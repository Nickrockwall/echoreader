import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BookDetail, ChapterContent, Lang, SourceId } from '../../../shared/types.ts';
import type { AmbientId } from '../lib/ambient.ts';
import type { VoiceConfig } from '../lib/speechEngine.ts';
import { api } from '../lib/api.ts';

export type Theme = 'light' | 'dark' | 'sepia';

export interface ReadingPosition {
  source: SourceId;
  bookId: string;
  chapter: number;
  /** Shown on the welcome screen before the book is loaded again. */
  title: string;
}

/** Quick speed buttons on the player; the settings panel allows anything from MIN_RATE to MAX_RATE. */
export const RATES = [0.8, 1, 1.25, 1.5] as const;
export const MIN_RATE = 0.8;
export const MAX_RATE = 1.5;

export interface VoicePreferences {
  /** Drama mode: quoted dialogue is read in its own voice. */
  dramaMode: boolean;
  narrationVoiceJa: string;
  dialogueVoiceJa: string;
  narrationVoiceEn: string;
  dialogueVoiceEn: string;
  /** Pitch offset in percent applied to every voice (-20 … 20). */
  pitch: number;
}

export const DEFAULT_VOICE_PREFS: VoicePreferences = {
  dramaMode: false,
  narrationVoiceJa: 'ja-nanami',
  dialogueVoiceJa: 'ja-genki',
  narrationVoiceEn: 'en-jenny',
  dialogueVoiceEn: 'en-aria',
  pitch: 0,
};

/** What the synthesis request needs for a chapter in `lang`. */
export function voiceConfig(prefs: VoicePreferences, lang: Lang): VoiceConfig {
  return {
    voice: lang === 'ja' ? prefs.narrationVoiceJa : prefs.narrationVoiceEn,
    dialogueVoice: lang === 'ja' ? prefs.dialogueVoiceJa : prefs.dialogueVoiceEn,
    drama: prefs.dramaMode,
    pitch: prefs.pitch,
  };
}

/** Presets used to be stored as plain Edge voice names. */
const LEGACY_VOICES: Record<string, string> = {
  'ja-JP-NanamiNeural': 'ja-nanami',
  'ja-JP-KeitaNeural': 'ja-keita',
  'en-US-JennyNeural': 'en-jenny',
  'en-GB-RyanNeural': 'en-ryan',
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
  /** Playback speed (MIN_RATE … MAX_RATE), applied in the browser so it changes instantly. */
  rate: number;
  voicePrefs: VoicePreferences;
  /** Keep reading into the next chapter when one finishes. */
  continuous: boolean;
  /** Add generated furigana to every kanji word (Japanese). */
  autoFurigana: boolean;
  /** Japanese chapters set top-to-bottom, right-to-left (縦書き). */
  vertical: boolean;
  theme: Theme;
  /** Ambient track volumes, 0–1 (0 = off). */
  ambient: Record<AmbientId, number>;
  voiceVolume: number;
  /** Lower the ambience while the voice is reading. */
  ducking: boolean;

  // session
  book: BookDetail | null;
  chapter: ChapterContent | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  pickerOpen: boolean;
  pickerSource: SourceId;
  pickedTokenId: string | null;
  lookup: LookupTarget | null;
  shortcutsOpen: boolean;
  creditsOpen: boolean;
  /** Set when a chapter finished playing and the next one should start by itself. */
  autoplayPending: boolean;

  setAutoFurigana(on: boolean): void;
  setVertical(on: boolean): void;
  setTheme(theme: Theme): void;
  setAmbient(id: AmbientId, volume: number): void;
  setVoiceVolume(volume: number): void;
  setDucking(on: boolean): void;
  setShortcutsOpen(open: boolean): void;
  setCreditsOpen(open: boolean): void;
  openLookup(target: LookupTarget): void;
  closeLookup(): void;
  setRate(rate: number): void;
  setVoicePrefs(patch: Partial<VoicePreferences>): void;
  resetVoicePrefs(): void;
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
      voicePrefs: DEFAULT_VOICE_PREFS,
      continuous: true,
      autoFurigana: false,
      vertical: false,
      theme: 'light',
      ambient: { rain: 0, fire: 0, cafe: 0 },
      voiceVolume: 1,
      ducking: true,

      book: null,
      chapter: null,
      status: 'idle',
      error: null,
      pickerOpen: false,
      pickerSource: 'syosetu',
      pickedTokenId: null,
      lookup: null,
      shortcutsOpen: false,
      creditsOpen: false,
      autoplayPending: false,

      setAutoFurigana: (autoFurigana) => set({ autoFurigana }),
      setVertical: (vertical) => set({ vertical }),
      setTheme: (theme) => set({ theme }),
      setAmbient: (id, volume) => set((s) => ({ ambient: { ...s.ambient, [id]: volume } })),
      setVoiceVolume: (voiceVolume) => set({ voiceVolume }),
      setDucking: (ducking) => set({ ducking }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      setCreditsOpen: (creditsOpen) => set({ creditsOpen }),
      openLookup: (lookup) => set({ lookup, pickedTokenId: lookup.tokenId }),
      closeLookup: () => set({ lookup: null }),
      setRate: (rate) => set({ rate }),
      setVoicePrefs: (patch) => set((s) => ({ voicePrefs: { ...s.voicePrefs, ...patch } })),
      resetVoicePrefs: () => set({ voicePrefs: DEFAULT_VOICE_PREFS }),
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
      // v1: one Edge voice name per language (`voices`) became VoicePreferences presets.
      version: 1,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 1) {
          const old = (state.voices ?? {}) as Partial<Record<Lang, string>>;
          state.voicePrefs = {
            ...DEFAULT_VOICE_PREFS,
            narrationVoiceJa: LEGACY_VOICES[old.ja ?? ''] ?? DEFAULT_VOICE_PREFS.narrationVoiceJa,
            narrationVoiceEn: LEGACY_VOICES[old.en ?? ''] ?? DEFAULT_VOICE_PREFS.narrationVoiceEn,
          };
          delete state.voices;
        }
        return state as unknown as ReaderState;
      },
      partialize: (s) => ({
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        lastPosition: s.lastPosition,
        rate: s.rate,
        voicePrefs: s.voicePrefs,
        continuous: s.continuous,
        autoFurigana: s.autoFurigana,
        vertical: s.vertical,
        theme: s.theme,
        ambient: s.ambient,
        voiceVolume: s.voiceVolume,
        ducking: s.ducking,
      }),
    },
  ),
);
