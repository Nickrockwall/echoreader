import { dialogueRanges } from '../../../shared/dialogue.ts';
import type { Lang } from '../../../shared/types.ts';

export interface ScriptSegment {
  type: 'narration' | 'dialogue';
  text: string;
  /** Where `text` starts in the parsed string, so word timings can be mapped back. */
  offset: number;
}

const SPEAKABLE = /[\p{L}\p{N}]/u;

/**
 * Splits text into narration and dialogue for drama mode. Pieces with nothing to say
 * (bare punctuation between quotes) are dropped; neighbours of the same kind are merged.
 */
export function parseDramaSegments(text: string, lang: Lang): ScriptSegment[] {
  const pieces: ScriptSegment[] = [];
  let cursor = 0;
  for (const [s, e] of dialogueRanges(text, lang)) {
    if (s > cursor) pieces.push({ type: 'narration', text: text.slice(cursor, s), offset: cursor });
    pieces.push({ type: 'dialogue', text: text.slice(s, e), offset: s });
    cursor = e;
  }
  if (cursor < text.length) pieces.push({ type: 'narration', text: text.slice(cursor), offset: cursor });

  const out: ScriptSegment[] = [];
  for (const p of pieces) {
    if (!SPEAKABLE.test(p.text)) continue;
    const last = out[out.length - 1];
    if (last && last.type === p.type && last.offset + last.text.length === p.offset) {
      last.text += p.text;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}
