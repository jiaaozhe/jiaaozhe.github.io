const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const runtimeSource = fs.readFileSync('assets/js/tool-runtime.js', 'utf8');

function createEmbeddedRuntime() {
    const messages = [];
    const listeners = {};
    const attributes = {};
    const parent = {
        postMessage: function(message) {
            messages.push(message);
        }
    };
    const window = {
        location: { hash: '#toolHostToken=test-token' },
        parent: parent,
        addEventListener: function(type, handler) {
            listeners[type] = handler;
        },
        setTimeout: function() { return 1; },
        clearTimeout: function() {}
    };
    const context = vm.createContext({
        console: console,
        document: {
            currentScript: { dataset: { runnerUrl: '../../tools/example/' } },
            documentElement: {
                hidden: false,
                setAttribute: function(name, value) { attributes[name] = value; }
            },
            body: {
                setAttribute: function(name, value) { attributes['body:' + name] = value; }
            }
        },
        Promise: Promise,
        URL: URL,
        URLSearchParams: URLSearchParams,
        window: window
    });

    vm.runInContext(runtimeSource, context, { filename: 'assets/js/tool-runtime.js' });
    return { window: window, parent: parent, listeners: listeners, messages: messages, attributes: attributes };
}

async function testEmbeddedRuntime() {
    const runtime = createEmbeddedRuntime();
    assert.equal(runtime.messages[0].type, 'tool:ready');
    assert.equal(runtime.messages[0].token, 'test-token');

    runtime.listeners.message({
        source: runtime.parent,
        data: {
            type: 'tool-host:init',
            token: 'test-token',
            theme: 'dark',
            state: { draft: '# Existing' }
        }
    });

    await runtime.window.toolStorage.ready();
    assert.equal(runtime.window.toolStorage.getItem('draft'), '# Existing');
    assert.equal(runtime.window.toolHost.theme, 'dark');
    assert.equal(runtime.attributes['data-theme'], 'dark');
    assert.equal(runtime.attributes['body:data-theme'], 'dark');

    runtime.listeners.message({
        source: runtime.parent,
        data: {
            type: 'tool-host:theme',
            token: 'test-token',
            theme: 'light'
        }
    });
    assert.equal(runtime.window.toolHost.theme, 'light');
    assert.equal(runtime.attributes['data-theme'], 'light');

    runtime.window.toolStorage.setItem('draft', '# Updated');
    await Promise.resolve();
    const write = runtime.messages.at(-1);
    assert.equal(write.type, 'tool:storage-set');
    assert.equal(write.key, 'draft');
    assert.equal(write.value, '# Updated');
    assert.equal(Object.hasOwn(write, 'toolId'), false, 'tool messages must not choose a namespace');

    const firstSave = runtime.window.toolStorage.flush();
    runtime.listeners.message({ source: runtime.parent, data: {
        type: 'tool-host:storage-error', token: 'test-token', requestId: write.requestId, message: 'quota exceeded'
    } });
    await assert.rejects(firstSave, /quota exceeded/);
    assert.equal(runtime.window.toolStorage.getItem('draft'), '# Existing');
    const retry = runtime.window.toolStorage.setItem('draft', '# Updated');
    await Promise.resolve();
    const retried = runtime.messages.at(-1);
    assert.notEqual(retried.requestId, write.requestId, 'failed value must be retryable');
    // A response from a different window/token must not acknowledge a write.
    runtime.listeners.message({ source: {}, data: {
        type: 'tool-host:storage-saved', token: 'test-token', requestId: retried.requestId
    } });
    const newer = runtime.window.toolStorage.setItem('draft', '# Newer');
    await Promise.resolve();
    const newest = runtime.messages.at(-1);
    runtime.listeners.message({ source: runtime.parent, data: {
        type: 'tool-host:storage-saved', token: 'test-token', requestId: retried.requestId
    } });
    await retry;
    assert.equal(runtime.window.toolStorage.getItem('draft'), '# Newer');
    runtime.listeners.message({ source: runtime.parent, data: {
        type: 'tool-host:storage-error', token: 'test-token', requestId: newest.requestId, message: 'transaction aborted'
    } });
    await assert.rejects(newer, /transaction aborted/);
    assert.equal(runtime.window.toolStorage.getItem('draft'), '# Updated');

    assert.throws(function() {
        runtime.window.toolStorage.setItem('../other-tool', 'no');
    }, /Invalid tool storage key/);
}

async function testTransactions() {
    const store = require('../assets/js/tool-state-store.js');
    let transaction, request, written;
    const db = { transaction: function() {
        transaction = {
            objectStore: function() { return {
                get: function() { request = {}; return request; },
                put: function(value) { written = value; return {}; }
            }; },
            abort: function() { transaction.onabort(); }
        };
        return transaction;
    } };
    let completed = false;
    const save = store.commit(db, 'example', [{ type: 'tool:storage-set', key: 'draft', value: 'new' }], 1024);
    save.then(function() { completed = true; });
    request.result = { draft: 'old', otherTab: 'preserve' };
    request.onsuccess();
    await Promise.resolve();
    assert.equal(completed, false, 'put success is not transaction completion');
    assert.equal(written.otherTab, 'preserve');
    transaction.oncomplete();
    await save;
    assert.equal(completed, true);

    const aborted = store.commit(db, 'example', [], 1024);
    request.result = {};
    request.onsuccess();
    transaction.error = new Error('disk failure');
    transaction.onabort();
    await assert.rejects(aborted, /disk failure/);

    const oversized = store.commit(db, 'example', [{ type: 'tool:storage-set', key: 'draft', value: 'large' }], 2);
    request.result = {};
    request.onsuccess();
    await assert.rejects(oversized, /12 MB/);
}

function testDirectAccessRedirect() {
    let redirectedTo = '';
    const window = {
        location: {
            hash: '',
            href: 'https://example.test/tool-apps/example/',
            replace: function(value) { redirectedTo = value; }
        },
        setTimeout: function() {}
    };
    window.parent = window;

    const documentElement = { hidden: false };
    const context = vm.createContext({
        console: console,
        document: {
            currentScript: { dataset: { runnerUrl: '../../tools/example/' } },
            documentElement: documentElement
        },
        Promise: Promise,
        URL: URL,
        URLSearchParams: URLSearchParams,
        window: window
    });

    vm.runInContext(runtimeSource, context, { filename: 'assets/js/tool-runtime.js' });
    assert.equal(documentElement.hidden, true);
    assert.equal(redirectedTo, 'https://example.test/tools/example/');
}

async function main() {
    await testEmbeddedRuntime();
    await testTransactions();
    testDirectAccessRedirect();
    console.log('Validated sandbox tool runtime protocol.');
}

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
