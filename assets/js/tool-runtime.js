(function() {
    const script = document.currentScript;
    const runnerUrl = script ? script.dataset.runnerUrl : '';
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = params.get('toolHostToken') || '';
    const cache = Object.create(null);
    const committed = Object.create(null);
    const pending = new Map();
    let nextRequestId = 0;
    let hydrated = false;
    let activeTheme = '';
    let resolveReady = null;
    let rejectReady = null;
    const readyPromise = new Promise(function(resolve, reject) {
        resolveReady = resolve;
        rejectReady = reject;
    });

    function redirectDirectAccess() {
        document.documentElement.hidden = true;
        window.toolStorage = Object.freeze({
            ready: function() { return new Promise(function() {}); },
            getItem: function() { return null; },
            setItem: function() {},
            removeItem: function() {},
            clear: function() {}
        });

        if (runnerUrl) {
            window.location.replace(new URL(runnerUrl, window.location.href).href);
        }
    }

    if (window.parent === window || !token) {
        redirectDirectAccess();
        return;
    }

    function post(type, payload) {
        window.parent.postMessage(Object.assign({
            type: type,
            token: token
        }, payload || {}), '*');
    }

    function validKey(value) {
        return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
    }

    function normalizeTheme(value) {
        return value === 'dark' ? 'dark' : 'light';
    }

    function applyTheme(value) {
        activeTheme = normalizeTheme(value);

        if (document.documentElement && typeof document.documentElement.setAttribute === 'function') {
            document.documentElement.setAttribute('data-theme', activeTheme);
        }
        if (document.body && typeof document.body.setAttribute === 'function') {
            document.body.setAttribute('data-theme', activeTheme);
        }
    }

    function applyOperation(target, operation) {
        if (operation.type === 'tool:storage-clear') {
            Object.keys(target).forEach(function(key) { delete target[key]; });
        } else if (operation.type === 'tool:storage-remove') {
            delete target[operation.key];
        } else if (operation.type === 'tool:storage-batch') {
            Object.assign(target, operation.values);
        } else {
            target[operation.key] = operation.value;
        }
    }

    function rebuildCache() {
        Object.keys(cache).forEach(function(key) { delete cache[key]; });
        Object.assign(cache, committed);
        pending.forEach(function(entry) { applyOperation(cache, entry.operation); });
    }

    function settleWrite(requestId, error) {
        const entry = pending.get(requestId);
        if (!entry) return;
        window.clearTimeout(entry.timer);
        if (!error) applyOperation(committed, entry.operation);
        pending.delete(requestId);
        rebuildCache();
        if (error) entry.reject(error);
        else entry.resolve();
    }

    function write(type, payload) {
        const requestId = ++nextRequestId;
        const operation = Object.assign({ type: type }, payload);
        let resolve, reject;
        const promise = new Promise(function(onResolve, onReject) { resolve = onResolve; reject = onReject; });
        // Existing tools may ignore the promise; callers that display "saved" await it.
        promise.catch(function() {});
        const entry = { operation: operation, promise: promise, resolve: resolve, reject: reject };
        pending.set(requestId, entry);
        applyOperation(cache, operation);
        entry.timer = window.setTimeout(function() {
            settleWrite(requestId, new Error('保存确认超时，请重试。'));
        }, 15000);
        readyPromise.then(function() {
            if (pending.has(requestId)) post(type, Object.assign({ requestId: requestId }, payload));
        }, function(error) { settleWrite(requestId, error); });
        return promise;
    }

    const toolStorage = {
        ready: function() {
            return readyPromise;
        },
        getItem: function(key) {
            const normalized = String(key);
            return Object.prototype.hasOwnProperty.call(cache, normalized) ? cache[normalized] : null;
        },
        setItem: function(key, value) {
            const normalized = String(key);
            if (!validKey(normalized)) throw new Error('Invalid tool storage key.');
            const next = String(value);
            if (cache[normalized] === next) return toolStorage.flush();
            return write('tool:storage-set', { key: normalized, value: next });
        },
        setItems: function(values) {
            const normalized = Object.create(null);
            Object.keys(values).forEach(function(key) {
                if (!validKey(key)) throw new Error('Invalid tool storage key.');
                normalized[key] = String(values[key]);
            });
            return write('tool:storage-batch', { values: normalized });
        },
        flush: function() {
            const promise = Promise.all(Array.from(pending.values(), function(entry) { return entry.promise; }));
            promise.catch(function() {});
            return promise;
        },
        removeItem: function(key) {
            const normalized = String(key);
            if (!validKey(normalized)) return;
            return write('tool:storage-remove', { key: normalized });
        },
        clear: function() {
            return write('tool:storage-clear');
        },
        key: function(index) {
            return Object.keys(cache)[index] || null;
        }
    };

    Object.defineProperty(toolStorage, 'length', {
        get: function() { return Object.keys(cache).length; }
    });

    window.toolStorage = Object.freeze(toolStorage);
    const scripts = new Map();
    const tasks = new Map();
    let nextTaskId = 0;
    const pdfFailures = new Set();
    const toolHost = {
        openPdfWorker: function() {
            const requestId = ++nextTaskId;
            return readyPromise.then(function() {
                return new Promise(function(resolve, reject) {
                    tasks.set(requestId, { resolve: resolve, reject: reject });
                    post('tool:pdf-worker', { requestId: requestId });
                });
            });
        },
        releasePdfWorker: function(id) { post('tool:pdf-release', { id: id }); },
        onPdfError: function(callback) { pdfFailures.add(callback); return function() { pdfFailures.delete(callback); }; },
        runTask: function(method, payload) {
            const requestId = ++nextTaskId;
            return readyPromise.then(function() {
                return new Promise(function(resolve, reject) {
                    tasks.set(requestId, { resolve: resolve, reject: reject });
                    post('tool:task', { requestId: requestId, method: method, payload: payload });
                });
            });
        },
        cancelTasks: function() { post('tool:task-cancel'); },
        loadScript: function(src, options) {
            if (scripts.has(src)) return scripts.get(src);
            const promise = new Promise(function(resolve, reject) {
                const element = document.createElement('script');
                const timer = window.setTimeout(function() {
                    element.remove();
                    reject(new Error('加载依赖超时，请重试。'));
                }, 20000);
                element.src = src;
                if (options && options.integrity) {
                    element.integrity = options.integrity;
                    element.crossOrigin = 'anonymous';
                }
                element.onload = function() { window.clearTimeout(timer); resolve(); };
                element.onerror = function() {
                    window.clearTimeout(timer);
                    element.remove();
                    reject(new Error('无法加载工具依赖，请重试。'));
                };
                document.head.appendChild(element);
            }).catch(function(error) { scripts.delete(src); throw error; });
            scripts.set(src, promise);
            return promise;
        },
        markReady: function() { post('tool:app-ready'); },
        reportError: function(error) {
            post('tool:runtime-error', {
                message: error && error.message ? error.message : String(error)
            });
        }
    };

    Object.defineProperty(toolHost, 'theme', {
        get: function() { return activeTheme; }
    });

    window.toolHost = Object.freeze(toolHost);

    window.addEventListener('message', function(event) {
        if (event.source !== window.parent) return;

        const message = event.data;
        if (!message || message.token !== token || typeof message.type !== 'string') return;
        if (message.type === 'tool-host:pdf-error') {
            pdfFailures.forEach(function(callback) { callback(new Error(message.message)); });
            return;
        }

        if (message.type === 'tool-host:task-result') {
            const task = tasks.get(message.requestId);
            if (!task) return;
            tasks.delete(message.requestId);
            if (message.error) {
                const error = new Error(message.error);
                error.name = message.cancelled ? 'AbortError' : 'Error';
                task.reject(error);
            } else task.resolve(message.result);
            return;
        }

        if (message.type === 'tool-host:init' && !hydrated) {
            applyTheme(message.theme);
            const state = message.state && typeof message.state === 'object' ? message.state : {};
            Object.keys(state).forEach(function(key) {
                if (validKey(key)) committed[key] = String(state[key]);
            });
            rebuildCache();
            hydrated = true;
            resolveReady(toolStorage);
            return;
        }

        if (message.type === 'tool-host:theme') {
            applyTheme(message.theme);
            return;
        }

        if (message.type === 'tool-host:storage-saved') {
            settleWrite(message.requestId);
        }
        if (message.type === 'tool-host:storage-error') {
            settleWrite(message.requestId, new Error(message.message || 'Tool storage error.'));
            console.error(message.message || 'Tool storage error.');
        }
    });

    window.addEventListener('error', function(event) {
        window.toolHost.reportError(event.error || event.message);
    });
    window.addEventListener('unhandledrejection', function(event) {
        window.toolHost.reportError(event.reason || 'Unhandled promise rejection');
    });

    window.setTimeout(function() {
        if (!hydrated) rejectReady(new Error('Tool host handshake timed out.'));
    }, 10000);

    post('tool:ready');
})();
