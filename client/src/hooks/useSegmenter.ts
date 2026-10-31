import { useMemo } from 'react';
import type { Lang } from '../../../shared/types.ts';
import { buildParagraph, type Paragraph } from '../lib/text.ts';

/**
 * Segments a block of paragraphs into sentences and word tokens (memoized per input).
 * `prefix` keeps ids unique when several blocks (preface, body, afterword) share a page.
 */
export function useSegmenter(paragraphs: string[] | undefined, lang: Lang, prefix = 'p'): Paragraph[] {
  return useMemo(
    () => (paragraphs ?? []).map((p, i) => buildParagraph(p, i, lang, prefix)),
    [paragraphs, lang, prefix],
  );
}
