(function() {
    'use strict';
    const workerUrl = new URL('tool-compute-worker.js', document.currentScript.src);
    workerUrl.search = new URL(document.currentScript.src).search;
    const allowed = { 'developer-converter': ['config-convert'], 'text-diff': ['text-compare', 'text-patch'] };
    window.ToolJobs = Object.freeze({ create: function(toolId, reply) {
        let worker;
        let active;
        let timer;
        function stop(message, cancelled) {
            window.clearTimeout(timer);
            if (worker) worker.terminate();
            worker = null;
            if (active) reply({ requestId: active.requestId, error: message, cancelled: Boolean(cancelled) });
            active = null;
        }
        return {
            cancel: function() { stop('任务已取消。', true); },
            run: function(job) {
                if (!(allowed[toolId] || []).includes(job.method)) {
                    reply({ requestId: job.requestId, error: '工具未获准执行此任务。' });
                    return;
                }
                let validPayload = false;
                try { validPayload = job.payload && typeof job.payload === 'object' && JSON.stringify(job.payload).length <= 5 * 1024 * 1024; } catch (_error) {}
                if (!validPayload) {
                    reply({ requestId: job.requestId, error: '计算输入超过限制。' });
                    return;
                }
                if (active) stop('任务已被新的输入替代。', true);
                active = job;
                try {
                    if (!worker) {
                        worker = new Worker(workerUrl);
                        const currentWorker = worker;
                        worker.onmessage = function(event) {
                            if (worker !== currentWorker || !active || event.data.requestId !== active.requestId) return;
                            window.clearTimeout(timer);
                            active = null;
                            reply(event.data);
                        };
                        worker.onerror = function() { if (worker === currentWorker) stop('计算模块启动失败，请重试。'); };
                    }
                    timer = window.setTimeout(function() { stop('计算超时，请缩小输入后重试。'); }, 15000);
                    worker.postMessage(job);
                } catch (error) {
                    stop(error.message || String(error));
                }
            }
        };
    } });
})();
