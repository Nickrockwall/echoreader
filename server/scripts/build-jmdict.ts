/**
 * Downloads the latest English JMdict from jmdict-simplified and builds server/data/jmdict.sqlite.
 * Run with: npm run setup:dict -w server
 */
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const DB_FILE = path.join(DATA_DIR, 'jmdict.sqlite');
const RELEASE_API = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest';

interface JmWord {
  id: string;
  kanji: { common: boolean; text: string }[];
  kana: { common: boolean; text: string }[];
  sense: {
    partOfSpeech: string[];
    misc: string[];
    info: string[];
    gloss: { text: string }[];
  }[];
}

interface JmDict {
  version: string;
  dictDate: string;
  tags: Record<string, string>;
  words: JmWord[];
}

/** Returns the first .json file inside a tar archive. */
function firstJsonInTar(tar: Buffer): Buffer {
  let pos = 0;
  while (pos + 512 <= tar.length) {
    const header = tar.subarray(pos, pos + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim(), 8);
    const type = String.fromCharCode(header[156]);
    const body = pos + 512;
    if ((type === '0' || type === '\0') && name.endsWith('.json')) return tar.subarray(body, body + size);
    pos = body + Math.ceil(size / 512) * 512;
  }
  throw new Error('压缩包里没有找到 JSON 文件');
}

async function main() {
  console.log('查询最新的 jmdict-simplified 发布…');
  const release = (await (await fetch(RELEASE_API)).json()) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  const asset = release.assets.find((a) => /^jmdict-eng-\d.*\.json\.tgz$/.test(a.name));
  if (!asset) throw new Error('发布中没有 jmdict-eng 的 .json.tgz 文件');

  console.log(`下载 ${asset.name}…`);
  const res = await fetch(asset.browser_download_url);
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
  const json = firstJsonInTar(gunzipSync(Buffer.from(await res.arrayBuffer())));
  const dict = JSON.parse(json.toString('utf8')) as JmDict;
  console.log(`解析完成：${dict.words.length.toLocaleString()} 个词条（${dict.dictDate}）`);

  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  await rm(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE tag (code TEXT PRIMARY KEY, description TEXT);
    CREATE TABLE entry (id INTEGER PRIMARY KEY, common INTEGER, data TEXT);
    CREATE TABLE form (key TEXT, entry INTEGER, kanji INTEGER, common INTEGER);
  `);

  const insertEntry = db.prepare('INSERT INTO entry (id, common, data) VALUES (?, ?, ?)');
  const insertForm = db.prepare('INSERT INTO form (key, entry, kanji, common) VALUES (?, ?, ?, ?)');
  const insertTag = db.prepare('INSERT INTO tag (code, description) VALUES (?, ?)');
  const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');

  db.exec('BEGIN');
  for (const [code, description] of Object.entries(dict.tags)) insertTag.run(code, description);
  insertMeta.run('version', release.tag_name);
  insertMeta.run('dictDate', dict.dictDate);
  for (const w of dict.words) {
    const id = Number(w.id);
    const common = w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);
    // Compact shape served to the client: k = kanji forms, r = readings, s = senses.
    const data = {
      k: w.kanji.map((k) => k.text),
      r: w.kana.map((k) => k.text),
      s: w.sense.map((s) => ({ p: s.partOfSpeech, g: s.gloss.map((g) => g.text), m: s.misc, i: s.info })),
    };
    insertEntry.run(id, common ? 1 : 0, JSON.stringify(data));
    for (const k of w.kanji) insertForm.run(k.text, id, 1, k.common ? 1 : 0);
    for (const k of w.kana) insertForm.run(k.text, id, 0, k.common ? 1 : 0);
  }
  db.exec('COMMIT');
  db.exec('CREATE INDEX form_key ON form (key)');
  db.close();

  await rm(DB_FILE, { force: true });
  const { rename } = await import('node:fs/promises');
  await rename(tmp, DB_FILE);
  console.log(`已生成 ${DB_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
