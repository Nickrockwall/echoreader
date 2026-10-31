import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookDetail, ChapterContent, Lang, SourceId } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';

export interface ReadingPosition {
  source: SourceId;
  bookId: string;
  chapter: number;
  /** Shown on the welcome screen before the book is loaded again. */
  title: string;
}

export const RATES = [0.8, 1, 1.25] as const;
export type Rate = (typeof RATES)[number];

export const VOICES: Record<Lang, { id: string; label: string }[]> = {
  ja: [
    { id: 'ja-JP-NanamiNeural', label: 'Nanami · 女声' },
    { id: 'ja-JP-KeitaNeural', label: 'Keita · 男声' },
  ],
  en: [
    { id: 'en-US-JennyNeural', label: 'Jenny · 美式女声' },
    { id: 'en-GB-RyanNeural', label: 'Ryan · 英式男声' },
  ],
};

/** The word whose dictionary card is open. */
export interface LookupTarget {
  tokenId: string;
  sentenceId: string;
  lang: Lang;
  word: string;
  /** Plain text of the sentence and the word's offset in it, for analysis in context. */
  sentence: string;
  offset: number;
}

interface ReaderState {
  // persisted
  fontSize: number;
  lineHeight: number;
  lastPosition: ReadingPosition | null;
  rate: Rate;
  voices: Record<Lang, string>;
  /** Keep reading into the next chapter when one finishes. */
  continuous: boolean;
  /** Add generated furigana to every kanji word (Japanese). */
  autoFurigana: boolean;

  // session
  book: BookDetail | null;
  chapter: ChapterContent | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  pickerOpen: boolean;
  pickerSource: SourceId;
  pickedTokenId: string | null;
  lookup: LookupTarget | null;
  /** Set when a chapter finished playing and the next one should start by itself. */
  autoplayPending: boolean;

  setAutoFurigana(on: boolean): void;
  openLookup(target: LookupTarget): void;
  closeLookup(): void;
  setRate(rate: Rate): void;
  setVoice(lang: Lang, voice: string): void;
  setContinuous(on: boolean): void;
  setAutoplayPending(on: boolean): void;
  setFontSize(size: number): void;
  setLineHeight(lh: number): void;
  resetTypography(): void;
  openPicker(source?: SourceId): void;
  closePicker(): void;
  openChapter(source: SourceId, bookId: string, chapter: number): Promise<void>;
  pickToken(id: string | null): void;
}

export const DEFAULT_FONT_SIZE = 19;
export const DEFAULT_LINE_HEIGHT = 1.9;

let requestSeq = 0;

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      fontSize: DEFAULT_FONT_SIZE,
      lineHeight: DEFAULT_LINE_HEIGHT,
      lastPosition: null,
      rate: 1,
      voices: { ja: VOICES.ja[0].id, en: VOICES.en[0].id },
      continuous: true,
      autoFurigana: false,

      book: null,
      chapter: null,
      status: 'idle',
      error: null,
      pickerOpen: false,
      pickerSource: 'syosetu',
      pickedTokenId: null,
      lookup: null,
      autoplayPending: false,

      setAutoFurigana: (autoFurigana) => set({ autoFurigana }),
      openLookup: (lookup) => set({ lookup, pickedTokenId: lookup.tokenId }),
      closeLookup: () => set({ lookup: null }),
      setRate: (rate) => set({ rate }),
      setVoice: (lang, voice) => set((s) => ({ voices: { ...s.voices, [lang]: voice } })),
      setContinuous: (continuous) => set({ continuous }),
      setAutoplayPending: (autoplayPending) => set({ autoplayPending }),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      resetTypography: () => set({ fontSize: DEFAULT_FONT_SIZE, lineHeight: DEFAULT_LINE_HEIGHT }),

      openPicker: (source) => set((s) => ({ pickerOpen: true, pickerSource: source ?? s.book?.source ?? s.pickerSource })),
      closePicker: () => set({ pickerOpen: false }),

      async openChapter(source, bookId, chapter) {
        const seq = ++requestSeq;
        set({ status: 'loading', error: null, pickedTokenId: null, lookup: null });
        try {
          const current = get().book;
          const book =
            current && current.source === source && current.id === bookId ? current : await api.book(source, bookId);
          const content = await api.chapter(source, bookId, chapter);
          if (seq !== requestSeq) return; // a newer navigation won
          set({
            book,
            chapter: content,
            status: 'ready',
            pickerOpen: false,
            lastPosition: { source, bookId, chapter, title: book.title },
          });
          window.scrollTo({ top: 0 });
        } catch (err) {
          if (seq !== requestSeq) return;
          set({ status: 'error', error: (err as Error).message });
        }
      },

      pickToken: (pickedTokenId) => set({ pickedTokenId }),
    }),
    {
      name: 'echoreader',
      partialize: (s) => ({
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        lastPosition: s.lastPosition,
        rate: s.rate,
        voices: s.voices,
        continuous: s.continuous,
        autoFurigana: s.autoFurigana,
      }),
    },
  ),
);
