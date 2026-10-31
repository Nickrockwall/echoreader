import type { DictLookupRequest, DictResult } from '../../../shared/types.ts';
import { UpstreamError } from '../lib/http.ts';
import { lookupEnglish } from './english.ts';
import { lookupJapanese } from './japanese.ts';

export { furigana, warmJapanese } from './japanese.ts';

export function lookup(req: Partial<DictLookupRequest>): Promise<DictResult> {
  const word = typeof req.word === 'string' ? req.word.trim() : '';
  if (!word || word.length > 40) throw new UpstreamError('需要一个要查的词', 400);
  if (req.lang === 'en') return lookupEnglish(word);
  if (req.lang === 'ja') {
    const sentence = typeof req.sentence === 'string' && req.sentence.length <= 2000 ? req.sentence : undefined;
    const offset = Number.isInteger(req.offset) ? req.offset! : 0;
    // Only trust the context if the word really sits at that offset.
    if (sentence && sentence.slice(offset, offset + word.length) === word) return lookupJapanese(word, sentence, offset);
    return lookupJapanese(word);
  }
  throw new UpstreamError('lang 必须是 ja 或 en', 400);
}
