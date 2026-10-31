import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useReaderStore } from '../store/useReaderStore.ts';

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-ink underline decoration-rule underline-offset-2 hover:text-celadon hover:decoration-celadon"
  >
    {children}
  </a>
);

/** Third-party content and code this app relies on, with the attribution each licence asks for. */
const SECTIONS: { title: string; items: ReactNode[] }[] = [
  {
    title: '词典',
    items: [
      <>
        本应用使用 <A href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project">JMdict</A>{' '}
        词典文件。这些文件是 Electronic Dictionary Research and Development Group（EDRDG）的财产，按照该组织的{' '}
        <A href="https://www.edrdg.org/edrdg/licence.html">许可证</A>（CC BY-SA 4.0）使用。数据经{' '}
        <A href="https://github.com/scriptin/jmdict-simplified">jmdict-simplified</A> 转换。
      </>,
      <>
        中文释义来自 <A href="https://zh.wiktionary.org/">维基词典</A> 贡献者，按{' '}
        <A href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</A> 授权；经{' '}
        <A href="https://kaikki.org/">wiktextract / kaikki.org</A> 提取，本应用只保留日语词条并将释义转为简体中文。查词卡片上的链接指向对应的原词条。
      </>,
      <>
        英文释义来自 <A href="https://en.wiktionary.org/">英文维基词典</A> 贡献者，经{' '}
        <A href="https://dictionaryapi.dev/">Free Dictionary API</A> 获取，按{' '}
        <A href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</A> 授权。单词发音录音来自 Wikimedia Commons，各自的许可证显示在查词卡片上。
      </>,
    ],
  },
  {
    title: '语言处理',
    items: [
      <>
        日语分词与读音：<A href="https://github.com/takuyaa/kuromoji.js">kuromoji.js</A>（Apache-2.0），内含
        mecab-ipadic 2.7.0 词典（© 奈良先端科学技術大学院大学，按其许可证使用）。
      </>,
      <>
        繁简转换：<A href="https://github.com/nk2028/opencc-js">opencc-js</A>（MIT）与{' '}
        <A href="https://github.com/BYVoid/OpenCC">OpenCC</A> 词库（Apache-2.0）。
      </>,
    ],
  },
  {
    title: '书源',
    items: [
      <>
        <A href="https://syosetu.com/">小説家になろう</A>
        ：作品版权属于各位作者。本应用只是在你自己的设备上阅读这些公开作品，请遵守其{' '}
        <A href="https://syosetu.com/site/rule/">利用規約</A>，不要转载。
      </>,
      <>
        <A href="https://www.aozora.gr.jp/">青空文库</A>：收录著作权已过期的作品（作品和译者都没有著作权的才会显示）。按其{' '}
        <A href="https://www.aozora.gr.jp/guide/kijyunn.html">使用规范</A>，每部作品最后一章末尾保留了底本信息和输入、校对志愿者的名字。
      </>,
      <>
        <A href="https://standardebooks.org/">Standard Ebooks</A>：公有领域书籍的精校版，其校订与排版以{' '}
        <A href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</A> 放弃权利；本应用与 Standard Ebooks 无关联。
      </>,
      <>
        <A href="https://www.gutenberg.org/">Project Gutenberg</A>：书籍在美国属于公有领域，经{' '}
        <A href="https://gutendex.com/">Gutendex</A> 检索。「Project Gutenberg」是其注册商标；本应用会去掉原书的许可声明后再显示正文，与 Project Gutenberg 无关联。
      </>,
    ],
  },
  {
    title: '声音',
    items: [
      <>
        朗读使用 Microsoft Edge 的在线朗读服务（经{' '}
        <A href="https://github.com/SchneeHertz/node-edge-tts">node-edge-tts</A>，MIT），这不是微软面向第三方的正式服务。
      </>,
      <>
        咖啡馆环境音：「Restaurant Ambience」，stephan 录制，经 PDSounds.org /{' '}
        <A href="https://commons.wikimedia.org/wiki/File:Restaurant_ambience.ogg">Wikimedia Commons</A>，公有领域。雨声和壁炉声由浏览器实时合成。
      </>,
    ],
  },
  {
    title: '字体与图标',
    items: [
      <>
        Shippori Mincho、Literata、Zen Kaku Gothic New，以及 JRPG 主题标题用的 Anton、Noto Sans SC，经 Google Fonts 提供，均为{' '}
        <A href="https://openfontlicense.org/">SIL Open Font License 1.1</A>。应用图标里的「読」字使用 Shippori Mincho 绘制。
      </>,
      <>
        界面图标：<A href="https://lucide.dev/">Lucide</A>（ISC）。
      </>,
    ],
  },
  {
    title: '本应用',
    items: [
      <>
        EchoReader 的代码以 <A href="https://github.com/Nickrockwall/echoreader/blob/main/LICENSE">MIT 许可证</A>{' '}
        开源：<A href="https://github.com/Nickrockwall/echoreader">github.com/Nickrockwall/echoreader</A>。完整的第三方清单见仓库中的 CREDITS.md。
      </>,
    ],
  },
];

export function CreditsDialog() {
  const open = useReaderStore((s) => s.creditsOpen);
  const setOpen = useReaderStore((s) => s.setCreditsOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[fade_160ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(40rem,calc(100dvh-2rem))] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-rule bg-surface font-ui shadow-[0_24px_60px_-24px_rgb(0_0_0/0.5)] focus:outline-none data-[state=open]:animate-[fade_160ms_ease-out]"
        >
          <div className="flex items-center justify-between px-6 pb-2 pt-5">
            <Dialog.Title className="text-base font-medium text-ink">致谢与许可</Dialog.Title>
            <Dialog.Close
              aria-label="关闭"
              className="grid size-8 place-items-center rounded-md text-ink-soft hover:bg-celadon-wash hover:text-ink"
            >
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6 pt-2">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h3 className="mb-1.5 text-xs font-medium text-celadon-deep">{s.title}</h3>
                <ul className="space-y-2 text-[13px] leading-relaxed text-ink-soft">
                  {s.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
