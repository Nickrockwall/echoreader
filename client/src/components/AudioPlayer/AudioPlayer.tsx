import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import { Check, LoaderCircle, Pause, Play, Repeat1, SkipBack, SkipForward, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChapterContent } from '../../../../shared/types.ts';
import { useAudioSync, useSpeechState } from '../../hooks/useAudioSync.ts';
import { buildChunks, type SpeechChunk } from '../../lib/speech.ts';
import { REPEAT_RATE, speech } from '../../lib/speechEngine.ts';
import type { Paragraph } from '../../lib/text.ts';
import { RATES, useReaderStore, VOICES } from '../../store/useReaderStore.ts';

const TOP_BAR_HEIGHT = 56;

/** The chunk and sentence containing a picked body word, if any. */
function pickedStart(pickedTokenId: string | null) {
  const sentenceId = pickedTokenId?.match(/^(p\d+s\d+)t\d+$/)?.[1];
  if (!sentenceId) return null;
  const index = speech.chunkOf(sentenceId);
  return index >= 0 ? { index, sentenceId } : null;
}

/** Where a first "play" begins: the first paragraph still visible below the top bar. */
function firstVisible(chunks: SpeechChunk[]) {
  const i = chunks.findIndex((c) => {
    const el = document.querySelector(`[data-pid="${c.paragraph.id}"]`);
    return el && el.getBoundingClientRect().bottom > TOP_BAR_HEIGHT + 8;
  });
  return { index: Math.max(0, i) };
}

