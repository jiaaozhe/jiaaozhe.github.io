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
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function() { reject(request.error); };
            });
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

    async function writeState(snapshot) {
        const db = await openDatabase();

        return new Promise(function(resolve, reject) {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const request = transaction.objectStore(STORE_NAME).put(snapshot, config.id);
            request.onsuccess = function() { resolve(); };
            request.onerror = function() { reject(request.error); };
        });
    }

    function queueStateWrite() {
        const snapshot = Object.assign({}, activeState);
        writeQueue = writeQueue.catch(function() {}).then(function() {
            return writeState(snapshot);
        }).catch(function(error) {
            setStatus('状态保存失败', 'error');
            console.error(error);
        });
    }

    function validKey(value) {
        return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
    }

    function stateSize(value) {
        return new TextEncoder().encode(JSON.stringify(value)).length;
    }

    function postToTool(type, payload) {
        if (!frame.contentWindow) return;
        frame.contentWindow.postMessage(Object.assign({
            type: type,
            token: activeToken
        }, payload || {}), '*');
    }

    function rejectStorage(message) {
        postToTool('tool-host:storage-error', { message: message });
    }

    async function hydrateTool() {
        try {
            activeState = await readState();
        } catch (error) {
            activeState = {};
            console.error(error);
        }

        stateReady = true;
        postToTool('tool-host:init', { state: activeState });
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
            return;
        }

        if (!stateReady) return;

        if (message.type === 'tool:storage-set') {
            if (!validKey(message.key)) {
                rejectStorage('无效的存储键。');
                return;
            }

            const nextState = Object.assign({}, activeState, {
                [message.key]: String(message.value)
            });

            if (stateSize(nextState) > MAX_STATE_BYTES) {
                rejectStorage('工具状态超过 12 MB 限制。');
                return;
            }

            activeState = nextState;
            queueStateWrite();
            return;
        }

        if (message.type === 'tool:storage-remove') {
            if (!validKey(message.key)) return;
            const nextState = Object.assign({}, activeState);
            delete nextState[message.key];
            activeState = nextState;
            queueStateWrite();
            return;
        }

        if (message.type === 'tool:storage-clear') {
            activeState = {};
            queueStateWrite();
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
        stateReady = false;
        activeState = {};
        activeToken = randomToken();
        if (errorPanel) errorPanel.hidden = true;
        if (loading) loading.classList.remove('is-hidden');
        setStatus('正在建立隔离环境', 'loading');

        try {
            const response = await fetch(config.entry, { method: 'HEAD', cache: 'no-cache' });
            if (!response.ok) {
                throw new Error('工具入口返回 HTTP ' + response.status + '。');
            }

            const entry = new URL(config.entry, window.location.href);
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

    boot();
})();
