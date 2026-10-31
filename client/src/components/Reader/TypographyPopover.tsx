import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import { Type } from 'lucide-react';
import { useReaderStore, type Theme } from '../../store/useReaderStore.ts';

function Row({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
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
        <span className="text-ink-soft">{label}</span>
        <span className="tabular-nums text-ink">{display}</span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-rule">
          <Slider.Range className="absolute h-full rounded-full bg-celadon" />
        </Slider.Track>
        <Slider.Thumb aria-label={label} className="block size-4 rounded-full border-2 border-celadon bg-surface shadow-sm" />
      </Slider.Root>
    </div>
  );
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: '亮色' },
  { id: 'dark', label: '纯黑' },
  { id: 'sepia', label: '羊皮纸' },
];

/** Each swatch is drawn in its own theme's colors, so it previews itself. */
function ThemePicker() {
  const theme = useReaderStore((s) => s.theme);
  const setTheme = useReaderStore((s) => s.setTheme);
  return (
    <div role="radiogroup" aria-label="主题" className="grid grid-cols-3 gap-2">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          onClick={() => setTheme(t.id)}
          className="group flex flex-col items-center gap-1.5 text-xs text-ink-soft aria-checked:text-ink"
        >
          <span
            data-theme={t.id}
            className="grid h-11 w-full place-items-center rounded-md border border-rule bg-paper font-mincho text-lg text-ink group-aria-checked:outline-2 group-aria-checked:outline-offset-2 group-aria-checked:outline-celadon"
          >
            文
          </span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function TypographyPopover() {
  const {
    fontSize,
    lineHeight,
    setFontSize,
    setLineHeight,
    resetTypography,
    autoFurigana,
    setAutoFurigana,
    vertical,
    setVertical,
  } = useReaderStore();
  const lang = useReaderStore((s) => s.chapter?.lang);
  return (
    <Popover.Root>
      <Popover.Trigger
        className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
        aria-label="阅读设置"
      >
        <Type size={18} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          // Return focus to the page, not this trigger, so Space keeps meaning play/pause.
          onCloseAutoFocus={(e) => e.preventDefault()}
          sideOffset={8}
          className="z-50 w-72 space-y-5 rounded-lg border border-rule bg-surface p-5 font-ui shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)]"
        >
          <ThemePicker />
          <Row label="字号" value={fontSize} display={`${fontSize}px`} min={14} max={30} step={1} onChange={setFontSize} />
          <Row
            label="行高"
            value={lineHeight}
            display={lineHeight.toFixed(1)}
            min={1.4}
            max={2.6}
            step={0.1}
            onChange={setLineHeight}
          />
          {lang === 'ja' && (
            <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-rule pt-4 text-sm">
              <span>
                <span className="block text-ink">给所有汉字注音</span>
                <span className="mt-0.5 block text-xs text-ink-faint">自动生成，偶尔会读错；作者的注音优先</span>
              </span>
              <input
                type="checkbox"
                checked={autoFurigana}
                onChange={(e) => setAutoFurigana(e.target.checked)}
                className="mt-1 accent-celadon"
              />
            </label>
          )}
          {lang === 'ja' && (
            <label className="flex cursor-pointer items-start justify-between gap-3 text-sm">
              <span>
                <span className="block text-ink">竖排（縦書き）</span>
                <span className="mt-0.5 block text-xs text-ink-faint">从右往左读，像纸质文库本</span>
              </span>
              <input
                type="checkbox"
                checked={vertical}
                onChange={(e) => setVertical(e.target.checked)}
                className="mt-1 accent-celadon"
              />
            </label>
          )}
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={resetTypography} className="text-celadon hover:text-celadon-deep">
              恢复默认排版
            </button>
            <Popover.Close
              onClick={() => useReaderStore.getState().setShortcutsOpen(true)}
              // Touch screens have no keyboard to speak of.
              className="flex items-center gap-1.5 text-ink-soft hover:text-ink [@media(pointer:coarse)]:hidden"
            >
              键盘快捷键
              <kbd className="rounded border border-rule border-b-2 bg-paper px-1.5 text-xs">?</kbd>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
