---
layout: default
title: 分类
permalink: /categories/
---

<section class="categories">
    <h2>文章分类</h2>
    
    {% assign categories = site.posts | map: 'categories' | uniq | compact %}
    
    {% for category in categories %}
    <div class="category-section">
        <h3 id="{{ category | slugify }}">{{ category }}</h3>
        <ul class="post-list">
            {% for post in site.posts %}
                {% if post.categories contains category %}
                <li>
                    <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
                    <span class="post-date">{{ post.date | date: "%Y年%-m月%-d日" }}</span>
                </li>
                {% endif %}
            {% endfor %}
        </ul>
    </div>
    {% endfor %}
</section>