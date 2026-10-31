import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type { Lang, VocabInput, VocabItem } from '../../../shared/types.ts';
import { UpstreamError } from '../lib/http.ts';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

let db: DatabaseSync | null = null;

/** The reader's own data (separate from the rebuildable dictionaries). */
function open() {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(path.join(DATA_DIR, 'user.sqlite'));
    db.exec(`
      CREATE TABLE IF NOT EXISTS vocab (
        id INTEGER PRIMARY KEY,
        lang TEXT NOT NULL,
        word TEXT NOT NULL,
        lemma TEXT NOT NULL,
        reading TEXT,
        meaning TEXT NOT NULL,
        sentence TEXT NOT NULL,
        word_offset INTEGER NOT NULL,
        source TEXT,
        book_id TEXT,
        book_title TEXT,
        chapter INTEGER,
        created_at TEXT NOT NULL,
        UNIQUE (lang, lemma)
      );
    `);
  }
  return db;
}

interface Row {
  id: number;
  lang: Lang;
  word: string;
  lemma: string;
  reading: string | null;
  meaning: string;
  sentence: string;
  word_offset: number;
  source: VocabItem['source'] | null;
  book_id: string | null;
  book_title: string | null;
  chapter: number | null;
  created_at: string;
}

function toItem(r: Row): VocabItem {
  return {
    id: r.id,
    lang: r.lang,
    word: r.word,
    lemma: r.lemma,
    reading: r.reading ?? undefined,
    meaning: r.meaning,
    sentence: r.sentence,
    offset: r.word_offset,
    source: r.source ?? undefined,
    bookId: r.book_id ?? undefined,
    bookTitle: r.book_title ?? undefined,
    chapter: r.chapter ?? undefined,
    createdAt: r.created_at,
  };
}

export function listVocab(lang?: Lang): VocabItem[] {
  const rows = lang
    ? open().prepare('SELECT * FROM vocab WHERE lang = ? ORDER BY created_at DESC').all(lang)
    : open().prepare('SELECT * FROM vocab ORDER BY created_at DESC').all();
  return (rows as unknown as Row[]).map(toItem);
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

/** Adds a word, or refreshes it (latest sentence and meaning) if it was saved before. */
export function saveVocab(body: Partial<VocabInput>): VocabItem {
  const lang = body.lang;
  const lemma = str(body.lemma, 80)?.trim();
  const word = str(body.word, 80)?.trim();
  const sentence = str(body.sentence, 2000);
  if ((lang !== 'ja' && lang !== 'en') || !lemma || !word || sentence === undefined) {
    throw new UpstreamError('需要 lang、word、lemma 和 sentence', 400);
  }
  const offset = Number.isInteger(body.offset) ? body.offset! : 0;
  const row = open()
    .prepare(
      `INSERT INTO vocab (lang, word, lemma, reading, meaning, sentence, word_offset, source, book_id, book_title, chapter, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (lang, lemma) DO UPDATE SET
         word = excluded.word, reading = excluded.reading, meaning = excluded.meaning,
         sentence = excluded.sentence, word_offset = excluded.word_offset, source = excluded.source,
         book_id = excluded.book_id, book_title = excluded.book_title, chapter = excluded.chapter
       RETURNING *`,
    )
    .get(
      lang,
      word,
      lemma,
      str(body.reading, 80) ?? null,
      str(body.meaning, 500) ?? '',
      sentence,
      offset,
      body.source === 'syosetu' || body.source === 'gutenberg' ? body.source : null,
      str(body.bookId, 40) ?? null,
      str(body.bookTitle, 200) ?? null,
      Number.isInteger(body.chapter) ? body.chapter! : null,
      new Date().toISOString(),
    ) as unknown as Row;
  return toItem(row);
}

export function deleteVocab(id: number) {
  open().prepare('DELETE FROM vocab WHERE id = ?').run(id);
}

// ---- Anki export ---------------------------------------------------------------

const html = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Fields may not contain the separator or line breaks. */
const field = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

/**
 * A tab-separated file using Anki's header directives (Anki 2.1.55+), so File → Import
 * picks the note type, deck and columns without any setup.
 */
export function vocabToAnki(lang?: Lang): string {
  const deck = lang === 'ja' ? 'EchoReader::日语' : lang === 'en' ? 'EchoReader::English' : 'EchoReader';
  const lines = ['#separator:tab', '#html:true', '#notetype:Basic', `#deck:${deck}`, '#tags column:3'];
  for (const v of listVocab(lang)) {
    const font = v.lang === 'ja' ? "'Hiragino Mincho ProN','Yu Mincho',serif" : 'Georgia,serif';
    const front = `<div style="font-family:${font};font-size:2em">${html(v.lemma)}</div>`;
    const marked =
      html(v.sentence.slice(0, v.offset)) +
      `<b><u>${html(v.sentence.slice(v.offset, v.offset + v.word.length))}</u></b>` +
      html(v.sentence.slice(v.offset + v.word.length));
    const from = v.bookTitle ? `《${html(v.bookTitle)}》${v.chapter ? ` 第 ${v.chapter} 章` : ''}` : '';
    const back = [
      v.reading ? `<div style="font-size:1.2em">${html(v.reading)}</div>` : '',
      `<div>${html(v.meaning)}</div>`,
      '<hr>',
      `<div style="font-family:${font}">${marked}</div>`,
      from ? `<div style="color:#888;font-size:.8em">${from}</div>` : '',
    ].join('');
    lines.push([front, back, `echoreader ${v.lang}`].map(field).join('\t'));
  }
  return `${lines.join('\n')}\n`;
}
