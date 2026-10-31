import { useEffect, useState } from 'react';
import type { ChapterContent } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';
import { parseRuby, type RubySpan } from '../lib/text.ts';

export interface ChapterFurigana {
  preface?: RubySpan[][];
  body?: RubySpan[][];
  afterword?: RubySpan[][];
}

const cache = new Map<string, Promise<ChapterFurigana>>();

async function load(chapter: ChapterContent): Promise<ChapterFurigana> {
  const blocks = [chapter.preface ?? [], chapter.paragraphs, chapter.afterword ?? []];
  // Analysis runs on the plain text, so the offsets line up with buildParagraph's.
  const texts = blocks.flat().map((p) => parseRuby(p).text);
  const spans = await api.furigana(texts);
  const toRuby = (list: [number, number, string][]) => list.map(([start, end, reading]) => ({ start, end, reading }));
  let i = 0;
  const [preface, body, afterword] = blocks.map((b) => b.map(() => toRuby(spans[i++])));
  return { preface, body, afterword };
}

/** Generated furigana for a Japanese chapter while `enabled`; empty otherwise. */
export function useFurigana(chapter: ChapterContent, enabled: boolean): ChapterFurigana {
  const [result, setResult] = useState<{ key: string; value: ChapterFurigana } | null>(null);
  const key = `${chapter.source}:${chapter.bookId}:${chapter.index}`;
  const active = enabled && chapter.lang === 'ja';

  useEffect(() => {
    if (!active) return;
    let job = cache.get(key);
    if (!job) {
      job = load(chapter);
      job.catch(() => cache.delete(key));
      cache.set(key, job);
    }
    let live = true;
    job.then((value) => live && setResult({ key, value })).catch(() => {});
    return () => {
      live = false;
    };
  }, [active, key, chapter]);

  return active && result?.key === key ? result.value : {};
}
