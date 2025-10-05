---
layout: default
title: 个人简介
permalink: /introduction/
---

<section class="profile-hero">
    <div class="hero-content">
        <div class="profile-avatar">
            <div class="avatar-placeholder">
                <span>J</span>
            </div>
        </div>
        <p class="subtitle">专注于人工智能与机器学习研究</p>
        <div class="hero-tags">
            <span class="tag">多模态表征</span>
            <span class="tag">计算机视觉</span>
        </div>
    </div>
</section>

<section class="profile-sections">
    <div class="section-grid">

        <div class="research-card">
            <div class="card-header">
                <h2>🔬 研究兴趣</h2>
                <div class="icon-wrapper">
                    <span>🔬</span>
                </div>
            </div>
            <div class="card-content">
                <div class="research-interests-preview">
                    <div class="research-interest-preview">
                        <h4>多模态表征</h4>
                        <p class="research-interest-meta">多模态理解、多模态特征对齐与融合</p>
                    </div>
                    <div class="research-interest-preview">
                        <h4>计算机视觉</h4>
                        <p class="research-interest-meta">图像描述</p>
                    </div>
                </div>
            </div>
        </div>

    </div>
</section>

<section class="publications-section">
    <div class="section-header-main">
        <h2>📚 学术论文</h2>
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
                <a href="{{ publication.pdf_url }}" class="publication-link" target="_blank" rel="noopener noreferrer">📄 PDF</a>
                {% endif %}
                {% if publication.project_url %}
                <a href="{{ publication.project_url }}" class="publication-link" target="_blank" rel="noopener noreferrer">🔗 项目</a>
                {% endif %}
                {% if publication.bibtex %}
                <a href="#" class="publication-link">📖 引用</a>
                {% endif %}
            </div>
        </div>
        {% endfor %}
    </div>
</section>

<section class="contact-section">
    <div class="section-header-main">
        <h2>📞 联系方式</h2>
        <p>欢迎与我交流合作</p>
    </div>

    <div class="contact-grid">
        <div class="contact-item">
            <div class="contact-icon">✉️</div>
            <div class="contact-info">
                <h4>邮箱</h4>
                <p>jiaaozhe1999@outlook.com</p>
            </div>
        </div>
        <div class="contact-item">
            <div class="contact-icon">💼</div>
            <div class="contact-info">
                <h4>GitHub</h4>
                <p>github.com/jiaaozhe</p>
            </div>
        </div>
    </div>
</section>