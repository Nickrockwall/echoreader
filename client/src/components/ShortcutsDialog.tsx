import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useReaderStore } from '../store/useReaderStore.ts';
import { shortcutTarget } from './AudioPlayer/AudioPlayer.tsx';

const SHORTCUTS: [keys: string[], action: string][] = [
  [['空格'], '朗读 / 暂停'],
  [['←'], '后退 5 秒'],
  [['→'], '前进 5 秒'],
  [['R'], '从头重听当前句'],
  [['Shift', 'R'], '以 0.8× 慢速跟读当前句'],
  [['?'], '显示这份快捷键列表'],
  [['Esc'], '关闭弹出的卡片或面板'],
];

/** "?" opens the list from anywhere outside a text field. */
export function useHelpShortcut() {
  const setOpen = useReaderStore((s) => s.setShortcutsOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && shortcutTarget(e)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}

export function ShortcutsDialog() {
  const open = useReaderStore((s) => s.shortcutsOpen);
  const setOpen = useReaderStore((s) => s.setShortcutsOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[fade_160ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-rule bg-surface p-6 font-ui shadow-[0_24px_60px_-24px_rgb(0_0_0/0.5)] focus:outline-none data-[state=open]:animate-[fade_160ms_ease-out]"
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-base font-medium text-ink">键盘快捷键</Dialog.Title>
            <Dialog.Close
              aria-label="关闭"
              className="grid size-8 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
            >
              <X size={16} />
            </Dialog.Close>
          </div>
          <dl className="space-y-2.5 text-sm">
            {SHORTCUTS.map(([keys, action]) => (
              <div key={action} className="flex items-center justify-between gap-4">
                <dt className="text-ink-soft">{action}</dt>
                <dd className="flex shrink-0 gap-1">
                  {keys.map((k) => (
                    <kbd
                      key={k}
                      className="min-w-7 rounded border border-rule border-b-2 bg-paper px-1.5 py-0.5 text-center text-xs text-ink"
                    >
                      {k}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
