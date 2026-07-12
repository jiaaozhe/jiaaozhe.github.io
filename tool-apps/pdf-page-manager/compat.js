(function() {
    'use strict';

    function define(target, name, value) {
        if (typeof target[name] === 'function') return;
        Object.defineProperty(target, name, {
            configurable: true,
            writable: true,
            value: value
        });
    }

    define(Promise, 'try', function(callback) {
        const args = Array.prototype.slice.call(arguments, 1);
        return new Promise(function(resolve) {
            resolve(callback.apply(null, args));
        });
    });

    define(Promise, 'withResolvers', function() {
        let resolve;
        let reject;
        const promise = new Promise(function(nextResolve, nextReject) {
            resolve = nextResolve;
            reject = nextReject;
        });
        return { promise: promise, resolve: resolve, reject: reject };
    });

    if (typeof AbortSignal !== 'undefined' && typeof AbortController !== 'undefined') {
        define(AbortSignal, 'any', function(signals) {
            const controller = new AbortController();
            const abort = function(signal) {
                if (!controller.signal.aborted) controller.abort(signal.reason);
            };
            for (const signal of signals) {
                if (signal.aborted) {
                    abort(signal);
                    break;
                }
                signal.addEventListener('abort', function() { abort(signal); }, { once: true });
            }
            return controller.signal;
        });
    }

    define(URL, 'parse', function(value, base) {
        try {
            return base === undefined ? new URL(value) : new URL(value, base);
        } catch (error) {
            return null;
        }
    });

    define(Map.prototype, 'getOrInsertComputed', function(key, callback) {
        if (!this.has(key)) this.set(key, callback(key));
        return this.get(key);
    });

    define(Set.prototype, 'intersection', function(other) {
        const result = new Set();
        this.forEach(function(value) {
            if (other.has(value)) result.add(value);
        });
        return result;
    });

    define(Set.prototype, 'union', function(other) {
        const result = new Set(this);
        other.forEach(function(value) { result.add(value); });
        return result;
    });

    if (typeof Response !== 'undefined') {
        define(Response.prototype, 'bytes', async function() {
            return new Uint8Array(await this.arrayBuffer());
        });
    }

    if (typeof Blob !== 'undefined') {
        define(Blob.prototype, 'bytes', async function() {
            return new Uint8Array(await this.arrayBuffer());
        });
    }

    define(Uint8Array.prototype, 'toHex', function() {
        let output = '';
        for (let index = 0; index < this.length; index += 1) {
            output += this[index].toString(16).padStart(2, '0');
        }
        return output;
    });

    define(Uint8Array, 'fromBase64', function(value) {
        const normalized = String(value || '')
            .replace(/\s+/g, '')
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    });

    define(Uint8Array.prototype, 'toBase64', function() {
        let binary = '';
        const chunkSize = 32768;
        for (let index = 0; index < this.length; index += chunkSize) {
            binary += String.fromCharCode.apply(null, this.subarray(index, index + chunkSize));
        }
        return btoa(binary);
    });
})();
