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

## 结构

- `server/` Express API：`/api/{syosetu|gutenberg}/{popular,search,books/:id,books/:id/toc,books/:id/chapters/:n}`
  - 上游响应缓存在 `server/.cache/`，可随时删除
- `client/` Vite + React 18 + Tailwind 4 + Zustand + Radix UI
- `shared/types.ts` 前后端共用类型

## 文本约定

段落字符串里 `""` 表示场景分隔；注音写作 `｜漢字《かんじ》`（服务端输出总带 `｜`）。
