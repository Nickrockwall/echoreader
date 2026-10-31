import * as Dialog from '@radix-ui/react-dialog';
import { LoaderCircle, Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { BookSummary, SearchResult, SourceId } from '../../../../shared/types.ts';
import { api } from '../../lib/api.ts';
import { useReaderStore } from '../../store/useReaderStore.ts';
import { BookDetailPanel } from './BookDetailPanel.tsx';
import { BookList } from './BookList.tsx';

const SOURCES: Record<
  SourceId,
  { tab: string; site: string; placeholder: string; popular: string; idPattern: RegExp; lang: 'ja' | 'en' }
> = {
  syosetu: {
    tab: '日本語',
    site: '小説家になろう',
    placeholder: '书名、作者或 Nコード（如 n9669bk）',
    popular: '今日热门',
    idPattern: /^n\d{4}[a-z]{1,3}$/i,
    lang: 'ja',
  },
  gutenberg: {
    tab: 'English',
    site: 'Project Gutenberg',
    placeholder: '书名、作者或书号（如 1342）',
    popular: '下载最多',
    idPattern: /^\d+$/,
    lang: 'en',
  },
};

export function SourcePicker() {
  const { pickerOpen, pickerSource, openPicker, closePicker, status, error: openError } = useReaderStore();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [items, setItems] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BookSummary | null>(null);
  const [slow, setSlow] = useState(false);

  const meta = SOURCES[pickerSource];

  useEffect(() => {
    if (!loading) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, [loading]);

  const load = (source: SourceId, q: string, page: number, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const req = q ? api.search(source, q, page, signal) : api.popular(source, page, signal);
    req
      .then((r) => {
        setResult(r);
        setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items]));
      })
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message))
      .finally(() => !signal?.aborted && setLoading(false));
  };

  // Reload the list whenever the source tab or the submitted query changes.
  useEffect(() => {
    if (!pickerOpen) return;
    const ctrl = new AbortController();
    setItems([]);
    setResult(null);
    load(pickerSource, submitted, 1, ctrl.signal);
    return () => ctrl.abort();
  }, [pickerOpen, pickerSource, submitted]);

  const switchSource = (source: SourceId) => {
    if (source === pickerSource) return;
    setSelected(null);
    setQuery('');
    setSubmitted('');
    openPicker(source);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    // A bare Nコード / book number opens that book directly.
    if (meta.idPattern.test(q)) {
      setSelected({ source: pickerSource, id: q.toLowerCase(), lang: meta.lang, title: q, author: '' });
      return;
    }
    setSelected(null);
    setSubmitted(q);
  };

  return (
    <Dialog.Root open={pickerOpen} onOpenChange={(open) => (open ? openPicker() : closePicker())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[fade_160ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-full max-w-[34rem] flex-col bg-surface font-ui shadow-[8px_0_40px_-16px_rgb(0_0_0/0.35)] focus:outline-none data-[state=open]:animate-[sheet_220ms_cubic-bezier(.2,.8,.2,1)]"
        >
          <header className="flex items-center justify-between px-6 pb-3 pt-5">
            <Dialog.Title className="text-base font-medium text-ink">找一本书</Dialog.Title>
            <Dialog.Close
              className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
              aria-label="关闭"
            >
              <X size={18} />
            </Dialog.Close>
          </header>

          <div role="tablist" aria-label="内容源" className="mx-6 grid grid-cols-2 rounded-lg bg-paper p-1">
            {(Object.keys(SOURCES) as SourceId[]).map((id) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={id === pickerSource}
                onClick={() => switchSource(id)}
                className="rounded-md px-3 py-2 text-left aria-selected:bg-surface aria-selected:shadow-sm"
              >
                <span className="block text-sm font-medium text-ink">{SOURCES[id].tab}</span>
                <span className="block text-xs text-ink-faint">{SOURCES[id].site}</span>
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="relative mx-6 mt-4">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={meta.placeholder}
              lang={meta.lang}
              className="w-full rounded-md border border-rule bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-celadon focus:outline-none"
            />
          </form>

          {status === 'error' && openError && (
            <p className="mx-6 mt-4 rounded-md bg-danger-wash px-4 py-3 text-sm text-danger">打不开这一章：{openError}</p>
          )}

          {selected ? (
            <BookDetailPanel key={`${selected.source}:${selected.id}`} summary={selected} onBack={() => setSelected(null)} />
          ) : (
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-rule">
              <p className="px-6 pb-1 pt-4 text-xs text-ink-faint">
                {submitted
                  ? result
                    ? `“${submitted}” 共 ${result.total.toLocaleString()} 个结果`
                    : `正在搜索 “${submitted}”…`
                  : meta.popular}
              </p>

              <BookList books={items} onSelect={setSelected} />

              {error && <p className="mx-6 my-4 rounded-md bg-danger-wash px-4 py-3 text-sm text-danger">{error}</p>}
              {!loading && !error && result && items.length === 0 && (
                <p className="px-6 py-10 text-center text-sm text-ink-soft">没有找到，换个关键词试试。</p>
              )}

              <div className="px-6 py-6">
                {loading ? (
                  <div className="text-center text-sm text-ink-faint">
                    <p className="flex items-center justify-center gap-2">
                      <LoaderCircle size={14} className="animate-spin" /> 正在读取…
                    </p>
                    {slow && <p className="mt-2">{meta.site} 响应较慢，首次加载可能要半分钟，之后会走缓存。</p>}
                  </div>
                ) : (
                  result?.hasMore && (
                    <button
                      type="button"
                      onClick={() => load(pickerSource, submitted, result.page + 1)}
                      className="w-full rounded-md border border-rule py-2 text-sm text-ink-soft hover:border-celadon hover:text-ink"
                    >
                      加载更多
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
