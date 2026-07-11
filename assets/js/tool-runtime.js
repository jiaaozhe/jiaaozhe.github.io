(function() {
    const script = document.currentScript;
    const runnerUrl = script ? script.dataset.runnerUrl : '';
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = params.get('toolHostToken') || '';
    const cache = Object.create(null);
    let hydrated = false;
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
            if (cache[normalized] === next) return;
            cache[normalized] = next;
            post('tool:storage-set', { key: normalized, value: next });
        },
        removeItem: function(key) {
            const normalized = String(key);
            if (!validKey(normalized)) return;
            delete cache[normalized];
            post('tool:storage-remove', { key: normalized });
        },
        clear: function() {
            Object.keys(cache).forEach(function(key) { delete cache[key]; });
            post('tool:storage-clear');
        },
        key: function(index) {
            return Object.keys(cache)[index] || null;
        }
    };

    Object.defineProperty(toolStorage, 'length', {
        get: function() { return Object.keys(cache).length; }
    });

    window.toolStorage = Object.freeze(toolStorage);
    window.toolHost = Object.freeze({
        markReady: function() { post('tool:app-ready'); },
        reportError: function(error) {
            post('tool:runtime-error', {
                message: error && error.message ? error.message : String(error)
            });
        }
    });

    window.addEventListener('message', function(event) {
        if (event.source !== window.parent) return;

        const message = event.data;
        if (!message || message.token !== token || typeof message.type !== 'string') return;

        if (message.type === 'tool-host:init' && !hydrated) {
            const state = message.state && typeof message.state === 'object' ? message.state : {};
            Object.keys(state).forEach(function(key) {
                if (validKey(key)) cache[key] = String(state[key]);
            });
            hydrated = true;
            resolveReady(toolStorage);
            return;
        }

        if (message.type === 'tool-host:storage-error') {
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
