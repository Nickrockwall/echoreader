/**
 * Builds server/data/ja-zh.sqlite: Japanese words with Chinese definitions, from the Chinese
 * Wiktionary as extracted by wiktextract (kaikki.org). Content license: CC BY-SA 4.0.
 * Run with: npm run setup:dict -w server
 */
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js/t2cn';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const DB_FILE = path.join(DATA_DIR, 'ja-zh.sqlite');

// The Chinese Wiktionary files Japanese under two headings (simplified and traditional spelling).
const SOURCES = [
  'https://kaikki.org/zhwiktionary/%E6%97%A5%E8%AF%AD/kaikki.org-dictionary-%E6%97%A5%E8%AF%AD.jsonl',
  'https://kaikki.org/zhwiktionary/%E6%97%A5%E8%AA%9E/kaikki.org-dictionary-%E6%97%A5%E8%AA%9E.jsonl',
];

/** Not dictionary entries for a reader: romaji spellings, redirects, kana syllables, glyph pages. */
const SKIP_POS = new Set(['romanization', 'soft-redirect', 'syllable', 'character']);

interface WkForm {
  form: string;
  tags?: string[];
  ruby?: [string, string][];
}

interface WkSense {
  glosses?: string[];
  tags?: string[];
  examples?: { text?: string; translation?: string }[];
}

interface WkEntry {
  word: string;
  pos: string;
  lang_code: string;
  forms?: WkForm[];
  senses?: WkSense[];
  sounds?: { other?: string }[];
}

const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' });
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u;

/** Spells out `text` in kana using ruby pairs (base -> reading); null if a kanji is left over. */
function readingOf(text: string, ruby: [string, string][] | undefined): string | null {
  if (KANA.test(text)) return text;
  if (!ruby?.length) return null;
  let out = '';
  let rest = text;
  let i = 0;
  while (rest) {
    const pair = ruby[i];
    if (pair && rest.startsWith(pair[0])) {
      out += pair[1];
      rest = rest.slice(pair[0].length);
      i++;
    } else {
      out += rest[0];
      rest = rest.slice(1);
    }
  }
  return /\p{Script=Han}/u.test(out) ? null : out;
}

async function download(url: string): Promise<string> {
  console.log(`下载 ${decodeURIComponent(url.split('/').pop()!)}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）：${url}`);
  return res.text();
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  await rm(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE entry (id INTEGER PRIMARY KEY, word TEXT, reading TEXT, pos TEXT, data TEXT);
    CREATE TABLE form (key TEXT, entry INTEGER);
  `);
  const insertEntry = db.prepare('INSERT INTO entry (id, word, reading, pos, data) VALUES (?, ?, ?, ?, ?)');
  const insertForm = db.prepare('INSERT INTO form (key, entry) VALUES (?, ?)');

  const seen = new Set<string>();
  let id = 0;
  db.exec('BEGIN');
  for (const url of SOURCES) {
    const text = await download(url);
    for (const line of text.split('\n')) {
      if (!line) continue;
      const e = JSON.parse(line) as WkEntry;
      if (e.lang_code !== 'ja' || SKIP_POS.has(e.pos)) continue;

      const senses = (e.senses ?? [])
        .filter((s) => s.glosses?.length)
        .map((s) => {
          const ex = s.examples?.find((x) => x.text && x.translation);
          return {
            g: s.glosses!.map(toSimplified),
            t: (s.tags ?? []).filter((t) => t !== 'form-of'),
            ...(ex ? { e: [ex.text!, toSimplified(ex.translation!)] } : {}),
          };
        });
      if (!senses.length) continue;

      const canonical = e.forms?.find((f) => f.tags?.includes('canonical'));
      const kanaSound = e.sounds?.find((s) => s.other && KANA.test(s.other))?.other;
      const reading = readingOf(e.word, canonical?.ruby) ?? kanaSound ?? null;

      const dedupeKey = `${e.word}|${e.pos}|${reading}|${JSON.stringify(senses.map((s) => s.g))}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      id++;
      insertEntry.run(id, e.word, reading, e.pos, JSON.stringify(senses));
      const keys = new Set([e.word]);
      // Verbal nouns are filed as 解体 with canonical form 解体する; index both.
      if (canonical?.form && canonical.form !== e.word) keys.add(canonical.form);
      for (const key of keys) insertForm.run(key, id);
    }
  }
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('builtAt', new Date().toISOString());
  db.exec('COMMIT');
  db.exec('CREATE INDEX form_key ON form (key)');
  db.close();

  await rm(DB_FILE, { force: true });
  await rename(tmp, DB_FILE);
  console.log(`已生成 ${DB_FILE}：${id.toLocaleString()} 个词条`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
