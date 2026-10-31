import { FileUp, LoaderCircle } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import type { BookDetail, Lang } from '../../../../shared/types.ts';
import { api } from '../../lib/api.ts';

const LANGS: { id: Lang | 'auto'; label: string }[] = [
  { id: 'auto', label: '自动识别' },
  { id: 'ja', label: '日语' },
  { id: 'en', label: '英语' },
];

/** Picks (or takes a dropped) EPUB / TXT file and adds it to the library on the computer running EchoReader. */
export function ImportPanel({ onImported }: { onImported(book: BookDetail): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState<Lang | 'auto'>('auto');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(file.name);
    setError(null);
    try {
      onImported(await api.library.import(file, lang === 'auto' ? undefined : lang));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files[0]);
  };

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`ui-import mx-6 mt-4 rounded-lg border border-dashed px-4 py-4 text-sm ${
        dragging ? 'border-celadon bg-celadon-wash' : 'border-rule'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => input.current?.click()}
          className="ui-primary flex items-center gap-2 rounded-md bg-celadon px-4 py-2 font-medium text-on-accent hover:bg-celadon-deep disabled:opacity-60"
        >
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <FileUp size={15} />}
          {busy ? '正在导入…' : '选择 EPUB 或 TXT'}
        </button>
        <label className="flex items-center gap-2 text-ink-soft">
          语言
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang | 'auto')}
            className="rounded-md border border-rule bg-surface px-2 py-1.5 text-ink focus:border-celadon focus:outline-none"
          >
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={input}
          type="file"
          accept=".epub,.txt,application/epub+zip,text/plain"
          className="hidden"
          aria-label="导入的文件"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        {busy
          ? `正在解析《${busy}》，长篇可能要几秒钟。`
          : '也可以把文件拖到这里。支持没有加密（DRM）的日语、英语书；青空文库格式的注音会保留。书保存在运行 EchoReader 的电脑上，手机和电脑都能读到。'}
      </p>
      {error && <p className="mt-3 rounded-md bg-danger-wash px-3 py-2 text-danger">导入失败：{error}</p>}
    </section>
  );
}
