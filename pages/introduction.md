---
layout: default
title: 关于
permalink: /introduction/
---

<section class="profile-hero">
    <div class="hero-content">
        <div class="profile-avatar">
            <svg class="avatar-mark" viewBox="0 0 128 128" role="img" aria-label="Jiaaozhe identity mark">
                <circle cx="64" cy="64" r="52"></circle>
                <path d="M45 34v40c0 20 18 28 34 17l27-18-42-22 35-22"></path>
                <circle cx="45" cy="34" r="5"></circle>
                <circle cx="79" cy="91" r="5"></circle>
                <circle cx="106" cy="73" r="5"></circle>
                <circle cx="99" cy="29" r="5"></circle>
                <path d="M37 96h18"></path>
                <path d="M73 32h18"></path>
            </svg>
        </div>
        <h1>关于</h1>
        <p class="subtitle">Code is cheap, show me your talk.</p>
        <div class="hero-tags">
            <span class="tag">Multimodal Representation</span>
            <span class="tag">Automation</span>
        </div>
    </div>
</section>

<section class="profile-sections">
    <div class="section-grid">

        <div class="research-card">
            <div class="card-header">
                <h2>研究兴趣</h2>
                <div class="icon-wrapper">
                    <span>Research</span>
                </div>
            </div>
            <div class="card-content">
                <div class="research-interests-preview">
                    <div class="research-interest-preview">
                        <h4>Multimodal Representation</h4>
                        <p class="research-interest-meta">Unified Multimodal Understanding, Contrastive Learning</p>
                    </div>
                    <div class="research-interest-preview">
                        <h4>Automation</h4>
                        <p class="research-interest-meta">Token is all you need.</p>
                    </div>
                </div>
            </div>
        </div>

    </div>
</section>

<section class="publications-section">
    <div class="section-header-main">
        <h2>学术论文</h2>
        <p>已发表的学术研究成果</p>
    </div>

    <div class="publications-grid">
        {% for publication in site.publications %}
        <div class="publication-card" data-bibtex="{{ publication.bibtex | escape }}">
            <div class="publication-badge">{{ publication.badge }}</div>
            <h3><a href="{{ publication.url | relative_url }}">{{ publication.title }}</a></h3>
            <p class="publication-authors">{{ publication.authors }}</p>
            <p class="publication-venue">{{ publication.venue }}, {{ publication.year }}</p>
            <div class="publication-links">
                {% if publication.pdf_url %}
                <a href="{{ publication.pdf_url }}" class="publication-link" target="_blank" rel="noopener noreferrer">PDF</a>
                {% endif %}
                {% if publication.project_url %}
                <a href="{{ publication.project_url }}" class="publication-link" target="_blank" rel="noopener noreferrer">项目</a>
                {% endif %}
                {% if publication.bibtex %}
                <a href="#" class="publication-link">引用</a>
                {% endif %}
            </div>
        </div>
        {% endfor %}
    </div>
</section>

<section class="contact-section">
    <div class="section-header-main">
        <h2>联系方式</h2>
        <p>欢迎与我交流合作</p>
    </div>

    <div class="contact-grid">
        <div class="contact-item">
            <div class="contact-icon">Mail</div>
            <div class="contact-info">
                <h4>邮箱</h4>
                <p><a href="mailto:jiaaozhe1999@outlook.com">jiaaozhe1999@outlook.com</a></p>
            </div>
        </div>
        <div class="contact-item">
            <div class="contact-icon">Git</div>
            <div class="contact-info">
                <h4>GitHub</h4>
                <p><a href="https://github.com/jiaaozhe" target="_blank" rel="noopener noreferrer">github.com/jiaaozhe</a></p>
            </div>
        </div>
    </div>
</section>
