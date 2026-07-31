---
layout: default
title: 状态
permalink: /status/
---

<section class="os-dashboard">
    <!-- Core Processes -->
    <div class="os-section">
        <div class="os-section-header">
            CORE_PROCESSES
            <div class="core-temp" id="core-temp" title="Click to check thermal status">
                <span class="temp-icon">&#127777;</span>
                <span class="temp-value" id="temp-value" data-base="{{ site.data.now.system.core_temp }}">{{ site.data.now.system.core_temp }}&#176;C</span>
            </div>
        </div>
        <div class="cpu-gauges">
            {% for item in site.data.now.focus.items %}
            {% assign circ = 314 %}
            {% assign progress_length = circ | times: item.progress | divided_by: 100.0 %}
            {% assign offset = circ | minus: progress_length %}
            <div class="cpu-gauge" style="--wave-color: {{ item.wave_color }};">
                <div class="gauge-header">
                    <span class="gauge-name">{{ item.display_name }}</span>
                    <span class="gauge-pid">PID {{ item.pid }}</span>
                </div>
                <svg viewBox="0 0 120 120" class="gauge-svg">
                    <circle class="gauge-bg" cx="60" cy="60" r="50"></circle>
                    <circle class="gauge-wave" cx="60" cy="60" r="50" style="stroke: {{ item.wave_color }};"></circle>
                    <circle class="gauge-progress" cx="60" cy="60" r="50"
                        stroke-dasharray="{{ circ }}"
                        stroke-dashoffset="{{ offset }}"></circle>
                </svg>
                <div class="gauge-center">
                    <div class="gauge-pct">{{ item.progress }}%</div>
                </div>
                <div class="gauge-meta">
                    <div><span class="meta-label">UPTIME</span> {{ item.uptime_hours }}h</div>
                    <div><span class="meta-label">CHECKPOINT</span> {{ item.checkpoint_days }}d</div>
                </div>
            </div>
            {% endfor %}
        </div>
    </div>

    <!-- AI Coprocessors Cluster -->
    <div class="os-section">
        {% assign agents = site.data.agents %}
        {% assign agent_active_count = 0 %}
        {% for agent in agents %}{% if agent.status == 'active' %}{% assign agent_active_count = agent_active_count | plus: 1 %}{% endif %}{% endfor %}
        <div class="os-section-header" style="color: #a78bfa">
            AI_COPROCESSORS
            <span class="header-sub">cognitive-cluster · Healthy · {{ agent_active_count }}/{{ agents.size }} Running</span>
        </div>
        <div class="cluster-dashboard">
            <div class="cluster-nodes">
                {% for item in agents %}
                <a href="{{ item.url }}" class="cluster-node" data-status="{{ item.status }}" target="_blank" rel="noopener noreferrer">
                    <div class="node-header">
                        <span class="node-badge {{ item.status }}">
                            <span class="node-dot"></span>
                            {% case item.status %}
                                {% when 'active' %}Running
                                {% when 'trying' %}Pending
                                {% when 'standby' %}Sleeping
                                {% when 'sold' %}Terminated
                                {% else %}{{ item.status | capitalize }}
                            {% endcase %}
                        </span>
                        <span class="node-name">{{ item.name }}</span>
                    </div>
                    <span class="node-image">{{ item.version }}</span>
                    <div class="node-resources">
                        <div class="resource-row">
                            <span class="resource-label">CPU</span>
                            <div class="resource-track">
                                <div class="resource-bar" style="--load: {{ item.throughput }};" data-load="{{ item.throughput | remove: '%' }}"></div>
                            </div>
                            <span class="resource-value">{{ item.throughput }}</span>
                        </div>
                        <div class="resource-row">
                            <span class="resource-label">MEM</span>
                            <div class="resource-track">
                                <div class="resource-bar latency-bar" style="--load: {% if item.latency == '0ms' %}5{% elsif item.latency == '1ms' %}10{% elsif item.latency == '2ms' %}15{% elsif item.latency == '12ms' %}40{% elsif item.latency == '30ms' %}50{% elsif item.latency == '45ms' %}60{% elsif item.latency == '120ms' %}90{% elsif item.latency == 'N/A' %}0{% else %}30{% endif %}%;"></div>
                            </div>
                            <span class="resource-value">{{ item.latency }}</span>
                        </div>
                        <div class="resource-row">
                            <span class="resource-label">IMG</span>
                            <span class="resource-text">{{ item.driver }}</span>
                        </div>
                    </div>
                    <div class="node-logs">
                        <span class="log-prefix">&gt;</span>
                        <span class="log-content">{{ item.desc }}</span>
                    </div>
                </a>
                {% endfor %}
            </div>
        </div>
    </div>

    <!-- System Components -->
    <div class="os-section">
        {% for group in site.data.uses %}
        {% if group.label == "FINANCIAL_SUBSYSTEM" %}{% continue %}{% endif %}
        {% if group.items.size > 0 %}
        <div class="os-section-header" style="color: {{ group.color }}">{{ group.label }} <span class="header-sub">{{ group.display_label }}</span></div>
        <div class="os-components">
            {% for item in group.items %}
            {% assign use_doc = site.uses | where: "slug", item.id | first %}
            {% assign item_name = use_doc.title | default: item.name %}
            {% assign item_url = use_doc.url | default: item.url %}
            {% assign item_official_url = use_doc.official_url | default: item.official_url %}
            {% assign item_version = use_doc.version | default: item.version %}
            {% assign item_driver = use_doc.status | default: item.driver %}
            {% assign domain = '' %}
            {% assign favicon_url = item_official_url | default: item_url %}
            {% if favicon_url contains "://" %}
            {% assign domain = favicon_url | remove: "https://" | remove: "http://" | split: "/" | first %}
            {% endif %}
            <div class="os-component" data-status="{{ item.status }}">
                <div class="component-header">
                    {% if domain != '' %}
                    <img class="component-favicon" src="https://www.google.com/s2/favicons?domain={{ domain }}&sz=32" alt="" loading="lazy">
                    {% endif %}
                    <div class="component-info">
                        {% if item_url %}
                        {% if item_url contains "://" %}
                        <a href="{{ item_url }}" class="component-name" target="_blank" rel="noopener noreferrer">{{ item_name }}</a>
                        {% else %}
                        <a href="{{ item_url | relative_url }}" class="component-name">{{ item_name }}</a>
                        {% endif %}
                        {% else %}
                        <span class="component-name">{{ item_name }}</span>
                        {% endif %}
                        <span class="component-version">{{ item_version }}</span>
                    </div>
                    <span class="component-led {{ item.status }}"></span>
                </div>
                <div class="component-params">
                    <span class="param"><span class="param-label">IO</span> {{ item.throughput }}</span>
                    <span class="param"><span class="param-label">LAT</span> {{ item.latency }}</span>
                    <span class="param"><span class="param-label">DRV</span> {{ item_driver }}</span>
                </div>
                {% if item.desc %}
                <div class="component-desc">{{ item.desc }}</div>
                {% endif %}
            </div>
            {% endfor %}
        </div>
        {% endif %}
        {% endfor %}
    </div>

    <!-- Financial Subsystem -->
    <div class="os-section">
        {% assign fin_group = site.data.uses | where: "label", "FINANCIAL_SUBSYSTEM" | first %}
        <div class="os-section-header" style="color: {{ fin_group.color }}">FINANCIAL_SUBSYSTEM <span class="header-sub">STOCKS</span></div>
        <div class="stock-panel">
            {% for item in fin_group.items %}
            <a href="{{ item.url }}" class="stock-row" target="_blank" rel="noopener noreferrer">
                <span class="stock-icon" aria-hidden="true">
                    {% if item.icon == "microsoft" %}
                    <svg viewBox="0 0 22 22" focusable="false">
                        <rect x="1" y="1" width="9" height="9" fill="#f25022"></rect>
                        <rect x="12" y="1" width="9" height="9" fill="#7fba00"></rect>
                        <rect x="1" y="12" width="9" height="9" fill="#00a4ef"></rect>
                        <rect x="12" y="12" width="9" height="9" fill="#ffb900"></rect>
                    </svg>
                    {% endif %}
                </span>
                <span class="stock-name">{{ item.name }}</span>
            </a>
            {% endfor %}
        </div>
    </div>

</section>

<link rel="stylesheet" href="{{ '/assets/css/status-dashboard.css' | relative_url }}?v={{ site.time | date: '%s' }}">
<script src="{{ '/assets/js/status-dashboard.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
