const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
    const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const fs = require('node:fs');
        const path = require('node:path');
        const vm = require('node:vm');
        const context = vm.createContext({ console, setTimeout, clearTimeout, TextEncoder, TextDecoder });
        context.self = context;
        context.postMessage = value => parentPort.postMessage(value);
        context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.resolve(workerData, 'assets/js', file), 'utf8'), context));
        vm.runInContext(fs.readFileSync(path.join(workerData, 'assets/js/tool-compute-worker.js'), 'utf8'), context);
        parentPort.on('message', data => context.onmessage({data}));
    `, { eval: true, workerData: process.cwd() });
    function request(method, payload) {
        return new Promise(function(resolve, reject) {
            worker.once('message', resolve); worker.once('error', reject);
            worker.postMessage({ requestId: 1, method: method, payload: payload });
        });
    }
    try {
        const config = await request('config-convert', { text: '{"n":9007199254740993}', options: { source: 'json', target: 'yaml', mode: 'safe' } });
        assert.equal(config.result.verification.passed, true);
        assert.match(config.result.output, /9007199254740993/);
        const diff = await request('text-compare', { oldText: 'a\nb\n', newText: 'a\nc\n', options: {} });
        assert.equal(diff.result.ok, true);
        assert.equal(diff.result.stats.modified, 1);
        const patch = await request('text-patch', { oldText: 'a\nb\n', newText: 'a\nc\n', options: {} });
        assert.equal(patch.result.verified, true);
        assert.match((await request('invalid', {})).error, /不支持/);
    } finally { await worker.terminate(); }

    const replies = [];
    let instance;
    function FakeWorker() { instance = this; this.postMessage = function() {}; this.terminate = function() { this.terminated = true; }; }
    const window = { setTimeout: function() { return 1; }, clearTimeout: function() {} };
    vm.runInNewContext(fs.readFileSync('assets/js/tool-jobs.js', 'utf8'), {
        window: window, document: { currentScript: { src: 'https://local.test/assets/js/tool-jobs.js' } }, URL: URL, Worker: FakeWorker
    });
    const jobs = window.ToolJobs.create('text-diff', function(reply) { replies.push(reply); });
    jobs.run({ requestId: 1, method: 'config-convert', payload: {} });
    assert.match(replies.pop().error, /未获准/);
    jobs.run({ requestId: 2, method: 'text-compare', payload: {} });
    const oldWorker = instance;
    jobs.run({ requestId: 3, method: 'text-compare', payload: {} });
    assert.equal(oldWorker.terminated, true);
    assert.equal(replies.pop().requestId, 2);
    instance.onmessage({ data: { requestId: 3, result: 'latest' } });
    assert.equal(replies.pop().result, 'latest');
    jobs.cancel();
    console.log('Validated real worker conversions, exact Patch replay, task allowlists, and cancellation.');
}
main().catch(function(error) { console.error(error); process.exitCode = 1; });
