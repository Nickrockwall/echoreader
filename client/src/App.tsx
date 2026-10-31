import { BookMarked, ChevronLeft, ChevronRight, Library, LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import { AmbientMixer, useAmbientSync } from './components/AmbientMixer/AmbientMixer.tsx';
import { WordPopover } from './components/Dictionary/WordPopover.tsx';
import { ShortcutsDialog, useHelpShortcut } from './components/ShortcutsDialog.tsx';
import { VocabSheet } from './components/Vocab/VocabSheet.tsx';
import { useVocabStore } from './store/useVocabStore.ts';
import { Reader } from './components/Reader/Reader.tsx';
import { TypographyPopover } from './components/Reader/TypographyPopover.tsx';
import { SourcePicker } from './components/SourcePicker/SourcePicker.tsx';
import { Welcome } from './components/Welcome.tsx';
import { useReaderStore } from './store/useReaderStore.ts';

function TopBar() {
  const { book, chapter, status, openPicker, openChapter } = useReaderStore();
  const go = (index: number | null) => chapter && index && openChapter(chapter.source, chapter.bookId, index);

  return (
    <header className="sticky top-0 z-30 border-b border-rule/70 bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-2 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => openPicker()}
          aria-label="书架"
          className="flex h-10 items-center gap-2 rounded-md px-2.5 text-sm text-ink-soft hover:bg-celadon-wash hover:text-ink"
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

        {/* Phones turn chapters with the buttons at the end of each chapter. */}
        {chapter && (
          <div className="hidden items-center sm:flex">
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
        <button
          type="button"
          onClick={() => useVocabStore.getState().setOpen(true)}
          aria-label="生词本"
          className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
        >
          <BookMarked size={18} />
        </button>
        <AmbientMixer />
        <TypographyPopover />
      </div>
    </header>
  );
}

/** The book's title set vertically along the left edge, like the spine of a tankōbon. */
function Spine() {
  const book = useReaderStore((s) => s.book);
  const vertical = useReaderStore((s) => s.vertical);
  // A vertical page uses the whole width; the spine would sit on top of the text.
  if (!book || (vertical && book.lang === 'ja')) return null;
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
  const { chapter, status, error, theme } = useReaderStore();
  useAmbientSync();
  useHelpShortcut();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // The phone's status bar takes the page color too.
    const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper);
  }, [theme]);

  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <Spine />
      <div className={`flex-1 transition-opacity ${status === 'loading' && chapter ? 'opacity-50' : ''}`}>
        {chapter ? <Reader key={`${chapter.source}:${chapter.bookId}:${chapter.index}`} chapter={chapter} /> : <Welcome />}
      </div>
      {status === 'error' && error && chapter && (
        <p role="alert" className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-md bg-ink px-4 py-3 text-sm text-on-accent">
          打不开这一章：{error}
        </p>
      )}
      <SourcePicker />
      <WordPopover />
      <ShortcutsDialog />
      <VocabSheet />
    </div>
  );
}
