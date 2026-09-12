'use strict';
let loaded = '';
function loadScripts() {
    const revision = self.location ? self.location.search : '';
    importScripts(...Array.from(arguments, function(url) { return url + revision; }));
}
self.onmessage = async function(event) {
    const job = event.data;
    try {
        let result;
        if (job.method === 'config-convert') {
            if (loaded !== 'config') {
                loadScripts('../../tool-apps/developer-converter/vendor/config-libs.js', '../../tool-apps/developer-converter/converter-core.js');
                loaded = 'config';
            }
            result = self.DeveloperConverterCore.convert(job.payload.text, job.payload.options);
        } else if (job.method === 'text-compare' || job.method === 'text-patch') {
            if (loaded !== 'diff') {
                loadScripts('../../tool-apps/text-diff/vendor/diff.js', '../../tool-apps/text-diff/diff-core.js');
                loaded = 'diff';
            }
            const method = job.method === 'text-compare' ? 'compare' : 'createPatch';
            result = await self.TextDiffCore[method](job.payload.oldText, job.payload.newText, job.payload.options);
        } else {
            throw new Error('不支持的计算任务。');
        }
        self.postMessage({ requestId: job.requestId, result: result });
    } catch (error) {
        self.postMessage({ requestId: job.requestId, error: error.message || String(error) });
    }
};
