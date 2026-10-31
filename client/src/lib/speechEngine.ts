import type { Lang } from '../../../shared/types.ts';
import { api } from './api.ts';
import type { SpeechChunk } from './speech.ts';

/** A word timing in paragraph plain-text offsets. */
export interface TimedWord {
  from: number;
  to: number;
  start: number;
  end: number;
}

export interface PreparedChunk {
  chunk: SpeechChunk;
  url: string;
  words: TimedWord[];
  /** words[i].start, for binary search on every animation frame. */
  wordStarts: number[];
  /** Start time (ms) of each of chunk.sentences, parallel array. */
  sentenceStarts: number[];
}

export type PlayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface EngineState {
  status: PlayStatus;
  index: number;
  count: number;
  error: string | null;
  /** Sentence being replayed slowly, if a repeat is in progress. */
  repeating: string | null;
}

const PREFETCH_AHEAD = 3;
const KEEP_BEHIND = 2;
/** Start a little early so the first word isn't clipped. */
const LEAD_IN_MS = 80;
/** Let the last word ring out before a repeat stops. */
const TAIL_MS = 250;
export const REPEAT_RATE = 0.8;

/** Index of the last item whose start time is <= t, or -1 (binary search over sorted starts). */
export function lastStarted(starts: number[], t: number) {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function sentenceStarts(chunk: SpeechChunk, words: TimedWord[]): number[] {
  const starts: number[] = [];
  for (const s of chunk.sentences) {
    const first = words.find((w) => w.from >= s.start && w.from < s.end);
    starts.push(first ? first.start : (starts[starts.length - 1] ?? 0));
  }
  return starts;
}

/**
 * Plays a chapter as a queue of synthesized chunks through one <audio> element (kept for the
 * lifetime of the app so it can later be routed into a Web Audio graph).
 */
class SpeechEngine {
  readonly audio = new Audio();
  private chunks: SpeechChunk[] = [];
  private lang: Lang = 'ja';
  private voice: string | undefined;
  private prepared = new Map<number, Promise<PreparedChunk>>();
  private generation = 0;
  private current: PreparedChunk | null = null;
  private rate = 1;
  /** Audio time (ms) at which a sentence repeat stops. */
  private repeatEnd: number | null = null;
  private repeatFrame = 0;
  private state: EngineState = { status: 'idle', index: 0, count: 0, error: null, repeating: null };
  private listeners = new Set<(s: EngineState) => void>();
  /** Fired when the last chunk finishes. */
  onChapterEnd: (() => void) | null = null;

  constructor() {
    this.audio.preload = 'auto';
    this.audio.preservesPitch = true;
    this.audio.addEventListener('ended', () => this.advance());
    this.audio.addEventListener('pause', () => {
      if (this.state.status === 'playing' && !this.audio.ended) this.set({ status: 'paused' });
    });
    this.audio.addEventListener('play', () => {
      if (this.current) this.set({ status: 'playing' });
    });
  }

  // ---- state ----

  subscribe(fn: (s: EngineState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => void this.listeners.delete(fn);
  }

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  get snapshot() {
    return this.state;
  }

  /** The chunk currently loaded in the audio element, with its timings. */
  get active() {
    return this.current;
  }

  // ---- queue ----

  load(chunks: SpeechChunk[], lang: Lang, voice: string | undefined) {
    this.stop();
    this.chunks = chunks;
    this.lang = lang;
    this.voice = voice;
    this.set({ status: 'idle', index: 0, count: chunks.length, error: null });
  }

  setVoice(voice: string) {
    if (voice === this.voice) return;
    this.voice = voice;
    const resume = this.state.status === 'playing' || this.state.status === 'loading';
    this.dropPrepared();
    if (resume) void this.playAt(this.state.index);
    else if (this.current) {
      // Keep the position; the next play re-synthesizes this chunk in the new voice.
      this.current = null;
      this.audio.removeAttribute('src');
      this.set({ status: 'paused' });
    }
  }

  setRate(rate: number) {
    this.rate = rate;
    this.audio.defaultPlaybackRate = rate; // survives src changes
    if (this.repeatEnd === null) this.audio.playbackRate = rate;
  }

  // ---- sentences ----

  /** Index of the chunk containing a sentence, or -1 (e.g. author notes aren't read aloud). */
  chunkOf(sentenceId: string) {
    return this.chunks.findIndex((c) => c.sentences.some((s) => s.id === sentenceId));
  }

  /** The sentence under the playhead. */
  currentSentence(): string | null {
    const p = this.current;
    if (!p) return null;
    const i = Math.max(0, lastStarted(p.sentenceStarts, this.audio.currentTime * 1000));
    return p.chunk.sentences[i]?.id ?? null;
  }

  playFromSentence(sentenceId: string) {
    const index = this.chunkOf(sentenceId);
    if (index >= 0) void this.start(index, sentenceId, false);
  }

  /** Jumps back to the start of the sentence being read and carries on at the normal rate. */
  replaySentence() {
    const id = this.currentSentence();
    if (id) this.playFromSentence(id);
  }

  /**
   * Moves the playhead by `deltaMs`, crossing into the neighbouring chunk when the jump runs
   * past either end of this one. Keeps playing or paused as it was.
   */
  seekBy(deltaMs: number) {
    if (!this.current) return;
    const { index, count, status } = this.state;
    const play = status === 'playing';
    const duration = this.audio.duration * 1000;
    const t = this.audio.currentTime * 1000 + deltaMs;
    this.endRepeat();
    if (t < 0 && index > 0) {
      void this.start(index - 1, undefined, false, { fromEndMs: -t, play });
    } else if (Number.isFinite(duration) && t > duration && index < count - 1) {
      void this.start(index + 1, undefined, false, { atMs: t - duration, play });
    } else {
      this.audio.currentTime = Math.max(0, Math.min(t, Number.isFinite(duration) ? duration - 50 : t)) / 1000;
    }
  }

  /** Replays one sentence at REPEAT_RATE, then pauses at its end (shadowing practice). */
  repeatSentence(sentenceId = this.currentSentence()) {
    const index = sentenceId ? this.chunkOf(sentenceId) : -1;
    if (index >= 0) void this.start(index, sentenceId!, true);
  }

  private sentenceWindow(p: PreparedChunk, sentenceId: string): [number, number] {
    const i = p.chunk.sentences.findIndex((s) => s.id === sentenceId);
    if (i < 0) return [0, Number.POSITIVE_INFINITY];
    const s = p.chunk.sentences[i];
    const spoken = p.words.filter((w) => w.from >= s.start && w.from < s.end);
    const from = Math.max(0, p.sentenceStarts[i] - LEAD_IN_MS);
    const to = spoken.length
      ? spoken[spoken.length - 1].end + TAIL_MS
      : (p.sentenceStarts[i + 1] ?? Number.POSITIVE_INFINITY);
    return [from, to];
  }

  private watchRepeat = () => {
    if (this.repeatEnd === null) return;
    if (this.audio.currentTime * 1000 >= this.repeatEnd) {
      this.audio.pause();
      this.endRepeat();
      return;
    }
    this.repeatFrame = requestAnimationFrame(this.watchRepeat);
  };

  private endRepeat() {
    if (this.repeatEnd === null && !this.state.repeating) return;
    cancelAnimationFrame(this.repeatFrame);
    this.repeatEnd = null;
    this.audio.playbackRate = this.rate;
    this.set({ repeating: null });
  }

  private prepare(index: number): Promise<PreparedChunk> {
    let job = this.prepared.get(index);
    if (!job) {
      const chunk = this.chunks[index];
      job = (async () => {
        const result = await api.tts({ text: chunk.text, lang: this.lang, voice: this.voice });
        const blob = await (await fetch(result.audio)).blob();
        const words = result.words.map((w) => {
          const [from, to] = chunk.toSource(w.offset, w.length);
          return { from, to, start: w.start, end: w.end };
        });
        return {
          chunk,
          url: URL.createObjectURL(blob),
          words,
          wordStarts: words.map((w) => w.start),
          sentenceStarts: sentenceStarts(chunk, words),
        };
      })();
      job.catch(() => this.prepared.delete(index));
      this.prepared.set(index, job);
    }
    return job;
  }

  private prefetchAround(index: number) {
    for (let i = index + 1; i <= index + PREFETCH_AHEAD && i < this.chunks.length; i++) {
      this.prepare(i).catch(() => {});
    }
    for (const [i, job] of this.prepared) {
      if (i < index - KEEP_BEHIND || i > index + PREFETCH_AHEAD) {
        this.prepared.delete(i);
        job.then((p) => URL.revokeObjectURL(p.url)).catch(() => {});
      }
    }
  }

  private dropPrepared() {
    for (const job of this.prepared.values()) job.then((p) => URL.revokeObjectURL(p.url)).catch(() => {});
    this.prepared.clear();
  }

  // ---- transport ----

  /** Plays chunk `index` from its start. */
  playAt(index: number) {
    return this.start(index, undefined, false);
  }

  private async start(
    index: number,
    sentenceId: string | undefined,
    repeat: boolean,
    /** Start position as ms from the chunk's end (seeking backwards across chunks); `play: false` loads paused. */
    opts: { fromEndMs?: number; atMs?: number; play?: boolean } = {},
  ) {
    if (!this.chunks.length) return;
    index = Math.max(0, Math.min(index, this.chunks.length - 1));
    const gen = ++this.generation;
    this.endRepeat();
    this.audio.pause();
    this.set({ status: 'loading', index, error: null, repeating: repeat ? (sentenceId ?? null) : null });
    this.prefetchAround(index);
    try {
      const prepared = await this.prepare(index);
      if (gen !== this.generation) return;
      if (this.current !== prepared) {
        this.current = prepared;
        this.audio.src = prepared.url;
      }
      const [from, to] = sentenceId ? this.sentenceWindow(prepared, sentenceId) : [0, Number.POSITIVE_INFINITY];
      let at = opts.atMs ?? from;
      if (opts.fromEndMs !== undefined) {
        if (this.audio.readyState < HTMLMediaElement.HAVE_METADATA) {
          await new Promise((r) => this.audio.addEventListener('loadedmetadata', r, { once: true }));
          if (gen !== this.generation) return;
        }
        at = Math.max(0, this.audio.duration * 1000 - opts.fromEndMs);
      }
      this.audio.currentTime = at / 1000;
      // Set after src: loading a source resets playbackRate to defaultPlaybackRate.
      this.audio.playbackRate = repeat ? REPEAT_RATE : this.rate;
      if (repeat) this.repeatEnd = to;
      if (opts.play === false) {
        this.set({ status: 'paused' });
        return;
      }
      await this.audio.play();
      if (gen !== this.generation) return;
      this.set({ status: 'playing' });
      if (repeat) this.repeatFrame = requestAnimationFrame(this.watchRepeat);
    } catch (err) {
      if (gen !== this.generation) return;
      this.endRepeat();
      const e = err as Error;
      // Autoplay policy: the browser wants a user gesture first. Leave it paused at this chunk.
      if (e.name === 'NotAllowedError') this.set({ status: 'paused' });
      else this.set({ status: 'error', error: e.message });
    }
  }

  /** Play/pause. `start` is where to begin when nothing has been played yet. */
  toggle(start: { index: number; sentenceId?: string }) {
    const { status, index } = this.state;
    switch (status) {
      case 'playing':
        this.audio.pause();
        this.endRepeat();
        break;
      case 'loading':
        this.generation++;
        this.endRepeat();
        this.set({ status: this.current ? 'paused' : 'idle' });
        break;
      case 'paused':
        // A repeat of a chunk's last sentence can leave the audio at its very end.
        if (this.current && this.audio.ended) this.advance();
        else if (this.current) void this.audio.play();
        else void this.playAt(index);
        break;
      case 'idle':
        void this.start(start.index, start.sentenceId, false);
        break;
      case 'ended':
        void this.playAt(0);
        break;
      case 'error':
        void this.playAt(index);
        break;
    }
  }

  pause() {
    if (this.state.status === 'playing') this.audio.pause();
  }

  stop() {
    this.generation++;
    this.endRepeat();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.current = null;
    this.dropPrepared();
  }

  private advance() {
    if (this.repeatEnd !== null) {
      // The repeated sentence ran to the end of its chunk: stop here, don't move on.
      this.endRepeat();
      this.set({ status: 'paused' });
      return;
    }
    const next = this.state.index + 1;
    if (next < this.chunks.length) {
      void this.playAt(next);
    } else {
      this.current = null;
      this.set({ status: 'ended' });
      this.onChapterEnd?.();
    }
  }
}

export const speech = new SpeechEngine();

// Handle for inspecting playback from the console and browser tests (dev builds only).
if (import.meta.env.DEV) (window as unknown as { __speech: SpeechEngine }).__speech = speech;
