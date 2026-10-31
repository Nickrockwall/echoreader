import * as cheerio from 'cheerio';
import type { BookDetail, BookSummary, ChapterContent, SearchResult, TocPage } from '../../../shared/types.ts';
import { cached, DAY, HOUR, MINUTE } from '../lib/cache.ts';
import { fetchJson, fetchText, UpstreamError } from '../lib/http.ts';
import type { SourceAdapter } from './index.ts';

const API = 'https://api.syosetu.com/novelapi/api/';
const SITE = 'https://ncode.syosetu.com';
const PAGE_SIZE = 20;
const TOC_PAGE_SIZE = 100; // fixed by the site
const MAX_START = 2000; // API rejects st > 2000

const GENRES: Record<number, string> = {
  101: '異世界〔恋愛〕', 102: '現実世界〔恋愛〕',
  201: 'ハイファンタジー', 202: 'ローファンタジー',
  301: '純文学', 302: 'ヒューマンドラマ', 303: '歴史', 304: '推理', 305: 'ホラー', 306: 'アクション', 307: 'コメディー',
  401: 'VRゲーム', 402: '宇宙', 403: '空想科学', 404: 'パニック',
  9901: '童話', 9902: '詩', 9903: 'エッセイ', 9904: 'リプレイ', 9999: 'その他', 9801: 'ノンジャンル',
};

interface ApiNovel {
  title: string;
  ncode: string;
  writer: string;
  story: string;
  general_all_no: number;
  noveltype: 1 | 2; // 1 serial, 2 short story
  genre: number;
  keyword: string;
  end: 0 | 1; // 0 = finished or short story, 1 = ongoing
}

type ApiResponse = [{ allcount: number }, ...ApiNovel[]];

const FIELDS = 't-n-w-s-ga-nt-g-k-e';

function toSummary(n: ApiNovel): BookSummary {
  return {
    source: 'syosetu',
    id: n.ncode.toLowerCase(),
    lang: 'ja',
    title: n.title,
    author: n.writer,
    summary: n.story.trim(),
    chapterCount: n.noveltype === 2 ? 1 : n.general_all_no,
    tags: [GENRES[n.genre], ...n.keyword.split(/\s+/).slice(0, 4)].filter(Boolean),
    complete: n.end === 0,
  };
}

