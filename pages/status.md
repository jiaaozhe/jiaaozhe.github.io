---
layout: default
title: 状态
permalink: /status/
---

<section class="os-dashboard">
    <!-- System Status Bar -->
    <div class="os-status-bar">
        <div class="os-metric">
            <span class="os-metric-icon">&#128267;</span>
            <div class="os-metric-text">
                <span class="os-metric-label">System Health</span>
                <span class="os-metric-value">{{ site.data.now.status.health }}</span>
            </div>
        </div>
        <div class="os-metric">
            <span class="os-metric-icon">&#9201;</span>
            <div class="os-metric-text">
                <span class="os-metric-label">Uptime</span>
                <span class="os-metric-value" id="system-uptime" data-birth="{{ site.data.now.system.birth_date }}">--</span>
            </div>
        </div>
        <div class="os-metric">
            <span class="os-metric-icon">&#128202;</span>
            <div class="os-metric-text">
                <span class="os-metric-label">Load Avg</span>
                <span class="os-metric-value">{{ site.data.now.system.load_average | join: ', ' }}</span>
            </div>
        </div>
        <div class="os-metric">
            <span class="os-metric-icon">&#127760;</span>
            <div class="os-metric-text">
                <span class="os-metric-label">Ping</span>
                <span class="os-metric-value">127.0.0.1 &#11015; 0.1ms</span>
            </div>
        </div>
    </div>

    <!-- CPU + RAM Row -->
    <div class="os-process-row">
        <!-- CPU / Core Processes -->
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

        <!-- RAM / Trial Zone -->
        <div class="os-section">
            <div class="os-section-header">RAM_TRIAL</div>
            {% for item in site.data.now.trying.items %}
            <div class="ram-trial">
                <div class="ram-header">
                    <span class="ram-name">{{ item.display_name }}</span>
                    <span class="ram-pid">PID {{ item.pid }}</span>
                    <span class="ram-mem">{{ item.allocated_memory }}</span>
                </div>
                <div class="ram-beaker">
                    <div class="ram-liquid" style="--progress: {{ item.progress }}%; --liquid-color: {{ item.wave_color }};">
                        <div class="ram-surface"></div>
                        <div class="ram-bubbles">
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                    </div>
                    <div class="ram-scale">
                        <span></span><span></span><span></span><span></span><span></span>
                    </div>
                </div>
                <div class="ram-meta">
                    <span><span class="meta-label">DEPS</span> {{ item.dependencies | join: ', ' }}</span>
                    <span><span class="meta-label">PROGRESS</span> {{ item.progress }}%</span>
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
            {% assign domain = '' %}
            {% assign favicon_url = item.official_url | default: item.url %}
            {% if favicon_url contains "://" %}
            {% assign domain = favicon_url | remove: "https://" | remove: "http://" | split: "/" | first %}
            {% endif %}
            <div class="os-component" data-status="{{ item.status }}">
                <div class="component-header">
                    {% if domain != '' %}
                    <img class="component-favicon" src="https://www.google.com/s2/favicons?domain={{ domain }}&sz=32" alt="" loading="lazy">
                    {% endif %}
                    <div class="component-info">
                        {% if item.url %}
                        {% if item.url contains "://" %}
                        <a href="{{ item.url }}" class="component-name" target="_blank" rel="noopener noreferrer">{{ item.name }}</a>
                        {% else %}
                        <a href="{{ item.url | relative_url }}" class="component-name">{{ item.name }}</a>
                        {% endif %}
                        {% else %}
                        <span class="component-name">{{ item.name }}</span>
                        {% endif %}
                        <span class="component-version">{{ item.version }}</span>
                    </div>
                    <span class="component-led {{ item.status }}"></span>
                </div>
                <div class="component-params">
                    <span class="param"><span class="param-label">IO</span> {{ item.throughput }}</span>
                    <span class="param"><span class="param-label">LAT</span> {{ item.latency }}</span>
                    <span class="param"><span class="param-label">DRV</span> {{ item.driver }}</span>
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
            {% assign stock = site.data.stocks | where: "symbol", item.version | first %}
            {% if item.url %}
            <a href="{{ item.url }}" class="stock-row" data-symbol="{{ item.version }}" target="_blank" rel="noopener noreferrer">
            {% else %}
            {% assign yahoo_symbol = item.version %}
            {% if stock.market == 'SH' %}{% assign yahoo_symbol = item.version | append: '.SS' %}{% elsif stock.market == 'SZ' %}{% assign yahoo_symbol = item.version | append: '.SZ' %}{% endif %}
            <a href="https://finance.yahoo.com/quote/{{ yahoo_symbol }}/" class="stock-row" data-symbol="{{ item.version }}" target="_blank" rel="noopener noreferrer">
            {% endif %}
                <div class="stock-header">
                    <div class="stock-info">
                        <span class="stock-name">{{ item.name | split: "(" | first | strip }}</span>
                        <span class="stock-symbol">{{ item.version }}</span>
                    </div>
                    <div class="stock-price">
                        {% if stock %}
                        <span class="stock-current {% if stock.change_pct >= 0 %}up{% else %}down{% endif %}">{{ stock.currency }}{{ stock.current }}</span>
                        <span class="stock-change {% if stock.change_pct >= 0 %}up{% else %}down{% endif %}">{% if stock.change_pct >= 0 %}+{% endif %}{{ stock.change_pct }}%</span>
                        {% else %}
                        <span class="stock-current offline">--</span>
                        {% endif %}
                    </div>
                </div>
                <svg class="stock-chart"></svg>
                {% if item.desc %}
                <span class="stock-desc">{{ item.desc }}</span>
                {% endif %}
            </a>
            {% endfor %}
        </div>
        <script id="stock-data" type="application/json">
            {{ site.data.stocks | jsonify }}
        </script>
    </div>

    <!-- System Log -->
    <div class="os-section">
        <div class="os-section-header">SYSTEM_LOG</div>
        <div class="os-terminal" id="system-log">
            <div class="terminal-header">
                <span class="terminal-btn close"></span>
                <span class="terminal-btn minimize"></span>
                <span class="terminal-btn maximize"></span>
                <span class="terminal-title">jiaaozhe@brain:~$ tail -f /var/log/life.log</span>
            </div>
            <div class="terminal-body" id="terminal-body">
                {% for log in site.data.now.system.log_messages %}
                <div class="log-line">
                    <span class="log-time">[{{ log.time }}]</span>
                    <span class="log-level {{ log.level }}">{{ log.level }}</span>
                    <span class="log-message">{{ log.message }}</span>
                </div>
                {% endfor %}
                <div class="log-cursor"></div>
            </div>
        </div>
    </div>
</section>

<link rel="stylesheet" href="{{ '/assets/css/status-dashboard.css' | relative_url }}?v={{ site.time | date: '%s' }}">
<script src="{{ '/assets/js/status-dashboard.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
