import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

/** A line of body text, or a heading, in document order. */
export type Block = { kind: 'text'; text: string } | { kind: 'heading'; level: number; text: string; className: string };

interface Options {
  /** Japanese markup breaks lines with <br>; source newlines carry no space. */
  lang: 'ja' | 'en';
  /** An empty line (two <br> in a row) is kept as "" (a scene break). */
  blankLines?: boolean;
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'blockquote', 'li', 'ul', 'ol', 'tr', 'table', 'header', 'footer', 'aside',
  'figure', 'figcaption', 'dd', 'dt', 'dl', 'pre', 'hgroup', 'body',
]);
const SKIP_TAGS = new Set(['script', 'style', 'rt', 'rp', 'head', 'title', 'nav']);

/** Ruby notation used throughout the app: ｜base《reading》. */
export const plainOfRuby = (s: string) => s.replace(/｜([^《]*)《[^》]*》/g, '$1');

/**
 * Walks an HTML subtree into lines and headings. Ruby becomes ｜base《reading》, Aozora's
 * editorial notes and footnote markers are dropped, and missing-glyph images become ※.
 */
export function htmlBlocks($: CheerioAPI, root: AnyNode, { lang, blankLines = false }: Options): Block[] {
  const out: Block[] = [];
  let buf = '';
  /** Whether the current line was ended by a <br> (so a second <br> makes an empty line). */
  let brRun = 0;

  const flush = (fromBr = false) => {
    const text = lang === 'ja' ? buf.replace(/^[\s　]+|[\s　]+$/g, '') : buf.replace(/\s+/g, ' ').trim();
    buf = '';
    if (text) {
      out.push({ kind: 'text', text });
      brRun = fromBr ? 1 : 0;
    } else if (fromBr) {
      if (blankLines && brRun >= 1) out.push({ kind: 'text', text: '' });
      brRun++;
    }
  };

  const inline = (node: AnyNode): string => {
    if (node.type === 'text') return clean((node as unknown as { data: string }).data);
    if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return '';
    const el = node as Element;
    const tag = el.name.toLowerCase();
    if (SKIP_TAGS.has(tag) || isSkipped(el)) return '';
    if (tag === 'img') return el.attribs.class?.includes('gaiji') ? '※' : '';
    if (tag === 'br') return '\n';
    if (tag === 'ruby') return ruby(el);
    return el.children.map(inline).join('');
  };

  const ruby = (el: Element): string => {
    let result = '';
    let base = '';
    for (const child of el.children) {
      const tag = child.type === 'tag' ? (child as Element).name.toLowerCase() : '';
      if (tag === 'rp') continue;
      if (tag === 'rt') {
        const reading = (child as Element).children.map(inline).join('').trim();
        result += base && reading ? `｜${base}《${reading}》` : base;
        base = '';
      } else if (tag === 'rtc') {
        continue;
      } else {
        base += inline(child);
      }
    }
    return result + base;
  };

  // Word joiners and soft hyphens are typesetting hints that would split words for the dictionary.
  const clean = (data: string) => {
    const text = data.replace(/[⁠­]/g, '');
    return lang === 'ja' ? text.replace(/[\r\n]+[ \t]*/g, '') : text.replace(/\s+/g, ' ');
  };

  const walk = (node: AnyNode) => {
    if (node.type === 'text') {
      buf += clean((node as unknown as { data: string }).data);
      return;
    }
    if (node.type !== 'tag') return;
    const el = node as Element;
    const tag = el.name.toLowerCase();
    if (SKIP_TAGS.has(tag) || isSkipped(el)) return;
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      flush();
      const text = plainOfRuby(inline(el)).replace(/\s+/g, ' ').trim();
      if (text) out.push({ kind: 'heading', level: Number(heading[1]), text, className: el.attribs.class ?? '' });
      brRun = 0;
      return;
    }
    if (tag === 'br') return flush(true);
    if (tag === 'hr') {
      flush();
      out.push({ kind: 'text', text: '' });
      return;
    }
    if (tag === 'ruby' || tag === 'img') {
      buf += inline(el);
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) flush();
    for (const child of el.children) walk(child);
    if (block) flush();
  };

  walk(root);
  flush();
  return out;
}

function isSkipped(el: Element) {
  const cls = el.attribs.class ?? '';
  // Aozora: ［＃…］ editorial notes. EPUB/Standard Ebooks: footnote reference markers.
  if (/\bnotes\b/.test(cls)) return true;
  const type = el.attribs['epub:type'] ?? '';
  return /\bnoteref\b/.test(type) || /\bpagebreak\b/.test(type);
}

/** Drops leading/trailing and repeated "" breaks. */
export function tidyParagraphs(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

const CHUNK_CHARS = 12000;

/** Cuts text with no usable headings into parts of readable length, at paragraph boundaries. */
export function chunk(paragraphs: string[], title: (n: number) => string): { title: string; paragraphs: string[] }[] {
  const parts: { title: string; paragraphs: string[] }[] = [];
  let current: string[] = [];
  let chars = 0;
  for (const p of paragraphs) {
    current.push(p);
    chars += p.length;
    if (chars >= CHUNK_CHARS) {
      parts.push({ title: title(parts.length + 1), paragraphs: tidyParagraphs(current) });
      current = [];
      chars = 0;
    }
  }
  if (tidyParagraphs(current).length) parts.push({ title: title(parts.length + 1), paragraphs: tidyParagraphs(current) });
  return parts;
}
