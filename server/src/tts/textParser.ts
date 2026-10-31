import type { Lang } from '../../../shared/types.ts';

export interface ScriptSegment {
  type: 'narration' | 'dialogue';
  text: string;
  /** Where `text` starts in the parsed string, so word timings can be mapped back. */
  offset: number;
}

const SPEAKABLE = /[\p{L}\p{N}]/u;
const LETTER = /[\p{L}\p{N}]/u;

/** Japanese brackets, nesting allowed: 「…『…』…」. */
const JA_PAIRS: Record<string, string> = { '「': '」', '『': '』' };

/**
 * Character ranges [start, end) of quoted dialogue, quote marks included.
 * English: “…” and "…", plus ‘…’ when the ‘ opens a quote rather than eliding a letter
 * (‘Tis) and the ’ closes it rather than being an apostrophe (don’t).
 */
function dialogueRanges(text: string, lang: Lang): [number, number][] {
  const ranges: [number, number][] = [];
  let start = -1;

  if (lang === 'ja') {
    const stack: string[] = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (JA_PAIRS[c]) {
        if (!stack.length) start = i;
        stack.push(JA_PAIRS[c]);
      } else if (stack.length && c === stack[stack.length - 1]) {
        stack.pop();
        if (!stack.length) ranges.push([start, i + 1]);
      }
    }
    if (stack.length) ranges.push([start, text.length]); // the line ends mid-quote
    return ranges;
  }

  let closer = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = text[i - 1] ?? ' ';
    const next = text[i + 1] ?? ' ';
    if (!closer) {
      if (c === '“') closer = '”';
      else if (c === '"') closer = '"';
      else if (c === '‘' && !LETTER.test(prev) && LETTER.test(next)) closer = '’';
      if (closer) start = i;
    } else if (c === closer && (closer !== '’' || !LETTER.test(next))) {
      ranges.push([start, i + 1]);
      closer = '';
    }
  }
  if (closer) ranges.push([start, text.length]);
  return ranges;
}

/**
 * Splits text into narration and dialogue for drama mode. Pieces with nothing to say
 * (bare punctuation between quotes) are dropped; neighbours of the same kind are merged.
 */
export function parseDramaSegments(text: string, lang: Lang): ScriptSegment[] {
  const pieces: ScriptSegment[] = [];
  let cursor = 0;
  for (const [s, e] of dialogueRanges(text, lang)) {
    if (s > cursor) pieces.push({ type: 'narration', text: text.slice(cursor, s), offset: cursor });
    pieces.push({ type: 'dialogue', text: text.slice(s, e), offset: s });
    cursor = e;
  }
  if (cursor < text.length) pieces.push({ type: 'narration', text: text.slice(cursor), offset: cursor });

  const out: ScriptSegment[] = [];
  for (const p of pieces) {
    if (!SPEAKABLE.test(p.text)) continue;
    const last = out[out.length - 1];
    if (last && last.type === p.type && last.offset + last.text.length === p.offset) {
      last.text += p.text;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}
