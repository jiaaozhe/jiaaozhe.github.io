/* ============================================================
   Personal OS Dashboard — Interactions
   ============================================================ */

function initDashboard() {
    initCoreTempEasterEgg();
    initClusterNodes();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
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
