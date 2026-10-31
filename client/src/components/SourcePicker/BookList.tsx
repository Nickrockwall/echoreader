import type { BookSummary } from '../../../../shared/types.ts';
import { Cover } from './Cover.tsx';

function chapterLabel(book: BookSummary) {
  if (book.source === 'syosetu') {
    if (book.chapterCount === 1) return '短編';
    return `全${book.chapterCount}話${book.complete ? '・完結' : '・連載中'}`;
  }
  return null;
}

export function BookList({ books, onSelect }: { books: BookSummary[]; onSelect(book: BookSummary): void }) {
  return (
    <ul className="divide-y divide-rule">
      {books.map((book) => (
        <li key={`${book.source}:${book.id}`}>
          <button
            type="button"
            onClick={() => onSelect(book)}
            className="ui-bookrow flex w-full gap-4 px-6 py-4 text-left hover:bg-celadon-wash/60 focus-visible:bg-celadon-wash/60"
          >
            <Cover book={book} />
            <div className="min-w-0 flex-1">
              <h3
                lang={book.lang}
                className={`line-clamp-2 font-semibold leading-snug text-ink ${
                  book.lang === 'ja' ? 'font-mincho' : 'font-literata'
                }`}
              >
                {book.title}
              </h3>
              <p className="mt-1 truncate text-sm text-ink-soft">
                {book.author}
                {chapterLabel(book) && <span className="ml-3 text-ink-faint">{chapterLabel(book)}</span>}
              </p>
              {book.summary && (
                <p lang={book.lang} className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-faint">
                  {book.summary}
                </p>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
