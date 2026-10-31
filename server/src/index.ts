import express, { type NextFunction, type Request, type Response } from 'express';
import type { SourceId } from '../../shared/types.ts';
import { UpstreamError } from './lib/http.ts';
import { sources, type SourceAdapter } from './sources/index.ts';

const PORT = Number(process.env.PORT ?? 3001);
const app = express();

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

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof UpstreamError ? err.status : 500;
  if (status >= 500) console.error(`[${req.method} ${req.url}]`, err);
  res.status(status).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`EchoReader API listening on http://localhost:${PORT}`);
  // Warm the landing lists; Gutendex in particular can take tens of seconds on a cold request.
  for (const source of Object.values(sources)) source.popular(1).catch(() => {});
});
