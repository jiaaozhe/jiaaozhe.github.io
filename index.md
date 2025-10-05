---
layout: default
title: 个人主页
---

<section class="hero">
    <h2>欢迎来到我的博客</h2>
    <p>探索技术前沿 • 分享编程心得 • 记录成长历程</p>
    <div class="hero-actions">
        <a href="/introduction/" class="btn-primary">了解我 →</a>
        <a href="/posts/" class="btn-secondary">阅读博客 →</a>
        <a href="/research/" class="btn-secondary">学术研究 →</a>
    </div>
</section>

<section class="quick-links">
    <div class="links-grid">
        <div class="link-card">
            <h3>📚 学术研究</h3>
            <p>探索我的学术论文和研究项目</p>
            <a href="/research/">查看详情 →</a>
        </div>
        <div class="link-card">
            <h3>✍️ 技术博客</h3>
            <p>阅读我的技术文章和学习笔记</p>
            <a href="/posts/">查看详情 →</a>
        </div>
        <div class="link-card">
            <h3>📄 关于本站</h3>
            <p>了解网站的使用条款和版权信息</p>
            <a href="/about/">查看详情 →</a>
        </div>
    </div>
</section>

<section class="recent-posts">
    <h2>最新文章</h2>
    <div class="blog-posts">
        {% for post in site.posts limit:3 %}
        <article class="post">
            <h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
            <p class="post-date">{{ post.date | date: "%Y年%-m月%-d日" }}</p>
            <p>{{ post.excerpt | strip_html | truncate: 120 }}</p>
        </article>
        {% endfor %}
    </div>
    {% if site.posts.size > 3 %}
    <div class="view-all">
        <a href="/posts/" class="view-all-link">查看所有文章 →</a>
    </div>
    {% endif %}
</section>