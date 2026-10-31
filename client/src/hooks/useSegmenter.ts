import { useMemo } from 'react';
import type { Lang } from '../../../shared/types.ts';
import { buildParagraph, type Paragraph, type RubySpan } from '../lib/text.ts';

/**
 * Segments a block of paragraphs into sentences and word tokens (memoized per input).
 * `prefix` keeps ids unique when several blocks (preface, body, afterword) share a page.
 * `autoRuby[i]` adds generated furigana to paragraph i.
 */
export function useSegmenter(
  paragraphs: string[] | undefined,
  lang: Lang,
  prefix = 'p',
  autoRuby?: RubySpan[][],
): Paragraph[] {
  return useMemo(
    () => (paragraphs ?? []).map((p, i) => buildParagraph(p, i, lang, prefix, autoRuby?.[i])),
    [paragraphs, lang, prefix, autoRuby],
  );
}
