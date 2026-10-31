import type { Lang } from './types.ts';

// Quoted-dialogue detection, shared so the reader draws speech bubbles around exactly the text the
// server voices as dialogue in drama mode.

const LETTER = /[\p{L}\p{N}]/u;

/** Japanese brackets, nesting allowed: 「…『…』…」. */
const JA_PAIRS: Record<string, string> = { '「': '」', '『': '』' };

/**
 * Character ranges [start, end) of quoted dialogue, quote marks included.
 * English: “…” and "…", plus ‘…’ when the ‘ opens a quote rather than eliding a letter
 * (‘Tis) and the ’ closes it rather than being an apostrophe (don’t).
 */
export function dialogueRanges(text: string, lang: Lang): [number, number][] {
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
