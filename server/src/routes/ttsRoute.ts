import { Router } from 'express';
import type { Lang, TtsPreviewRequest, TtsRequest, VoiceCatalog } from '../../../shared/types.ts';
import { UpstreamError } from '../lib/http.ts';
import { audioPath, synthesize } from '../tts/edgeTTS.ts';
import { PREVIEW_TEXT, resolvePreset, VOICE_PRESETS } from '../tts/voices.ts';

const VOICEVOX = 'http://localhost:50021';
const PROBE_TTL_MS = 60_000;

let probe: { at: number; value: VoiceCatalog['voicevox'] } | null = null;

/** Whether a local VOICEVOX engine is running (reserved for future character voices). */
async function probeVoicevox(): Promise<VoiceCatalog['voicevox']> {
  if (probe && Date.now() - probe.at < PROBE_TTL_MS) return probe.value;
  let value: VoiceCatalog['voicevox'] = { available: false };
  try {
    const res = await fetch(`${VOICEVOX}/version`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) value = { available: true, version: (await res.text()).replace(/"/g, '') };
  } catch {
    // not running
  }
  probe = { at: Date.now(), value };
  return value;
}

const isLang = (v: unknown): v is Lang => v === 'ja' || v === 'en';

export const ttsRoute = Router();

ttsRoute.get('/voices', async (_req, res) => {
  res.json({ presets: VOICE_PRESETS, voicevox: await probeVoicevox() } satisfies VoiceCatalog);
});

ttsRoute.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Partial<TtsRequest>;
  if (typeof body.text !== 'string' || !isLang(body.lang)) {
    throw new UpstreamError('需要 text 和 lang（ja 或 en）', 400);
  }
  res.json(await synthesize({ ...body, text: body.text, lang: body.lang }));
});

/** A short sample sentence in the given voice, for the settings panel's preview buttons. */
ttsRoute.post('/preview', async (req, res) => {
  const { voice, lang, pitch } = (req.body ?? {}) as Partial<TtsPreviewRequest>;
  if (!isLang(lang) || typeof voice !== 'string' || !resolvePreset(voice, lang)) {
    throw new UpstreamError('需要有效的 voice 和 lang', 400);
  }
  res.json(await synthesize({ text: PREVIEW_TEXT[lang], lang, voice, pitch }));
});

ttsRoute.get('/audio/:file', (req, res, next) => {
  const id = req.params.file.replace(/\.mp3$/, '');
  // Content-addressed: the same id always means the same audio.
  res.sendFile(audioPath(id), { headers: { 'Content-Type': 'audio/mpeg' }, maxAge: '365d', immutable: true, dotfiles: 'allow' }, (err) => {
    if (err) next(new UpstreamError('音频不存在或已被清理', 404));
  });
});
