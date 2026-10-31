import * as Popover from '@radix-ui/react-popover';
import { LoaderCircle, Play, Repeat1, Star, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Credit, DictEntry, DictResult } from '../../../../shared/types.ts';
import { api } from '../../lib/api.ts';
import { REPEAT_RATE, speech } from '../../lib/speechEngine.ts';
import { useReaderStore, voiceConfig, type LookupTarget } from '../../store/useReaderStore.ts';
import { useVocabStore, vocabKey } from '../../store/useVocabStore.ts';

const EN_POS: Record<string, string> = {
  noun: '名词', verb: '动词', adjective: '形容词', adverb: '副词', preposition: '介词', conjunction: '连词',
  pronoun: '代词', interjection: '感叹词', determiner: '限定词', article: '冠词', numeral: '数词', exclamation: '感叹词',
};

const cache = new Map<string, Promise<DictResult>>();

function keyOf(t: LookupTarget) {
  // English lookups don't depend on context; Japanese ones do (reading, inflection).
  return t.lang === 'en' ? `en|${t.word.toLowerCase()}` : `ja|${t.word}|${t.offset}|${t.sentence}`;
}

function fetchResult(t: LookupTarget) {
  const key = keyOf(t);
  let job = cache.get(key);
  if (!job) {
    job = api.lookup({ lang: t.lang, word: t.word, sentence: t.sentence, offset: t.offset });
    job.catch(() => cache.delete(key));
    cache.set(key, job);
  }
  return job;
}

// One element for word pronunciations, separate from the chapter's read-aloud audio.
const wordAudio = new Audio();

async function pronounce(result: DictResult, entry: DictEntry | undefined) {
  if (entry?.audio) {
    wordAudio.src = entry.audio;
  } else {
    // Speak the kana reading when there is one: a lone kanji is easy for TTS to misread.
    const text = result.lang === 'ja' ? (entry?.reading ?? entry?.headword ?? result.lemma) : (entry?.headword ?? result.lemma);
    const { voicePrefs } = useReaderStore.getState();
    const voice = voiceConfig(voicePrefs, result.lang).voice;
    wordAudio.src = (await api.tts({ text, lang: result.lang, voice, pitch: voicePrefs.pitch })).audio;
  }
  await wordAudio.play();
}

const linkClass = 'underline decoration-rule underline-offset-2 hover:text-celadon hover:decoration-celadon';

