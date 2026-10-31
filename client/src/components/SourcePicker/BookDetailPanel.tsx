import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BookDetail, BookSummary, TocPage } from '../../../../shared/types.ts';
import { api } from '../../lib/api.ts';
import { useReaderStore } from '../../store/useReaderStore.ts';
import { Cover } from './Cover.tsx';

const FRONT_MATTER = 'Front matter';

export function BookDetailPanel({ summary, onBack }: { summary: BookSummary; onBack(): void }) {
  const { openChapter, lastPosition, status } = useReaderStore();
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [toc, setToc] = useState<TocPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setError(null);
    api
      .book(summary.source, summary.id)
      .then((d) => live && setDetail(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [summary.source, summary.id]);

  useEffect(() => {
    let live = true;
    setToc(null);
    api
      .toc(summary.source, summary.id, page)
      .then((t) => live && setToc(t))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [summary.source, summary.id, page]);

  const book = detail ?? summary;
  const resume = lastPosition?.source === book.source && lastPosition.bookId === book.id ? lastPosition.chapter : null;
  // Start at the first real chapter, skipping Gutenberg front matter.
  const firstChapter = toc && page === 1 ? (toc.entries.find((e) => e.title !== FRONT_MATTER)?.index ?? 1) : 1;
  const open = (index: number) => openChapter(book.source, book.id, index);
  const loading = status === 'loading';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="overflow-y-auto">
        <div className="px-6 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-celadon-wash hover:text-ink"
          >
            <ArrowLeft size={16} /> 返回列表
          </button>
        </div>

        <section className="flex gap-5 px-6 pb-6 pt-5">
          <Cover book={book} size="lg" />
          <div className="min-w-0 flex-1">
            <h2
              lang={book.lang}
              className={`text-xl font-semibold leading-snug ${book.lang === 'ja' ? 'font-mincho' : 'font-literata'}`}
            >
              {book.title}
            </h2>
            <p className="mt-1.5 text-sm text-ink-soft">{book.author}</p>
            {book.tags && book.tags.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {book.tags.map((t) => (
                  <li key={t} className="rounded-full bg-celadon-wash px-2.5 py-0.5 text-xs text-celadon-deep">
                    {t}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => open(resume ?? firstChapter)}
                className="flex items-center gap-2 rounded-md bg-celadon px-4 py-2 text-sm font-medium text-on-accent hover:bg-celadon-deep disabled:opacity-60"
              >
                {loading && <LoaderCircle size={14} className="animate-spin" />}
                {resume ? `继续读第 ${resume} 章` : '开始阅读'}
              </button>
              {resume && (
                <button
                  type="button"
                  onClick={() => open(firstChapter)}
                  className="rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-celadon-wash hover:text-ink"
                >
                  从头读
                </button>
              )}
            </div>
          </div>
        </section>

        {book.summary && (
          <div className="px-6 pb-6">
            <p
              lang={book.lang}
              className={`whitespace-pre-line text-sm leading-relaxed text-ink-soft ${summaryOpen ? '' : 'line-clamp-4'}`}
            >
              {book.summary}
            </p>
            {book.summary.length > 160 && (
              <button
                type="button"
                onClick={() => setSummaryOpen(!summaryOpen)}
                className="mt-1 text-sm text-celadon hover:text-celadon-deep"
              >
                {summaryOpen ? '收起简介' : '展开简介'}
              </button>
            )}
          </div>
        )}

        {error && <p className="mx-6 mb-4 rounded-md bg-danger-wash px-4 py-3 text-sm text-danger">{error}</p>}

        <section className="border-t border-rule pb-6">
          <div className="flex items-center justify-between px-6 pb-2 pt-5">
            <h3 className="text-sm font-medium text-ink">目录</h3>
            {toc && toc.totalPages > 1 && (
              <div className="flex items-center gap-1 text-sm text-ink-soft">
                <button
                  type="button"
                  aria-label="上一页目录"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="grid size-7 place-items-center rounded hover:bg-celadon-wash disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="tabular-nums">
                  {page} / {toc.totalPages}
                </span>
                <button
                  type="button"
                  aria-label="下一页目录"
                  disabled={page >= toc.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="grid size-7 place-items-center rounded hover:bg-celadon-wash disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {!toc && !error && (
            <p className="flex items-center gap-2 px-6 py-4 text-sm text-ink-faint">
              <LoaderCircle size={14} className="animate-spin" /> 正在读取目录…
            </p>
          )}

          {toc && (
            <ol lang={book.lang}>
              {toc.entries.map((e, i) => (
                <li key={e.index}>
                  {e.group && e.group !== toc.entries[i - 1]?.group && (
                    <p className="px-6 pb-1 pt-4 text-xs font-medium text-celadon-deep">{e.group}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => open(e.index)}
                    className={`flex w-full items-baseline gap-3 px-6 py-2 text-left text-sm hover:bg-celadon-wash/60 ${
                      e.index === resume ? 'text-celadon-deep' : 'text-ink'
                    }`}
                  >
                    <span className="w-9 shrink-0 text-right tabular-nums text-ink-faint">{e.index}</span>
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
