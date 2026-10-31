import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookDetail, ChapterContent, SourceId } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';

export interface ReadingPosition {
  source: SourceId;
  bookId: string;
  chapter: number;
  /** Shown on the welcome screen before the book is loaded again. */
  title: string;
}

interface ReaderState {
  // persisted
  fontSize: number;
  lineHeight: number;
  lastPosition: ReadingPosition | null;

  // session
  book: BookDetail | null;
  chapter: ChapterContent | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  pickerOpen: boolean;
  pickerSource: SourceId;
  pickedTokenId: string | null;

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

      book: null,
      chapter: null,
      status: 'idle',
      error: null,
      pickerOpen: false,
      pickerSource: 'syosetu',
      pickedTokenId: null,

      setFontSize: (fontSize) => set({ fontSize }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      resetTypography: () => set({ fontSize: DEFAULT_FONT_SIZE, lineHeight: DEFAULT_LINE_HEIGHT }),

      openPicker: (source) => set((s) => ({ pickerOpen: true, pickerSource: source ?? s.book?.source ?? s.pickerSource })),
      closePicker: () => set({ pickerOpen: false }),

      async openChapter(source, bookId, chapter) {
        const seq = ++requestSeq;
        set({ status: 'loading', error: null, pickedTokenId: null });
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
      partialize: (s) => ({ fontSize: s.fontSize, lineHeight: s.lineHeight, lastPosition: s.lastPosition }),
    },
  ),
);
