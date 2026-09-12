(function() {
    'use strict';
    const workerUrl = new URL('tool-pdf-worker.mjs', document.currentScript.src);
    workerUrl.search = new URL(document.currentScript.src).search;
    window.ToolPdfHost = Object.freeze({ create: function(reply, reportError) {
        let worker;
        let nextId = 0;
        const leases = new Set();
        function dispose() {
            if (worker) worker.terminate();
            worker = null;
            leases.clear();
        }
        return {
            open: function(requestId) {
                let channel;
                try {
                    if (!worker) {
                        worker = new Worker(workerUrl, { type: 'module' });
                        worker.onerror = function() { dispose(); reportError('PDF 计算模块发生错误，请重新打开工具。'); };
                    }
                    const id = ++nextId;
                    channel = new MessageChannel();
                    worker.postMessage({ type: 'connect', id: id, port: channel.port2 }, [channel.port2]);
                    leases.add(id);
                    reply({ requestId: requestId, result: { id: id, port: channel.port1 } }, [channel.port1]);
                } catch (error) {
                    if (channel) { channel.port1.close(); channel.port2.close(); }
                    reply({ requestId: requestId, error: error.message || String(error) });
                }
            },
            release: function(id) {
                if (!leases.delete(id)) return;
                if (worker) worker.postMessage({ type: 'release', id: id });
                if (!leases.size) dispose();
            },
            dispose: dispose
        };
    } });
})();
