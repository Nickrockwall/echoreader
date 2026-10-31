import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { BookDetail, BookSummary, ChapterContent, SearchResult, TocPage } from '../../../shared/types.ts';
import { cached, DAY, MINUTE } from '../lib/cache.ts';
import { fetchText, UpstreamError } from '../lib/http.ts';
import { htmlBlocks, tidyParagraphs } from './htmlText.ts';
import type { SourceAdapter } from './index.ts';

const SITE = 'https://standardebooks.org';
const PAGE_SIZE = 24;
/** Front and back matter that is not reading text. */
const SKIP_FILES = new Set([
  'titlepage', 'imprint', 'halftitlepage', 'colophon', 'uncopyright', 'endnotes', 'loi', 'toc', 'copyright',
]);

/**
 * Book ids are the site's path below /ebooks/ with "~" for "/", e.g.
 * "jane-austen~pride-and-prejudice" or "leo-tolstoy~anna-karenina~constance-garnett".
 */
function bookPath(id: string) {
  if (!/^[a-z0-9-]+(~[a-z0-9_-]+){1,3}$/.test(id)) throw new UpstreamError(`不是有效的 Standard Ebooks 书目：${id}`, 400);
  return `${SITE}/ebooks/${id.replace(/~/g, '/')}`;
}

const idOf = (path: string) => path.replace(/^\/ebooks\//, '').replace(/\//g, '~');
const absolute = (src?: string) => (src ? new URL(src, SITE).href : undefined);

interface Chapter {
  file: string;
  title: string;
  group?: string;
}

async function list(params: Record<string, string>, page: number): Promise<SearchResult> {
  const qs = new URLSearchParams({ ...params, 'per-page': String(PAGE_SIZE), page: String(page) });
  const url = `${SITE}/ebooks?${qs}`;
  const html = await cached('se-list', url, 30 * MINUTE, () => fetchText(url));
  const $ = cheerio.load(html);
  const items: BookSummary[] = [];
  $('li[typeof="schema:Book"]').each((_, el) => {
    const li = $(el);
    const path = li.attr('about');
    if (!path) return;
    items.push({
      source: 'standardebooks',
      id: idOf(path),
      lang: 'en',
      title: li.find('[property="schema:name"]').first().text().trim(),
      author: li.find('.author [property="schema:name"]').map((_, a) => $(a).text().trim()).get().join(', '),
      cover: absolute(li.find('img').attr('src')),
    });
  });
  const pages = $('nav.pagination ol li a')
    .map((_, a) => Number($(a).text()))
    .get()
    .filter(Number.isFinite);
  const lastPage = Math.max(page, ...pages);
  // The site does not print a result count; estimate from the page numbers.
  return { items, total: page < lastPage ? lastPage * PAGE_SIZE : (page - 1) * PAGE_SIZE + items.length, page, hasMore: page < lastPage };
}

async function meta(id: string): Promise<BookSummary> {
  const url = bookPath(id);
  const html = await cached('se-book', url, DAY, () => fetchText(url));
  const $ = cheerio.load(html);
  const description = $('#description [property="schema:description"]').text().replace(/\s+/g, ' ').trim();
  return {
    source: 'standardebooks',
    id,
    lang: 'en',
    title: $('h1[property="schema:name"]').first().text().trim() || $('title').text().split(' - ')[0].trim(),
    author: $('[property="schema:author"] [property="schema:name"]').first().text().trim(),
    cover: absolute($('img[src*="/images/covers/"]').first().attr('src')),
    summary: description || $('meta[name="description"]').attr('content')?.replace(/^Free epub ebook download of the Standard Ebooks edition of /, ''),
    tags: $('.tags li a').map((_, a) => $(a).text().trim()).get().slice(0, 4),
  };
}

/**
 * Reading order from the web edition's table of contents. Entries that hold other files become
 * groups ("Book I · Part I: 1805"); anchors inside a file the reader already has are skipped.
 */
async function chapters(id: string): Promise<Chapter[]> {
  const url = `${bookPath(id)}/text`;
  const html = await cached('se-toc', url, DAY, () => fetchText(url));
  const $ = cheerio.load(html);
  const top = $('main ol, nav ol, ol').first();
  if (!top.length) throw new UpstreamError('Standard Ebooks 目录页结构和预期不一致');

  const out: Chapter[] = [];
  const seen = new Set<string>();
  const visit = (ol: Element, groups: string[]) => {
    for (const li of $(ol).children('li').toArray()) {
      const link = $(li).children('a').first();
      const href = link.attr('href') ?? '';
      const file = href.replace(/^text\//, '').split('#')[0];
      const label = link.text().replace(/\s+/g, ' ').trim();
      const nested = $(li).children('ol').get(0);
      const childFiles = nested
        ? $(nested).find('a').map((_, a) => ($(a).attr('href') ?? '').replace(/^text\//, '').split('#')[0]).get()
        : [];
      if (nested && childFiles.some((f) => f !== file)) {
        // A container ("Book I"); the half-title of the whole book is not worth a group label.
        visit(nested, file === 'halftitlepage' ? groups : [...groups, label]);
        continue;
      }
      if (!file || SKIP_FILES.has(file) || seen.has(file)) continue;
      seen.add(file);
      out.push({ file, title: label || file, group: groups.length ? groups.join(' · ') : undefined });
    }
  };
  visit(top.get(0)!, []);
  if (!out.length) throw new UpstreamError('这本书的目录是空的');
  return out;
}

export const standardEbooks: SourceAdapter = {
  popular: (page) => list({ sort: 'popularity' }, page),

  search: (q, page) => list({ query: q }, page),

  async book(id): Promise<BookDetail> {
    const [summary, chs] = await Promise.all([meta(id), chapters(id)]);
    return { ...summary, chapterCount: chs.length, tocPages: 1 };
  },

  async toc(id): Promise<TocPage> {
    const chs = await chapters(id);
    return { page: 1, totalPages: 1, entries: chs.map((c, i) => ({ index: i + 1, title: c.title, group: c.group })) };
  },

  async chapter(id, index): Promise<ChapterContent> {
    const chs = await chapters(id);
    const ch = chs[index - 1];
    if (!ch) throw new UpstreamError(`这本书只有 ${chs.length} 章`, 404);
    const url = `${bookPath(id)}/text/${ch.file}`;
    const html = await cached('se-chapter', url, 30 * DAY, () => fetchText(url));
    const $ = cheerio.load(html, { xml: false });
    const section = $('main section, body section').first().get(0) ?? $('main').get(0);
    if (!section) throw new UpstreamError('Standard Ebooks 章节页结构和预期不一致');

    // The chapter's own heading is shown as the title, not repeated as body text.
    const blocks = htmlBlocks($, section, { lang: 'en' });
    const first = blocks.findIndex((b) => b.kind === 'text' && b.text);
    const heading = blocks.slice(0, Math.max(first, 0)).filter((b) => b.kind === 'heading').map((b) => b.text);
    const paragraphs = tidyParagraphs(blocks.slice(Math.max(first, 0)).map((b) => b.text));

    return {
      source: 'standardebooks',
      bookId: id,
      lang: 'en',
      index,
      title: ch.title !== ch.file ? ch.title : heading.join(': ') || ch.title,
      group: ch.group,
      paragraphs,
      prev: index > 1 ? index - 1 : null,
      next: index < chs.length ? index + 1 : null,
    };
  },
};
