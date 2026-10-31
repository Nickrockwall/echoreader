import type { BookDetail, ChapterContent, SearchResult, SourceId, TocPage } from '../../../shared/types.ts';
import { gutendex } from './gutendex.ts';
import { syosetu } from './syosetu.ts';

export interface SourceAdapter {
  popular(page: number): Promise<SearchResult>;
  search(query: string, page: number): Promise<SearchResult>;
  book(id: string): Promise<BookDetail>;
  toc(id: string, page: number): Promise<TocPage>;
  chapter(id: string, index: number): Promise<ChapterContent>;
}

export const sources: Record<SourceId, SourceAdapter> = {
  syosetu,
  gutenberg: gutendex,
};
