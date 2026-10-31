// Types shared by server and client. Import with `import type` only.

export type SourceId = 'syosetu' | 'gutenberg';
export type Lang = 'ja' | 'en';

export interface BookSummary {
  source: SourceId;
  id: string;
  lang: Lang;
  title: string;
  author: string;
  cover?: string;
  summary?: string;
  /** Number of chapters, when the source knows it without fetching the book. */
  chapterCount?: number;
  tags?: string[];
  /** true = finished, false = ongoing, undefined = unknown */
  complete?: boolean;
}

export interface SearchResult {
  items: BookSummary[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface BookDetail extends BookSummary {
  chapterCount: number;
  tocPages: number;
}

export interface TocEntry {
  /** 1-based chapter index, stable across requests. */
  index: number;
  title: string;
  /** Section/volume heading this chapter belongs to, if any. */
  group?: string;
}

export interface TocPage {
  page: number;
  totalPages: number;
  entries: TocEntry[];
}

/**
 * Paragraph strings use two conventions:
 * - "" marks a scene break (runs of blank lines collapse to one).
 * - Ruby is written as ｜base《reading》 (the ｜ is always present in server output).
 */
export interface ChapterContent {
  source: SourceId;
  bookId: string;
  lang: Lang;
  index: number;
  title: string;
  group?: string;
  paragraphs: string[];
  preface?: string[];
  afterword?: string[];
  prev: number | null;
  next: number | null;
}

/** One spoken word: character range in the synthesized text plus audio time in ms. */
export interface TtsWord {
  offset: number;
  length: number;
  start: number;
  end: number;
}

export interface TtsRequest {
  text: string;
  lang: Lang;
  voice?: string;
}

export interface TtsResult {
  id: string;
  voice: string;
  /** URL of the mp3, served by the API. */
  audio: string;
  words: TtsWord[];
}

export interface ApiError {
  error: string;
}
