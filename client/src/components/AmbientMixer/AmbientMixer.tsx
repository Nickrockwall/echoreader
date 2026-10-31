import * as Dialog from '@radix-ui/react-dialog';
import * as Slider from '@radix-ui/react-slider';
import { CloudRain, Coffee, Flame, Mic, Waves, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { setAmbientVolume, type AmbientId } from '../../lib/ambient.ts';
import { existingGraph, setDucking, setVoiceVolume } from '../../lib/audioGraph.ts';
import { useReaderStore } from '../../store/useReaderStore.ts';

const TRACKS: { id: AmbientId; label: string; icon: ReactNode }[] = [
  { id: 'rain', label: '雨夜', icon: <CloudRain size={16} /> },
  { id: 'fire', label: '壁炉', icon: <Flame size={16} /> },
  { id: 'cafe', label: '咖啡馆', icon: <Coffee size={16} /> },
];

const AMBIENT_IDS = TRACKS.map((t) => t.id);

/**
 * Keeps the audio graph in step with the saved mixer settings. Audio may only start after a
 * user gesture, so saved ambience resumes on the first click or key press of the session.
 */
export function useAmbientSync() {
  useEffect(() => {
    const apply = () => {
      const s = useReaderStore.getState();
      for (const id of AMBIENT_IDS) setAmbientVolume(id, s.ambient[id]);
      setVoiceVolume(s.voiceVolume);
      setDucking(s.ducking);
    };

    // Voice volume works without the graph (it sets the element's own volume).
    setVoiceVolume(useReaderStore.getState().voiceVolume);

    const unlock = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (AMBIENT_IDS.some((id) => useReaderStore.getState().ambient[id] > 0)) apply();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // Later changes come from the mixer's own controls, i.e. from a gesture.
    const unsubscribe = useReaderStore.subscribe((s, prev) => {
      if (s.ambient !== prev.ambient || s.ducking !== prev.ducking) apply();
      else if (s.voiceVolume !== prev.voiceVolume) setVoiceVolume(s.voiceVolume);
    });
    return () => {
      unlock();
      unsubscribe();
    };
  }, []);
}

function Row({
  icon,
  label,
  value,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  onChange(v: number): void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`shrink-0 ${value > 0 ? 'text-celadon' : 'text-ink-faint'}`}>{icon}</span>
      <span className="w-12 shrink-0 text-sm text-ink">{label}</span>
      <Slider.Root
        className="relative flex h-5 min-w-0 flex-1 touch-none select-none items-center"
        value={[Math.round(value * 100)]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(v / 100)}
      >
        <Slider.Track className="ui-fader-track relative h-1 grow rounded-full bg-rule">
          <Slider.Range className="ui-fader-range absolute h-full rounded-full bg-celadon" />
        </Slider.Track>
        <Slider.Thumb aria-label={`${label}音量`} className="ui-fader-thumb block size-4 rounded-full border-2 border-celadon bg-surface shadow-sm" />
      </Slider.Root>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-faint">
        {value > 0 ? Math.round(value * 100) : '关'}
      </span>
    </div>
  );
}

export function AmbientMixer() {
  const { ambient, setAmbient, voiceVolume, setVoiceVolume: setVoice, ducking, setDucking: setDuck } =
    useReaderStore();
  const [open, setOpen] = useState(false);
  const active = AMBIENT_IDS.some((id) => ambient[id] > 0);

  const openMixer = () => {
    // Opening the mixer is a gesture: let it wake the audio graph if ambience is already on.
    if (active && !existingGraph()) AMBIENT_IDS.forEach((id) => setAmbientVolume(id, ambient[id]));
    setOpen(true);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={openMixer}
        className="ui-icon-btn relative grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
        aria-label="环境音"
      >
        <Waves size={18} />
        {active && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-celadon" aria-hidden />}
      </button>
      <Dialog.Portal>
        {/* Light overlay: the drawer is often adjusted while listening, the page stays visible. */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20 data-[state=open]:animate-[fade_160ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          // Return focus to the page, not the trigger, so Space keeps meaning play/pause.
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="ui-mixer fixed inset-y-0 right-0 z-50 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col bg-surface pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] font-ui shadow-[-8px_0_40px_-16px_rgb(0_0_0/0.35)] focus:outline-none data-[state=open]:animate-[sheet-right_220ms_cubic-bezier(.2,.8,.2,1)]"
        >
          <header className="flex items-center justify-between px-5 pb-2 pt-5">
            <Dialog.Title className="text-base font-medium text-ink">环境音</Dialog.Title>
            <Dialog.Close
              aria-label="关闭"
              className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
            >
              <X size={18} />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-3">
            {TRACKS.map((t) => (
              <Row key={t.id} icon={t.icon} label={t.label} value={ambient[t.id]} onChange={(v) => setAmbient(t.id, v)} />
            ))}
            <div className="space-y-5 border-t border-rule pt-5">
              <Row icon={<Mic size={16} />} label="人声" value={voiceVolume} onChange={setVoice} />
              <label className="flex cursor-pointer items-center justify-between text-sm text-ink-soft">
                朗读时压低环境音
                <input
                  type="checkbox"
                  checked={ducking}
                  onChange={(e) => setDuck(e.target.checked)}
                  className="accent-celadon"
                />
              </label>
            </div>
            <p className="text-xs leading-relaxed text-ink-faint">
              雨声和壁炉声由浏览器实时合成；咖啡馆是一段公有领域录音。关掉面板后声音继续播放。
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
