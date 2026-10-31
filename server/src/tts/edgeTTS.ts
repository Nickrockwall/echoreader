import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'node-edge-tts';
import type { Lang, TtsResult, TtsWord } from '../../../shared/types.ts';
import { UpstreamError } from '../lib/http.ts';

export const VOICES: Record<Lang, string[]> = {
  ja: ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
  en: ['en-US-JennyNeural', 'en-GB-RyanNeural'],
};

const AUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.cache/tts');
const MAX_CHARS = 2000;
const MAX_CONCURRENT = 3;
/** First attempt immediately, then two retries with growing pauses. */
const RETRY_DELAYS_MS = [0, 1000, 3000];

// ---- Concurrency gate: the Edge endpoint throttles bursts of parallel sockets ----

let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

// ---- Alignment ---------------------------------------------------------------

const unescapeXml = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]!);

/**
 * Word boundaries only carry the spoken text, so locate each one in the input by scanning
 * forward. Parts that can't be found (the service rewrote them) are dropped; the client
 * still has sentence-level timing from its neighbours.
 */
export function alignWords(text: string, parts: { part: string; start: number; end: number }[]): TtsWord[] {
  const words: TtsWord[] = [];
  let cursor = 0;
  for (const { part, start, end } of parts) {
    const needle = unescapeXml(part).trim();
    if (!needle) continue;
    let at = text.indexOf(needle, cursor);
    if (at < 0) at = text.toLowerCase().indexOf(needle.toLowerCase(), cursor);
    if (at < 0) continue;
    words.push({ offset: at, length: needle.length, start, end });
    cursor = at + needle.length;
  }
  return words;
}

// ---- Synthesis ---------------------------------------------------------------

async function synthesizeOnce(text: string, voice: string) {
  const tts = new EdgeTTS({
    voice,
    lang: voice.slice(0, 5),
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    saveSubtitles: true,
    timeout: 30000,
  });
  const audio: Buffer[] = [];
  const parts: { part: string; start: number; end: number }[] = [];
  for await (const chunk of tts.streamAudio(text)) {
    if (Buffer.isBuffer(chunk)) audio.push(chunk);
    else parts.push(chunk);
  }
  if (!audio.length) throw new Error('没有收到音频数据');
  return { audio: Buffer.concat(audio), parts };
}

const inflight = new Map<string, Promise<TtsResult>>();

export function audioPath(id: string) {
  if (!/^[0-9a-f]{40}$/.test(id)) throw new UpstreamError('无效的音频编号', 400);
  return path.join(AUDIO_DIR, `${id}.mp3`);
}

/** Synthesizes (or loads from disk) speech for `text`, returning word timings aligned to `text`. */
export function synthesize(text: string, lang: Lang, voice?: string): Promise<TtsResult> {
  const chosen = voice ?? VOICES[lang][0];
  if (!VOICES[lang].includes(chosen)) throw new UpstreamError(`不支持的声线：${chosen}`, 400);
  if (!text.trim()) throw new UpstreamError('没有可朗读的文字', 400);
  if (text.length > MAX_CHARS) throw new UpstreamError(`单次朗读最多 ${MAX_CHARS} 字`, 400);

  const id = createHash('sha1').update(`${chosen}\n${text}`).digest('hex');
  const existing = inflight.get(id);
  if (existing) return existing;

  const job = (async (): Promise<TtsResult> => {
    const meta = path.join(AUDIO_DIR, `${id}.json`);
    try {
      return JSON.parse(await readFile(meta, 'utf8')) as TtsResult;
    } catch {
      // not cached yet
    }

    const { audio, parts } = await withSlot(async () => {
      // The service drops sockets under load and answers bursts (fast skipping ahead) with 429s,
      // so back off between attempts rather than hammering it again at once.
      let lastError: Error | undefined;
      for (const wait of RETRY_DELAYS_MS) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try {
          return await synthesizeOnce(text, chosen);
        } catch (err) {
          lastError = err as Error;
        }
      }
      throw new UpstreamError(`语音合成失败：${lastError?.message}`);
    });

    const result: TtsResult = { id, voice: chosen, audio: `/api/tts/audio/${id}.mp3`, words: alignWords(text, parts) };
    await mkdir(AUDIO_DIR, { recursive: true });
    await writeFile(audioPath(id), audio);
    await writeFile(meta, JSON.stringify(result));
    return result;
  })().finally(() => inflight.delete(id));

  inflight.set(id, job);
  return job;
}
