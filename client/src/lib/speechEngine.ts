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
}

const PREFETCH_AHEAD = 3;
const KEEP_BEHIND = 2;

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
  private state: EngineState = { status: 'idle', index: 0, count: 0, error: null };
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
    this.audio.defaultPlaybackRate = rate; // survives src changes
    this.audio.playbackRate = rate;
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

  /** Plays chunk `index` from its start, or from the start of `sentenceId` within it. */
  async playAt(index: number, sentenceId?: string) {
    if (!this.chunks.length) return;
    index = Math.max(0, Math.min(index, this.chunks.length - 1));
    const gen = ++this.generation;
    this.audio.pause();
    this.set({ status: 'loading', index, error: null });
    this.prefetchAround(index);
    try {
      const prepared = await this.prepare(index);
      if (gen !== this.generation) return;
      this.current = prepared;
      this.audio.src = prepared.url;
      const s = sentenceId ? prepared.chunk.sentences.findIndex((x) => x.id === sentenceId) : -1;
      // Back off slightly so the first word isn't clipped.
      this.audio.currentTime = s > 0 ? Math.max(0, prepared.sentenceStarts[s] - 80) / 1000 : 0;
      await this.audio.play();
      if (gen === this.generation) this.set({ status: 'playing' });
    } catch (err) {
      if (gen !== this.generation) return;
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
        break;
      case 'loading':
        this.generation++;
        this.set({ status: this.current ? 'paused' : 'idle' });
        break;
      case 'paused':
        if (this.current) void this.audio.play();
        else void this.playAt(index);
        break;
      case 'idle':
        void this.playAt(start.index, start.sentenceId);
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
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.current = null;
    this.dropPrepared();
  }

  private advance() {
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
