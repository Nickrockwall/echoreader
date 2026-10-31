import * as cheerio from 'cheerio';
import { unzipSync } from 'fflate';
import type { BookDetail, BookSummary, ChapterContent, SearchResult, TocPage } from '../../../shared/types.ts';
import { cached, DAY, FOREVER } from '../lib/cache.ts';
import { fetchBytes, fetchText, UpstreamError } from '../lib/http.ts';
import { chunk, htmlBlocks, tidyParagraphs } from './htmlText.ts';
import type { SourceAdapter } from './index.ts';

const SITE = 'https://www.aozora.gr.jp';
/** The full catalogue as CSV (one row per work and person), published by Aozora Bunko itself. */
const INDEX_URL = `${SITE}/index_pages/list_person_all_extended_utf8.zip`;
const PAGE_SIZE = 30;
/** Works without headings longer than this are cut into parts. */
const SINGLE_CHAPTER_MAX = 30000;

interface Work {
  id: string;
  title: string;
  /** Title and subtitle readings, for kana search. */
  reading: string;
  subtitle: string;
  author: string;
  authorReading: string;
  firstPublished: string;
  orthography: string;
  xhtml: string;
  encoding: string;
}

interface ParsedChapter {
  title: string;
  group?: string;
  paragraphs: string[];
}

// ---- Catalogue ------------------------------------------------------------------

/** Minimal RFC 4180 reader (quoted fields may contain commas, quotes and newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

async function loadCatalogue(): Promise<Work[]> {
  const zip = unzipSync(await fetchBytes(INDEX_URL, 90000));
  const csv = Object.values(zip)[0];
  if (!csv) throw new UpstreamError('青空文库作品清单是空的');
  const [head, ...rows] = parseCsv(new TextDecoder('utf-8').decode(csv).replace(/^﻿/, ''));
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new UpstreamError(`青空文库作品清单缺少「${name}」一栏，格式可能变了`);
    return i;
  };
  const c = {
    id: col('作品ID'), title: col('作品名'), reading: col('作品名読み'), subtitle: col('副題'),
    subtitleReading: col('副題読み'), firstPublished: col('初出'), orthography: col('文字遣い種別'),
    workCopyright: col('作品著作権フラグ'), last: col('姓'), first: col('名'), lastReading: col('姓読み'),
    firstReading: col('名読み'), role: col('役割フラグ'), personCopyright: col('人物著作権フラグ'),
    xhtml: col('XHTML/HTMLファイルURL'), encoding: col('XHTML/HTMLファイル符号化方式'),
  };

  // Only works free of copyright for every person involved (translators included).
  const protectedIds = new Set(rows.filter((r) => r[c.workCopyright] === 'あり' || r[c.personCopyright] === 'あり').map((r) => r[c.id]));
  const works = new Map<string, Work>();
  for (const r of rows) {
    const id = r[c.id];
    if (!id || protectedIds.has(id) || !r[c.xhtml]?.startsWith('http')) continue;
    if (r[c.role] !== '著者') continue;
    const name = `${r[c.last]}${r[c.first]}`;
    const nameReading = `${r[c.lastReading]}${r[c.firstReading]}`;
    const known = works.get(id);
    if (known) {
      if (!known.author.split('・').includes(name)) {
        known.author += `・${name}`;
        known.authorReading += ` ${nameReading}`;
      }
      continue;
    }
    works.set(id, {
      id: String(Number(id)),
      title: r[c.title],
      reading: `${r[c.reading]} ${r[c.subtitleReading]}`.trim(),
      subtitle: r[c.subtitle],
      author: name,
      authorReading: nameReading,
      firstPublished: r[c.firstPublished],
      orthography: r[c.orthography],
      xhtml: r[c.xhtml].replace(/^http:/, 'https:'),
      encoding: r[c.encoding],
    });
  }
  return [...works.values()];
}

let catalogueJob: Promise<{ works: Work[]; byId: Map<string, Work> }> | undefined;

function catalogue() {
  if (!catalogueJob) {
    catalogueJob = cached('aozora-index', 'v1', 7 * DAY, loadCatalogue).then((works) => ({
      works,
      byId: new Map(works.map((w) => [w.id, w])),
    }));
    catalogueJob.catch(() => (catalogueJob = undefined));
  }
  return catalogueJob;
}

async function work(id: string): Promise<Work> {
  if (!/^\d+$/.test(id)) throw new UpstreamError(`不是有效的青空文库作品编号：${id}`, 400);
  const w = (await catalogue()).byId.get(String(Number(id)));
  if (!w) throw new UpstreamError('青空文库里没有这部作品，或者它仍受著作权保护', 404);
  return w;
}

/** Work ids in order of the most recent yearly access ranking. */
async function ranking(): Promise<string[]> {
  return cached('aozora-ranking', 'latest', 7 * DAY, async () => {
    const index = await fetchText(`${SITE}/access_ranking/`);
    const years = [...index.matchAll(/href="(\d{4})_xhtml\.html"/g)].map((m) => m[1]).sort();
    const year = years[years.length - 1];
    if (!year) throw new UpstreamError('找不到青空文库的访问排行');
    const page = await fetchText(`${SITE}/access_ranking/${year}_xhtml.html`);
    return [...page.matchAll(/cards\/\d+\/card(\d+)\.html/g)].map((m) => m[1]);
  });
}