export function AudioPlayer({ chapter, paragraphs }: { chapter: ChapterContent; paragraphs: Paragraph[] }) {
  const chunks = useMemo(() => buildChunks(paragraphs), [paragraphs]);
  const state = useSpeechState();
  const {
    rate,
    setRate,
    voices,
    setVoice,
    continuous,
    autoplayPending,
    setAutoplayPending,
    openChapter,
    pickedTokenId,
  } = useReaderStore();
  const lang = chapter.lang;
  const [scrub, setScrub] = useState<number | null>(null);
  // A word picked after the last play start redirects the next play to its sentence.
  const usedPick = useRef<string | null>(null);

  useAudioSync();

  const onPlay = () => {
    const pick = pickedStart(pickedTokenId);
    if (pick && pickedTokenId !== usedPick.current && state.status !== 'playing') {
      usedPick.current = pickedTokenId;
      speech.playFromSentence(pick.sentenceId);
    } else {
      speech.toggle(pick ?? firstVisible(chunks));
    }
  };

  // A fresh queue per chapter (the Reader is keyed by chapter, so this runs once per chapter).
  useEffect(() => {
    const initial = useReaderStore.getState();
    speech.load(chunks, lang, initial.voices[lang]);
    speech.setRate(initial.rate);
    if (initial.autoplayPending) void speech.playAt(0);
    return () => speech.stop();
  }, [chunks, lang]);

  // The flag is cleared only once playback really started (or failed), so a remount in between
  // (StrictMode, a quick re-render) still honours it.
  useEffect(() => {
    if (state.status === 'playing' || state.status === 'error') setAutoplayPending(false);
  }, [state.status, setAutoplayPending]);

  useEffect(() => speech.setRate(rate), [rate]);
  useEffect(() => speech.setVoice(voices[lang]), [voices, lang]);

  useEffect(() => {
    speech.onChapterEnd = () => {
      if (!continuous || !chapter.next) return;
      setAutoplayPending(true);
      void openChapter(chapter.source, chapter.bookId, chapter.next);
    };
    return () => {
      speech.onChapterEnd = null;
    };
  }, [continuous, chapter, openChapter, setAutoplayPending]);

  const { status, index, count, error, repeating } = state;
  const hasSentence = Boolean(speech.active) && (status === 'playing' || status === 'paused');
  const busy = status === 'loading' || autoplayPending;
  const playing = status === 'playing';
  const shown = scrub ?? index;
  const voiceLabel = VOICES[lang].find((v) => v.id === voices[lang])?.label ?? voices[lang];

  if (!count) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 font-ui">
      <div
        role="region"
        aria-label="朗读控制条"
        className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-rule bg-page/95 px-3 py-2.5 shadow-[0_18px_40px_-20px_rgb(30_35_48/0.45)] backdrop-blur"
      >
        <button
          type="button"
          onClick={onPlay}
          aria-label={playing ? '暂停' : '朗读'}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-celadon text-page hover:bg-celadon-deep"
        >
          {busy ? (
            <LoaderCircle size={20} className="animate-spin" />
          ) : playing ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" className="translate-x-px" />
          )}
        </button>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            aria-label="上一段"
            disabled={index <= 0}
            onClick={() => speech.playAt(index - 1)}
            className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink disabled:opacity-30"
          >
            <SkipBack size={17} />
          </button>
          <button
            type="button"
            aria-label="下一段"
            disabled={index >= count - 1}
            onClick={() => speech.playAt(index + 1)}
            className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink disabled:opacity-30"
          >
            <SkipForward size={17} />
          </button>
          <button
            type="button"
            aria-label={`慢速重听这句（${REPEAT_RATE}×）`}
            title={`慢速重听这句（${REPEAT_RATE}×）`}
            aria-pressed={Boolean(repeating)}
            disabled={!hasSentence}
            onClick={() => speech.repeatSentence()}
            className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink disabled:opacity-30 aria-pressed:bg-lamp/30 aria-pressed:text-ink"
          >
            <Repeat1 size={17} />
          </button>
        </div>

        <div className="order-last flex min-w-0 basis-full items-center gap-3 sm:order-none sm:basis-auto sm:flex-1">
          <Slider.Root
            className="relative flex h-5 min-w-0 flex-1 touch-none select-none items-center"
            value={[shown]}
            min={0}
            max={Math.max(count - 1, 1)}
            step={1}
            onValueChange={([v]) => setScrub(v)}
            onValueCommit={([v]) => {
              setScrub(null);
              void speech.playAt(v);
            }}
            aria-label="朗读位置（段落）"
          >
            <Slider.Track className="relative h-1 grow rounded-full bg-rule">
              <Slider.Range className="absolute h-full rounded-full bg-celadon" />
            </Slider.Track>
            <Slider.Thumb className="block size-3.5 rounded-full border-2 border-celadon bg-page" />
          </Slider.Root>
          <span className="shrink-0 text-xs tabular-nums text-ink-faint">
            {shown + 1} / {count} 段
          </span>
        </div>

        <div role="radiogroup" aria-label="语速" className="flex shrink-0 rounded-lg bg-paper p-0.5 text-xs">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={rate === r}
              onClick={() => setRate(r)}
              className="rounded-md px-2 py-1 tabular-nums text-ink-soft aria-checked:bg-page aria-checked:text-ink aria-checked:shadow-sm"
            >
              {r === 1 ? '1.0' : r}×
            </button>
          ))}
        </div>

        <Popover.Root>
          <Popover.Trigger
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-soft hover:bg-celadon-wash hover:text-ink"
            aria-label={`声线：${voiceLabel}`}
          >
            <UserRound size={15} />
            <span className="hidden md:inline">{voiceLabel.split(' · ')[0]}</span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="end"
              sideOffset={10}
              className="z-50 w-56 rounded-lg border border-rule bg-page p-1.5 font-ui shadow-[0_12px_32px_-12px_rgb(30_35_48/0.3)]"
            >
              <div role="radiogroup" aria-label="声线">
                {VOICES[lang].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={voices[lang] === v.id}
                    onClick={() => setVoice(lang, v.id)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-celadon-wash"
                  >
                    {v.label}
                    {voices[lang] === v.id && <Check size={15} className="text-celadon" />}
                  </button>
                ))}
              </div>
              <label className="mt-1 flex cursor-pointer items-center justify-between border-t border-rule px-3 pb-1.5 pt-2.5 text-sm text-ink-soft">
                读完自动下一章
                <input
                  type="checkbox"
                  checked={continuous}
                  onChange={(e) => useReaderStore.getState().setContinuous(e.target.checked)}
                  className="accent-celadon"
                />
              </label>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {status === 'error' && error && (
          <p role="alert" className="basis-full px-1 text-xs !indent-0 text-red-700">
            朗读出错：{error}。点播放键重试。
          </p>
        )}
      </div>
    </div>
  );
}
