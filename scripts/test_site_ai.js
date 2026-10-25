const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = require('../assets/js/site-ai-context.js');
const { chatCompletion } = require('../assets/js/site-ai-client.js');

test('retrieval finds evidence near the end of a long article within its budget', function() {
    const text = '引言与背景。\n\n'.repeat(3000) + 'configuration lifetime: persist until shutdown\n';
    const result = context.relevantText(text, 'configuration lifetime', 8000);
    assert(result.includes('persist until shutdown'));
    assert(result.length <= 8000);
    const chinese = '日常笔记。\n\n'.repeat(3000) + '多模态对齐使用对比学习目标。';
    assert(context.relevantText(chinese, '多模态对齐', 8000).includes('对比学习目标'));
});

test('model plans can only read known pages and context respects total limits', function() {
    const routes = Array.from({ length: 8 }, (_, i) => ({ id: '/post-' + i + '/', title: 'Post ' + i }));
    const plan = context.cleanPlan({ action: 'read_pages', pages: ['/unknown/', ...routes.map(r => r.id), routes[0].id] }, { routes });
    assert.equal(plan.pages.length, 5);
    assert(!plan.pages.includes('/unknown/'));
    const pages = Object.fromEntries(routes.map(r => [r.id, { content: 'body '.repeat(10000) }]));
    const blocks = context.buildContext(plan.pages, { pages }, { routes }, 'body');
    const total = blocks.reduce((n, block) => n + block.split('CONTENT:\n')[1].length, 0);
    assert(total <= 24000);
    assert.deepEqual(context.parseJsonObject('```json\n{"action":"answer"}\n```'), { action: 'answer' });
});

test('model HTTP client reports failure, times out, and accepts cancellation', async function(t) {
    const config = { baseUrl: 'https://model.invalid/v1', model: 'test' };
    t.mock.method(globalThis, 'fetch', async function() {
        return { ok: false, status: 429, text: async () => 'rate limited' };
    });
    await assert.rejects(chatCompletion(config, []), /HTTP 429/);
    globalThis.fetch = async function(url, options) {
        return new Promise((resolve, reject) => {
            const fail = () => reject(new DOMException('Aborted', 'AbortError'));
            if (options.signal.aborted) fail();
            else options.signal.addEventListener('abort', fail, { once: true });
        });
    };
    await assert.rejects(chatCompletion(config, [], { timeoutMs: 5 }), /timed out/);
    const controller = new AbortController();
    const request = chatCompletion(config, [], { signal: controller.signal });
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
});

test('configured AI plans then reads relevant body before answering', async function() {
    const calls = [];
    let reads = 0;
    const sandbox = {
        window: {}, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout,
        localStorage: { getItem: () => JSON.stringify({ baseUrl: 'https://model.invalid/v1', model: 'test' }) },
        fetch: async function(url, options) {
            calls.push(JSON.parse(options.body));
            const content = calls.length === 1
                ? JSON.stringify({ action: 'read_pages', pages: ['/article/', '/unknown/'] })
                : 'The lifetime is until shutdown.';
            return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
        }
    };
    sandbox.window.siteData = {
        loadManifest: async () => ({ routes: [{ id: '/article/', url: '/article/', title: 'Article' }] }),
        loadContent: async () => {
            reads += 1;
            return { pages: { '/article/': { content: 'background '.repeat(5000) + 'configuration lifetime: until shutdown' } } };
        }
    };
    vm.createContext(sandbox);
    for (const name of ['site-ai-config', 'site-ai-client', 'site-ai-context', 'site-ai-demo', 'site-ai']) {
        vm.runInContext(fs.readFileSync('assets/js/' + name + '.js', 'utf8'), sandbox, { filename: name });
    }
    const answer = await sandbox.window.siteAI.answerAsync('configuration lifetime?');
    assert.equal(reads, 1);
    assert.equal(calls.length, 2);
    assert(calls[1].messages[1].content.includes('until shutdown'));
    assert(answer[0].includes('until shutdown'));
});

test('siteData deduplicates requests and retries a failed load', async function() {
    let attempts = 0;
    const sandbox = {
        document: { documentElement: { dataset: { siteBaseurl: '/preview', siteVersion: '123' } } },
        window: {},
        fetch: async function(url) {
            attempts += 1;
            assert.equal(url, '/preview/site-manifest.json?v=123');
            if (attempts === 1) throw new Error('offline');
            return { ok: true, json: async () => ({ schema: 1 }) };
        }
    };
    vm.runInNewContext(fs.readFileSync('assets/js/site-data.js', 'utf8'), sandbox);
    assert.equal(attempts, 0, 'reading pages must not eagerly load the manifest');
    await assert.rejects(sandbox.window.siteData.loadManifest(), /offline/);
    const [a, b] = await Promise.all([sandbox.window.siteData.loadManifest(), sandbox.window.siteData.loadManifest()]);
    assert.strictEqual(a, b);
    assert.equal(attempts, 2);
});
