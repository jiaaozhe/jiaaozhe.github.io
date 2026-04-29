---
layout: default
title: 碎片流
permalink: /fragments/
---

<section class="hero fragments-hero">
    <p class="hero-kicker">Fragments</p>
    <h1>碎片流</h1>
    <p>论文、工具、实验和代码库的短记录。它们不够完整，但值得留下。</p>
</section>

<section class="fragment-filter">
    <span>筛选碎片</span>
    <div class="filter-links" data-fragment-filter>
        <button type="button" class="filter-button is-active" data-fragment-type="all" aria-pressed="true">全部</button>
        <button type="button" class="filter-button" data-fragment-type="paper" aria-pressed="false">论文</button>
        <button type="button" class="filter-button" data-fragment-type="tool" aria-pressed="false">工具</button>
        <button type="button" class="filter-button" data-fragment-type="experiment" aria-pressed="false">实验</button>
        <button type="button" class="filter-button" data-fragment-type="code" aria-pressed="false">代码</button>
    </div>
</section>

<section class="fragment-stream" aria-label="碎片流列表">
    {% assign fragments = site.data.fragments | sort: "date" | reverse %}
    {% for fragment in fragments %}
    <article class="fragment-item" data-fragment-item data-fragment-type="{{ fragment.type | escape }}" data-fragment-tags="{{ fragment.tags | join: '|' | escape }}">
        <time class="fragment-date" datetime="{{ fragment.date }}">{{ fragment.date | date: "%Y.%m.%d" }}</time>
        <div class="fragment-body">
            <div class="fragment-meta">
                <span>{{ fragment.type_label }}</span>
                {% for tag in fragment.tags %}
                <button type="button" class="fragment-tag" data-fragment-tag="{{ tag | escape }}">#{{ tag }}</button>
                {% endfor %}
            </div>
            <p>{{ fragment.text }}</p>
            {% if fragment.source %}
            <a class="fragment-source" href="{{ fragment.source.url }}" target="_blank" rel="noopener noreferrer">{{ fragment.source.label }}</a>
            {% endif %}
        </div>
    </article>
    {% endfor %}
    {% if fragments.size == 0 %}
    <p class="empty-state">碎片流还没有内容。</p>
    {% endif %}
</section>
