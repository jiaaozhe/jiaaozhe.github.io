---
layout: default
title: 博客文章
permalink: /posts/
---

<section class="hero">
    <h2>我的博客文章</h2>
    <p>探索技术前沿 • 分享编程心得 • 记录成长历程</p>
</section>

<section class="blog-posts">
    {% for post in site.posts %}
    <article class="post">
        <h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
        <p class="post-date">{{ post.date | date: "%Y年%-m月%-d日" }}</p>
        <p>{{ post.excerpt | strip_html | truncate: 120 }}</p>
    </article>
    {% endfor %}
</section>