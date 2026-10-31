import { BookOpen } from 'lucide-react';
import { useSegmenter } from '../hooks/useSegmenter.ts';
import { useReaderStore } from '../store/useReaderStore.ts';
import { ParagraphView } from './Reader/ParagraphView.tsx';
import { useTokenPicking } from './Reader/useTokenPicking.ts';

// Public-domain openings: 夏目漱石「吾輩は猫である」, Carroll "Alice's Adventures in Wonderland".
const SAMPLE_JA = ['｜吾輩《わがはい》は猫である。名前はまだ無い。'];
const SAMPLE_EN = ['Alice was beginning to get very tired of sitting by her sister on the bank.'];

function SampleLine({ lang, lines }: { lang: 'ja' | 'en'; lines: string[] }) {
  const paragraphs = useSegmenter(lines, lang, `demo-${lang}-`);
  const onClick = useTokenPicking([paragraphs], lang);
  return (
    <div lang={lang} onClick={onClick} className="prose-reader demo">
      {paragraphs.map((p) => (
        <ParagraphView key={p.id} paragraph={p} />
      ))}
    </div>
  );
}

export function Welcome() {
  const { openPicker, openChapter, lastPosition, status, setCreditsOpen } = useReaderStore();

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-20 sm:px-10">
      <h1 className="ui-hero font-mincho text-[clamp(2.5rem,7vw,4.25rem)] font-semibold leading-[1.15] tracking-[0.02em] text-ink">
        读一句，
        <br />
        听一句，
        <br className="sm:hidden" />
        查一个词。
      </h1>
      <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-soft">
        EchoReader 从小説家になろう 和 Project Gutenberg 载入日语、英语小说，每个词都能点开查释义。试着点下面的词：
      </p>

      <section className="ui-sample mt-12 space-y-6 border-l-2 border-celadon pl-6">
        <div className="text-[clamp(1.35rem,3.2vw,1.75rem)]">
          <SampleLine lang="ja" lines={SAMPLE_JA} />
        </div>
        <div className="text-[clamp(1.15rem,2.6vw,1.4rem)]">
          <SampleLine lang="en" lines={SAMPLE_EN} />
        </div>
      </section>

      <div className="mt-14 flex flex-wrap gap-3 font-ui">
        {lastPosition && (
          <button
            type="button"
            disabled={status === 'loading'}
            onClick={() => openChapter(lastPosition.source, lastPosition.bookId, lastPosition.chapter)}
            className="ui-primary flex items-center gap-2 rounded-md bg-celadon px-5 py-3 text-sm font-medium text-on-accent hover:bg-celadon-deep disabled:opacity-60"
          >
            <BookOpen size={16} />
            继续读《{lastPosition.title}》第 {lastPosition.chapter} 章
          </button>
        )}
        <button
          type="button"
          onClick={() => openPicker('syosetu')}
          className={`rounded-md px-5 py-3 text-sm font-medium ${
            lastPosition ? 'ui-ghost border border-rule text-ink hover:border-celadon' : 'ui-primary bg-celadon text-on-accent hover:bg-celadon-deep'
          }`}
        >
          找日语小说
        </button>
        <button
          type="button"
          onClick={() => openPicker('gutenberg')}
          className="ui-ghost rounded-md border border-rule px-5 py-3 text-sm font-medium text-ink hover:border-celadon"
        >
          找英文经典
        </button>
      </div>

      <p className="mt-16 text-xs text-ink-faint">
        词典数据来自 JMdict（EDRDG）与维基词典，按 CC BY-SA 授权。
        <button
          type="button"
          onClick={() => setCreditsOpen(true)}
          className="ml-1 underline decoration-rule underline-offset-2 hover:text-ink"
        >
          致谢与许可
        </button>
      </p>
    </main>
  );
}
