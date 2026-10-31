# EchoReader

日英双语有声小说阅读器（本地个人使用）。

## 启动

```bash
npm install
npm run setup:dict -w server   # 首次：生成日语词典（约 1 分钟，需联网）
                               #   server/data/jmdict.sqlite  JMdict 日英（约 60 MB）
                               #   server/data/ja-zh.sqlite   维基词典日中（约 18 MB，CC BY-SA）
npm run dev                    # 同时启动后端 :3001 和前端 :5173
```

浏览器打开 http://localhost:5173 。

## 在手机上用

```bash
npm start   # 构建前端并启动；终端会打印「手机（同一 Wi-Fi）打开：http://192.168.x.x:3001」
```

首次运行时 Windows 防火墙会询问是否允许 Node.js 访问网络，选「专用网络 / 允许」。
安装到主屏幕、手机脱离电脑离线阅读需要 HTTPS（浏览器规定）；在 http 局域网地址下其余功能都正常。

## 功能

- 生词本（电脑和手机共用），一键导出 Anki
- 日语竖排（縦書き）阅读
- 整本离线下载：存到电脑；在 HTTPS 下还会存到手机

- 从 小説家になろう / Project Gutenberg 搜书、读章节；字号、行高可调，记住阅读进度
- edge-tts 朗读（Nanami / Keita / Jenny / Ryan），句子与单词同步高亮，0.8× / 1.0× / 1.25×，读完自动下一章
- 点词查词典：日语按上下文求原形，中文释义（维基词典）+ 英文释义（JMdict）；英语用 Free Dictionary
- 自动给汉字注音（作者注音优先）；单句慢速跟读
- 环境音：雨夜、壁炉（浏览器实时合成）、咖啡馆（公有领域录音），朗读时自动压低
- 主题：亮色、OLED 纯黑、羊皮纸

## 快捷键

| 键 | 作用 |
|---|---|
| 空格 | 朗读 / 暂停 |
| ← / → | 后退 / 前进 5 秒（可跨段） |
| R | 从头重听当前句 |
| Shift + R | 以 0.8× 慢速跟读当前句 |
| ? | 显示快捷键列表 |

## 结构

- `server/` Express API：`/api/{syosetu|gutenberg}/{popular,search,books/:id,books/:id/toc,books/:id/chapters/:n}`
  - 上游响应缓存在 `server/.cache/`，可随时删除
- `client/` Vite + React 18 + Tailwind 4 + Zustand + Radix UI
- `shared/types.ts` 前后端共用类型

## 文本约定

段落字符串里 `""` 表示场景分隔；注音写作 `｜漢字《かんじ》`（服务端输出总带 `｜`）。
