import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type { DictEntry } from '../../../shared/types.ts';

const DB_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/ja-zh.sqlite');

const POS_ZH: Record<string, string> = {
  noun: '名词', verb: '动词', adj: '形容词', adv: '副词', particle: '助词', intj: '感叹词', conj: '接续词',
  pron: '代词', name: '专有名词', suffix: '后缀', prefix: '前缀', counter: '量词', num: '数词', phrase: '短语',
  proverb: '谚语', idiom: '惯用语', det: '连体词', postp: '助词',
};

const TAG_ZH: Record<string, string> = {
  archaic: '古语', obsolete: '已废弃', dated: '旧式', rare: '罕用', slang: '俚语', colloquial: '口语',
  informal: '非正式', formal: '正式', literary: '书面语', honorific: '尊敬语', humble: '谦让语', polite: '礼貌语',
  figuratively: '比喻', 'Internet': '网络用语', abbreviation: '缩略语', transitive: '他动词', intransitive: '自动词',
  derogatory: '贬义', vulgar: '粗俗', humorous: '诙谐', impersonal: '无人称', 'kana-only': '通常写假名',
};

/** kuromoji (IPADIC) part of speech -> compatible Wiktionary POS. */
const WIKTIONARY_POS: Record<string, string[]> = {
  名詞: ['noun', 'name', 'pron', 'num', 'counter'],
  動詞: ['verb'],
  形容詞: ['adj'],
  副詞: ['adv'],
  助詞: ['particle', 'postp'],
  助動詞: ['verb', 'suffix', 'particle'],
  連体詞: ['adj', 'det'],
  接続詞: ['conj'],
  感動詞: ['intj'],
  接頭詞: ['prefix'],
};

interface Row {
  id: number;
  word: string;
  reading: string | null;
  pos: string;
  data: string;
}

interface StoredSense {
  g: string[];
  t: string[];
  e?: [string, string];
}

let db: DatabaseSync | null | undefined;

/** The Chinese dictionary is optional: without it, lookups simply carry no Chinese entries. */
function open() {
  if (db === undefined) db = existsSync(DB_FILE) ? new DatabaseSync(DB_FILE, { readOnly: true }) : null;
  return db;
}

export const hasChineseDictionary = () => open() !== null;

export interface ZhHints {
  reading?: string;
  /** kuromoji part of speech of the clicked word, e.g. 動詞 */
  pos?: string;
}

/** Chinese-defined entries filed under any of `keys`, best match for the context first. */
export function lookupChinese(keys: string[], hints: ZhHints = {}, limit = 3): DictEntry[] {
  const conn = open();
  if (!conn || !keys.length) return [];
  const stmt = conn.prepare(
    'SELECT e.id, e.word, e.reading, e.pos, e.data FROM form f JOIN entry e ON e.id = f.entry WHERE f.key = ?',
  );
  const rows = new Map<number, Row>();
  for (const key of keys) for (const row of stmt.all(key) as unknown as Row[]) rows.set(row.id, row);

  let candidates = [...rows.values()];
  // When some entries match the reading in context, the others are different words (今日 こんにち/きょう).
  if (hints.reading && candidates.some((r) => r.reading === hints.reading)) {
    candidates = candidates.filter((r) => r.reading === hints.reading || r.reading === null);
  }
  const posOk = new Set(hints.pos ? WIKTIONARY_POS[hints.pos] : []);
  const score = (r: Row) => Number(posOk.has(r.pos)) * 2 + Number(r.reading === hints.reading);
  // Stable sort: keeps Wiktionary's order (usually the main sense first) within equal scores.
  candidates.sort((a, b) => score(b) - score(a));

  return candidates.slice(0, limit).map((r) => {
    const senses = JSON.parse(r.data) as StoredSense[];
    const pos = POS_ZH[r.pos];
    return {
      headword: r.word,
      reading: r.reading && r.reading !== r.word ? r.reading : undefined,
      senses: senses.slice(0, 5).map((s) => ({
        pos: pos ? [pos] : [],
        glosses: s.g,
        notes: s.t.map((t) => TAG_ZH[t]).filter((t): t is string => Boolean(t)),
        example: s.e?.[0],
        exampleTranslation: s.e?.[1],
      })),
    };
  });
}
