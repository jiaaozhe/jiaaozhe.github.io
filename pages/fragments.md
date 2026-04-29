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
    {% assign fragments = site.fragments | sort: "date" | reverse %}
    {% assign fragment_types = fragments | map: "type" | compact | uniq %}
    <div class="filter-links" data-fragment-filter>
        <button type="button" class="filter-button is-active" data-fragment-type="all" aria-pressed="true">全部</button>
        {% for type in fragment_types %}
        <button type="button" class="filter-button" data-fragment-type="{{ type | escape }}" aria-pressed="false">{{ type }}</button>
        {% endfor %}
    </div>
</section>

<section class="fragment-stream" aria-label="碎片流列表">
    {% for fragment in fragments %}
    <article class="fragment-item" data-fragment-item data-fragment-type="{{ fragment.type | escape }}">
        <time class="fragment-date" datetime="{{ fragment.date }}">{{ fragment.date | date: "%Y.%m.%d" }}</time>
        <div class="fragment-content">
            {{ fragment.content }}
        </div>
        <span class="fragment-type">{{ fragment.type }}</span>
        {% if fragment.source %}
        <a class="fragment-source" href="{{ fragment.source.url }}" target="_blank" rel="noopener noreferrer">{{ fragment.source.label }}</a>
        {% endif %}
    </article>
    {% endfor %}
    {% if fragments.size == 0 %}
    <p class="empty-state">碎片流还没有内容。</p>
    {% endif %}
</section>
