---
layout: default
title: 首页
---

<section class="hero">
    <h2>欢迎来到我的博客</h2>
    <p>分享技术、生活和思考</p>
    <p><a href="/categories/">查看所有分类</a></p>
</section>

<section class="blog-posts">
    {% for post in site.posts %}
    <article class="post">
        <h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
        <p class="post-date">{{ post.date | date: "%Y年%-m月%-d日" }}</p>
        <p>{{ post.excerpt | strip_html | truncate: 100 }}</p>
    </article>
    {% endfor %}
</section>