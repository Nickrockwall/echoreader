import { Fragment, memo, type ReactNode } from 'react';
import type { Paragraph, Token } from '../../lib/text.ts';

function renderSurface(tok: Token): ReactNode {
  if (!tok.ruby.length) return tok.surface;
  const parts: ReactNode[] = [];
  let cursor = tok.start;
  for (const r of tok.ruby) {
    if (r.start > cursor) parts.push(tok.surface.slice(cursor - tok.start, r.start - tok.start));
    parts.push(
      <ruby key={r.start}>
        {tok.surface.slice(r.start - tok.start, r.end - tok.start)}
        <rp>(</rp>
        <rt>{r.reading}</rt>
        <rp>)</rp>
      </ruby>,
    );
    cursor = r.end;
  }
  if (cursor < tok.end) parts.push(tok.surface.slice(cursor - tok.start));
  return parts;
}

/**
 * One paragraph: sentences are wrapped (for read-along highlighting later), word-like tokens
 * become clickable spans. Clicks are handled by delegation on the article via data-tok.
 */
export const ParagraphView = memo(function ParagraphView({ paragraph }: { paragraph: Paragraph }) {
  if (paragraph.isBreak) return <div className="scene-break" aria-hidden />;
  return (
    <p data-pid={paragraph.id}>
      {paragraph.sentences.map((s) => (
        <span key={s.id} data-sid={s.id}>
          {s.tokens.map((t) =>
            t.isWord ? (
              <span key={t.id} className="tok" data-tok={t.id}>
                {renderSurface(t)}
              </span>
            ) : (
              <Fragment key={t.id}>{renderSurface(t)}</Fragment>
            ),
          )}
        </span>
      ))}
    </p>
  );
});
