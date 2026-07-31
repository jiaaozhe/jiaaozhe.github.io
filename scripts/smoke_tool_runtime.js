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
        setTimeout: function() { return 1; }
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
    const write = runtime.messages.at(-1);
    assert.equal(write.type, 'tool:storage-set');
    assert.equal(write.key, 'draft');
    assert.equal(write.value, '# Updated');
    assert.equal(Object.hasOwn(write, 'toolId'), false, 'tool messages must not choose a namespace');

    assert.throws(function() {
        runtime.window.toolStorage.setItem('../other-tool', 'no');
    }, /Invalid tool storage key/);
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
    testDirectAccessRedirect();
    console.log('Validated sandbox tool runtime protocol.');
}

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
