import { useEffect, useMemo, type MouseEvent } from 'react';
import type { Lang } from '../../../../shared/types.ts';
import type { Paragraph, Sentence, Token } from '../../lib/text.ts';
import { useReaderStore } from '../../store/useReaderStore.ts';

export interface TokenHit {
  token: Token;
  sentence: Sentence;
  paragraph: Paragraph;
  lang: Lang;
}

/**
 * Click-to-look-up for word spans rendered by ParagraphView. Uses event delegation and toggles
 * the [data-picked] attribute directly, so picking a word never re-renders the chapter.
 */
export function useTokenPicking(blocks: Paragraph[][], lang: Lang) {
  const pickedTokenId = useReaderStore((s) => s.pickedTokenId);
  const openLookup = useReaderStore((s) => s.openLookup);

  const index = useMemo(() => {
    const map = new Map<string, TokenHit>();
    for (const paragraphs of blocks)
      for (const paragraph of paragraphs)
        for (const sentence of paragraph.sentences)
          for (const token of sentence.tokens) map.set(token.id, { token, sentence, paragraph, lang });
    return map;
  }, [blocks, lang]);

  useEffect(() => {
    if (!pickedTokenId) return;
    const el = document.querySelector(`[data-tok="${pickedTokenId}"]`);
    el?.setAttribute('data-picked', '');
    return () => el?.removeAttribute('data-picked');
  }, [pickedTokenId, index]);

  return (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tok]');
    const hit = el && index.get(el.dataset.tok!);
    if (!hit) return;
    openLookup({
      tokenId: hit.token.id,
      sentenceId: hit.sentence.id,
      lang,
      word: hit.token.surface,
      sentence: hit.sentence.text,
      offset: hit.token.start - hit.sentence.start,
    });
  };
}
