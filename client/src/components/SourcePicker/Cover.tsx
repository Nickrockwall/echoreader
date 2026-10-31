import { useState } from 'react';
import type { BookSummary } from '../../../../shared/types.ts';

/** Gutenberg has cover images; なろう has none, so its cover is the title set vertically. */
export function Cover({ book, size = 'sm' }: { book: BookSummary; size?: 'sm' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const box = size === 'sm' ? 'h-[84px] w-[60px]' : 'h-[168px] w-[120px]';
  if (book.cover && !failed) {
    return (
      <img
        src={book.cover}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${box} shrink-0 rounded-sm bg-celadon-wash object-cover shadow-sm`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${box} shrink-0 overflow-hidden rounded-sm border border-celadon/30 bg-celadon-wash px-1 py-2 shadow-sm`}
    >
      <div
        className={`spine mx-auto h-full overflow-hidden font-semibold leading-tight text-celadon-deep ${
          book.lang === 'ja' ? 'font-mincho' : 'font-literata'
        } ${size === 'sm' ? 'text-[10px]' : 'text-[15px]'}`}
      >
        {book.title}
      </div>
    </div>
  );
}
