import { LoaderCircle, Square, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Lang } from '../../../../shared/types.ts';
import { api } from '../../lib/api.ts';
import { speech } from '../../lib/speechEngine.ts';

// All preview buttons share one player, so starting a preview stops the previous one.
const player = new Audio();
let playingKey: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
player.addEventListener('ended', () => {
  playingKey = null;
  notify();
});

/** Plays a 2–3 second sample sentence in one voice preset. */
export function VoicePreviewButton({ voice, lang, pitch, label }: { voice: string; lang: Lang; pitch: number; label: string }) {
  const key = `${voice}|${pitch}`;
  const [, rerender] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);

  const playing = playingKey === key;

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // don't also select the voice row
    if (playing) {
      player.pause();
      playingKey = null;
      return notify();
    }
    speech.pause(); // keep the sample from talking over the book
    setLoading(true);
    try {
      const { audio } = await api.preview({ voice, lang, pitch });
      player.src = audio;
      playingKey = key;
      notify();
      await player.play();
    } catch {
      playingKey = null;
      notify();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? `停止试听${label}` : `试听${label}`}
      className="grid size-8 shrink-0 place-items-center rounded-full text-celadon hover:bg-celadon-wash"
    >
      {loading ? (
        <LoaderCircle size={15} className="animate-spin" />
      ) : playing ? (
        <Square size={13} fill="currentColor" />
      ) : (
        <Volume2 size={16} />
      )}
    </button>
  );
}
