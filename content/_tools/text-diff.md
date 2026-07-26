---
title: 文本差异台
summary: 完全在浏览器本地比较两段文本或两个 UTF-8 文件，支持并排、统一视图以及可回放验证的 Patch 导出。
category: 开发
status: beta
runtime: sandbox
entry: /tool-apps/text-diff/
thumbnail: /tool-apps/text-diff/preview.svg
source_url: https://github.com/jiaaozhe/jiaaozhe.github.io
provenance: native
updated: 2026-07-26
storage: bridged
capabilities:
  - scripts
  - downloads
  - fullscreen
network: []
tags:
  - Diff
  - 文本比较
  - Patch
  - 代码审查
  - UTF-8
  - 本地处理
---

左右文本、导入文件和差异结果只保留在当前页面内存中，不会上传或写入持久化存储。工具只保存视图、上下文和忽略规则等界面偏好。

比较以行为基础，并对修改行继续做单词或字符级高亮；支持忽略首尾空白、忽略大小写、折叠未变化内容和差异块导航。导出的 Unified Diff 始终根据原始文本精确生成，并在下载前回放验证。
