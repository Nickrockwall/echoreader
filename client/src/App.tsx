import { ChevronLeft, ChevronRight, Library, LoaderCircle } from 'lucide-react';
import { WordPopover } from './components/Dictionary/WordPopover.tsx';
import { Reader } from './components/Reader/Reader.tsx';
import { TypographyPopover } from './components/Reader/TypographyPopover.tsx';
import { SourcePicker } from './components/SourcePicker/SourcePicker.tsx';
import { Welcome } from './components/Welcome.tsx';
import { useReaderStore } from './store/useReaderStore.ts';

function TopBar() {
  const { book, chapter, status, openPicker, openChapter } = useReaderStore();
  const go = (index: number | null) => chapter && index && openChapter(chapter.source, chapter.bookId, index);

  return (
    <header className="sticky top-0 z-30 border-b border-rule/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => openPicker()}
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-celadon-wash hover:text-ink"
        >
          <Library size={18} />
          <span className="hidden sm:inline">书架</span>
        </button>

        <div className="min-w-0 flex-1 text-center">
          {book && chapter && (
            <p className="truncate text-sm">
              <span lang={book.lang} className="text-ink">
                {book.title}
              </span>
              <span lang={book.lang} className="ml-3 hidden text-ink-faint md:inline">
                {chapter.title}
              </span>
            </p>
          )}
        </div>

        {status === 'loading' && <LoaderCircle size={16} className="animate-spin text-celadon" aria-label="正在载入" />}

        {chapter && (
          <div className="flex items-center">
            <button
              type="button"
              aria-label="上一章"
              disabled={!chapter.prev}
              onClick={() => go(chapter.prev)}
              className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-14 text-center text-xs tabular-nums text-ink-faint">
              {chapter.index} / {book?.chapterCount}
            </span>
            <button
              type="button"
              aria-label="下一章"
              disabled={!chapter.next}
              onClick={() => go(chapter.next)}
              className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        <TypographyPopover />
      </div>
    </header>
  );
}

/** The book's title set vertically along the left edge, like the spine of a tankōbon. */
function Spine() {
  const book = useReaderStore((s) => s.book);
  if (!book) return null;
  return (
    <div
      aria-hidden
      className={`spine pointer-events-none fixed left-8 top-24 hidden max-h-[calc(100vh-8rem)] overflow-hidden text-[15px] tracking-[0.3em] text-ink-faint/70 xl:block ${
        book.lang === 'ja' ? 'font-mincho' : 'font-literata'
      }`}
    >
      {book.title}
      <span className="mt-6 inline-block text-celadon">{book.author}</span>
    </div>
  );
}

export default function App() {
  const { chapter, status, error } = useReaderStore();
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <Spine />
      <div className={`flex-1 transition-opacity ${status === 'loading' && chapter ? 'opacity-50' : ''}`}>
        {chapter ? <Reader key={`${chapter.source}:${chapter.bookId}:${chapter.index}`} chapter={chapter} /> : <Welcome />}
      </div>
      {status === 'error' && error && chapter && (
        <p role="alert" className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-md bg-ink px-4 py-3 text-sm text-page">
          打不开这一章：{error}
        </p>
      )}
      <SourcePicker />
      <WordPopover />
    </div>
  );
}
