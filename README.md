# 个人博客

使用 Jekyll 和 GitHub Pages 搭建的个人博客网站。

## 功能特性

- 使用 Markdown 写作
- 响应式设计，支持移动端
- 自动文章列表和分页
- SEO 优化
- 使用 GitHub Pages 免费托管

## 本地开发

1. 安装 Ruby 和 Jekyll：
   ```bash
   gem install jekyll bundler
   ```

2. 安装依赖：
   ```bash
   bundle install
   ```

3. 启动本地服务器：
   ```bash
   bundle exec jekyll serve
   ```

4. 在浏览器打开 http://localhost:4000

## 添加新文章

在 `_posts/` 目录创建 Markdown 文件，文件名格式：

```
YYYY-MM-DD-title.md
```

文件头部需要包含 YAML front matter：

```markdown
---
title: "文章标题"
date: YYYY-MM-DD
excerpt: "文章摘要"
---

文章内容...
```

## 部署

推送到 GitHub 后会自动部署：

```bash
git add .
git commit -m "添加新文章"
git push origin main
```

网站将在几分钟内更新：https://username.github.io

## 项目结构

```
├── _config.yml         # Jekyll 配置
├── _data/              # 站点数据
│   └── fragments.yml
├── _layouts/           # 布局模板
│   ├── default.html
│   ├── post.html
│   └── publication.html
├── _posts/             # 博客文章 (Markdown)
│   ├── 2025-01-01-first-post.md
│   └── 2025-01-02-github-pages-guide.md
├── _publications/      # 学术成果
├── assets/css/         # 样式文件
│   └── styles.css
├── assets/js/          # 交互脚本
│   └── script.js
├── pages/              # 独立页面
│   ├── fragments.md
│   ├── introduction.md
│   ├── posts.md
│   └── research.md
├── index.md            # 主页
├── Gemfile             # Ruby 依赖
└── README.md           # 项目说明
```
