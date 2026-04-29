---
layout: default
title: 个人主页
---

<section class="hero">
    <h1>欢迎来到我的博客</h1>
</section>

<section class="quick-links">
    <div class="links-grid">
        <div class="link-card">
            <h3>学术研究</h3>
            <p>探索我的学术论文和研究项目</p>
            <a href="/research/">查看详情</a>
        </div>
        <div class="link-card">
            <h3>技术博客</h3>
            <p>阅读我的技术文章和学习笔记</p>
            <a href="/posts/">查看详情</a>
        </div>
    </div>
</section>

<section class="recent-fragments">
    <div class="section-header-main">
        <p>Fragments</p>
        <h2>碎片流</h2>
    </div>
    <div class="home-fragment-list">
        {% assign fragments = site.data.fragments | sort: "date" | reverse %}
        {% for fragment in fragments limit:3 %}
        <article class="home-fragment">
            <time datetime="{{ fragment.date }}">{{ fragment.date | date: "%Y.%m.%d" }}</time>
            <p>{{ fragment.text }}</p>
        </article>
        {% endfor %}
    </div>
    {% if fragments.size == 0 %}
    <p class="empty-state">碎片流还没有内容。</p>
    {% endif %}
    <div class="view-all">
        <a href="/fragments/" class="view-all-link">查看碎片流</a>
    </div>
</section>

<section class="recent-posts">
    <h2>最新文章</h2>
    <div class="blog-posts">
        {% for post in site.posts limit:3 %}
        <article class="post-card">
            <h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
            <p class="post-date">{{ post.date | date: "%Y年%-m月%-d日" }}</p>
            <p>{{ post.excerpt | strip_html | truncate: 120 }}</p>
        </article>
        {% endfor %}
    </div>
    {% if site.posts.size > 3 %}
    <div class="view-all">
        <a href="/posts/" class="view-all-link">查看所有文章</a>
    </div>
    {% endif %}
</section>