async function query(params: Record<string, string | number>): Promise<ApiResponse> {
  const qs = new URLSearchParams({ out: 'json', of: FIELDS, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const url = `${API}?${qs}`;
  return cached('syosetu-api', url, 10 * MINUTE, () => fetchJson<ApiResponse>(url));
}

async function list(params: Record<string, string | number>, page: number): Promise<SearchResult> {
  const st = (page - 1) * PAGE_SIZE + 1;
  if (st > MAX_START) return { items: [], total: 0, page, hasMore: false };
  const [head, ...novels] = await query({ ...params, lim: PAGE_SIZE, st });
  return {
    items: novels.map(toSummary),
    total: head.allcount,
    page,
    hasMore: st + novels.length <= Math.min(head.allcount, MAX_START) && novels.length === PAGE_SIZE,
  };
}

async function meta(id: string): Promise<ApiNovel> {
  const url = `${API}?${new URLSearchParams({ out: 'json', of: FIELDS, ncode: id })}`;
  const [head, novel] = await cached('syosetu-meta', id, DAY, () => fetchJson<ApiResponse>(url));
  if (!head.allcount || !novel) throw new UpstreamError(`没有找到作品 ${id}`, 404);
  return novel;
}

function normalizeId(id: string) {
  if (!/^n\d{4}[a-z]{1,3}$/i.test(id)) throw new UpstreamError(`不是有效的 Nコード：${id}`, 400);
  return id.toLowerCase();
}

/** Turns one <p> into a paragraph string, keeping author ruby as ｜base《reading》. */
function paragraphText($: cheerio.CheerioAPI, p: cheerio.Cheerio<any>): string {
  p.find('ruby').each((_, el) => {
    const ruby = $(el);
    const reading = ruby.find('rt').text().trim();
    ruby.find('rt, rp').remove();
    const base = (ruby.find('rb').length ? ruby.find('rb').text() : ruby.text()).trim();
    ruby.replaceWith(reading && base ? `｜${base}《${reading}》` : base);
  });
  p.find('img').remove();
  // Strip indentation (full-width spaces) and stray whitespace; layout handles indent via CSS.
  return p.text().replace(/^[\s　]+|[\s　]+$/g, '');
}

function cleanParagraphs(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

function extractBlock($: cheerio.CheerioAPI, selector: string): string[] {
  const lines: string[] = [];
  $(selector).find('p').each((_, el) => {
    lines.push(paragraphText($, $(el)));
  });
  return cleanParagraphs(lines);
}

export const syosetu: SourceAdapter = {
  // Serialized works only: the daily ranking is otherwise dominated by one-page short stories.
  popular: (page) => list({ order: 'dailypoint', type: 're' }, page),

  search: (q, page) => list({ word: q, order: 'hyoka' }, page),

  async book(rawId): Promise<BookDetail> {
    const id = normalizeId(rawId);
    const novel = await meta(id);
    const summary = toSummary(novel);
    return { ...summary, chapterCount: summary.chapterCount!, tocPages: Math.max(1, Math.ceil(summary.chapterCount! / TOC_PAGE_SIZE)) };
  },

  async toc(rawId, page): Promise<TocPage> {
    const id = normalizeId(rawId);
    const novel = await meta(id);
    if (novel.noveltype === 2) {
      return { page: 1, totalPages: 1, entries: [{ index: 1, title: novel.title }] };
    }
    const totalPages = Math.max(1, Math.ceil(novel.general_all_no / TOC_PAGE_SIZE));
    const html = await cached('syosetu-toc', `${id}:${page}`, HOUR, () => fetchText(`${SITE}/${id}/?p=${page}`));
    const $ = cheerio.load(html);
    const entries: TocPage['entries'] = [];
    let group: string | undefined;
    $('.p-eplist').children().each((_, el) => {
      const node = $(el);
      if (node.hasClass('p-eplist__chapter-title')) {
        group = node.text().trim();
      } else if (node.hasClass('p-eplist__sublist')) {
        const link = node.find('a.p-eplist__subtitle');
        const index = Number(link.attr('href')?.match(/\/(\d+)\/?$/)?.[1]);
        if (index) entries.push({ index, title: link.text().trim(), group });
      }
    });
    return { page, totalPages, entries };
  },

  async chapter(rawId, index): Promise<ChapterContent> {
    const id = normalizeId(rawId);
    const novel = await meta(id);
    const isShort = novel.noveltype === 2;
    const total = isShort ? 1 : novel.general_all_no;
    if (index < 1 || index > total) throw new UpstreamError(`这部作品只有 ${total} 话`, 404);

    const url = isShort ? `${SITE}/${id}/` : `${SITE}/${id}/${index}/`;
    const html = await cached('syosetu-chapter', url, 7 * DAY, () => fetchText(url));
    const $ = cheerio.load(html);
    const body = $('.p-novel__body');
    if (!body.length) throw new UpstreamError('页面结构和预期不一致，可能是なろう改版了');

    const paragraphs = extractBlock($, '.p-novel__body .p-novel__text:not(.p-novel__text--preface):not(.p-novel__text--afterword)');
    const preface = extractBlock($, '.p-novel__text--preface');
    const afterword = extractBlock($, '.p-novel__text--afterword');

    return {
      source: 'syosetu',
      bookId: id,
      lang: 'ja',
      index,
      title: (isShort ? novel.title : $('.p-novel__title').first().text().trim()) || `第${index}話`,
      paragraphs,
      preface: preface.length ? preface : undefined,
      afterword: afterword.length ? afterword : undefined,
      prev: index > 1 ? index - 1 : null,
      next: index < total ? index + 1 : null,
    };
  },
};
