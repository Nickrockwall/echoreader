import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ChapterContent } from '../../../../shared/types.ts';
import { useSegmenter } from '../../hooks/useSegmenter.ts';
import { AudioPlayer } from '../AudioPlayer/AudioPlayer.tsx';
import type { Paragraph } from '../../lib/text.ts';
import { useReaderStore } from '../../store/useReaderStore.ts';
import { ParagraphView } from './ParagraphView.tsx';
import { useTokenPicking } from './useTokenPicking.ts';

const LABELS = {
  ja: { preface: '前書き', afterword: '後書き', prev: '前の話', next: '次の話' },
  en: { preface: 'Preface', afterword: 'Afterword', prev: 'Previous chapter', next: 'Next chapter' },
};

/** "CHAPTER I. Down the Rabbit-Hole" -> label "Chapter I", title "Down the Rabbit-Hole". */
function splitHeading(title: string): { label?: string; title: string } {
  const m = title.match(/^(chapter|letter|book|part|stave|act)\s+([0-9]+|[ivxlcdm]+)\.?\s+(.{3,})$/i);
  if (!m) return { title };
  const word = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  return { label: `${word} ${m[2].toUpperCase()}`, title: m[3] };
}

function AuthorNote({ label, paragraphs }: { label: string; paragraphs: Paragraph[] }) {
  if (!paragraphs.length) return null;
  return (
    <details className="group my-8 rounded-md border border-rule px-5 py-3 text-[0.88em] text-ink-soft">
      <summary className="cursor-pointer font-ui text-sm text-ink-faint marker:text-rule">{label}</summary>
      <div className="mt-3">
        {paragraphs.map((p) => (
          <ParagraphView key={p.id} paragraph={p} />
        ))}
      </div>
    </details>
  );
}

export function Reader({ chapter }: { chapter: ChapterContent }) {
  const { fontSize, lineHeight, openChapter, status } = useReaderStore();
  const lang = chapter.lang;
  const labels = LABELS[lang];

  const preface = useSegmenter(chapter.preface, lang, 'pre');
  const body = useSegmenter(chapter.paragraphs, lang, 'p');
  const afterword = useSegmenter(chapter.afterword, lang, 'aft');
  const onClick = useTokenPicking([preface, body, afterword], lang);

  const go = (index: number | null) => index && openChapter(chapter.source, chapter.bookId, index);
  const heading = splitHeading(chapter.title);

  return (
    <article
      lang={lang}
      onClick={onClick}
      className="prose-reader mx-auto px-6 pb-32 pt-16 sm:px-10"
      style={{ '--reader-size': `${fontSize}px`, '--reader-leading': lineHeight } as React.CSSProperties}
      aria-busy={status === 'loading'}
    >
      <header className="mb-14">
        {chapter.group && <p className="!indent-0 mb-3 font-ui text-sm text-ink-faint">{chapter.group}</p>}
        {heading.label && <p className="!indent-0 mb-2 text-[0.95em] italic text-celadon-deep">{heading.label}</p>}
        <h1 className="text-[1.75em] font-semibold leading-snug tracking-wide text-ink">{heading.title}</h1>
        <div className="mt-6 h-px w-16 bg-celadon" />
      </header>

      <AuthorNote label={labels.preface} paragraphs={preface} />

      <div className="text-ink">
        {body.map((p) => (
          <ParagraphView key={p.id} paragraph={p} />
        ))}
      </div>

      <AuthorNote label={labels.afterword} paragraphs={afterword} />

      <nav className="mt-20 flex items-center justify-between gap-4 border-t border-rule pt-6 font-ui text-sm">
        <button
          type="button"
          disabled={!chapter.prev}
          onClick={() => go(chapter.prev)}
          className="flex items-center gap-1 rounded-md px-3 py-2 text-ink-soft hover:bg-celadon-wash hover:text-ink disabled:invisible"
        >
          <ChevronLeft size={16} /> {labels.prev}
        </button>
        <button
          type="button"
          disabled={!chapter.next}
          onClick={() => go(chapter.next)}
          className="flex items-center gap-1 rounded-md bg-celadon px-4 py-2 text-page hover:bg-celadon-deep disabled:invisible"
        >
          {labels.next} <ChevronRight size={16} />
        </button>
      </nav>
      <AudioPlayer chapter={chapter} paragraphs={body} />
    </article>
  );
}
