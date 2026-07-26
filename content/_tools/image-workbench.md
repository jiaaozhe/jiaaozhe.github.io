---
title: 图像工作台
summary: 完全在浏览器本地运行的批量图像处理工具，支持隐私元数据检查与清理、裁剪、缩放、压缩、格式转换和 ZIP 导出。
category: 图像
status: beta
runtime: sandbox
entry: /tool-apps/image-workbench/
thumbnail: /tool-apps/image-workbench/preview.svg
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
  - 图像处理
  - 图片压缩
  - 格式转换
  - 批量处理
  - 本地处理
  - EXIF
  - 隐私清理
---

图片文件和导出结果仅保留在当前浏览器会话中，不会上传或写入持久化存储。工具只保存导出预设和界面偏好。

支持 JPEG、PNG 和经过浏览器能力检测的 WebP，提供 EXIF、GPS、XMP、IPTC 与文本元数据检查，以及非破坏裁剪、旋转翻转、高质量缩放、结果对比和批量 ZIP 导出。

所有导出都会重新编码，并在下载前复检生成文件，确认隐私元数据载体已移除；原始文件始终保持不变。
