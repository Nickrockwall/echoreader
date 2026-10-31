import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import { Type } from 'lucide-react';
import { useReaderStore } from '../../store/useReaderStore.ts';

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
        aria-label={label}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-rule">
          <Slider.Range className="absolute h-full rounded-full bg-celadon" />
        </Slider.Track>
        <Slider.Thumb className="block size-4 rounded-full border-2 border-celadon bg-page shadow-sm" />
      </Slider.Root>
    </div>
  );
}

export function TypographyPopover() {
  const { fontSize, lineHeight, setFontSize, setLineHeight, resetTypography } = useReaderStore();
  return (
    <Popover.Root>
      <Popover.Trigger
        className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
        aria-label="排版设置"
      >
        <Type size={18} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 space-y-5 rounded-lg border border-rule bg-page p-5 font-ui shadow-[0_12px_32px_-12px_rgb(30_35_48/0.25)]"
        >
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
          <button type="button" onClick={resetTypography} className="text-sm text-celadon hover:text-celadon-deep">
            恢复默认
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
