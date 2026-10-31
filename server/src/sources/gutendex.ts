import type { BookDetail, BookSummary, ChapterContent, SearchResult, TocPage } from '../../../shared/types.ts';
import { cached, DAY, FOREVER, MINUTE } from '../lib/cache.ts';
import { fetchJson, fetchText, UpstreamError } from '../lib/http.ts';
import type { SourceAdapter } from './index.ts';

const API = 'https://gutendex.com/books/';
const PAGE_SIZE = 32; // fixed by Gutendex

interface GutendexBook {
  id: number;
  title: string;
  authors: { name: string }[];
  summaries?: string[];
  subjects: string[];
  formats: Record<string, string>;
  copyright: boolean | null;
}

interface GutendexList {
  count: number;
  next: string | null;
  results: GutendexBook[];
}

interface ParsedChapter {
  title: string;
  group?: string;
  paragraphs: string[];
}

/** "Austen, Jane" -> "Jane Austen" */
function displayName(name: string) {
  const [last, first] = name.split(', ');
  return first ? `${first} ${last}` : name;
}

function toSummary(b: GutendexBook): BookSummary {
  return {
    source: 'gutenberg',
    id: String(b.id),
    lang: 'en',
    title: b.title,
    author: b.authors.map((a) => displayName(a.name)).join(', ') || 'Anonymous',
    cover: b.formats['image/jpeg'],
    summary: b.summaries?.[0]?.replace(/\s*\(This is an automatically generated summary\.\)\s*$/, ''),
    tags: b.subjects.slice(0, 4).map((s) => s.split(' -- ')[0]),
  };
}

async function list(params: Record<string, string>, page: number): Promise<SearchResult> {
  const qs = new URLSearchParams({ languages: 'en', copyright: 'false', ...params, page: String(page) });
  const url = `${API}?${qs}`;
  const data = await cached('gutendex-list', url, 30 * MINUTE, () => fetchJson<GutendexList>(url, 90000));
  return {
    items: data.results.map(toSummary),
    total: data.count,
    page,
    hasMore: Boolean(data.next),
  };
}

async function meta(id: string) {
  if (!/^\d+$/.test(id)) throw new UpstreamError(`不是有效的 Gutenberg 书号：${id}`, 400);
  return cached('gutendex-meta', id, DAY, () => fetchJson<GutendexBook>(`${API}${id}/`, 90000));
}

function textUrl(b: GutendexBook) {
  const plain = Object.entries(b.formats).filter(([type, url]) => type.startsWith('text/plain') && !url.endsWith('.zip'));
  const utf8 = plain.find(([type]) => type.includes('utf-8'));
  return (utf8 ?? plain[0])?.[1] ?? `https://www.gutenberg.org/ebooks/${b.id}.txt.utf-8`;
}

// ---- Plain-text parsing -------------------------------------------------------

const HEADING_RE =
  /^(chapter|book|part|letter|stave|volume|canto|section|act)\s+([0-9]+|[ivxlcdm]+|the\s+\w+|[a-z]+(-[a-z]+)?)\b[.:]?/i;
const ROMAN_RE = /^[IVXLC]+\.?$/;
/** "IV. THE BOSCOMBE VALLEY MYSTERY" — numbered all-caps titles (story collections). */
const ROMAN_TITLE_RE = /^[IVXLC]+\.\s+[A-Z0-9][A-Z0-9’'",.:;!?\- ]+$/;
const TOC_MAX_CHARS = 2000;
const FRONT_MATTER_MIN_CHARS = 1000;
const CHUNK_CHARS = 12000;

function stripBoilerplate(raw: string) {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const start = text.search(/^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG.*$/im);
  const end = text.search(/^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG.*$/im);
  const from = start >= 0 ? text.indexOf('\n', start) + 1 : 0;
  return text.slice(from, end >= 0 ? end : undefined);
}

/** Unwraps hard-wrapped lines into paragraphs; "* * *" style separators become "" scene breaks. */
function toParagraphs(body: string): string[] {
  const out: string[] = [];
  // Illustrated editions sometimes bury the chapter heading inside the illustration caption.
  const withoutIllustrations = body.replace(/\[Illustration([^\]]*)\]/g, (_, caption: string) => {
    const heading = caption.split('\n').map((l) => l.trim()).find((l) => HEADING_RE.test(l));
    return heading ? `\n\n${heading}\n\n` : '';
  });
  for (const block of withoutIllustrations.split(/\n[ \t]*\n/)) {
    const p = block
      .split('\n')
      .map((l) => l.trim())
      .join(' ')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (!p) continue;
    if (/^[*\s.]+$/.test(p)) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    out.push(p);
  }
  return out;
}

function isHeading(p: string, romanHeadings: boolean) {
  // Keyword headings may carry a long title wrapped over two lines.
  if (HEADING_RE.test(p)) return p.length <= 160;
  if (p.length > 90) return false;
  return ROMAN_TITLE_RE.test(p) || (romanHeadings && ROMAN_RE.test(p));
}

