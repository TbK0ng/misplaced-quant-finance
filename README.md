# 错位的量化金融 · 阅读版

把《错位的量化金融》（作者：栀染）十二章重新排版成一个静态阅读站，重点优化手机阅读：深/浅两套主题、章节抽屉、小节目录、全文搜索、公式与代码的横向滑动提示，以及「继续阅读」记忆。

## 本地运行

```bash
npm install
npm run build      # 源 Markdown -> docs/
npm run preview    # 构建并起本地服务 http://localhost:4173
```

## 结构

```
*.md                    原稿（十二章，保留原样）
images/                 原稿配图
site/build.mjs          生成器：Markdown -> 静态 HTML
site/style.css          主题样式
site/app.js             交互：主题、进度、搜索、目录
site/serve.mjs          本地预览服务器
docs/                   生成产物（已 gitignore）
.github/workflows/      GitHub Pages 部署
```

生成器做了这些事：`$...$` 用 KaTeX 渲染（独占一行的公式升级为行间公式）、代码块自动识别语言并高亮、跨章链接改写成站内链接、标题生成锚点与小节目录、导出 `search.json` 供搜索面板使用。

## 部署

推送到 `main` 后 GitHub Actions 会构建 `docs/` 并发布到 GitHub Pages（仓库 Settings → Pages 的 Source 需为 **GitHub Actions**）。

## 版权

正文与图表版权归作者栀染所有，本仓库只做排版与阅读体验。
