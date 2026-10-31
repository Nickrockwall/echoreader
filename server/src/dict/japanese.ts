import { createRequire } from 'node:module';
import path from 'node:path';
import kuromoji from 'kuromoji';
import type { DictResult, FuriganaResult } from '../../../shared/types.ts';
import { JMDICT, zhWiktionary } from './credits.ts';
import { lookupChinese } from './jazh.ts';
import { lookupJmdict } from './jmdict.ts';

type Tokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

const DIC_PATH = path.join(path.dirname(createRequire(import.meta.url).resolve('kuromoji/package.json')), 'dict');

let tokenizer: Promise<Tokenizer> | null = null;

function getTokenizer() {
  tokenizer ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DIC_PATH }).build((err, t) => (err ? reject(err) : resolve(t)));
  });
  return tokenizer;
}

/** Morpheme with 0-based offsets into the analyzed text. */
interface Morpheme {
  surface: string;
  base: string;
  reading: string; // hiragana, "" when unknown
  pos: string;
  detail: string;
  conjugation: string;
  start: number;
  end: number;
}

const HAN = /\p{Script=Han}/u;
const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

async function analyze(text: string): Promise<Morpheme[]> {
  const t = await getTokenizer();
  return t.tokenize(text).map((m) => {
    const start = m.word_position - 1;
    return {
      surface: m.surface_form,
      base: m.basic_form === '*' ? m.surface_form : m.basic_form,
      reading: m.reading && m.reading !== '*' ? toHiragana(m.reading) : '',
      pos: m.pos,
      detail: m.pos_detail_1,
      conjugation: m.conjugated_form === '*' ? '' : m.conjugated_form,
      start,
      end: start + m.surface_form.length,
    };
  });
}

// ---- Furigana ----------------------------------------------------------------

/**
 * Splits a morpheme's reading across its kanji runs, leaving okurigana bare:
 * 取り扱い + とりあつかい -> 取[と] り 扱[あつか] い.
 */
function rubyForMorpheme(m: Morpheme): [number, number, string][] {
  if (!m.reading || !HAN.test(m.surface)) return [];
  const runs = m.surface.match(/\p{Script=Han}+|[^\p{Script=Han}]+/gu)!;
  const pattern = runs.map((r) => (HAN.test(r) ? '(.+?)' : `(${toHiragana(r).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`)).join('');
  const match = new RegExp(`^${pattern}$`, 'u').exec(m.reading);
  const spans: [number, number, string][] = [];
  if (!match) {
    // Reading doesn't line up (irregular word): annotate the whole surface.
    return m.reading === m.surface ? [] : [[m.start, m.end, m.reading]];
  }
  let pos = m.start;
  runs.forEach((run, i) => {
    if (HAN.test(run)) spans.push([pos, pos + run.length, match[i + 1]]);
    pos += run.length;
  });
  return spans;
}

export async function furigana(texts: string[]): Promise<FuriganaResult> {
  const out: FuriganaResult = [];
  for (const text of texts) out.push((await analyze(text)).flatMap(rubyForMorpheme));
  return out;
}

// ---- Lookup ------------------------------------------------------------------

const POS_ZH: Record<string, string> = {
  名詞: '名词', 動詞: '动词', 形容詞: '形容词', 副詞: '副词', 助詞: '助词', 助動詞: '助动词', 連体詞: '连体词',
  接続詞: '接续词', 感動詞: '感叹词', 接頭詞: '接头词', 記号: '符号', フィラー: '填充词',
};
const FUNCTION_POS = new Set(['助詞', '助動詞', '記号']);

/** kuromoji (IPADIC) part of speech -> compatible JMdict POS code prefixes. */
const JMDICT_POS: Record<string, string[]> = {
  名詞: ['n', 'pn', 'adj-no', 'adj-na', 'ctr', 'num'],
  動詞: ['v'],
  形容詞: ['adj-i', 'adj-ix'],
  副詞: ['adv'],
  助詞: ['prt'],
  助動詞: ['aux', 'cop'],
  連体詞: ['adj-pn'],
  接続詞: ['conj'],
  感動詞: ['int'],
  接頭詞: ['pref'],
};

export async function lookupJapanese(word: string, sentence = word, offset = 0): Promise<DictResult> {
  const morphemes = await analyze(sentence);
  const end = offset + word.length;
  const covered = morphemes.filter((m) => m.start < end && m.end > offset);
  const main = covered.find((m) => !FUNCTION_POS.has(m.pos)) ?? covered[0];

  // A click spanning several morphemes is likely a compound (異世界): try it whole first.
  // A click within one morpheme (笑 of 笑っ, 食べ) wants that morpheme's dictionary form first.
  const ordered = covered.length > 1 ? [word, main?.base, main?.surface] : [main?.base, main?.surface, word];
  const candidates = [...new Set(ordered.filter((c): c is string => Boolean(c)))];
  const reading = covered.map((m) => m.reading || m.surface).join('');
  const pos = main ? JMDICT_POS[main.pos] : undefined;

  for (const key of candidates) {
    // The in-context reading only describes surfaces, not a lemma like 食べる.
    const contextual = key === word ? reading : key === main?.surface ? main.reading : undefined;
    const entries = lookupJmdict(key, { reading: contextual, pos });
    // JMdict's best entry bridges to the Chinese dictionary: its spellings find entries filed
    // under another form (はし -> 箸), and its reading tells homographs apart.
    const best = entries[0];
    const spellings = best ? [best.headword, ...(best.variants ?? [])].filter((f) => f === key || HAN.test(f)) : [];
    const zhEntries = lookupChinese([...new Set([key, ...spellings])], {
      reading: best ? (best.reading ?? best.headword) : contextual,
      pos: main?.pos,
    });
    if (entries.length || zhEntries.length) {
      const compound = covered.length > 1 && key === word;
      return {
        lang: 'ja',
        word,
        lemma: key,
        reading: reading !== word ? reading : undefined,
        analysis: main && !compound ? describe(main) : undefined,
        entries,
        credit: JMDICT,
        zhEntries,
        zhCredit: zhEntries.length ? zhWiktionary(zhEntries[0].headword) : undefined,
      };
    }
  }
  return {
    lang: 'ja',
    word,
    lemma: main?.base ?? word,
    reading: reading !== word ? reading : undefined,
    analysis: main ? describe(main) : undefined,
    entries: [],
    credit: JMDICT,
  };
}

/** How the clicked form relates to its dictionary form; nothing for an uninflected word. */
function describe(m: Morpheme) {
  if (m.base === m.surface) return undefined;
  const parts = [POS_ZH[m.pos] ?? m.pos, `原形 ${m.base}`];
  if (m.conjugation && m.conjugation !== '基本形') parts.push(m.conjugation);
  return parts.join(' · ');
}

/** Loads the analyzer at startup so the first click isn't slow. */
export function warmJapanese() {
  getTokenizer().catch((err) => console.error('kuromoji failed to load', err));
}
