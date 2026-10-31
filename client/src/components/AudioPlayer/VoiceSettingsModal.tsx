import * as Dialog from '@radix-ui/react-dialog';
import * as Slider from '@radix-ui/react-slider';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Lang, VoicePreset } from '../../../../shared/types.ts';
import {
  DEFAULT_VOICE_PREFS,
  MAX_RATE,
  MIN_RATE,
  useReaderStore,
  type VoicePreferences,
} from '../../store/useReaderStore.ts';
import { useVoiceCatalog } from './useVoiceCatalog.ts';
import { VoicePreviewButton } from './VoicePreviewButton.tsx';

type Role = 'narration' | 'dialogue';

const FIELD: Record<Lang, Record<Role, keyof VoicePreferences>> = {
  ja: { narration: 'narrationVoiceJa', dialogue: 'dialogueVoiceJa' },
  en: { narration: 'narrationVoiceEn', dialogue: 'dialogueVoiceEn' },
};

const QUOTES: Record<Lang, string> = { ja: '「」『』', en: '“ ”  " "  ‘ ’' };

function SliderRow(props: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange(v: number): void;
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-ink-soft">{props.label}</span>
        <span className="tabular-nums text-ink">{props.display}</span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={props.step}
        onValueChange={([v]) => props.onChange(v)}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-rule">
          <Slider.Range className="absolute h-full rounded-full bg-celadon" />
        </Slider.Track>
        <Slider.Thumb aria-label={props.label} className="block size-4 rounded-full border-2 border-celadon bg-surface shadow-sm" />
      </Slider.Root>
    </div>
  );
}

