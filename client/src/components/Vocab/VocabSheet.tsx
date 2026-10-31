import * as Dialog from '@radix-ui/react-dialog';
import { Download, Trash2, Volume2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Lang, VocabItem } from '../../../../shared/types.ts';
import { api } from '../../lib/api.ts';
import { useReaderStore, voiceConfig } from '../../store/useReaderStore.ts';
import { useVocabStore } from '../../store/useVocabStore.ts';

type Filter = 'all' | Lang;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'ja', label: '日语' },
  { id: 'en', label: '英语' },
];

const sentenceAudio = new Audio();

async function speakSentence(v: VocabItem) {
  // The sentence is read the way the chapter would be, drama voices included.
  const config = voiceConfig(useReaderStore.getState().voicePrefs, v.lang);
  sentenceAudio.src = (await api.tts({ text: v.sentence, lang: v.lang, ...config })).audio;
  await sentenceAudio.play();
}

/** The original sentence with the saved word marked. */
function Context({ v }: { v: VocabItem }) {
  const end = v.offset + v.word.length;
  const fits = v.sentence.slice(v.offset, end) === v.word;
  return (
    <p lang={v.lang} className={`text-[13px] leading-relaxed text-ink-soft ${v.lang === 'ja' ? 'font-mincho' : 'font-literata'}`}>
      {fits ? (
        <>
          {v.sentence.slice(0, v.offset)}
          <mark className="rounded-sm bg-lamp/30 px-0.5 text-ink">{v.word}</mark>
          {v.sentence.slice(end)}
        </>
      ) : (
        v.sentence
      )}
    </p>
  );
}

function Row({ v }: { v: VocabItem }) {
  const remove = useVocabStore((s) => s.remove);
  const setOpen = useVocabStore((s) => s.setOpen);
  const openChapter = useReaderStore((s) => s.openChapter);
  const canOpen = v.source && v.bookId && v.chapter;

  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p lang={v.lang} className="flex flex-wrap items-baseline gap-x-2">
            <span className={`text-lg font-semibold text-ink ${v.lang === 'ja' ? 'font-mincho' : 'font-literata'}`}>
              {v.lemma}
            </span>
            {v.reading && <span className="text-sm text-ink-soft">{v.reading}</span>}
          </p>
          {v.meaning && <p className="mt-0.5 text-sm text-ink">{v.meaning}</p>}
        </div>
        <button
          type="button"
          onClick={() => void speakSentence(v).catch(() => {})}
          aria-label={`朗读「${v.lemma}」的例句`}
          className="grid size-9 shrink-0 place-items-center rounded-md text-celadon hover:bg-celadon-wash"
        >
          <Volume2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => void remove(v.id)}
          aria-label={`删除「${v.lemma}」`}
          className="grid size-9 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-danger-wash hover:text-danger"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="mt-2 border-l-2 border-rule pl-3">
        <Context v={v} />
        {v.bookTitle && (
          <button
            type="button"
            disabled={!canOpen}
            onClick={() => {
              setOpen(false);
              void openChapter(v.source!, v.bookId!, v.chapter!);
            }}
            className="mt-1 text-left text-xs text-ink-faint hover:text-celadon disabled:hover:text-ink-faint"
          >
            《{v.bookTitle}》{v.chapter ? ` 第 ${v.chapter} 章` : ''}
          </button>
        )}
      </div>
    </li>
  );
}

export function VocabSheet() {
  const { items, error, open, setOpen } = useVocabStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (v) =>
        (filter === 'all' || v.lang === filter) &&
        (!q || [v.lemma, v.word, v.reading ?? '', v.meaning].some((s) => s.toLowerCase().includes(q))),
    );
  }, [items, filter, query]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[fade_160ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] font-ui shadow-[-8px_0_40px_-16px_rgb(0_0_0/0.35)] focus:outline-none data-[state=open]:animate-[sheet-right_220ms_cubic-bezier(.2,.8,.2,1)]"
        >
          <header className="flex items-center justify-between px-5 pb-3 pt-5">
            <Dialog.Title className="text-base font-medium text-ink">
              生词本
              {items && <span className="ml-2 text-sm font-normal text-ink-faint">{items.length} 个词</span>}
            </Dialog.Title>
            <Dialog.Close
              aria-label="关闭"
              className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
            >
              <X size={18} />
            </Dialog.Close>
          </header>

          <div className="flex items-center gap-2 px-5">
            <div role="tablist" aria-label="语言" className="flex rounded-lg bg-paper p-0.5 text-sm">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className="rounded-md px-3 py-1.5 text-ink-soft aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-sm"
                >
                  {f.label}
                </button>
              ))}
            </div>
            <a
              href={api.vocab.exportUrl(filter === 'all' ? undefined : filter)}
              download
              className={`ml-auto flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-celadon hover:bg-celadon-wash ${
                shown.length ? '' : 'pointer-events-none opacity-40'
              }`}
            >
              <Download size={15} /> 导出 Anki
            </a>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索单词、读音或释义"
            className="mx-5 mt-3 rounded-md border border-rule bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-celadon focus:outline-none sm:text-sm"
          />

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-rule">
            {error && <p className="mx-5 my-4 rounded-md bg-danger-wash px-4 py-3 text-sm text-danger">{error}</p>}
            {items === null && !error && <p className="px-5 py-8 text-center text-sm text-ink-faint">正在读取…</p>}
            {items && items.length === 0 && (
              <p className="px-8 py-12 text-center text-sm leading-relaxed text-ink-soft">
                还没有生词。读书时点开任意一个词，按卡片右上角的 ☆ 就能收进来。
              </p>
            )}
            {items && items.length > 0 && shown.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-ink-soft">没有符合的词。</p>
            )}
            <ul className="divide-y divide-rule">
              {shown.map((v) => (
                <Row key={v.id} v={v} />
              ))}
            </ul>
          </div>

          <p className="border-t border-rule px-5 py-3 text-xs leading-relaxed text-ink-faint">
            导出的文件可直接用 Anki「文件 → 导入」，会自动建好 EchoReader 牌组；卡片背面带原句和出处。
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
