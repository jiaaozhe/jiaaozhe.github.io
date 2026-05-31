---
layout: default
title: 摄影
permalink: /photos/
---

{% assign photo_posts = site.photos | sort: "date" | reverse %}

<section class="hero photos-hero">
    <h1>摄影</h1>
    <p>按时间发布的图片文章。每一页是一组照片，也是一段拍摄记录。</p>
</section>

<section class="photo-filter">
    <span>筛选摄影文章</span>
    {% assign photo_tags = photo_posts | map: "tags" | compact | uniq %}
    <div class="filter-links" data-photo-filter>
        <button type="button" class="filter-button is-active" data-photo-tag="all" aria-pressed="true">全部</button>
        {% for tag in photo_tags %}
        <button type="button" class="filter-button" data-photo-tag="{{ tag | escape }}" aria-pressed="false">{{ tag }}</button>
        {% endfor %}
    </div>
</section>

<section class="photo-post-list" aria-label="摄影文章列表">
    {% for photo in photo_posts %}
    <article class="photo-post-card" data-photo-item data-photo-tags="{{ photo.tags | join: '|' | escape }}">
        <a class="photo-post-card-image" href="{{ photo.url | relative_url }}" aria-label="阅读摄影文章：{{ photo.title | escape }}">
            <img src="{{ photo.thumb | default: photo.cover | default: photo.photos[0].thumb | default: photo.photos[0].image }}" alt="{{ photo.alt | default: photo.title | escape }}" loading="lazy" decoding="async">
        </a>
        <div class="photo-post-card-body">
            <div class="photo-post-card-meta">
                <time datetime="{{ photo.date }}">{{ photo.date | date: "%Y.%m.%d" }}</time>
                <span>{{ photo.photos.size }} 张</span>
            </div>
            <h2><a href="{{ photo.url | relative_url }}">{{ photo.title }}</a></h2>
            {% if photo.summary %}
            <p>{{ photo.summary }}</p>
            {% endif %}
            {% if photo.tags %}
            <div class="photo-post-card-tags">
                {% for tag in photo.tags %}
                <span>{{ tag }}</span>
                {% endfor %}
            </div>
            {% endif %}
        </div>
    </article>
    {% endfor %}
    {% if photo_posts.size == 0 %}
    <p class="empty-state">还没有摄影文章。</p>
    {% endif %}
</section>
