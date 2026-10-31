import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'node-edge-tts';
import type { TtsRequest, TtsResult, TtsWord, VoicePreset } from '../../../shared/types.ts';
import { UpstreamError } from '../lib/http.ts';
import { parseDramaSegments, type ScriptSegment } from './textParser.ts';
import { resolvePreset } from './voices.ts';

const AUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.cache/tts');
const MAX_CHARS = 2000;
const MAX_CONCURRENT = 3;
/** First attempt immediately, then two retries with growing pauses. */
const RETRY_DELAYS_MS = [0, 1000, 3000];
const MAX_PITCH_SHIFT = 20;

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

// ---- MP3 -------------------------------------------------------------------------

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/**
 * Exact playing time of an MPEG Layer III stream, from its frame headers. Concatenated
 * segments are offset by this, so word timings after a joint land where the audio does.
 */
export function mp3DurationMs(buf: Buffer): number {
  let pos = 0;
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') {
    pos = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  }
  let seconds = 0;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) {
      pos++; // not a frame header: resync
      continue;
    }
    const version = (buf[pos + 1] >> 3) & 0x3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[pos + 1] >> 1) & 0x3; // 1 = Layer III
    const bitrateIndex = buf[pos + 2] >> 4;
    const rateIndex = (buf[pos + 2] >> 2) & 0x3;
    const padding = (buf[pos + 2] >> 1) & 0x1;
    const sampleRate = SAMPLE_RATES[version]?.[rateIndex];
    const kbps = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex];
    if (layer !== 1 || !sampleRate || !kbps) {
      pos++;
      continue;
    }
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding;
    seconds += samples / sampleRate;
    pos += length;
  }
  return seconds * 1000;
}

// ---- Synthesis ---------------------------------------------------------------

const pitchString = (percent: number) => (percent === 0 ? 'default' : `${percent > 0 ? '+' : ''}${percent}%`);

async function synthesizeOnce(text: string, preset: VoicePreset, pitchShift: number) {
  const tts = new EdgeTTS({
    voice: preset.voice,
    lang: preset.lang === 'ja' ? 'ja-JP' : preset.voice.slice(0, 5),
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    pitch: pitchString(preset.pitch + pitchShift),
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

function synthesizeWithRetry(text: string, preset: VoicePreset, pitchShift: number) {
  return withSlot(async () => {
    // The service drops sockets under load and answers bursts (fast skipping ahead) with 429s,
    // so back off between attempts rather than hammering it again at once.
    let lastError: Error | undefined;
    for (const wait of RETRY_DELAYS_MS) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        return await synthesizeOnce(text, preset, pitchShift);
      } catch (err) {
        lastError = err as Error;
      }
    }
    throw new UpstreamError(`语音合成失败（${preset.name}）：${lastError?.message}`);
  });
}

const inflight = new Map<string, Promise<TtsResult>>();

export function audioPath(id: string) {
  if (!/^[0-9a-f]{40}$/.test(id)) throw new UpstreamError('无效的音频编号', 400);
  return path.join(AUDIO_DIR, `${id}.mp3`);
}

/**
 * Synthesizes (or loads from disk) speech for `text`, returning word timings aligned to `text`.
 * In drama mode quoted dialogue and narration are voiced separately and joined into one clip,
 * with each segment's word timings shifted by the audio before it.
 */
export function synthesize(req: TtsRequest): Promise<TtsResult> {
  const { text, lang } = req;
  if (!text.trim()) throw new UpstreamError('没有可朗读的文字', 400);
  if (text.length > MAX_CHARS) throw new UpstreamError(`单次朗读最多 ${MAX_CHARS} 字`, 400);
  const narration = resolvePreset(req.voice, lang);
  if (!narration) throw new UpstreamError(`不支持的声线：${req.voice}`, 400);
  const dialogue = req.drama ? resolvePreset(req.dialogueVoice, lang) : undefined;
  if (req.drama && !dialogue) throw new UpstreamError(`不支持的台词声线：${req.dialogueVoice}`, 400);
  const pitch = Math.max(-MAX_PITCH_SHIFT, Math.min(MAX_PITCH_SHIFT, Math.round(Number(req.pitch) || 0)));

  const split = Boolean(dialogue && dialogue.id !== narration.id);
  const key = JSON.stringify({ v: narration.id, d: split ? dialogue!.id : null, p: pitch, text });
  const id = createHash('sha1').update(key).digest('hex');
  const existing = inflight.get(id);
  if (existing) return existing;

  const job = (async (): Promise<TtsResult> => {
    const meta = path.join(AUDIO_DIR, `${id}.json`);
    try {
      return JSON.parse(await readFile(meta, 'utf8')) as TtsResult;
    } catch {
      // not cached yet
    }

    const segments: ScriptSegment[] = split
      ? parseDramaSegments(text, lang)
      : [{ type: 'narration', text, offset: 0 }];
    if (!segments.length) throw new UpstreamError('没有可朗读的文字', 400);

    // Segments synthesize in parallel (within the concurrency gate) and are joined in order.
    const clips = await Promise.all(
      segments.map((s) => synthesizeWithRetry(s.text, s.type === 'dialogue' ? dialogue! : narration, pitch)),
    );
    const words: TtsWord[] = [];
    let elapsed = 0;
    clips.forEach((clip, i) => {
      for (const w of alignWords(segments[i].text, clip.parts)) {
        const shift = Math.round(elapsed);
        words.push({ ...w, offset: w.offset + segments[i].offset, start: w.start + shift, end: w.end + shift });
      }
      elapsed += mp3DurationMs(clip.audio);
    });

    const result: TtsResult = { id, voice: narration.id, audio: `/api/tts/audio/${id}.mp3`, words };
    await mkdir(AUDIO_DIR, { recursive: true });
    await writeFile(audioPath(id), Buffer.concat(clips.map((c) => c.audio)));
    await writeFile(meta, JSON.stringify(result));
    return result;
  })().finally(() => inflight.delete(id));

  inflight.set(id, job);
  return job;
}
