# 个人博客

基于 Jekyll 和 GitHub Pages 的个人网站。

## 本地启动

```bash
bundle install
bundle exec jekyll serve
```

打开 `http://localhost:4000`。

## 内容维护

### 文章

在 `_posts/` 新建 Markdown 文件，文件名格式：

```text
YYYY-MM-DD-title.md
```

示例：

```markdown
---
title: "文章标题"
date: 2026-04-29
excerpt: "文章摘要"
categories: [技术]
---

正文内容。
```

### 碎片流

碎片流放在 `_fragments/`，每条一个 Markdown 文件。

```text
_fragments/YYYY-MM-DD-title.md
```

示例：

```markdown
---
date: 2026-04-29
type: 观察
---

这里写短记录内容。

可以写多段、列表、链接或代码。
```

`type` 会自动生成顶部筛选按钮，不需要额外配置。

### 学术成果

学术成果放在 `_publications/`，每篇一个 Markdown 文件。

## 目录结构

```text
├── _config.yml
├── _fragments/
├── _layouts/
├── _posts/
├── _publications/
├── assets/
│   ├── css/
│   └── js/
├── pages/
│   ├── fragments.md
│   ├── introduction.md
│   ├── posts.md
│   └── research.md
├── index.md
└── README.md
```

## 部署

推送到 `main` 后由 GitHub Pages 自动构建。
