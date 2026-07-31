---
layout: default
title: 博客文章
permalink: /posts/
---

<section class="hero">
    <header class="page-heading">
        <p class="page-kicker">Writing &amp; essays</p>
        <h1>我的博客文章</h1>
    </header>
</section>

<section class="post-filter">
    <span>筛选文章</span>
    {% assign categories = site.posts | map: 'categories' | uniq | compact %}
    <div class="filter-links" data-post-filter>
        <button type="button" class="filter-button is-active" data-category="all" aria-pressed="true">全部</button>
        {% for category in categories %}
        <button type="button" class="filter-button" data-category="{{ category | escape }}" aria-pressed="false">{{ category }}</button>
        {% endfor %}
    </div>
</section>

<section class="blog-posts">
    {% for post in site.posts %}
    <article class="post-card" data-post-categories="{{ post.categories | join: '|' | escape }}">
        <h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
        <p class="post-date">{{ post.date | date: "%Y年%-m月%-d日" }}</p>
        <p>{{ post.excerpt | strip_html | truncate: 120 }}</p>
    </article>
    {% endfor %}
</section>
