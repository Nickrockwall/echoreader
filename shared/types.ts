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

// ---- Dictionary ---------------------------------------------------------------

export interface DictLookupRequest {
  lang: Lang;
  /** The clicked word as displayed. */
  word: string;
  /** Sentence around the word, so Japanese can be analyzed in context (base form, reading). */
  sentence?: string;
  /** Offset of `word` within `sentence`. */
  offset?: number;
}

export interface DictSense {
  pos: string[];
  glosses: string[];
  /** Usage notes: "usually kana", "slang", ... */
  notes: string[];
  example?: string;
  /** Translation of `example` into the reader's language, when the source has one. */
  exampleTranslation?: string;
}

export interface DictEntry {
  headword: string;
  /** Japanese: kana reading. English: IPA. */
  reading?: string;
  /** Other written forms (Japanese) */
  variants?: string[];
  common?: boolean;
  /** Pronunciation audio, when the dictionary offers one (English). */
  audio?: string;
  /** Who made that recording and under what terms (it is separately licensed). */
  audioCredit?: Credit;
  senses: DictSense[];
}

/** Attribution for a piece of licensed content, as shown next to it. */
export interface Credit {
  name: string;
  /** The source page (e.g. the Wiktionary entry this definition came from). */
  url?: string;
  license: string;
  licenseUrl: string;
}

export interface DictResult {
  lang: Lang;
  word: string;
  /** Dictionary form actually looked up (食べました -> 食べる, running -> run). */
  lemma: string;
  /** Reading of the clicked text in context (Japanese). */
  reading?: string;
  /** Grammatical role in context, e.g. "動詞・自立" (Japanese). */
  analysis?: string;
  entries: DictEntry[];
  /** Attribution for `entries`. */
  credit: Credit;
  /** Chinese-defined entries (Japanese only), shown ahead of `entries`. */
  zhEntries?: DictEntry[];
  zhCredit?: Credit;
}

export interface FuriganaRequest {
  texts: string[];
}

/** Per input text, ruby spans [start, end, reading] over that text. */
export type FuriganaResult = [number, number, string][][];

// ---- Offline books ---------------------------------------------------------------

export interface OfflineStatus {
  state: 'none' | 'running' | 'done' | 'error';
  /** Chapters fetched so far, out of `total`. */
  done: number;
  total: number;
  finishedAt?: string;
  error?: string;
}

// ---- Vocabulary book -------------------------------------------------------------

export interface VocabInput {
  lang: Lang;
  /** As it appeared in the text (食べ). */
  word: string;
  /** Dictionary form (食べる); one entry per lang + lemma. */
  lemma: string;
  reading?: string;
  /** Short meaning shown on the card back. */
  meaning: string;
  sentence: string;
  /** Offset of `word` within `sentence`. */
  offset: number;
  source?: SourceId;
  bookId?: string;
  bookTitle?: string;
  chapter?: number;
}

export interface VocabItem extends VocabInput {
  id: number;
  createdAt: string;
}

export interface ApiError {
  error: string;
}
