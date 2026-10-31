# 词典数据

服务器首次启动时会把这里的压缩包解压到 `server/data/`，无需联网。要更新到最新版，运行
`npm run setup:dict -w server`（重新下载、生成，并更新这里的压缩包）。

| 文件 | 内容 | 来源与许可 |
|---|---|---|
| `jmdict.sqlite.gz` | 日英词典，约 21.9 万词条 | [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html)（Electronic Dictionary Research and Development Group），经 [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) 转换。CC BY-SA 4.0 |
| `ja-zh.sqlite.gz` | 日中词典，约 11.3 万词条，释义已转为简体 | [维基词典（中文版）](https://zh.wiktionary.org/) 的日语词条，经 [wiktextract / kaikki.org](https://kaikki.org/zhwiktionary/) 提取。CC BY-SA 4.0 |

两份数据均按 CC BY-SA 4.0 授权：转载或分发时须署名，并以相同协议共享改编后的数据。