const size = (c: ParsedChapter) => c.paragraphs.reduce((n, p) => n + p.length, 0);
const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Turns raw heading-delimited sections into reading chapters:
 * - a heading with no body (e.g. "Book the First") becomes the group of the chapters after it;
 * - a small section whose title reappears later is a table-of-contents entry and is dropped;
 * - short front matter (title pages) is dropped.
 */
function refine(sections: ParsedChapter[]): ParsedChapter[] {
  const keys = sections.map((c) => titleKey(c.title));
  // TOC lines may carry a description the body heading lacks: "CHAPTER V. Tom meets..." vs "CHAPTER V".
  const repeats = (i: number) => keys.slice(i + 1).some((k) => k === keys[i] || keys[i].startsWith(`${k} `));

  const out: ParsedChapter[] = [];
  let group: string | undefined;
  sections.forEach((c, i) => {
    const chars = size(c);
    if (i === 0) {
      if (chars >= FRONT_MATTER_MIN_CHARS) out.push(c);
      return;
    }
    const repeatsLater = repeats(i);
    if (repeatsLater && chars < TOC_MAX_CHARS) return;
    if (repeatsLater && out.length === 0) {
      // Last table-of-contents line followed by prefatory material (etymology, extracts...).
      out.push({ ...c, title: 'Front matter' });
      return;
    }
    if (chars === 0) {
      group = c.title;
      return;
    }
    // A top-level heading that has its own text (e.g. the next story in a collection) ends the group.
    if (ROMAN_TITLE_RE.test(c.title) || /^(book|part|volume)\b/i.test(c.title)) group = undefined;
    out.push({ ...c, group });
  });
  return out;
}

export function splitChapters(raw: string): ParsedChapter[] {
  const paragraphs = toParagraphs(stripBoilerplate(raw));
  const romanHeadings = paragraphs.filter((p) => ROMAN_RE.test(p)).length >= 3;

  const chapters: ParsedChapter[] = [];
  let current: ParsedChapter = { title: 'Front matter', paragraphs: [] };
  for (const p of paragraphs) {
    if (p === '' && current.paragraphs.length === 0) continue;
    if (isHeading(p, romanHeadings)) {
      chapters.push(current);
      current = { title: p, paragraphs: [] };
    } else {
      current.paragraphs.push(p);
    }
  }
  chapters.push(current);

  const real = refine(chapters);
  if (real.length >= 2) return real;

  // No usable headings: cut the book into readable parts at paragraph boundaries.
  const parts: ParsedChapter[] = [];
  let part: ParsedChapter = { title: 'Part 1', paragraphs: [] };
  let chars = 0;
  for (const p of paragraphs) {
    part.paragraphs.push(p);
    chars += p.length;
    if (chars >= CHUNK_CHARS) {
      parts.push(part);
      part = { title: `Part ${parts.length + 1}`, paragraphs: [] };
      chars = 0;
    }
  }
  if (part.paragraphs.length) parts.push(part);
  return parts;
}

// Raw text is cached on disk; parsing is cheap and kept in memory so parser fixes apply on restart.
const parsedBooks = new Map<string, Promise<ParsedChapter[]>>();

function chapters(id: string): Promise<ParsedChapter[]> {
  let job = parsedBooks.get(id);
  if (!job) {
    job = (async () => {
      const book = await meta(id);
      const raw = await cached('gutenberg-text', id, FOREVER, () => fetchText(textUrl(book), 60000));
      return splitChapters(raw);
    })();
    job.catch(() => parsedBooks.delete(id));
    parsedBooks.set(id, job);
  }
  return job;
}

export const gutendex: SourceAdapter = {
  popular: (page) => list({}, page),

  search: (q, page) => list({ search: q }, page),

  async book(id): Promise<BookDetail> {
    const [book, chs] = await Promise.all([meta(id), chapters(id)]);
    return { ...toSummary(book), chapterCount: chs.length, tocPages: 1 };
  },

  async toc(id): Promise<TocPage> {
    const chs = await chapters(id);
    return { page: 1, totalPages: 1, entries: chs.map((c, i) => ({ index: i + 1, title: c.title, group: c.group })) };
  },

  async chapter(id, index): Promise<ChapterContent> {
    const chs = await chapters(id);
    const ch = chs[index - 1];
    if (!ch) throw new UpstreamError(`这本书只有 ${chs.length} 章`, 404);
    return {
      source: 'gutenberg',
      bookId: id,
      lang: 'en',
      index,
      title: ch.title,
      group: ch.group,
      paragraphs: ch.paragraphs,
      prev: index > 1 ? index - 1 : null,
      next: index < chs.length ? index + 1 : null,
    };
  },
};
