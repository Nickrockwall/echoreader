import * as cheerio from 'cheerio';
import { unzipSync } from 'fflate';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BookDetail, BookSummary, ChapterContent, Lang, SearchResult, TocPage } from '../../../shared/types.ts';
import { UpstreamError } from '../lib/http.ts';
import { splitChapters } from './gutendex.ts';
import { chunk, htmlBlocks, tidyParagraphs } from './htmlText.ts';
import type { SourceAdapter } from './index.ts';

/** Imported books live next to the vocabulary database, outside the repository. */
const LIBRARY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/library');

interface ParsedChapter {
  title: string;
  group?: string;
  paragraphs: string[];
}

interface StoredBook {
  id: string;
  lang: Lang;
  title: string;
  author: string;
  fileName: string;
  importedAt: string;
  chapters: ParsedChapter[];
}

export const MAX_IMPORT_BYTES = 60 * 1024 * 1024;

// ---- Language and encoding ------------------------------------------------------------

/** Japanese when kana are a noticeable share of the CJK text; English when Latin letters dominate. */
function detectLang(sample: string): Lang | null {
  const kana = (sample.match(/[぀-ヿ]/g) ?? []).length;
  const han = (sample.match(/[㐀-鿿]/g) ?? []).length;
  const latin = (sample.match(/[A-Za-z]/g) ?? []).length;
  if (kana > 0 && kana >= (kana + han) * 0.1) return 'ja';
  if (latin > (kana + han) * 2) return 'en';
  return null;
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  for (const encoding of ['utf-8', 'shift_jis', 'gb18030']) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^﻿/, '');
    } catch {
      // try the next one
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// ---- Plain text (Japanese) --------------------------------------------------------------

const JA_HEADING =
  /^(第[0-9０-９一二三四五六七八九十百千〇零]+[章話部編幕節回巻]|序章|終章|序幕|終幕|間章|幕間|プロローグ|エピローグ)([\s　:：・「『（(].{0,40})?$/;
const SCENE_BREAK = /^[\s　]*([*＊※◇◆□■○●☆★・]+[\s　]*){1,9}$/;
const KANJI_RUN = '[々〆ヵヶ〇㐀-鿿豈-﫿]+';

/** Aozora-style text: ｜base《reading》 stays, base《reading》 gets its ｜, ［＃…］ notes go. */
function jaLine(line: string): { text: string; heading: boolean } {
  const heading = /［＃[^］]*(大|中|小)見出し[^］]*］/.test(line);
  const text = line
    .replace(/［＃[^］]*］/g, '')
    .replace(new RegExp(`(?<!｜[^《]*)(${KANJI_RUN})《([^》]+)》`, 'g'), '｜$1《$2》')
    .replace(/[|｜]([^《|｜]+)《/g, '｜$1《')
    .replace(/^[\s　]+|[\s　]+$/g, '');
  return { text, heading: heading && text.length > 0 };
}

function splitJapaneseText(raw: string, fallbackTitle: string): { title?: string; author?: string; chapters: ParsedChapter[] } {
  let lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let title: string | undefined;
  let author: string | undefined;

  // Aozora Bunko text files: title, author, then a notation guide between dashed rules; credits after 底本：.
  const rule = lines.findIndex((l) => /^-{20,}$/.test(l.trim()));
  if (rule >= 0 && rule < 12) {
    title = lines[0]?.trim() || undefined;
    author = lines[1]?.trim() || undefined;
    const close = lines.findIndex((l, i) => i > rule && /^-{20,}$/.test(l.trim()));
    lines = lines.slice(close > rule ? close + 1 : rule + 1);
    const colophon = lines.findIndex((l) => /^底本：/.test(l));
    if (colophon > 0) lines = lines.slice(0, colophon);
  }

  const chapters: ParsedChapter[] = [];
  let current: ParsedChapter = { title: title ?? fallbackTitle, paragraphs: [] };
  let blanks = 0;
  for (const raw of lines) {
    const { text, heading } = jaLine(raw);
    if (!text) {
      blanks++;
      continue;
    }
    // Web novels put a blank line between paragraphs; only a longer gap is a scene break.
    if (blanks >= 2 && current.paragraphs.length) current.paragraphs.push('');
    blanks = 0;
    if (heading || (text.length <= 50 && JA_HEADING.test(text))) {
      chapters.push(current);
      current = { title: text, paragraphs: [] };
    } else if (SCENE_BREAK.test(text)) {
      current.paragraphs.push('');
    } else {
      current.paragraphs.push(text);
    }
  }
  chapters.push(current);

  let real: ParsedChapter[] = chapters.map((c) => ({ ...c, paragraphs: tidyParagraphs(c.paragraphs) })).filter((c) => c.paragraphs.length);
  // A few short lines before the first heading are a title page: take the title and author from it.
  const front = chapters[0];
  const frontText = front.paragraphs.join('');
  if (real.length >= 2 && frontText.length > 0 && frontText.length < 200) {
    real = real.slice(1);
    const lines = front.paragraphs.filter(Boolean);
    const byline = lines.find((l) => /^(作者|著者|作|著)[:：\s　]/.test(l) || /[　\s](著|作)$/.test(l));
    title ??= lines.find((l) => l !== byline);
    author ??= byline?.replace(/^(作者|著者|作|著)[:：\s　]*|[　\s]*(著|作)$/g, '') || undefined;
  }
  if (real.length === 1 && real[0].paragraphs.join('').length > 30000) {
    real = chunk(real[0].paragraphs, (n) => `（${n}）`);
  }
  return { title, author, chapters: real };
}

// ---- EPUB --------------------------------------------------------------------------------

function parseEpub(zip: Record<string, Uint8Array>, langOverride: Lang | null) {
  const read = (name: string) => {
    const file = zip[name] ?? zip[decodeURIComponent(name)];
    if (!file) throw new UpstreamError(`EPUB 里缺少文件：${name}`, 400);
    return new TextDecoder('utf-8').decode(file);
  };
  const container = cheerio.load(read('META-INF/container.xml'), { xml: true });
  const opfPath = container('rootfile').attr('full-path');
  if (!opfPath) throw new UpstreamError('不是有效的 EPUB（找不到 OPF）', 400);
  const opfDir = path.posix.dirname(opfPath);
  const resolve = (href: string, base = opfDir) => path.posix.normalize(path.posix.join(base, href.split('#')[0]));
  const opf = cheerio.load(read(opfPath), { xml: true });

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  opf('manifest > item').each((_, el) => {
    const a = (el as unknown as { attribs: Record<string, string> }).attribs;
    manifest.set(a.id, { href: resolve(a.href), type: a['media-type'] ?? '', props: a.properties ?? '' });
  });

  // Chapter names from the EPUB 3 navigation document, or the EPUB 2 NCX.
  const labels = new Map<string, string>();
  const nav = [...manifest.values()].find((m) => m.props.split(' ').includes('nav'));
  if (nav) {
    const $ = cheerio.load(read(nav.href));
    const toc = $('nav[epub\\:type="toc"], nav#toc, nav').first();
    toc.find('a[href]').each((_, a) => {
      const file = resolve($(a).attr('href')!, path.posix.dirname(nav.href));
      if (!labels.has(file)) labels.set(file, $(a).text().replace(/\s+/g, ' ').trim());
    });
  } else {
    const ncxId = opf('spine').attr('toc');
    const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
    if (ncx) {
      const $ = cheerio.load(read(ncx.href), { xml: true });
      $('navPoint').each((_, p) => {
        const file = resolve($(p).children('content').attr('src') ?? '', path.posix.dirname(ncx.href));
        const label = $(p).children('navLabel').text().replace(/\s+/g, ' ').trim();
        if (!labels.has(file) && label) labels.set(file, label);
      });
    }
  }

  const metaLang = opf('metadata dc\\:language, metadata language').first().text().trim().toLowerCase();
  const docs = opf('spine > itemref')
    .map((_, el) => manifest.get((el as unknown as { attribs: Record<string, string> }).attribs.idref))
    .get()
    .filter((m): m is { href: string; type: string; props: string } => Boolean(m && /html/.test(m.type)));

  const htmls = docs.map((d) => ({ href: d.href, $: cheerio.load(read(d.href)) }));
  const sample = htmls.slice(0, 8).map((h) => h.$('body').text()).join('').slice(0, 20000);
  const lang: Lang | null = langOverride ?? (metaLang.startsWith('ja') ? 'ja' : metaLang.startsWith('en') ? 'en' : detectLang(sample));
  if (!lang) throw new UpstreamError('看起来不是日语或英语的书。EchoReader 目前只支持这两种语言。', 400);

  const chapters: ParsedChapter[] = [];
  for (const { href, $ } of htmls) {
    const body = $('body').get(0);
    if (!body) continue;
    const blocks = htmlBlocks($, body, { lang });
    const firstText = blocks.findIndex((b) => b.kind === 'text' && b.text);
    if (firstText < 0) continue; // cover, image-only pages
    const headings = blocks.slice(0, firstText).filter((b) => b.kind === 'heading').map((b) => b.text);
    const paragraphs = tidyParagraphs(blocks.slice(firstText).map((b) => b.text));
    const title = labels.get(href) || headings.join(' ') || (lang === 'ja' ? `第${chapters.length + 1}節` : `Section ${chapters.length + 1}`);
    chapters.push({ title, paragraphs });
  }

  return {
    lang,
    title: opf('metadata dc\\:title, metadata title').first().text().trim() || undefined,
    author: opf('metadata dc\\:creator, metadata creator').map((_, el) => opf(el).text().trim()).get().filter(Boolean).join(', ') || undefined,
    chapters,
  };
}

// ---- Library ------------------------------------------------------------------------------

const books = new Map<string, StoredBook>();

function loadLibrary() {
  mkdirSync(LIBRARY, { recursive: true });
  for (const file of readdirSync(LIBRARY)) {
    if (!file.endsWith('.json')) continue;
    try {
      const book = JSON.parse(readFileSync(path.join(LIBRARY, file), 'utf8')) as StoredBook;
      books.set(book.id, book);
    } catch {
      console.warn(`[local] 跳过无法读取的书：${file}`);
    }
  }
}
loadLibrary();

function stored(id: string) {
  const book = books.get(id);
  if (!book) throw new UpstreamError('书架上没有这本书了，可能已经删除', 404);
  return book;
}

function toSummary(b: StoredBook): BookSummary {
  return {
    source: 'local',
    id: b.id,
    lang: b.lang,
    title: b.title,
    author: b.author,
    chapterCount: b.chapters.length,
    summary: `${b.fileName}，导入于 ${b.importedAt.slice(0, 10)}`,
  };
}

/** Parses an uploaded EPUB or TXT file and adds it to the library. */
export function importBook(bytes: Uint8Array, fileName: string, lang: Lang | null): BookDetail {
  if (!bytes.length) throw new UpstreamError('文件是空的', 400);
  const base = fileName.replace(/\.[^.]+$/, '') || '未命名';
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  let parsed: { lang: Lang; title?: string; author?: string; chapters: ParsedChapter[] };
  if (isZip) {
    let zip: Record<string, Uint8Array>;
    try {
      zip = unzipSync(bytes);
    } catch {
      throw new UpstreamError('EPUB 文件损坏，解压失败', 400);
    }
    if (!zip['META-INF/container.xml']) throw new UpstreamError('只支持 EPUB 和 TXT 文件', 400);
    parsed = parseEpub(zip, lang);
  } else if (/\.(txt|text)$/i.test(fileName) || !fileName.includes('.')) {
    const text = decodeText(bytes);
    const detected = lang ?? detectLang(text.slice(0, 20000));
    if (!detected) throw new UpstreamError('看起来不是日语或英语的书。EchoReader 目前只支持这两种语言。', 400);
    if (detected === 'ja') parsed = { lang: 'ja', ...splitJapaneseText(text, base) };
    else {
      // A short first line ("The Lighthouse Keeper") is the title; the splitter drops it with the front matter.
      const first = text.trim().split(/\r?\n/)[0].trim();
      const title = first.length <= 80 && !/^(chapter|part|book)\b/i.test(first) ? first : undefined;
      parsed = { lang: 'en', title, chapters: splitChapters(text) };
    }
  } else {
    throw new UpstreamError('只支持 EPUB 和 TXT 文件', 400);
  }
  if (!parsed.chapters.length) throw new UpstreamError('没有在文件里找到正文', 400);

  const book: StoredBook = {
    id: randomBytes(5).toString('hex'),
    lang: parsed.lang,
    title: parsed.title || base,
    author: parsed.author ?? '',
    fileName,
    importedAt: new Date().toISOString(),
    chapters: parsed.chapters,
  };
  mkdirSync(LIBRARY, { recursive: true });
  writeFileSync(path.join(LIBRARY, `${book.id}.json`), JSON.stringify(book));
  books.set(book.id, book);
  return { ...toSummary(book), chapterCount: book.chapters.length, tocPages: 1 };
}

export function deleteBook(id: string) {
  stored(id);
  books.delete(id);
  rmSync(path.join(LIBRARY, `${id}.json`), { force: true });
}

function listing(filter: (b: StoredBook) => boolean): SearchResult {
  const items = [...books.values()].filter(filter).sort((a, b) => b.importedAt.localeCompare(a.importedAt)).map(toSummary);
  return { items, total: items.length, page: 1, hasMore: false };
}

export const local: SourceAdapter = {
  popular: async () => listing(() => true),

  async search(q) {
    const needle = q.normalize('NFKC').toLowerCase();
    return listing((b) => `${b.title} ${b.author} ${b.fileName}`.normalize('NFKC').toLowerCase().includes(needle));
  },

  async book(id): Promise<BookDetail> {
    const b = stored(id);
    return { ...toSummary(b), chapterCount: b.chapters.length, tocPages: 1 };
  },

  async toc(id): Promise<TocPage> {
    const b = stored(id);
    return { page: 1, totalPages: 1, entries: b.chapters.map((c, i) => ({ index: i + 1, title: c.title, group: c.group })) };
  },

  async chapter(id, index): Promise<ChapterContent> {
    const b = stored(id);
    const ch = b.chapters[index - 1];
    if (!ch) throw new UpstreamError(`这本书只有 ${b.chapters.length} 章`, 404);
    return {
      source: 'local',
      bookId: id,
      lang: b.lang,
      index,
      title: ch.title,
      group: ch.group,
      paragraphs: ch.paragraphs,
      prev: index > 1 ? index - 1 : null,
      next: index < b.chapters.length ? index + 1 : null,
    };
  },
};
