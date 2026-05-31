---
layout: default
title: 个人主页
---

<section class="home-hero">
    <p class="home-hero-desc">{{ site.description }}</p>
</section>

<section class="timeline-section">
    <div class="timeline-filter" data-timeline-filter>
        <button class="filter-button is-active" data-filter="all" aria-pressed="true">全部</button>
        <button class="filter-button" data-filter="post" aria-pressed="false">文章</button>
        <button class="filter-button" data-filter="photo" aria-pressed="false">摄影</button>
        <button class="filter-button" data-filter="fragment" aria-pressed="false">碎片</button>
        <button class="filter-button" data-filter="publication" aria-pressed="false">研究</button>
    </div>

    <div class="timeline" data-timeline>
        {% for post in site.posts limit: 8 %}
        <article class="timeline-item" data-timeline-kind="post" data-timeline-date="{{ post.date | date: '%Y-%m-%d' }}">
            <div class="timeline-marker" data-kind="post"></div>
            <div class="timeline-body">
                <div class="timeline-meta">
                    <span class="timeline-kind">文章</span>
                    <time datetime="{{ post.date }}">{{ post.date | date: "%Y.%m.%d" }}</time>
                </div>
                <h3 class="timeline-title"><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
                <p class="timeline-excerpt">{{ post.excerpt | strip_html | truncate: 120 }}</p>
                {% if post.categories.size > 0 %}
                <div class="timeline-tags">
                    {% for cat in post.categories %}
                    <span class="tag">{{ cat }}</span>
                    {% endfor %}
                </div>
                {% endif %}
            </div>
        </article>
        {% endfor %}

        {% assign fragments = site.fragments | sort: "date" | reverse %}
        {% for fragment in fragments limit: 8 %}
        <article class="timeline-item" data-timeline-kind="fragment" data-timeline-date="{{ fragment.date | date: '%Y-%m-%d' }}">
            <div class="timeline-marker" data-kind="fragment"></div>
            <div class="timeline-body">
                <div class="timeline-meta">
                    <span class="timeline-kind">{{ fragment.type | default: "碎片" }}</span>
                    <time datetime="{{ fragment.date }}">{{ fragment.date | date: "%Y.%m.%d" }}</time>
                </div>
                <p class="timeline-excerpt">{{ fragment.content | strip_html | truncate: 120 }}</p>
            </div>
        </article>
        {% endfor %}

        {% assign photos = site.photos | sort: "date" | reverse %}
        {% for photo in photos limit: 8 %}
        <article class="timeline-item" data-timeline-kind="photo" data-timeline-date="{{ photo.date | date: '%Y-%m-%d' }}">
            <div class="timeline-marker" data-kind="photo"></div>
            <div class="timeline-body">
                <div class="timeline-meta">
                    <span class="timeline-kind">摄影</span>
                    <time datetime="{{ photo.date }}">{{ photo.date | date: "%Y.%m.%d" }}</time>
                </div>
                <h3 class="timeline-title"><a href="{{ photo.url | relative_url }}">{{ photo.title }}</a></h3>
                {% if photo.summary %}
                <p class="timeline-excerpt">{{ photo.summary }}</p>
                {% endif %}
                <a class="timeline-photo-thumb" href="{{ photo.url | relative_url }}" aria-label="阅读摄影文章：{{ photo.title | escape }}">
                    {% assign timeline_cover = photo.thumb | default: photo.cover | default: photo.photos[0].thumb | default: photo.photos[0].image %}
                    <img src="{{ timeline_cover }}" alt="{{ photo.alt | default: photo.title | escape }}" loading="lazy" decoding="async">
                </a>
            </div>
        </article>
        {% endfor %}

        {% for pub in site.publications limit: 4 %}
        <article class="timeline-item" data-timeline-kind="publication" data-timeline-date="{{ pub.year }}-01-01">
            <div class="timeline-marker" data-kind="publication"></div>
            <div class="timeline-body">
                <div class="timeline-meta">
                    <span class="timeline-kind">论文</span>
                    <time>{{ pub.year }}</time>
                </div>
                <h3 class="timeline-title"><a href="{{ pub.url | relative_url }}">{{ pub.title }}</a></h3>
                <p class="timeline-excerpt">{{ pub.venue }}</p>
            </div>
        </article>
        {% endfor %}
    </div>

</section>
