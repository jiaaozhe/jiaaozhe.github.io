/* ============================================================
   Personal OS Dashboard — Interactions
   ============================================================ */

function initDashboard() {
    initUptime();
    initRandomStatus();
    initCoreTempEasterEgg();
    initLogScroller();
    initStockCharts();
    initClusterNodes();
}

/* ---- Uptime Calculator ---- */
function initUptime() {
    const el = document.getElementById('system-uptime');
    if (!el) return;

    const birth = el.dataset.birth;
    if (!birth) return;

    const birthDate = new Date(birth);
    const now = new Date();

    let years = now.getFullYear() - birthDate.getFullYear();
    let lastBirthday = new Date(now.getFullYear(), birthDate.getMonth(), birthDate.getDate());

    if (now < lastBirthday) {
        years--;
        lastBirthday = new Date(now.getFullYear() - 1, birthDate.getMonth(), birthDate.getDate());
    }

    const diffMs = now - lastBirthday;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    el.textContent = years + 'y ' + days + 'd';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

/* ---- Random Status Bar Message ---- */
function initRandomStatus() {
    const messages = [
        'All systems nominal.',
        'Coffee levels critical.',
        'Procrastination daemon neutralized.',
        'Dopamine reserves at 78%.',
        'Focus protocol engaged.',
        'No bugs detected... yet.'
    ];
    const healthEl = document.querySelector('.os-metric-value');
    if (healthEl && healthEl.textContent.includes('%')) {
        const pick = messages[Math.floor(Math.random() * messages.length)];
        healthEl.setAttribute('title', pick);
    }
}

/* ---- Core Temperature Easter Egg ---- */
function initCoreTempEasterEgg() {
    const widget = document.getElementById('core-temp');
    const tempVal = document.getElementById('temp-value');
    if (!widget || !tempVal) return;

    const baseTemp = parseInt(tempVal.dataset.base || '42', 10);
    let running = false;

    widget.addEventListener('click', () => {
        if (running) return;
        running = true;
        widget.classList.add('overheating');

        let temp = baseTemp;
        const climb = setInterval(() => {
            temp += 3;
            tempVal.textContent = temp + '°C';
            if (temp >= 85) {
                clearInterval(climb);
                tempVal.textContent = '85°C';
                showToast('⚠️ EMERGENCY SHUTDOWN IMMINENT');
                setTimeout(() => {
                    widget.classList.remove('overheating');
                    recoverTemp(baseTemp);
                }, 2000);
            }
        }, 60);
    });

    function recoverTemp(target) {
        let temp = 85;
        const drop = setInterval(() => {
            temp -= 4;
            if (temp <= target) {
                temp = target;
                clearInterval(drop);
                showToast('✅ Crisis averted. Thermal normal.');
                running = false;
            }
            tempVal.textContent = temp + '°C';
        }, 50);
    }

    function showToast(msg) {
        let toast = document.getElementById('os-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'os-toast';
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--surface);
                color: var(--text);
                border: 1px solid var(--line);
                padding: 10px 20px;
                border-radius: 6px;
                font-family: var(--mono-font);
                font-size: 13px;
                z-index: 9999;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                white-space: nowrap;
            `;
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        requestAnimationFrame(() => { toast.style.opacity = '1'; });
        setTimeout(() => { toast.style.opacity = '0'; }, 2200);
    }
}

/* ---- System Log Scroller ---- */
function initLogScroller() {
    const body = document.getElementById('terminal-body');
    if (!body) return;

    const pool = [
        { level: 'INFO',  message: 'Background thread idle. Awaiting input.' },
        { level: 'INFO',  message: 'Neural net pruning cycle complete.' },
        { level: 'WARN',  message: 'Distraction detected. Focus shield activated.' },
        { level: 'INFO',  message: 'Garbage collection: closed 3 browser tabs.' },
        { level: 'INFO',  message: 'Memory consolidation: dream buffer flushed.' },
        { level: 'WARN',  message: 'Caffeine half-life approaching. Refill advised.' },
        { level: 'ERROR', message: 'Motivation not found in $PATH.' },
        { level: 'INFO',  message: 'Sync complete. Local state matches remote.' },
        { level: 'INFO',  message: 'New idea enqueued for review.' },
        { level: 'WARN',  message: 'Deadline approaching. Velocity increasing.' }
    ];

    function pad2(n) { return n < 10 ? '0' + n : n; }

    function nowTime() {
        const d = new Date();
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function appendLog(entry) {
        const line = document.createElement('div');
        line.className = 'log-line';
        line.innerHTML = `
            <span class="log-time">[${nowTime()}]</span>
            <span class="log-level ${entry.level}">${entry.level}</span>
            <span class="log-message">${entry.message}</span>
        `;
        const cursor = body.querySelector('.log-cursor');
        if (cursor) {
            body.insertBefore(line, cursor);
        } else {
            body.appendChild(line);
        }
        body.scrollTop = body.scrollHeight;

        // Trim old lines
        const lines = body.querySelectorAll('.log-line');
        if (lines.length > 30) {
            lines[0].remove();
        }
    }

    // Random interval: 8-15 seconds
    function schedule() {
        const delay = 8000 + Math.random() * 7000;
        setTimeout(() => {
            const pick = pool[Math.floor(Math.random() * pool.length)];
            appendLog(pick);
            schedule();
        }, delay);
    }

    schedule();
}

/* ---- Mini Stock Charts ---- */
function initStockCharts() {
    const dataEl = document.getElementById('stock-data');
    if (!dataEl) return;

    let stocks = [];
    try {
        stocks = JSON.parse(dataEl.textContent);
    } catch (e) {
        return;
    }

    const PAD = 2;

    document.querySelectorAll('.stock-row').forEach(function(row) {
        const symbol = row.dataset.symbol;
        const stock = stocks.find(function(s) { return s.symbol === symbol; });
        const svg = row.querySelector('.stock-chart');
        if (!stock || !stock.history || stock.history.length === 0 || !svg) return;

        const history = stock.history;
        const svgW = svg.clientWidth || 120;
        const svgH = svg.clientHeight || 90;
        svg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);

        const candleW = svgW / history.length;

        var maxHigh = -Infinity;
        var minLow = Infinity;
        history.forEach(function(d) {
            if (d.h > maxHigh) maxHigh = d.h;
            if (d.l < minLow) minLow = d.l;
        });

        const range = maxHigh - minLow || 1;
        var svgHTML = '';

        history.forEach(function(day, i) {
            const x = i * candleW;
            const xCenter = x + candleW / 2;
            const wickX = xCenter;

            const yHigh = PAD + (1 - (day.h - minLow) / range) * (svgH - 2 * PAD);
            const yLow = PAD + (1 - (day.l - minLow) / range) * (svgH - 2 * PAD);
            const yOpen = PAD + (1 - (day.o - minLow) / range) * (svgH - 2 * PAD);
            const yClose = PAD + (1 - (day.c - minLow) / range) * (svgH - 2 * PAD);

            const isUp = day.c >= day.o;
            const color = isUp ? 'var(--dash-chart-up)' : 'var(--dash-chart-down)';

            // Wick
            svgHTML += '<line x1="' + wickX.toFixed(1) + '" y1="' + yHigh.toFixed(1) + '" x2="' + wickX.toFixed(1) + '" y2="' + yLow.toFixed(1) + '" stroke="' + color + '" stroke-width="1"/>';

            // Body
            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);
            const bodyWidth = Math.max(candleW - 2, 1);
            svgHTML += '<rect x="' + (x + 1).toFixed(1) + '" y="' + bodyTop.toFixed(1) + '" width="' + bodyWidth.toFixed(1) + '" height="' + bodyHeight.toFixed(1) + '" fill="' + color + '"/>';
        });

        svg.innerHTML = svgHTML;
    });
}

/* ---- Cluster Node Resource Bars ---- */
function initClusterNodes() {
    document.querySelectorAll('.cluster-node').forEach(function(node) {
        const bars = node.querySelectorAll('.resource-bar[data-load]');
        bars.forEach(function(bar) {
            const baseLoad = parseInt(bar.dataset.load, 10) || 0;
            setInterval(function() {
                const jitter = (Math.random() - 0.5) * 8;
                const newLoad = Math.max(2, Math.min(100, baseLoad + jitter));
                bar.style.setProperty('--load', newLoad + '%');
            }, 2500 + Math.random() * 1500);
        });
    });
}
