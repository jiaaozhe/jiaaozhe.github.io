(function() {
    const configElement = document.getElementById('tool-runner-config');
    const frame = document.querySelector('[data-tool-frame]');
    const stage = document.querySelector('[data-tool-stage]');
    const loading = document.querySelector('[data-tool-loading]');
    const errorPanel = document.querySelector('[data-tool-error]');
    const errorMessage = document.querySelector('[data-tool-error-message]');
    const retryButton = document.querySelector('[data-tool-retry]');
    const fullscreenButton = document.querySelector('[data-tool-fullscreen]');
    const statusText = document.querySelector('[data-tool-status]');
    const statusDot = document.querySelector('.tool-runner-dot');

    if (!configElement || !frame || !stage) {
        return;
    }

    const DB_NAME = 'site-tool-state';
    const DB_VERSION = 1;
    const STORE_NAME = 'tools';
    const MAX_STATE_BYTES = 12 * 1024 * 1024;
    const config = JSON.parse(configElement.textContent || '{}');
    let activeToken = '';
    let activeState = {};
    let stateReady = false;
    let bootTimer = null;
    let dbPromise = null;
    let writeQueue = Promise.resolve();
    let pendingWrites = [];
    let writeTimer = null;
    let hydrationToken = '';
    const jobs = window.ToolJobs.create(config.id, function(result) { postToTool('tool-host:task-result', result); });
    const pdfHost = config.id === 'pdf-page-manager' && window.ToolPdfHost ? window.ToolPdfHost.create(function(result, transfer) {
        postToTool('tool-host:task-result', result, transfer);
    }, function(message) {
        postToTool('tool-host:pdf-error', { message: message });
        setStatus(message, 'error');
    }) : null;

    function normalizedTheme(value) {
        return value === 'dark' ? 'dark' : 'light';
    }

    function activeTheme() {
        return normalizedTheme(document.documentElement.getAttribute('data-theme'));
    }

    function setStatus(text, state) {
        if (statusText) statusText.textContent = text;
        if (statusDot) statusDot.dataset.state = state;
    }

    function randomToken() {
        const bytes = new Uint8Array(18);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, function(value) {
            return value.toString(16).padStart(2, '0');
        }).join('');
    }

    function openDatabase() {
        if (!('indexedDB' in window)) {
            return Promise.reject(new Error('当前浏览器不支持隔离存储。'));
        }

        if (!dbPromise) {
            dbPromise = new Promise(function(resolve, reject) {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onupgradeneeded = function() {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                request.onsuccess = function() {
                    const db = request.result;
                    db.onversionchange = function() { db.close(); dbPromise = null; };
                    resolve(db);
                };
                request.onerror = function() { reject(request.error); };
                request.onblocked = function() { setStatus('请关闭旧版工具标签页以启用存储', 'error'); };
            }).catch(function(error) { dbPromise = null; throw error; });
        }

        return dbPromise;
    }

    async function readState() {
        const db = await openDatabase();

        return new Promise(function(resolve, reject) {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const request = transaction.objectStore(STORE_NAME).get(config.id);
            request.onsuccess = function() {
                const value = request.result;
                resolve(value && typeof value === 'object' ? value : {});
            };
            request.onerror = function() { reject(request.error); };
        });
    }

    function flushStateWrites() {
        window.clearTimeout(writeTimer);
        writeTimer = null;
        if (!pendingWrites.length) return;
        const batch = pendingWrites;
        pendingWrites = [];
        writeQueue = writeQueue.catch(function() {}).then(async function() {
            try {
                const db = await openDatabase();
                await window.ToolStateStore.commit(db, config.id, batch.map(function(item) { return item.message; }), MAX_STATE_BYTES);
                batch.forEach(function(item) {
                    if (item.token === activeToken) postToTool('tool-host:storage-saved', { requestId: item.message.requestId });
                });
                if (batch.some(function(item) { return item.token === activeToken; })) setStatus('状态已保存', 'ready');
            } catch (error) {
                batch.forEach(function(item) {
                    if (item.token === activeToken) rejectStorage(error.message || String(error), item.message.requestId);
                });
                if (batch.some(function(item) { return item.token === activeToken; })) setStatus('状态保存失败，请重试', 'error');
            }
        });
    }

    function queueStateWrite(message) {
        pendingWrites.push({ token: activeToken, message: message });
        if (writeTimer === null) writeTimer = window.setTimeout(flushStateWrites, 25);
    }

    function validKey(value) {
        return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
    }

    function postToTool(type, payload, transfer) {
        if (!frame.contentWindow) return;
        frame.contentWindow.postMessage(Object.assign({
            type: type,
            token: activeToken
        }, payload || {}), '*', transfer || []);
    }

    function rejectStorage(message, requestId) {
        postToTool('tool-host:storage-error', { message: message, requestId: requestId });
    }

    async function hydrateTool() {
        const token = activeToken;
        if (hydrationToken === token) return;
        hydrationToken = token;
        let state;
        try {
            await writeQueue;
            state = await readState();
        } catch (error) {
            state = {};
            console.error(error);
        }
        if (token !== activeToken) return;
        activeState = state;
        stateReady = true;
        postToTool('tool-host:init', {
            protocol: 2,
            state: activeState,
            theme: activeTheme()
        });
    }

    window.addEventListener('message', function(event) {
        if (event.source !== frame.contentWindow) return;

        const message = event.data;
        if (!message || message.token !== activeToken || typeof message.type !== 'string') return;

        if (message.type === 'tool:ready') {
            hydrateTool();
            return;
        }

        if (message.type === 'tool:app-ready') {
            window.clearTimeout(bootTimer);
            if (loading) loading.classList.add('is-hidden');
            setStatus('隔离运行中', 'ready');
            return;
        }

        if (message.type === 'tool:runtime-error') {
            console.error('Tool runtime:', message.message || 'unknown error');
            setStatus('工具发生错误，请查看工具内提示', 'error');
            return;
        }

        if (!stateReady) return;

        if (message.type === 'tool:task') { jobs.run(message); return; }
        if (message.type === 'tool:task-cancel') { jobs.cancel(); return; }
        if (message.type === 'tool:pdf-worker' && pdfHost) { pdfHost.open(message.requestId); return; }
        if (message.type === 'tool:pdf-release' && pdfHost) { pdfHost.release(message.id); return; }

        if (message.type === 'tool:storage-set') {
            if (!validKey(message.key)) {
                rejectStorage('无效的存储键。', message.requestId);
                return;
            }
            queueStateWrite({ type: message.type, key: message.key, value: String(message.value), requestId: message.requestId });
            return;
        }

        if (message.type === 'tool:storage-batch') {
            if (!message.values || typeof message.values !== 'object' || !Object.keys(message.values).every(validKey)) {
                rejectStorage('无效的存储键。', message.requestId);
                return;
            }
            const values = Object.create(null);
            Object.keys(message.values).forEach(function(key) { values[key] = String(message.values[key]); });
            queueStateWrite({ type: message.type, values: values, requestId: message.requestId });
            return;
        }

        if (message.type === 'tool:storage-remove') {
            if (!validKey(message.key)) { rejectStorage('无效的存储键。', message.requestId); return; }
            queueStateWrite({ type: message.type, key: message.key, requestId: message.requestId });
            return;
        }

        if (message.type === 'tool:storage-clear') {
            queueStateWrite({ type: message.type, requestId: message.requestId });
        }
    });

    function showError(error) {
        window.clearTimeout(bootTimer);
        setStatus('启动失败', 'error');
        if (loading) loading.classList.add('is-hidden');
        if (errorMessage) errorMessage.textContent = error && error.message ? error.message : String(error);
        if (errorPanel) errorPanel.hidden = false;
    }

    async function boot() {
        jobs.cancel();
        if (pdfHost) pdfHost.dispose();
        flushStateWrites();
        window.clearTimeout(bootTimer);
        stateReady = false;
        activeState = {};
        activeToken = randomToken();
        if (errorPanel) errorPanel.hidden = true;
        if (loading) loading.classList.remove('is-hidden');
        setStatus('正在建立隔离环境', 'loading');

        try {
            const entry = new URL(config.entry, window.location.href);
            if (config.version) entry.searchParams.set('v', config.version);
            const hash = new URLSearchParams(entry.hash.replace(/^#/, ''));
            hash.set('toolHostToken', activeToken);
            entry.hash = hash.toString();
            frame.src = entry.href;

            bootTimer = window.setTimeout(function() {
                showError(new Error('工具启动超时，请重试。'));
            }, 30000);
        } catch (error) {
            showError(error);
        }
    }

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') flushStateWrites();
    });
    window.addEventListener('pagehide', flushStateWrites);
    window.addEventListener('pagehide', function() { jobs.cancel(); });
    window.addEventListener('pagehide', function() { if (pdfHost) pdfHost.dispose(); });

    if (retryButton) {
        retryButton.addEventListener('click', boot);
    }

    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', function() {
            if (document.fullscreenElement) {
                document.exitFullscreen();
                return;
            }

            if (stage.requestFullscreen) {
                stage.requestFullscreen();
            }
        });
    }

    window.addEventListener('storage', function(event) {
        if (event.key !== 'theme') return;
        const theme = normalizedTheme(event.newValue || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
        document.documentElement.setAttribute('data-theme', theme);
        if (stateReady) postToTool('tool-host:theme', { theme: theme });
    });

    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const handleColorScheme = function(event) {
        if (localStorage.getItem('theme')) return;
        const theme = event.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        if (stateReady) postToTool('tool-host:theme', { theme: theme });
    };
    if (typeof colorScheme.addEventListener === 'function') {
        colorScheme.addEventListener('change', handleColorScheme);
    } else if (typeof colorScheme.addListener === 'function') {
        colorScheme.addListener(handleColorScheme);
    }

    boot();
})();
