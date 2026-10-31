# 词典数据

服务器首次启动时会把这里的压缩包解压到 `server/data/`，无需联网。要更新到最新版，运行
`npm run setup:dict -w server`（重新下载、生成，并更新这里的压缩包）。

## jmdict.sqlite.gz — 日英词典（约 21.9 万词条）

This package uses the [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project) dictionary
files. These files are the property of the [Electronic Dictionary Research and Development Group](https://www.edrdg.org/),
and are used in conformance with the Group's [licence](https://www.edrdg.org/edrdg/licence.html) (CC BY-SA 4.0).

- 来源：JMdict 英文版，经 [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) 转为 JSON
- 改动：只保留词形、读音、词性、释义和用法标注，按词形建立索引后存为 SQLite
- 许可：CC BY-SA 4.0

## ja-zh.sqlite.gz — 日中词典（约 11.3 万词条）

- 来源：[中文维基词典](https://zh.wiktionary.org/)（zh.wiktionary.org）的日语词条，作者为维基词典贡献者；
  经 [wiktextract](https://github.com/tatuylonen/wiktextract) 提取，由 [kaikki.org](https://kaikki.org/zhwiktionary/) 发布
- 改动：只保留日语词条（去掉罗马字、重定向、单字和音节条目）；释义与例句译文用 OpenCC 转为简体中文；
  合并「日语」「日語」两个分类并去重；存为 SQLite
- 许可：[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

两份数据都按 CC BY-SA 4.0 继续授权：转载或分发时须署名，并以相同协议共享改编后的数据。
应用在每张查词卡片上显示来源与许可，并在「致谢与许可」页面列出完整说明。
