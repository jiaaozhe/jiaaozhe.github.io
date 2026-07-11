---
layout: default
title: 工具
permalink: /tools/
---

{% assign tools = site.tools | sort: "title" %}
{% assign categories = tools | map: "category" | compact | uniq %}

<section class="tools-index" data-tools-index>
    <header class="tools-index-header">
        <div>
            <p class="tools-kicker">UTILITY INDEX</p>
            <h1>工具</h1>
            <p class="tools-intro">独立运行的小工具。状态保存在浏览器本地，每个工具拥有隔离的运行空间。</p>
        </div>
        <div class="tools-count" aria-label="工具数量">
            <strong>{{ tools.size }}</strong>
            <span>available</span>
        </div>
    </header>

    <div class="tools-controls">
        <div class="tools-filter" data-tools-filter role="group" aria-label="按分类筛选工具">
            <button type="button" class="is-active" data-tool-category="all" aria-pressed="true">全部</button>
            {% for category in categories %}
            <button type="button" data-tool-category="{{ category | escape }}" aria-pressed="false">{{ category }}</button>
            {% endfor %}
        </div>
        {% if tools.size > 6 %}
        <label class="tools-search">
            <span class="sr-only">搜索工具</span>
            <input type="search" data-tools-search placeholder="搜索工具" autocomplete="off">
        </label>
        {% endif %}
    </div>

    <div class="tools-grid" data-tools-grid>
        {% for tool in tools %}
        {% capture tool_search_text %}{{ tool.title }} {{ tool.summary }} {{ tool.tags | join: " " }}{% endcapture %}
        <article class="tool-card" data-tool-item data-tool-category="{{ tool.category | escape }}" data-tool-search="{{ tool_search_text | strip | downcase | escape }}">
            <a class="tool-card-preview" href="{{ tool.url | relative_url }}" aria-label="打开 {{ tool.title | escape }}">
                <img src="{{ tool.thumbnail | relative_url }}" alt="{{ tool.title | escape }} 界面" loading="lazy" decoding="async">
                <span class="tool-card-status" data-status="{{ tool.status }}">{{ tool.status }}</span>
            </a>
            <div class="tool-card-body">
                <div class="tool-card-meta">
                    <span>{{ tool.category }}</span>
                    {% if tool.provenance == "native" %}<span>原生</span>{% else %}<span>{{ tool.license }}</span>{% endif %}
                </div>
                <h2><a href="{{ tool.url | relative_url }}">{{ tool.title }}</a></h2>
                <p>{{ tool.summary }}</p>
                <div class="tool-card-signals" aria-label="工具运行信息">
                    <span>隔离运行</span>
                    <span>本地保存</span>
                    {% if tool.network.size > 0 %}<span>部分功能联网</span>{% endif %}
                </div>
                <div class="tool-card-actions">
                    <a class="tool-launch" href="{{ tool.url | relative_url }}">打开工具 <span aria-hidden="true">↗</span></a>
                    <a class="tool-source" href="{{ tool.source_url }}" target="_blank" rel="noopener noreferrer">源码</a>
                </div>
            </div>
        </article>
        {% endfor %}
    </div>

    <p class="tools-empty" data-tools-empty hidden>没有匹配的工具。</p>
</section>

<link rel="stylesheet" href="{{ '/assets/css/tools.css' | relative_url }}?v={{ site.time | date: '%s' }}">
<script src="{{ '/assets/js/tools.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
