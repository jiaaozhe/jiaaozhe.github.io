---
title: "If coding is solved, what now?: Measuring the sloppiness of code"
date: 2026-09-13
published: 2026-09-10
source:
  url: https://earendil.com/posts/measuring-code-sloppiness/
  site: EARENDIL
  author: Sebastian
category: 工程
summary: 作者从物理学背景切入，把「代码形式正确」和「代码不臃肿」拆成两件事，并给出两个可计算的指标——Verbosity 衡量重复与冗长行的占比，Erosion 衡量复杂度是否过度集中在少数大函数上。他实测 LLM 生成代码的冗长度与侵蚀度约为成熟人类项目代码的两倍，同时顺带把「让 AI 当裁判」这条主流做法批了一顿。
tags:
  - 代码质量
  - 评测
  - LLM
---

文中两个细节比结论本身更有意思。

一是作者提到，单纯看 LOC 变化量作为臃肿度的代理指标「出乎意料地有效」，但紧接着补了一句——一旦开始针对它优化，它就会立刻失效。这几乎是所有代码质量指标的共同宿命，也解释了为什么这类指标适合当诊断工具而不是目标。

二是评测设计：SlopCodeBench 在多轮迭代之间清空模型上下文，以此模拟人类真实使用 coding agent 的方式。结果是坏决策会随轮次累积，最强模型在「每个检查点都必须通过」的严格口径下拿到 0%。这个设计比它的数字更值得关注。