function CreditLine({ label, credit }: { label: string; credit: Credit }) {
  return (
    <p>
      {label}：
      {credit.url ? (
        <a href={credit.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {credit.name}
        </a>
      ) : (
        credit.name
      )}
      ，
      <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {credit.license}
      </a>
    </p>
  );
}

function Entry({
  entry,
  lang,
  primary,
  glossLang = 'en',
}: {
  entry: DictEntry;
  /** Language of the headword and examples. */
  lang: 'ja' | 'en';
  primary: boolean;
  /** Language the definitions are written in. */
  glossLang?: 'en' | 'zh-CN';
}) {
  const senses = primary ? entry.senses.slice(0, 5) : entry.senses.slice(0, 2);
  // Label a sense only when its part of speech differs from the one before it.
  const labelOf = (i: number) => {
    const key = senses[i].pos.join('|') + senses[i].notes.join('|');
    const prev = i > 0 ? senses[i - 1].pos.join('|') + senses[i - 1].notes.join('|') : null;
    return key !== prev;
  };
  return (
    <section className={primary ? '' : 'border-t border-rule pt-3'}>
      {!primary && (
        <p lang={lang} className="mb-1.5 text-sm">
          <span className={`font-semibold text-ink ${lang === 'ja' ? 'font-mincho' : 'font-literata'}`}>{entry.headword}</span>
          {entry.reading && <span className="ml-2 text-ink-soft">{entry.reading}</span>}
        </p>
      )}
      <ol className="space-y-2">
        {senses.map((s, i) => (
          <li key={i} className="text-sm leading-relaxed">
            {(s.pos.length > 0 || s.notes.length > 0) && labelOf(i) && (
              <p className="mb-0.5 flex flex-wrap gap-x-2 text-xs text-celadon-deep">
                {s.pos.map((p) => (
                  <span key={p}>{lang === 'en' ? (EN_POS[p] ?? p) : p}</span>
                ))}
                {s.notes.map((n) => (
                  <span key={n} className="text-ink-faint">
                    {n}
                  </span>
                ))}
              </p>
            )}
            <p lang={glossLang} className="text-ink">
              {senses.length > 1 && <span className="mr-1.5 tabular-nums text-ink-faint">{i + 1}.</span>}
              {s.glosses.join(glossLang === 'en' ? '; ' : '；')}
            </p>
            {s.example && s.exampleTranslation ? (
              // A bilingual example: the source sentence, then its translation.
              <p className="mt-1 border-l-2 border-rule pl-2.5 text-[13px] leading-relaxed">
                <span lang={lang} className={`block text-ink-soft ${lang === 'ja' ? 'font-mincho' : 'font-literata'}`}>
                  {s.example}
                </span>
                <span lang={glossLang} className="block text-ink-faint">
                  {s.exampleTranslation}
                </span>
              </p>
            ) : (
              s.example && (
                <p lang="en" className="mt-0.5 font-literata text-[13px] italic text-ink-soft">
                  {s.example}
                </p>
              )
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function WordPopover() {
  const lookup = useReaderStore((s) => s.lookup);
  const closeLookup = useReaderStore((s) => s.closeLookup);
  const pickToken = useReaderStore((s) => s.pickToken);
  const vocab = useVocabStore((s) => s.items);
  const saveVocab = useVocabStore((s) => s.save);
  const removeVocab = useVocabStore((s) => s.remove);
  const [saveError, setSaveError] = useState(false);
  const [state, setState] = useState<{ key: string; result?: DictResult; error?: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);

  // Anchor to the live word element so the card follows it while the page scrolls.
  const anchor = useRef({
    getBoundingClientRect: () =>
      document.querySelector(`[data-tok="${useReaderStore.getState().lookup?.tokenId}"]`)?.getBoundingClientRect() ??
      new DOMRect(),
  });

  useEffect(() => {
    if (!lookup) return;
    const key = keyOf(lookup);
    let live = true;
    setState({ key });
    setSaveError(false);
    if (!useVocabStore.getState().items) void useVocabStore.getState().load();
    fetchResult(lookup)
      .then((result) => live && setState({ key, result }))
      .catch((e: Error) => live && setState({ key, error: e.message }));
    return () => {
      live = false;
    };
  }, [lookup]);

  if (!lookup) return null;
  const current = state && state.key === keyOf(lookup) ? state : null;
  const result = current?.result;
  const [first, ...rest] = result?.entries ?? [];
  const zh = result?.zhEntries ?? [];
  // JMdict's entry is ranked by context (reading, part of speech), so it heads the card when present.
  const head = first ?? zh[0];
  const readable = speech.chunkOf(lookup.sentenceId) >= 0;

  const lemma = head?.headword ?? result?.lemma;
  const saved = lemma ? vocab?.find((v) => vocabKey(v.lang, v.lemma) === vocabKey(lookup.lang, lemma)) : undefined;

  const toggleSaved = async () => {
    if (!result || !lemma) return;
    if (saved) return removeVocab(saved.id);
    // A compact meaning for the flashcard: Chinese when available, else the first English senses.
    const meaning = zh.length
      ? zh[0].senses.slice(0, 2).map((s) => s.glosses.join('，')).join('；')
      : (first?.senses.slice(0, 2).map((s) => s.glosses.slice(0, 2).join(', ')).join('; ') ?? '');
    const { chapter, book } = useReaderStore.getState();
    try {
      await saveVocab({
        lang: lookup.lang,
        word: lookup.word,
        lemma,
        reading: head?.reading ?? result.reading,
        meaning,
        sentence: lookup.sentence,
        offset: lookup.offset,
        ...(chapter && book
          ? { source: chapter.source, bookId: chapter.bookId, bookTitle: book.title, chapter: chapter.index }
          : {}),
      });
    } catch {
      setSaveError(true);
    }
  };

  const act = (fn: () => void) => {
    // The sentence has been acted on; don't let the play button jump back to it later.
    pickToken(null);
    closeLookup();
    fn();
  };

  const say = async () => {
    if (!result) return;
    setSpeaking(true);
    try {
      await pronounce(result, head);
    } catch {
      // Pronunciation is a nicety; a failure here needs no message.
    } finally {
      setSpeaking(false);
    }
  };

  return (
    <Popover.Root open onOpenChange={(open) => !open && closeLookup()}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          // Keep clear of the top bar and the floating player (two rows tall below the sm breakpoint).
          collisionPadding={{ top: 64, bottom: window.innerWidth < 640 ? 156 : 104, left: 16, right: 16 }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          aria-label={`「${lookup.word}」的释义`}
          className="z-50 flex max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-2rem))] flex-col rounded-xl border border-rule bg-surface font-ui shadow-[0_18px_44px_-18px_rgb(0_0_0/0.4)] data-[state=open]:animate-[fade_120ms_ease-out]"
        >
          <header className="flex items-start gap-3 px-4 pb-2 pt-3.5">
            <div className="min-w-0 flex-1" lang={lookup.lang}>
              <p className="flex flex-wrap items-baseline gap-x-2.5">
                <span
                  className={`text-[1.6rem] font-semibold leading-tight text-ink ${
                    lookup.lang === 'ja' ? 'font-mincho' : 'font-literata'
                  }`}
                >
                  {head?.headword ?? result?.lemma ?? lookup.word}
                </span>
                {(head?.reading ?? result?.reading) && (
                  <span className="text-[15px] text-ink-soft">{head?.reading ?? result?.reading}</span>
                )}
              </p>
              {result && (result.analysis || result.lemma !== lookup.word.toLowerCase()) && (
                <p className="mt-1 text-xs text-ink-faint">
                  {result.analysis ?? `${lookup.word} → ${result.lemma}`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={say}
              disabled={!result || speaking}
              aria-label="朗读这个词"
              className="mt-1 grid size-8 shrink-0 place-items-center rounded-full text-celadon hover:bg-celadon-wash disabled:opacity-40"
            >
              {speaking ? <LoaderCircle size={16} className="animate-spin" /> : <Volume2 size={17} />}
            </button>
            <button
              type="button"
              onClick={toggleSaved}
              disabled={!result || !lemma}
              aria-pressed={Boolean(saved)}
              aria-label={saved ? '从生词本移除' : '加入生词本'}
              title={saveError ? '没保存上，请重试' : saved ? '已在生词本，点按移除' : '加入生词本'}
              className={`mt-1 grid size-8 shrink-0 place-items-center rounded-full hover:bg-celadon-wash disabled:opacity-40 ${
                saveError ? 'text-danger' : 'text-celadon'
              }`}
            >
              <Star size={17} fill={saved ? 'currentColor' : 'none'} />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
            {!current?.result && !current?.error && (
              <p className="flex items-center gap-2 py-2 text-sm text-ink-faint">
                <LoaderCircle size={14} className="animate-spin" /> 正在查词…
              </p>
            )}
            {current?.error && <p className="py-1 text-sm text-danger">{current.error}</p>}
            {result && !first && !zh.length && (
              <p className="py-1 text-sm text-ink-soft">
                词典里没有「{result.lemma}」。{lookup.lang === 'ja' ? '可能是人名、专有名词或少见写法。' : ''}
              </p>
            )}
            {zh.map((e, i) => (
              <Entry key={`zh${i}`} entry={e} lang={lookup.lang} primary={i === 0} glossLang="zh-CN" />
            ))}
            {first &&
              (zh.length ? (
                // With Chinese definitions present, English is a supplement the reader can open.
                <details className="group border-t border-rule pt-2.5">
                  <summary className="cursor-pointer select-none text-xs text-ink-faint marker:text-rule hover:text-ink-soft">
                    英文释义：{result!.credit.name}
                  </summary>
                  <div className="mt-2.5 space-y-3">
                    <Entry entry={first} lang={lookup.lang} primary />
                    {rest.map((e, i) => (
                      <Entry key={i} entry={e} lang={lookup.lang} primary={false} />
                    ))}
                  </div>
                </details>
              ) : (
                <>
                  <Entry entry={first} lang={lookup.lang} primary />
                  {rest.map((e, i) => (
                    <Entry key={i} entry={e} lang={lookup.lang} primary={false} />
                  ))}
                </>
              ))}
            {result && (first || zh.length > 0) && (
              // Attribution required by the CC BY-SA sources: who, where from, which licence.
              <div className="space-y-0.5 text-[11px] text-ink-faint">
                {zh.length > 0 && result.zhCredit && <CreditLine label="中文释义" credit={result.zhCredit} />}
                {first && <CreditLine label={zh.length ? '英文释义' : '释义'} credit={result.credit} />}
                {head?.audio && head.audioCredit && <CreditLine label="发音录音" credit={head.audioCredit} />}
              </div>
            )}
          </div>

          {readable && (
            <footer className="flex gap-1 border-t border-rule px-2 py-1.5">
              <button
                type="button"
                onClick={() => act(() => speech.playFromSentence(lookup.sentenceId))}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs text-ink-soft hover:bg-celadon-wash hover:text-ink"
              >
                <Play size={13} /> 从这句读起
              </button>
              <button
                type="button"
                onClick={() => act(() => speech.repeatSentence(lookup.sentenceId))}
                title={`以 ${REPEAT_RATE} 倍速重读这一句，读完自动暂停`}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs text-ink-soft hover:bg-celadon-wash hover:text-ink"
              >
                <Repeat1 size={13} /> 慢速跟读 {REPEAT_RATE}×
              </button>
            </footer>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
