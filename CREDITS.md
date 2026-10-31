# 致谢与第三方许可 / Credits

EchoReader 的代码以 [MIT](LICENSE) 授权。下面列出应用使用的第三方数据、代码和素材，以及各自的许可。应用内「阅读设置 → 致谢与许可」显示同样的内容。

## 随仓库分发的数据

| 内容 | 位置 | 来源与许可 |
|---|---|---|
| 日英词典 | `server/dict-data/jmdict.sqlite.gz` | [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)，Electronic Dictionary Research and Development Group 的财产，按 [EDRDG 许可证](https://www.edrdg.org/edrdg/licence.html)（CC BY-SA 4.0）使用；经 [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) 转换 |
| 日中词典 | `server/dict-data/ja-zh.sqlite.gz` | [中文维基词典](https://zh.wiktionary.org/) 贡献者，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)；经 [wiktextract / kaikki.org](https://kaikki.org/zhwiktionary/) 提取 |
| 咖啡馆环境音 | `client/public/ambient/cafe.ogg` | 「Restaurant Ambience」，stephan 录制，经 PDSounds.org / [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Restaurant_ambience.ogg)，公有领域 |
| 应用图标 | `client/public/icons/` | 本项目制作；「読」字使用 Shippori Mincho（SIL OFL 1.1）绘制 |
| README 截图 | `docs/screenshots/` | 本项目截图；显示的文本均为公有领域作品：夏目漱石《吾輩は猫である》（底本文字取自[青空文库](https://www.aozora.gr.jp/cards/000148/card789.html)）、Lewis Carroll《Alice's Adventures in Wonderland》（Project Gutenberg） |

两份词典按 CC BY-SA 4.0 继续授权（相同方式共享）。对数据所做的改动见 [`server/dict-data/README.md`](server/dict-data/README.md)。

## 运行时获取的内容

- **英文释义**：[英文维基词典](https://en.wiktionary.org/) 贡献者，经 [Free Dictionary API](https://dictionaryapi.dev/) 获取，CC BY-SA 3.0；单词发音录音来自 Wikimedia Commons，各自的许可显示在查词卡片上
- **小説家になろう**：作品版权属于各位作者；本应用只供在自己的设备上阅读，请遵守 [利用規約](https://syosetu.com/site/rule/)
- **Project Gutenberg**：书籍在美国属于公有领域，经 [Gutendex](https://gutendex.com/) 检索。「Project Gutenberg」是其注册商标；本应用显示正文前会去掉原书附带的许可声明，与 Project Gutenberg 无关联
- **朗读**：Microsoft Edge 的在线朗读服务（Azure 神经网络声线，如 Nanami、Keita、Jenny、Ryan），经 [node-edge-tts](https://github.com/SchneeHertz/node-edge-tts)（MIT）；这不是微软面向第三方的正式服务。「元气少女」等预设是调整音调的变体，并非独立声线
- **字体**：Shippori Mincho、Literata、Zen Kaku Gothic New，经 Google Fonts，[SIL Open Font License 1.1](https://openfontlicense.org/)

## 主要依赖

| 组件 | 用途 | 许可 |
|---|---|---|
| [kuromoji.js](https://github.com/takuyaa/kuromoji.js) | 日语分词、原形、读音 | Apache-2.0；内含 mecab-ipadic 2.7.0（© 奈良先端科学技術大学院大学） |
| [opencc-js](https://github.com/nk2028/opencc-js) / [OpenCC](https://github.com/BYVoid/OpenCC) | 繁简转换 | MIT / Apache-2.0 |
| [React](https://react.dev/)、[Zustand](https://github.com/pmndrs/zustand)、[Radix UI](https://www.radix-ui.com/) | 界面 | MIT |
| [Lucide](https://lucide.dev/) | 图标 | ISC |
| [Tailwind CSS](https://tailwindcss.com/)、[Vite](https://vite.dev/) | 样式、构建 | MIT |
| [Express](https://expressjs.com/)、[cheerio](https://cheerio.js.org/) | 服务端、网页解析 | MIT |

完整的依赖及其许可见 `package-lock.json`，可用 `npx license-checker --summary` 查看。
