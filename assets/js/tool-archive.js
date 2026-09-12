(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ToolArchive = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';
    function create(library, maxBytes) {
        const parts = [];
        let bytes = 0;
        let failure;
        let resolve, reject;
        const result = new Promise(function(onResolve, onReject) { resolve = onResolve; reject = onReject; });
        result.catch(function() {});
        const zip = new library.Zip(function(error, data, final) {
            if (error) { failure = error; reject(error); return; }
            // Copy each emitted chunk into Blob storage; don't retain source buffers.
            if (data.length) parts.push(new Blob([data]));
            if (final) {
                resolve(new Blob(parts, { type: 'application/zip' }));
                parts.length = 0;
            }
        });
        return {
            add: async function(name, input) {
                const size = input instanceof Blob ? input.size : input.byteLength;
                if (bytes + size > maxBytes) throw new Error('批量结果超过内存预算，请减少文件数量。');
                bytes += size;
                const entry = new library.ZipPassThrough(name);
                zip.add(entry);
                const chunkSize = 1024 * 1024;
                if (!size) entry.push(new Uint8Array(), true);
                for (let offset = 0; offset < size; offset += chunkSize) {
                    if (failure) throw failure;
                    const end = Math.min(size, offset + chunkSize);
                    const data = input instanceof Blob
                        ? new Uint8Array(await input.slice(offset, end).arrayBuffer())
                        : input.subarray(offset, end);
                    entry.push(data, end === size);
                    await new Promise(function(done) { setTimeout(done, 0); });
                }
            },
            finish: function() { zip.end(); return result; },
            dispose: function() { zip.terminate(); parts.length = 0; }
        };
    }
    return Object.freeze({ create: create });
});
