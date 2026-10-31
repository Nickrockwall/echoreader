import express, { type NextFunction, type Request, type Response } from 'express';
import type { FuriganaRequest, Lang, SourceId, TtsRequest } from '../../shared/types.ts';
import { furigana, lookup, warmJapanese } from './dict/lookup.ts';
import { UpstreamError } from './lib/http.ts';
import { sources, type SourceAdapter } from './sources/index.ts';
import { audioPath, synthesize, VOICES } from './tts/edgeTTS.ts';

const PORT = Number(process.env.PORT ?? 3001);
const app = express();
app.use(express.json({ limit: '2mb' }));

function adapter(req: Request): SourceAdapter {
  const source = sources[req.params.source as SourceId];
  if (!source) throw new UpstreamError(`未知的内容源：${req.params.source}`, 400);
  return source;
}

function positiveInt(value: unknown, fallback = 1) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1) throw new UpstreamError(`参数必须是正整数：${value}`, 400);
  return n;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/:source/popular', async (req, res) => {
  res.json(await adapter(req).popular(positiveInt(req.query.page)));
});

app.get('/api/:source/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) throw new UpstreamError('请输入搜索关键词', 400);
  res.json(await adapter(req).search(q, positiveInt(req.query.page)));
});

app.get('/api/:source/books/:id', async (req, res) => {
  res.json(await adapter(req).book(req.params.id));
});

app.get('/api/:source/books/:id/toc', async (req, res) => {
  res.json(await adapter(req).toc(req.params.id, positiveInt(req.query.page)));
});

app.get('/api/:source/books/:id/chapters/:index', async (req, res) => {
  res.json(await adapter(req).chapter(req.params.id, positiveInt(req.params.index)));
});

app.post('/api/dict/lookup', async (req, res) => {
  res.json(await lookup(req.body ?? {}));
});

app.post('/api/ja/furigana', async (req, res) => {
  const { texts } = (req.body ?? {}) as Partial<FuriganaRequest>;
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string')) {
    throw new UpstreamError('需要 texts 字符串数组', 400);
  }
  res.json(await furigana(texts));
});

app.get('/api/tts/voices', (_req, res) => {
  res.json(VOICES);
});

app.post('/api/tts', async (req, res) => {
  const { text, lang, voice } = (req.body ?? {}) as Partial<TtsRequest>;
  if (typeof text !== 'string' || (lang !== 'ja' && lang !== 'en')) {
    throw new UpstreamError('需要 text 和 lang（ja 或 en）', 400);
  }
  res.json(await synthesize(text, lang as Lang, voice));
});

app.get('/api/tts/audio/:file', (req, res, next) => {
  const id = req.params.file.replace(/\.mp3$/, '');
  // Content-addressed: the same id always means the same audio.
  res.sendFile(audioPath(id), { headers: { 'Content-Type': 'audio/mpeg' }, maxAge: '365d', immutable: true, dotfiles: 'allow' }, (err) => {
    if (err) next(new UpstreamError('音频不存在或已被清理', 404));
  });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof UpstreamError ? err.status : 500;
  if (status >= 500) console.error(`[${req.method} ${req.url}]`, err);
  res.status(status).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`EchoReader API listening on http://localhost:${PORT}`);
  // Warm the landing lists; Gutendex in particular can take tens of seconds on a cold request.
  for (const source of Object.values(sources)) source.popular(1).catch(() => {});
  warmJapanese();
});
