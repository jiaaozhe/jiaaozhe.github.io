---
layout: default
title: 好文分享
permalink: /reads/
---

{% assign reads = site.reads | sort: "date" | reverse %}
{% assign categories = reads | map: "category" | compact | uniq %}

<section class="hero">
    <header class="page-heading">
        <p class="page-kicker">Reading list</p>
        <h1>好文分享</h1>
    </header>
    <p>我读过、并且认为值得再读一遍的东西。每条都附一段推荐语，说明它为什么值得占用你的时间。</p>
</section>

<section class="reads-filter">
    <span>筛选分类</span>
    <div class="filter-links" data-reads-filter>
        <button type="button" class="filter-button is-active" data-read-category="all" aria-pressed="true">全部</button>
        {% for category in categories %}
        <button type="button" class="filter-button" data-read-category="{{ category | escape }}" aria-pressed="false">{{ category }}</button>
        {% endfor %}
    </div>
</section>

<section class="reads-grid">
    {% for read in reads %}
    <article class="read-card" data-read-item data-read-category="{{ read.category | escape }}">
        <h2><a href="{{ read.url | relative_url }}">{{ read.title }}</a></h2>
        <p class="read-card-date">
            <span class="read-card-category">{{ read.category }}</span>
            <time datetime="{{ read.date | date: '%Y-%m-%d' }}">{{ read.date | date: "%Y.%m.%d" }}</time>
        </p>
        <p class="read-card-summary">{{ read.summary }}</p>
        <p class="read-card-source">{{ read.source.site }}{% if read.source.author %} · {{ read.source.author }}{% endif %}</p>
        {% if read.tags.size > 0 %}
        <div class="read-card-tags">
            {% for tag in read.tags %}
            <span class="tag">{{ tag }}</span>
            {% endfor %}
        </div>
        {% endif %}
        <a class="read-card-outbound" href="{{ read.source.url }}" target="_blank" rel="noopener noreferrer">原文 <span aria-hidden="true">↗</span></a>
    </article>
    {% endfor %}
</section>

{% if reads.size == 0 %}
<p class="empty-state">还没有分享内容。</p>
{% endif %}
