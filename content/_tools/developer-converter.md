---
title: 配置与请求转换台
summary: 在浏览器本地完成 JSON、YAML、TOML 互转、结构查询与 Schema 验证，并把 cURL 转为多种代码或请求格式。
category: 开发
status: beta
runtime: sandbox
entry: /tool-apps/developer-converter/
thumbnail: /tool-apps/developer-converter/preview.svg
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
  - JSON
  - YAML
  - TOML
  - cURL
  - Python
  - JavaScript
  - Go
  - JSON Schema
  - JSONPath
  - 格式转换
  - 本地处理
---

配置文本、cURL 命令和转换结果只保留在当前浏览器会话中，不会上传或写入持久化存储。工具只保存格式、转换策略等界面偏好。

配置转换支持格式自动识别、大整数保真、损失诊断和目标格式回读复检；还可用结构树、JSON Pointer 或安全的 JSONPath 子集定位节点，并使用 Draft 2020-12 JSON Schema 验证当前配置。

cURL 转换使用 Bash 语法解析器生成 Python Requests、JavaScript Fetch、Go net/http、Raw HTTP 或 HAR 1.2，不会实际发送请求；Authorization、Cookie、API Key 等疑似凭据默认改写为环境变量。
