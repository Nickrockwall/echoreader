import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FuriganaRequest, Lang, SourceId, TtsRequest } from '../../shared/types.ts';
import { furigana, lookup, warmJapanese } from './dict/lookup.ts';
import { UpstreamError } from './lib/http.ts';
import { sources, type SourceAdapter } from './sources/index.ts';
import { audioPath, synthesize, VOICES } from './tts/edgeTTS.ts';
import { deleteVocab, listVocab, saveVocab, vocabToAnki } from './user/vocab.ts';

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

const langParam = (v: unknown): Lang | undefined => (v === 'ja' || v === 'en' ? v : undefined);

app.get('/api/vocab', (req, res) => {
  res.json(listVocab(langParam(req.query.lang)));
});

app.post('/api/vocab', (req, res) => {
  res.json(saveVocab(req.body ?? {}));
});

app.delete('/api/vocab/:id', (req, res) => {
  deleteVocab(positiveInt(req.params.id));
  res.json({ ok: true });
});

app.get('/api/vocab/export', (req, res) => {
  const lang = langParam(req.query.lang);
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="echoreader-${lang ?? 'all'}-${date}.txt"`);
  res.send(vocabToAnki(lang));
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

app.use('/api', (_req, res) => {
  res.status(404).json({ error: '没有这个接口' });
});

// Production: serve the built reader from the same port, so a phone needs just one address.
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  // Hashed assets never change; the shell and service worker must always be revalidated.
  app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '365d' }));
  app.use(express.static(CLIENT_DIST, { maxAge: 0 }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof UpstreamError ? err.status : 500;
  if (status >= 500) console.error(`[${req.method} ${req.url}]`, err);
  res.status(status).json({ error: err.message });
});

/** IPv4 addresses other devices on the same network can use to reach this machine. */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => Boolean(i && i.family === 'IPv4' && !i.internal))
    .map((i) => i.address);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EchoReader listening on http://localhost:${PORT}`);
  if (existsSync(CLIENT_DIST)) {
    for (const ip of lanAddresses()) console.log(`  手机（同一 Wi-Fi）打开：http://${ip}:${PORT}`);
  }
  // Warm the landing lists; Gutendex in particular can take tens of seconds on a cold request.
  for (const source of Object.values(sources)) source.popular(1).catch(() => {});
  warmJapanese();
});
