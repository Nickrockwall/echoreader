import { useEffect, useSyncExternalStore } from 'react';
import { lastStarted, speech, type EngineState, type PreparedChunk } from '../lib/speechEngine.ts';

const WORD_HIGHLIGHT = 'tts-word';
/** Pause auto-follow for this long after the reader scrolls by hand. */
const MANUAL_SCROLL_GRACE_MS = 4000;

export function useSpeechState(): EngineState {
  return useSyncExternalStore(
    (cb) => speech.subscribe(cb),
    () => speech.snapshot,
  );
}

/**
 * Builds a DOM Range over [from, to) of a paragraph's plain text, skipping text that isn't part
 * of it: ruby readings and decorations such as a speech bubble's speaker label.
 */
function rangeInParagraph(p: Element, from: number, to: number): Range | null {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('rt, rp, [data-skip-text]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const range = document.createRange();
  let pos = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const len = node.textContent!.length;
    if (!started && from < pos + len) {
      range.setStart(node, from - pos);
      started = true;
    }
    if (started && to <= pos + len) {
      range.setEnd(node, to - pos);
      return range;
    }
    pos += len;
  }
  return null;
}

/**
 * Follows the audio clock and paints the read-along state straight onto the DOM:
 * the current sentence gets [data-reading], the current word a CSS Custom Highlight.
 * Nothing here re-renders React.
 */
export function useAudioSync() {
  useEffect(() => {
    const highlights = typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : null;
    let frame = 0;
    let sentenceId: string | null = null;
    let wordKey = '';
    let lastManualScroll = 0;

    const markManual = () => (lastManualScroll = performance.now());
    const keys = (e: KeyboardEvent) => {
      if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) markManual();
    };
    window.addEventListener('wheel', markManual, { passive: true });
    window.addEventListener('touchmove', markManual, { passive: true });
    window.addEventListener('keydown', keys);

    // A sentence can span several elements (split around a speech bubble's edge); mark them all.
    const sentenceEls = (id: string | null) => (id ? document.querySelectorAll(`[data-sid="${id}"]`) : []);

    const setSentence = (id: string | null) => {
      if (id === sentenceId) return;
      sentenceEls(sentenceId).forEach((e) => e.removeAttribute('data-reading'));
      const els = sentenceEls(id);
      els.forEach((e) => e.setAttribute('data-reading', ''));
      sentenceId = id;
      const el = els[0];
      if (el && performance.now() - lastManualScroll > MANUAL_SCROLL_GRACE_MS) {
        const r = el.getBoundingClientRect();
        // Vertical text scrolls sideways, so the sentence can also leave through the left or right.
        const offscreen =
          r.top < 96 || r.bottom > window.innerHeight - 160 || r.left < 24 || r.right > window.innerWidth - 24;
        // "block" follows the writing mode: vertical centring in horizontal text, horizontal in 縦書き.
        if (offscreen) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }
    };

    const setWord = (prepared: PreparedChunk | null, i: number) => {
      const key = prepared && i >= 0 ? `${prepared.chunk.id}:${i}` : '';
      if (key === wordKey) return;
      wordKey = key;
      if (!highlights) return;
      if (!key) return void highlights.delete(WORD_HIGHLIGHT);
      const p = document.querySelector(`[data-pid="${prepared!.chunk.paragraph.id}"]`);
      const w = prepared!.words[i];
      const range = p && rangeInParagraph(p, w.from, w.to);
      if (range) highlights.set(WORD_HIGHLIGHT, new Highlight(range));
      else highlights.delete(WORD_HIGHLIGHT);
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const { status } = speech.snapshot;
      const prepared = speech.active;
      if (!prepared || status === 'idle' || status === 'ended' || status === 'error') {
        setSentence(null);
        setWord(null, -1);
        return;
      }
      const t = speech.audio.currentTime * 1000;
      // A slow repeat starts a little before its sentence; keep the highlight on that sentence.
      setSentence(
        speech.snapshot.repeating ?? prepared.chunk.sentences[Math.max(0, lastStarted(prepared.sentenceStarts, t))].id,
      );
      // Keep the word lit through the short gaps between words, but not after the last one ends.
      const wi = lastStarted(prepared.wordStarts, t);
      const word = prepared.words[wi];
      const next = prepared.words[wi + 1];
      setWord(prepared, word && (t < word.end + 120 || (next && t < next.start)) ? wi : -1);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', markManual);
      window.removeEventListener('touchmove', markManual);
      window.removeEventListener('keydown', keys);
      setSentence(null);
      highlights?.delete(WORD_HIGHLIGHT);
    };
  }, []);
}