function PresetList({
  presets,
  selected,
  pitch,
  onSelect,
}: {
  presets: VoicePreset[];
  selected: string;
  pitch: number;
  onSelect(id: string): void;
}) {
  return (
    <ul role="radiogroup" className="divide-y divide-rule rounded-lg border border-rule">
      {presets.map((p) => (
        <li key={p.id} className="flex items-center gap-2 pr-2">
          <button
            type="button"
            role="radio"
            aria-checked={selected === p.id}
            onClick={() => onSelect(p.id)}
            className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-celadon-wash/60"
          >
            <span className="grid size-4 shrink-0 place-items-center text-celadon">
              {selected === p.id && <Check size={15} />}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-ink">{p.name}</span>
                <span className="text-xs text-ink-faint">{p.gender === 'female' ? '女' : '男'}</span>
                {p.styleTags.map((t) => (
                  <span
                    key={t}
                    className={`rounded px-1.5 text-[11px] leading-5 ${
                      t === '实验' ? 'bg-lamp/25 text-ink' : 'bg-celadon-wash text-celadon-deep'
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </span>
              <span className="block truncate text-xs text-ink-soft">{p.description}</span>
            </span>
          </button>
          <VoicePreviewButton voice={p.id} lang={p.lang} pitch={pitch} label={p.name} />
        </li>
      ))}
    </ul>
  );
}

export function VoiceSettingsModal({
  open,
  onOpenChange,
  lang: chapterLang,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  lang: Lang;
}) {
  const { voicePrefs: prefs, setVoicePrefs, resetVoicePrefs, rate, setRate, continuous, setContinuous } =
    useReaderStore();
  const catalog = useVoiceCatalog();
  const [lang, setLang] = useState<Lang>(chapterLang);
  const [role, setRole] = useState<Role>('narration');

  // Open on the chapter's language, narration first.
  useEffect(() => {
    if (open) {
      setLang(chapterLang);
      setRole('narration');
    }
  }, [open, chapterLang]);

  const presets = catalog?.presets.filter((p) => p.lang === lang) ?? [];
  const nameOf = (id: string) => presets.find((p) => p.id === id)?.name ?? id;
  const narration = prefs[FIELD[lang].narration] as string;
  const dialogue = prefs[FIELD[lang].dialogue] as string;
  const activeRole: Role = prefs.dramaMode ? role : 'narration';
  const selected = activeRole === 'narration' ? narration : dialogue;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[fade_160ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          // Return focus to the page so Space keeps meaning play/pause.
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border border-rule bg-surface pb-[env(safe-area-inset-bottom)] font-ui shadow-[0_-12px_48px_-20px_rgb(0_0_0/0.5)] focus:outline-none data-[state=open]:animate-[fade_160ms_ease-out] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(44rem,calc(100dvh-2rem))] sm:w-[30rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
            <Dialog.Title className="text-base font-medium text-ink">音色与配音</Dialog.Title>
            <div role="tablist" aria-label="语言" className="ml-auto flex rounded-lg bg-paper p-0.5 text-sm">
              {(['ja', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={lang === l}
                  onClick={() => setLang(l)}
                  className="rounded-md px-3 py-1 text-ink-soft aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-sm"
                >
                  {l === 'ja' ? '日语' : 'English'}
                </button>
              ))}
            </div>
            <Dialog.Close
              aria-label="关闭"
              className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
            >
              <X size={18} />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-paper px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-ink">广播剧模式</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                  引号 {QUOTES[lang]} 里的台词用「台词」声线，其余用「旁白」声线
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={prefs.dramaMode}
                onChange={(e) => setVoicePrefs({ dramaMode: e.target.checked })}
                className="mt-1 size-4 accent-celadon"
              />
            </label>

            {/* Which role the list below is choosing for. */}
            <div className="grid grid-cols-2 gap-2">
              {(['narration', 'dialogue'] as const).map((r) => {
                const disabled = r === 'dialogue' && !prefs.dramaMode;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={disabled}
                    aria-pressed={activeRole === r}
                    onClick={() => setRole(r)}
                    className="rounded-lg border border-rule px-3 py-2 text-left aria-pressed:border-celadon aria-pressed:bg-celadon-wash disabled:opacity-40"
                  >
                    <span className="block text-xs text-ink-faint">{r === 'narration' ? '旁白' : '台词'}</span>
                    <span className="block truncate text-sm font-medium text-ink">
                      {nameOf(r === 'narration' ? narration : dialogue)}
                    </span>
                  </button>
                );
              })}
            </div>

            {catalog ? (
              <PresetList
                presets={presets}
                selected={selected}
                pitch={prefs.pitch}
                onSelect={(id) => setVoicePrefs({ [FIELD[lang][activeRole]]: id })}
              />
            ) : (
              <p className="py-6 text-center text-sm text-ink-faint">正在读取声线…</p>
            )}

            {lang === 'ja' && (
              <p className="text-xs leading-relaxed text-ink-faint">
                免费朗读服务的日语只有 Nanami、Keita 两个声线；「元气少女」等是调整音调得到的变体，「实验」声线是会说日语的多语言声线。
                {catalog?.voicevox.available && ` 检测到 VOICEVOX ${catalog.voicevox.version ?? ''}，角色声线接入开发中。`}
              </p>
            )}

            <div className="space-y-4 border-t border-rule pt-4">
              <SliderRow
                label="语速"
                value={rate}
                display={`${rate.toFixed(2).replace(/0$/, '')}×`}
                min={MIN_RATE}
                max={MAX_RATE}
                step={0.05}
                onChange={(v) => setRate(Math.round(v * 100) / 100)}
              />
              <SliderRow
                label="音调"
                value={prefs.pitch}
                display={prefs.pitch === 0 ? '原声' : `${prefs.pitch > 0 ? '+' : ''}${prefs.pitch}%`}
                min={-20}
                max={20}
                step={2}
                onChange={(v) => setVoicePrefs({ pitch: v })}
              />
              <label className="flex cursor-pointer items-center justify-between text-sm text-ink-soft">
                读完自动下一章
                <input
                  type="checkbox"
                  checked={continuous}
                  onChange={(e) => setContinuous(e.target.checked)}
                  className="accent-celadon"
                />
              </label>
            </div>
          </div>

          <footer className="flex items-center justify-between border-t border-rule px-5 py-3 text-sm">
            <button
              type="button"
              onClick={() => {
                resetVoicePrefs();
                setRate(1);
              }}
              disabled={JSON.stringify(prefs) === JSON.stringify(DEFAULT_VOICE_PREFS) && rate === 1}
              className="text-celadon hover:text-celadon-deep disabled:text-ink-faint"
            >
              恢复默认
            </button>
            <span className="text-xs text-ink-faint">修改会立即用于正在朗读的章节</span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
