---
layout: default
title: 分类
permalink: /categories/
---

<section class="categories-hero">
    <div class="hero-content">
        <h1>文章分类</h1>
        <p class="subtitle">按主题浏览所有文章</p>
    </div>
</section>

<section class="categories-content">
    {% assign categories = site.posts | map: 'categories' | uniq | compact %}

    <div class="categories-grid">
        {% for category in categories %}
        <div class="category-card">
            <div class="category-header">
                <h2 id="{{ category | slugify }}">{{ category }}</h2>
                <div class="post-count">
                    {% assign count = 0 %}
                    {% for post in site.posts %}
                        {% if post.categories contains category %}
                            {% assign count = count | plus: 1 %}
                        {% endif %}
                    {% endfor %}
                    {{ count }} 篇文章
                </div>
            </div>

            <div class="post-list">
                {% for post in site.posts %}
                    {% if post.categories contains category %}
                    <div class="post-item">
                        <a href="{{ post.url | relative_url }}" class="post-title">{{ post.title }}</a>
                        <span class="post-date">{{ post.date | date: "%Y年%-m月%-d日" }}</span>
                    </div>
                    {% endif %}
                {% endfor %}
            </div>
        </div>
        {% endfor %}
    </div>
</section>