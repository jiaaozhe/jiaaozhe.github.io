(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ToolStateStore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    function apply(state, operation) {
        if (operation.type === 'tool:storage-clear') return Object.create(null);
        const next = Object.assign(Object.create(null), state);
        if (operation.type === 'tool:storage-remove') delete next[operation.key];
        else if (operation.type === 'tool:storage-batch') Object.assign(next, operation.values);
        else next[operation.key] = operation.value;
        return next;
    }

    // Read and patch in the same transaction, so another tab's keys are preserved.
    function commit(db, id, operations, maxBytes) {
        return new Promise(function(resolve, reject) {
            const transaction = db.transaction('tools', 'readwrite');
            const store = transaction.objectStore('tools');
            const request = store.get(id);
            let next;
            let failure;
            transaction.oncomplete = function() { resolve(next); };
            transaction.onabort = function() { reject(failure || transaction.error || new Error('状态保存已中止。')); };
            transaction.onerror = function() { failure = failure || transaction.error; };
            request.onsuccess = function() {
                try {
                    next = operations.reduce(apply, request.result || Object.create(null));
                    if (new TextEncoder().encode(JSON.stringify(next)).length > maxBytes) {
                        throw new Error('工具状态超过 12 MB 限制。');
                    }
                    store.put(next, id);
                } catch (error) {
                    failure = error;
                    transaction.abort();
                }
            };
        });
    }

    return Object.freeze({ apply: apply, commit: commit });
});
