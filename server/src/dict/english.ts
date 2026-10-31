import type { DictEntry, DictResult } from '../../../shared/types.ts';
import { cached, DAY } from '../lib/cache.ts';
import { enWiktionary } from './credits.ts';
import { fetchJson, UpstreamError } from '../lib/http.ts';

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const MAX_CANDIDATES = 4;

interface License {
  name: string;
  url: string;
}

interface FreeDictEntry {
  word: string;
  phonetic?: string;
  phonetics: { text?: string; audio?: string; sourceUrl?: string; license?: License }[];
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string }[];
  }[];
  license?: License;
  sourceUrls?: string[];
}

const IRREGULAR: Record<string, string> = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', did: 'do', done: 'do', does: 'do',
  went: 'go', gone: 'go', said: 'say', made: 'make', took: 'take', taken: 'take', saw: 'see', seen: 'see',
  came: 'come', thought: 'think', began: 'begin', begun: 'begin', ran: 'run', got: 'get', gotten: 'get',
  knew: 'know', known: 'know', found: 'find', felt: 'feel', told: 'tell', left: 'leave', heard: 'hear',
  stood: 'stand', sat: 'sit', spoke: 'speak', spoken: 'speak', wrote: 'write', written: 'write',
  brought: 'bring', bought: 'buy', caught: 'catch', taught: 'teach', fell: 'fall', fallen: 'fall',
  held: 'hold', kept: 'keep', meant: 'mean', met: 'meet', paid: 'pay', sent: 'send', slept: 'sleep',
  gave: 'give', given: 'give', ate: 'eat', eaten: 'eat', drank: 'drink', drunk: 'drink', grew: 'grow',
  lay: 'lie', lain: 'lie', rose: 'rise', risen: 'rise', shook: 'shake', wore: 'wear', worn: 'wear',
  men: 'man', women: 'woman', children: 'child', feet: 'foot', teeth: 'tooth', mice: 'mouse', geese: 'goose',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad', further: 'far', farther: 'far',
};

/** Possible dictionary forms of an inflected word, most likely first. */
export function lemmaCandidates(raw: string): string[] {
  const w = raw.toLowerCase().replace(/[’']s$/, '').replace(/’/g, "'");
  const out = [w];
  if (IRREGULAR[w]) out.push(IRREGULAR[w]);
  const add = (s: string) => s.length > 1 && out.push(s);
  const undouble = (stem: string) => (/([bdgklmnprt])\1$/.test(stem) ? stem.slice(0, -1) : null);

  if (w.endsWith('ies') || w.endsWith('ied')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('ier')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('iest')) add(`${w.slice(0, -4)}y`);
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  for (const suffix of ['ed', 'ing', 'er', 'est']) {
    if (!w.endsWith(suffix)) continue;
    const stem = w.slice(0, -suffix.length);
    const single = undouble(stem);
    if (single) add(single);
    add(stem);
    add(`${stem}e`);
  }
  if (w.endsWith('ly')) add(w.slice(0, -2));
  return [...new Set(out)];
}

function toEntries(data: FreeDictEntry[]): DictEntry[] {
  return data.slice(0, 3).map((e) => {
    const recording = e.phonetics.find((p) => p.audio);
    return {
      headword: e.word,
      reading: e.phonetic ?? e.phonetics.find((p) => p.text)?.text,
      audio: recording?.audio || undefined,
      // Recordings are separately licensed (mostly Wikimedia Commons uploads).
      audioCredit:
        recording?.audio && recording.license
          ? {
              name: 'Wikimedia Commons',
              url: recording.sourceUrl,
              // The API sometimes drops the "CC" prefix ("BY-SA 4.0").
              license: recording.license.name.replace(/^(?!CC)/, 'CC '),
              licenseUrl: recording.license.url,
            }
          : undefined,
      // One sense per definition, so each gets its own number and example.
      senses: e.meanings.slice(0, 3).flatMap((m) =>
        m.definitions.slice(0, 3).map((d) => ({
          pos: [m.partOfSpeech],
          glosses: [d.definition],
          notes: [],
          example: d.example,
        })),
      ),
    };
  });
}

/** null when the dictionary has no such headword. */
async function fetchWord(word: string): Promise<FreeDictEntry[] | null> {
  return cached('freedict', word, 30 * DAY, async () => {
    try {
      return await fetchJson<FreeDictEntry[]>(`${API}${encodeURIComponent(word)}`);
    } catch (err) {
      if (err instanceof UpstreamError && err.status === 404) return null;
      throw err;
    }
  });
}

export async function lookupEnglish(word: string): Promise<DictResult> {
  let failure: Error | null = null;
  for (const candidate of lemmaCandidates(word).slice(0, MAX_CANDIDATES)) {
    let data: FreeDictEntry[] | null;
    try {
      data = await fetchWord(candidate);
    } catch (err) {
      // The service throws sporadic 5xx for odd forms; another candidate may still succeed.
      failure = err as Error;
      continue;
    }
    if (data?.length) {
      const credit = enWiktionary(data[0].sourceUrls?.[0], data[0].license);
      return { lang: 'en', word, lemma: candidate, entries: toEntries(data), credit };
    }
  }
  if (failure) throw failure;
  return { lang: 'en', word, lemma: word.toLowerCase(), entries: [], credit: enWiktionary() };
}
