import type {
  ApiError,
  BookDetail,
  ChapterContent,
  SearchResult,
  SourceId,
  TocPage,
  TtsRequest,
  TtsResult,
} from '../../../shared/types.ts';

async function get<T>(path: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error('连不上本地服务。请确认后端已用 npm run dev 启动。');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error ?? `请求失败（HTTP ${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  popular: (source: SourceId, page = 1, signal?: AbortSignal) =>
    get<SearchResult>(`/${source}/popular?page=${page}`, signal),
  search: (source: SourceId, q: string, page = 1, signal?: AbortSignal) =>
    get<SearchResult>(`/${source}/search?q=${encodeURIComponent(q)}&page=${page}`, signal),
  book: (source: SourceId, id: string) => get<BookDetail>(`/${source}/books/${encodeURIComponent(id)}`),
  toc: (source: SourceId, id: string, page = 1) =>
    get<TocPage>(`/${source}/books/${encodeURIComponent(id)}/toc?page=${page}`),
  chapter: (source: SourceId, id: string, index: number) =>
    get<ChapterContent>(`/${source}/books/${encodeURIComponent(id)}/chapters/${index}`),
  tts: (req: TtsRequest) =>
    get<TtsResult>('/tts', undefined, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
};
