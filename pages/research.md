---
layout: default
title: 学术研究
permalink: /research/
---

<section class="research-hero">
    <div class="hero-content">
        <h1>学术研究</h1>
    </div>
</section>

<section class="research-content">
    <div class="research-grid">
        <div class="research-card">
            <div class="card-header">
                <h2>学术论文</h2>
                <div class="icon-wrapper">
                    <span>Papers</span>
                </div>
            </div>
            <div class="card-content">

                <div class="publications-preview">
                    {% for publication in site.publications %}
                    <div class="publication-preview" data-bibtex="{{ publication.bibtex | escape }}">
                        <h4><a href="{{ publication.url | relative_url }}">{{ publication.title }}</a></h4>
                        <p class="publication-meta">{{ publication.authors }} · {{ publication.venue }}, {{ publication.year }}</p>
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
            </div>
        </div>
    </div>
</section>
