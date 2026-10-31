import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { dialogueRanges } from '../../../../shared/dialogue.ts';
import type { Lang } from '../../../../shared/types.ts';
import type { Paragraph, Token } from '../../lib/text.ts';

function renderSurface(tok: Token): ReactNode {
  if (!tok.ruby.length) return tok.surface;
  const parts: ReactNode[] = [];
  let cursor = tok.start;
  for (const r of tok.ruby) {
    if (r.start > cursor) parts.push(tok.surface.slice(cursor - tok.start, r.start - tok.start));
    parts.push(
      <ruby key={r.start} data-auto={r.auto ? '' : undefined}>
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

function renderToken(t: Token) {
  return t.isWord ? (
    // Short half-width numbers get .tcy so vertical text can set them upright (縦中横).
    <span key={t.id} className={/^[0-9]{1,2}$/.test(t.surface) ? 'tok tcy' : 'tok'} data-tok={t.id}>
      {renderSurface(t)}
    </span>
  ) : (
    <Fragment key={t.id}>{renderSurface(t)}</Fragment>
  );
}

/** A stretch of one sentence that is either all dialogue or all narration. */
interface Piece {
  sentenceId: string;
  dialogue: boolean;
  tokens: Token[];
}

const SPEAKABLE = /[\p{L}\p{N}]/u;

/**
 * One paragraph: sentences are wrapped (for read-along highlighting), word-like tokens become
 * clickable spans; clicks are handled by delegation on the article via data-tok.
 *
 * With `speaker` set (drama mode), quoted dialogue is drawn as speech bubbles. A sentence that
 * crosses a bubble edge is split into pieces that share its data-sid.
 */
export const ParagraphView = memo(function ParagraphView({
  paragraph,
  lang,
  speaker,
}: {
  paragraph: Paragraph;
  lang?: Lang;
  /** Name shown on dialogue bubbles; no bubbles when absent. */
  speaker?: string;
}) {
  const ranges = useMemo(
    () => (speaker && lang && !paragraph.isBreak ? dialogueRanges(paragraph.text, lang) : []),
    [speaker, lang, paragraph],
  );

  if (paragraph.isBreak) return <div className="scene-break" aria-hidden />;

  if (!ranges.length) {
    return (
      <p data-pid={paragraph.id}>
        {paragraph.sentences.map((s) => (
          <span key={s.id} data-sid={s.id}>
            {s.tokens.map(renderToken)}
          </span>
        ))}
      </p>
    );
  }

  const inDialogue = (t: Token) => ranges.some(([s, e]) => t.start >= s && t.end <= e);
  // Whole-line dialogue (the usual web-novel layout) becomes one block bubble.
  const outside = ranges.reduce((text, [s, e]) => text.slice(0, s) + ' '.repeat(e - s) + text.slice(e), paragraph.text);
  const wholeLine = !SPEAKABLE.test(outside);

  const pieces: Piece[] = [];
  for (const s of paragraph.sentences) {
    for (const t of s.tokens) {
      const dialogue = wholeLine || inDialogue(t);
      const last = pieces[pieces.length - 1];
      if (last && last.sentenceId === s.id && last.dialogue === dialogue) last.tokens.push(t);
      else pieces.push({ sentenceId: s.id, dialogue, tokens: [t] });
    }
  }

  const renderPiece = (p: Piece, k: number) => (
    <span key={`${p.sentenceId}-${k}`} data-sid={p.sentenceId}>
      {p.tokens.map(renderToken)}
    </span>
  );

  if (wholeLine) {
    return (
      <p data-pid={paragraph.id} className="bubble bubble-block">
        <span className="bubble-tag" data-skip-text aria-hidden>
          {speaker}
        </span>
        {pieces.map(renderPiece)}
      </p>
    );
  }

  // Group consecutive dialogue pieces into inline bubbles.
  const out: ReactNode[] = [];
  let run: Piece[] = [];
  const flush = () => {
    if (run.length) out.push(<span key={`b${out.length}`} className="bubble">{run.map(renderPiece)}</span>);
    run = [];
  };
  pieces.forEach((p, k) => {
    if (p.dialogue) run.push(p);
    else {
      flush();
      out.push(renderPiece(p, k));
    }
  });
  flush();
  return <p data-pid={paragraph.id}>{out}</p>;
});