function toSummary(w: Work): BookSummary {
  return {
    source: 'aozora',
    id: w.id,
    lang: 'ja',
    title: w.subtitle ? `${w.title}　${w.subtitle}` : w.title,
    author: w.author,
    summary: w.firstPublished ? `初出：${w.firstPublished}` : undefined,
    tags: [w.orthography].filter(Boolean),
  };
}

const page = <T>(items: T[], n: number) => items.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE);

/** Folds width, case and katakana so 'ソウセキ', 'そうせき' and 'ｿｳｾｷ' all match. */
function fold(s: string) {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　・]/g, '');
}

// ---- Text ------------------------------------------------------------------------

/**
 * Splits the main text at its headings. With both 大見出し and 中見出し, the larger ones become
 * groups; a work without headings is one chapter (or parts, when it is long).
 */
function splitWork(w: Work, html: string): { chapters: ParsedChapter[]; colophon: string[] } {
  const $ = cheerio.load(html);
  const main = $('.main_text').get(0);
  if (!main) throw new UpstreamError('青空文库页面结构和预期不一致');
  const blocks = htmlBlocks($, main, { lang: 'ja', blankLines: true });

  const count = (cls: string) => blocks.filter((b) => b.kind === 'heading' && b.className.includes(cls)).length;
  const levels = ['o-midashi', 'naka-midashi', 'ko-midashi'];
  const chapterLevel = count('naka-midashi') >= 2 ? 'naka-midashi' : levels.find((l) => count(l) >= 2);
  const groupLevel = chapterLevel === 'naka-midashi' && count('o-midashi') ? 'o-midashi' : undefined;
  const title = toSummary(w).title;

  const chapters: ParsedChapter[] = [];
  let current: ParsedChapter = { title, paragraphs: [] };
  let group: string | undefined;
  for (const b of blocks) {
    if (b.kind === 'heading' && chapterLevel && b.className.includes(chapterLevel)) {
      chapters.push(current);
      current = { title: b.text, group, paragraphs: [] };
    } else if (b.kind === 'heading' && groupLevel && b.className.includes(groupLevel)) {
      chapters.push(current);
      group = b.text;
      current = { title: b.text, group, paragraphs: [] };
    } else {
      current.paragraphs.push(b.text);
    }
  }
  chapters.push(current);

  let real = chapters
    .map((c) => ({ ...c, paragraphs: tidyParagraphs(c.paragraphs) }))
    .filter((c) => c.paragraphs.length > 0);
  if (real.length === 0) throw new UpstreamError('这部作品的正文是空的');
  if (real.length === 1 && real[0].paragraphs.join('').length > SINGLE_CHAPTER_MAX) {
    real = chunk(real[0].paragraphs, (n) => `${title}（${n}）`);
  }

  // Aozora asks that the source edition and the volunteers' credits travel with the text.
  const colophon = $('.bibliographical_information').get(0);
  const credits = colophon ? htmlBlocks($, colophon, { lang: 'ja' }).map((b) => b.text) : [];
  return { chapters: real, colophon: tidyParagraphs(credits) };
}

