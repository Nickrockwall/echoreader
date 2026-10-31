import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type { DictEntry } from '../../../shared/types.ts';
import { UpstreamError } from '../lib/http.ts';

const DB_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/jmdict.sqlite');

/** Short Chinese labels for the most frequent JMdict codes; anything else uses JMdict's English. */
const POS_ZH: Record<string, string> = {
  n: '名词', pn: '代词', 'n-suf': '名词后缀', 'n-pref': '名词前缀', 'n-adv': '副词性名词', 'n-t': '时间名词',
  v1: '一段动词', 'v1-s': '一段动词', vs: 'サ变动词', 'vs-i': 'サ变动词', 'vs-s': 'サ变动词', vk: 'カ变动词', vz: 'ザ变动词',
  'v5u': '五段动词', 'v5k': '五段动词', 'v5k-s': '五段动词', 'v5g': '五段动词', 'v5s': '五段动词', 'v5t': '五段动词',
  'v5n': '五段动词', 'v5b': '五段动词', 'v5m': '五段动词', 'v5r': '五段动词', 'v5r-i': '五段动词', 'v5aru': '五段动词',
  'v5u-s': '五段动词', vt: '他动词', vi: '自动词', 'aux-v': '助动词', aux: '助动词',
  'adj-i': 'い形容词', 'adj-ix': 'い形容词', 'adj-na': 'な形容词', 'adj-no': '可接の', 'adj-pn': '连体词', 'adj-t': 'たる形容词',
  'adj-f': '定语', adv: '副词', 'adv-to': '副词（と）', prt: '助词', conj: '接续词', int: '感叹词', exp: '惯用语',
  ctr: '量词', pref: '前缀', suf: '后缀', num: '数词', cop: '系词',
};

const MISC_ZH: Record<string, string> = {
  uk: '通常只写假名', sl: '俚语', col: '口语', arch: '古语', hon: '尊敬语', hum: '谦让语', pol: '礼貌语',
  vulg: '粗俗', abbr: '缩略语', 'on-mim': '拟声拟态', obsc: '罕用', derog: '贬义', joc: '诙谐', fam: '亲昵',
  male: '男性用语', fem: '女性用语', yoji: '四字熟语', id: '惯用句', proverb: '谚语', net: '网络用语', rare: '罕用',
  dated: '旧式', poet: '诗歌用语', form: '书面语', chn: '儿语',
};

interface Row {
  id: number;
  data: string;
}

interface Compact {
  k: string[];
  r: string[];
  s: { p: string[]; g: string[]; m: string[]; i: string[] }[];
}

let db: DatabaseSync | null = null;
let tags: Map<string, string> | null = null;

function open() {
  if (!db) {
    if (!existsSync(DB_FILE)) {
      throw new UpstreamError('日语词典还没安装。请在项目目录运行：npm run setup:dict -w server', 503);
    }
    db = new DatabaseSync(DB_FILE, { readOnly: true });
    tags = new Map((db.prepare('SELECT code, description FROM tag').all() as { code: string; description: string }[]).map((t) => [t.code, t.description]));
  }
  return db;
}

const label = (code: string, zh: Record<string, string>) => zh[code] ?? tags?.get(code) ?? code;

export interface LookupHints {
  /** Reading in context; disambiguates homographs (今日 きょう / こんにち). */
  reading?: string;
  /** JMdict part-of-speech code prefixes compatible with the context (["prt"] for a particle). */
  pos?: string[];
}

/**
 * Entries whose kanji or kana form is exactly `key`, best first: entries fitting the context's
 * part of speech, then matching reading, then common words, then JMdict order.
 */
export function lookupJmdict(key: string, hints: LookupHints = {}, limit = 4): DictEntry[] {
  const rows = open()
    .prepare(
      `SELECT e.id, e.data, MAX(f.common) AS fc, e.common AS ec
       FROM form f JOIN entry e ON e.id = f.entry
       WHERE f.key = ?
       GROUP BY e.id
       ORDER BY fc DESC, ec DESC, e.id
       LIMIT 60`,
    )
    .all(key) as unknown as Row[];

  const { reading, pos } = hints;
  const entries = rows.map((row) => {
    const d = JSON.parse(row.data) as Compact;
    const posMatch = pos ? d.s.some((s) => s.p.some((p) => pos.some((prefix) => p.startsWith(prefix)))) : false;
    const readingMatch = reading ? d.r.includes(reading) : false;
    return { d, score: Number(posMatch) * 2 + Number(readingMatch) };
  });
  // Stable sort keeps the SQL order (common first) within equal scores.
  entries.sort((a, b) => b.score - a.score);

  return entries.slice(0, limit).map(({ d }) => {
    // Headword is the form the reader clicked when the entry has it (ます, not its rare 〼 spelling).
    const headword = d.k.includes(key) || d.r.includes(key) ? key : (d.k[0] ?? d.r[0]);
    return {
      headword,
      reading: d.k.includes(headword) ? (reading && d.r.includes(reading) ? reading : d.r[0]) : undefined,
      variants: [...d.k, ...d.r].filter((f) => f !== headword).slice(0, 4),
      senses: d.s.slice(0, 5).map((s) => ({
        pos: [...new Set(s.p.map((p) => label(p, POS_ZH)))],
        glosses: s.g,
        notes: [...s.m.map((m) => label(m, MISC_ZH)), ...s.i],
      })),
    };
  });
}
