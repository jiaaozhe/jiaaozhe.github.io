---
title: "GitHub Pages 搭建指南"
date: 2024-01-02
excerpt: "如何用 GitHub Pages 快速搭建个人博客网站。"
---

GitHub Pages 是一个免费的静态网站托管服务，非常适合搭建个人博客、项目文档等。下面是如何快速搭建一个博客的步骤：

## 1. 创建 GitHub 仓库

首先，在你的 GitHub 账户中创建一个新的仓库，命名为：

```
username.github.io
```

将 `username` 替换为你的 GitHub 用户名。

## 2. 准备网站文件

创建基本的 HTML 文件：

- `index.html` - 主页
- `styles.css` - 样式文件  
- `about.html` - 关于页面
- `posts/` - 博客文章目录

## 3. 上传到 GitHub

使用 Git 命令上传文件：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/username/username.github.io.git
git push -u origin main
```

## 4. 启用 GitHub Pages

在仓库设置中，找到 GitHub Pages 部分：

- 选择分支：`main`
- 选择文件夹：`/ (root)`
- 保存设置

等待几分钟，你的网站就会在 `https://username.github.io` 上线了！

## 优点

- **完全免费**：无需支付任何费用
- **支持自定义域名**：可以绑定自己的域名
- **自动 HTTPS**：提供安全的 HTTPS 连接
- **与 GitHub 工作流完美集成**：代码和网站在同一个地方管理
- **版本控制**：所有更改都有完整的历史记录

## Jekyll 支持

GitHub Pages 原生支持 Jekyll，你可以：

1. 使用 Markdown 写文章
2. 使用 Liquid 模板语言
3. 自动构建和部署
4. 使用丰富的插件系统

## 注意事项

- 仓库必须是公开的（除非使用 GitHub Pro）
- 每月有带宽限制（但个人博客通常足够）
- 支持自定义 404 页面
- 可以添加 Google Analytics 等分析工具

开始你的博客之旅吧！