const parsed = new Map<string, Promise<ReturnType<typeof splitWork>>>();

function text(id: string) {
  let job = parsed.get(id);
  if (!job) {
    job = (async () => {
      const w = await work(id);
      const html = await cached('aozora-text', w.xhtml, FOREVER, async () => {
        const bytes = await fetchBytes(w.xhtml, 60000);
        const declared = /utf-?8/i.test(w.encoding) ? 'utf-8' : 'shift_jis';
        return new TextDecoder(declared).decode(bytes);
      });
      return splitWork(w, html);
    })();
    job.catch(() => parsed.delete(id));
    parsed.set(id, job);
  }
  return job;
}

export const aozora: SourceAdapter = {
  async popular(n): Promise<SearchResult> {
    const [{ byId }, ids] = await Promise.all([catalogue(), ranking()]);
    const works = ids.map((id) => byId.get(id)).filter((w): w is Work => Boolean(w));
    return { items: page(works, n).map(toSummary), total: works.length, page: n, hasMore: n * PAGE_SIZE < works.length };
  },

  async search(q, n): Promise<SearchResult> {
    const [{ works }, ids] = await Promise.all([catalogue(), ranking().catch(() => [] as string[])]);
    const rank = new Map(ids.map((id, i) => [id, i]));
    const needle = fold(q);
    const scored: [number, Work][] = [];
    for (const w of works) {
      const title = fold(w.title + w.subtitle);
      const reading = fold(w.reading);
      const author = fold(w.author);
      const authorReading = fold(w.authorReading);
      // An author's full, family or given name ranks with an exact title ("そうせき" finds Sōseki's works).
      const authorHit =
        needle.length >= 2 &&
        (author === needle || authorReading === needle || author.startsWith(needle) || authorReading.startsWith(needle) ||
          author.endsWith(needle) || authorReading.endsWith(needle));
      let score = -1;
      if (title === needle || authorHit) score = 0;
      else if (title.startsWith(needle) || reading.startsWith(needle)) score = 1;
      else if (title.includes(needle)) score = 2;
      else if (author.includes(needle) || authorReading.includes(needle)) score = 3;
      else if (reading.includes(needle)) score = 4;
      if (score >= 0) scored.push([score, w]);
    }
    const popularity = (w: Work) => rank.get(w.id) ?? Number.MAX_SAFE_INTEGER;
    scored.sort((a, b) => a[0] - b[0] || popularity(a[1]) - popularity(b[1]) || Number(a[1].id) - Number(b[1].id));
    return { items: page(scored, n).map(([, w]) => toSummary(w)), total: scored.length, page: n, hasMore: n * PAGE_SIZE < scored.length };
  },

  async book(id): Promise<BookDetail> {
    const [w, t] = await Promise.all([work(id), text(id)]);
    return { ...toSummary(w), chapterCount: t.chapters.length, tocPages: 1 };
  },

  async toc(id): Promise<TocPage> {
    const { chapters } = await text(id);
    return { page: 1, totalPages: 1, entries: chapters.map((c, i) => ({ index: i + 1, title: c.title, group: c.group })) };
  },

  async chapter(id, index): Promise<ChapterContent> {
    const [w, { chapters, colophon }] = await Promise.all([work(id), text(id)]);
    const ch = chapters[index - 1];
    if (!ch) throw new UpstreamError(`这部作品只有 ${chapters.length} 章`, 404);
    const last = index === chapters.length;
    return {
      source: 'aozora',
      bookId: w.id,
      lang: 'ja',
      index,
      title: ch.title,
      group: ch.group,
      paragraphs: ch.paragraphs,
      afterword: last && colophon.length ? colophon : undefined,
      prev: index > 1 ? index - 1 : null,
      next: last ? null : index + 1,
    };
  },
};
