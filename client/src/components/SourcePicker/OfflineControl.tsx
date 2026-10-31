import { CircleCheck, Download, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BookDetail, OfflineStatus, SourceId } from '../../../../shared/types.ts';
import { api } from '../../lib/api.ts';

const POLL_MS = 1500;
const DEVICE_CONCURRENCY = 4;

/** A service worker controls the page only on localhost or HTTPS; then pages can be kept on the device. */
const deviceCaching = () => typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller);
const deviceKey = (book: BookDetail) => `echoreader-offline:${book.source}:${book.id}`;

function readDeviceCount(book: BookDetail) {
  try {
    return Number(localStorage.getItem(deviceKey(book)) ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Requests every page of the book through the service worker, which keeps a copy of each
 * response. The server already has them cached, so this is quick.
 */
async function saveToDevice(book: BookDetail, onProgress: (n: number) => void, signal: AbortSignal) {
  const base = `/api/${book.source}/books/${encodeURIComponent(book.id)}`;
  await fetch(base, { signal });
  for (let p = 1; p <= book.tocPages; p++) await fetch(`${base}/toc?page=${p}`, { signal });
  let next = 1;
  let done = 0;
  const worker = async () => {
    while (next <= book.chapterCount && !signal.aborted) {
      const i = next++;
      const res = await fetch(`${base}/chapters/${i}`, { signal });
      if (!res.ok) throw new Error(`第 ${i} 章保存失败`);
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: DEVICE_CONCURRENCY }, worker));
}

/** Seconds per chapter for sources fetched page by page (kept slow to stay polite); the rest are one file. */
const SECONDS_PER_CHAPTER: Partial<Record<SourceId, number>> = { syosetu: 1, standardebooks: 0.7 };

function minutes(book: BookDetail) {
  const perChapter = SECONDS_PER_CHAPTER[book.source];
  if (!perChapter || book.chapterCount * perChapter < 20) return '几秒钟';
  const m = Math.ceil((book.chapterCount * perChapter) / 60);
  return m <= 1 ? '不到 1 分钟' : `约 ${m} 分钟`;
}

export function OfflineControl({ book }: { book: BookDetail }) {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [device, setDevice] = useState(() => readDeviceCount(book));
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const canSaveOnDevice = deviceCaching();

  // Server-side progress: poll while a download runs.
  useEffect(() => {
    let live = true;
    let timer = 0;
    const poll = async () => {
      try {
        const s = await api.offline.status(book.source, book.id);
        if (!live) return;
        setStatus(s);
        if (s.state === 'running') timer = window.setTimeout(poll, POLL_MS);
      } catch {
        if (live) timer = window.setTimeout(poll, POLL_MS * 2);
      }
    };
    void poll();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [book.source, book.id, status?.state === 'running']);

  // Once the server has the whole book, copy it onto this device too (where possible).
  useEffect(() => {
    if (status?.state !== 'done' || !canSaveOnDevice || device >= book.chapterCount || deviceBusy) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setDeviceBusy(true);
    setDeviceError(null);
    saveToDevice(book, (n) => setDevice(n), ctrl.signal)
      .then(() => {
        setDevice(book.chapterCount);
        try {
          localStorage.setItem(deviceKey(book), String(book.chapterCount));
        } catch {
          // Without storage the badge just won't remember; the cached pages are still there.
        }
      })
      .catch((e: Error) => !ctrl.signal.aborted && setDeviceError(e.message))
      .finally(() => setDeviceBusy(false));
    return () => ctrl.abort();
    // Triggered by the download finishing (or a different book); progress updates must not restart it.
  }, [status?.state, canSaveOnDevice, book.id]);

  const start = async () => setStatus(await api.offline.start(book.source, book.id));
  const cancel = async () => {
    abort.current?.abort();
    setStatus(await api.offline.cancel(book.source, book.id));
  };

  if (!status) return null;
  const pct = status.total ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <section className="mx-6 mb-6 rounded-lg border border-rule px-4 py-3 text-sm">
      {status.state === 'none' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-soft">
            离线下载整本
            <span className="ml-2 text-xs text-ink-faint">
              {book.chapterCount} 章，{minutes(book)}
            </span>
          </p>
          <button
            type="button"
            onClick={start}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-celadon hover:bg-celadon-wash"
          >
            <Download size={15} /> 下载
          </button>
        </div>
      )}

      {status.state === 'running' && (
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-ink">
              <LoaderCircle size={14} className="animate-spin text-celadon" />
              正在下载 {status.done} / {status.total || '…'} 章
            </p>
            <button
              type="button"
              onClick={cancel}
              aria-label="取消下载"
              className="grid size-8 place-items-center rounded-md text-ink-faint hover:bg-celadon-wash hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-celadon transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">可以关掉这个面板继续阅读，下载在电脑上进行。</p>
        </div>
      )}

      {status.state === 'done' && (
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-ink">
            <CircleCheck size={15} className="text-celadon" />
            已离线保存 {status.total} 章
          </p>
          {canSaveOnDevice ? (
            <p className="text-xs text-ink-faint">
              {device >= book.chapterCount
                ? '这台设备上也有一份，断网也能读。'
                : deviceBusy
                  ? `正在存到这台设备：${device} / ${book.chapterCount}`
                  : (deviceError ?? '')}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-ink-faint">
              保存在电脑上：小说网站打不开或断网时照样能读。要让手机脱离电脑也能读，需要用 HTTPS 地址打开本应用。
            </p>
          )}
        </div>
      )}

      {status.state === 'error' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-danger">下载中断：{status.error}</p>
          <button type="button" onClick={start} className="h-9 shrink-0 rounded-md px-3 text-celadon hover:bg-celadon-wash">
            继续下载
          </button>
        </div>
      )}
    </section>
  );
}
