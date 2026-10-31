import type { Paragraph, Sentence } from './text.ts';

/** A unit of synthesis: one paragraph, or a run of its sentences when the paragraph is long. */
export interface SpeechChunk {
  id: string;
  paragraph: Paragraph;
  sentences: Sentence[];
  /** Text sent to TTS: the paragraph slice with usable ruby readings substituted for their bases. */
  text: string;
  /** Maps a range in `text` back to a range in the paragraph's plain text. */
  toSource(offset: number, length: number): [number, number];
}

const MAX_CHUNK_CHARS = 1200;
const SPEAKABLE = /[\p{L}\p{N}]/u;
const KANA_READING = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;

interface Piece {
  src: number;
  srcLen: number;
  tts: number;
  ttsLen: number;
  /** Ruby substitutions map as a whole: any part of the reading highlights the whole base. */
  atomic: boolean;
}

function buildChunk(paragraph: Paragraph, sentences: Sentence[], k: number): SpeechChunk {
  const start = sentences[0].start;
  const end = sentences[sentences.length - 1].end;
  const pieces: Piece[] = [];
  let text = '';
  let cursor = start;

  const plain = (to: number) => {
    if (to <= cursor) return;
    pieces.push({ src: cursor, srcLen: to - cursor, tts: text.length, ttsLen: to - cursor, atomic: false });
    text += paragraph.text.slice(cursor, to);
    cursor = to;
  };

  for (const r of paragraph.ruby) {
    if (r.start < start || r.end > end) continue;
    // Emphasis dots and decorative glosses are not pronunciations; only kana readings are.
    if (!KANA_READING.test(r.reading)) continue;
    plain(r.start);
    pieces.push({ src: r.start, srcLen: r.end - r.start, tts: text.length, ttsLen: r.reading.length, atomic: true });
    text += r.reading;
    cursor = r.end;
  }
  plain(end);

  const locate = (ttsOffset: number) =>
    pieces.find((p) => ttsOffset < p.tts + p.ttsLen) ?? pieces[pieces.length - 1];

  return {
    id: `${paragraph.id}c${k}`,
    paragraph,
    sentences,
    text,
    toSource(offset, length) {
      const a = locate(offset);
      const b = locate(offset + Math.max(length, 1) - 1);
      const from = a.atomic ? a.src : a.src + (offset - a.tts);
      const to = b.atomic ? b.src + b.srcLen : b.src + (offset + length - b.tts);
      return [from, Math.max(to, from)];
    },
  };
}

export function buildChunks(paragraphs: Paragraph[]): SpeechChunk[] {
  const chunks: SpeechChunk[] = [];
  for (const p of paragraphs) {
    if (p.isBreak || !SPEAKABLE.test(p.text)) continue;
    let run: Sentence[] = [];
    let chars = 0;
    let k = 0;
    for (const s of p.sentences) {
      if (run.length && chars + s.text.length > MAX_CHUNK_CHARS) {
        chunks.push(buildChunk(p, run, k++));
        run = [];
        chars = 0;
      }
      run.push(s);
      chars += s.text.length;
    }
    if (run.length) chunks.push(buildChunk(p, run, k));
  }
  return chunks;
}
