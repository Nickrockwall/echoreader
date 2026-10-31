import { create } from 'zustand';
import type { Lang, VocabInput, VocabItem } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';

export const vocabKey = (lang: Lang, lemma: string) => `${lang}|${lemma}`;

interface VocabState {
  /** null until first loaded from the server. */
  items: VocabItem[] | null;
  error: string | null;
  open: boolean;
  load(): Promise<void>;
  save(input: VocabInput): Promise<void>;
  remove(id: number): Promise<void>;
  setOpen(open: boolean): void;
}

/** The vocabulary book lives on the server, so the phone and the computer share one list. */
export const useVocabStore = create<VocabState>()((set, get) => ({
  items: null,
  error: null,
  open: false,

  async load() {
    try {
      set({ items: await api.vocab.list(), error: null });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async save(input) {
    const item = await api.vocab.save(input);
    const rest = (get().items ?? []).filter((v) => v.id !== item.id);
    set({ items: [item, ...rest] });
  },

  async remove(id) {
    const before = get().items;
    set({ items: (before ?? []).filter((v) => v.id !== id) });
    try {
      await api.vocab.remove(id);
    } catch (err) {
      set({ items: before, error: (err as Error).message });
    }
  },

  setOpen: (open) => {
    set({ open });
    if (open) void get().load();
  },
}));
