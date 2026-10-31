import type {
  ApiError,
  BookDetail,
  ChapterContent,
  DictLookupRequest,
  DictResult,
  FuriganaResult,
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
  tts: (req: TtsRequest) => post<TtsResult>('/tts', req),
  lookup: (req: DictLookupRequest, signal?: AbortSignal) => post<DictResult>('/dict/lookup', req, signal),
  furigana: (texts: string[]) => post<FuriganaResult>('/ja/furigana', { texts }),
};

function post<T>(path: string, body: unknown, signal?: AbortSignal) {
  return get<T>(path, signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
