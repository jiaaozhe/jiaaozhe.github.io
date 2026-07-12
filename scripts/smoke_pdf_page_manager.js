const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const core = require('../tool-apps/pdf-page-manager/pdf-core.js');
global.PDFPageCore = core;
global.PDFLib = require('../tool-apps/pdf-page-manager/vendor/pdf-lib.min.js');
require('../tool-apps/pdf-page-manager/pdf-engine.js');

const engine = global.PDFPageEngine;

function exactArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function fileSource(id, name, bytes) {
    return {
        id: id,
        name: name,
        size: bytes.byteLength,
        file: {
            arrayBuffer: async function() { return exactArrayBuffer(bytes); }
        }
    };
}

async function createPdf(pageSpecs) {
    const document = await global.PDFLib.PDFDocument.create();
    const font = await document.embedFont(global.PDFLib.StandardFonts.Helvetica);
    pageSpecs.forEach(function(spec, index) {
        const page = document.addPage([spec.width, spec.height]);
        if (spec.rotation) page.setRotation(global.PDFLib.degrees(spec.rotation));
        page.drawText('fixture-' + (index + 1), { x: 24, y: 28, size: 12, font: font });
    });
    return document.save({ useObjectStreams: true });
}

function browserLikeContext() {
    function DOMMatrix() {}
    function ImageData() {}
    function Path2D() {}
    function HTMLElement() {}
    function HTMLAnchorElement() {}
    const document = {
        baseURI: 'https://example.test/tool-apps/pdf-page-manager/',
        documentElement: { style: {} },
        createElement: function(tagName) {
            return {
                tagName: String(tagName).toUpperCase(),
                style: {},
                classList: { add: function() {}, remove: function() {}, toggle: function() {} },
                append: function() {},
                appendChild: function() {},
                remove: function() {},
                setAttribute: function() {},
                getContext: function() { return null; }
            };
        },
        createElementNS: function(namespace, tagName) { return this.createElement(tagName); }
    };
    const context = vm.createContext({
        console: console,
        navigator: { platform: 'MacIntel', userAgent: 'Mozilla/5.0 Chrome/140' },
        document: document,
        location: { href: document.baseURI },
        DOMMatrix: DOMMatrix,
        ImageData: ImageData,
        Path2D: Path2D,
        HTMLElement: HTMLElement,
        HTMLAnchorElement: HTMLAnchorElement,
        URL: URL,
        URLSearchParams: URLSearchParams,
        Blob: Blob,
        Response: Response,
        AbortController: AbortController,
        AbortSignal: AbortSignal,
        TextDecoder: TextDecoder,
        TextEncoder: TextEncoder,
        ArrayBuffer: ArrayBuffer,
        Uint8Array: Uint8Array,
        Uint16Array: Uint16Array,
        Uint32Array: Uint32Array,
        Int8Array: Int8Array,
        Int16Array: Int16Array,
        Int32Array: Int32Array,
        Float32Array: Float32Array,
        Float64Array: Float64Array,
        structuredClone: structuredClone,
        crypto: global.crypto,
        performance: performance,
        atob: atob,
        btoa: btoa,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        queueMicrotask: queueMicrotask,
        requestAnimationFrame: function(callback) { return setTimeout(callback, 0); },
        cancelAnimationFrame: clearTimeout,
        fetch: async function() { throw new Error('Unexpected network access in bundled PDF.js smoke test.'); }
    });
    context.window = context;
    context.self = context;
    return context;
}

async function testBundledPdfJsParsing(bytes) {
    const compat = fs.readFileSync('tool-apps/pdf-page-manager/compat.js', 'utf8');
    const source = fs.readFileSync('tool-apps/pdf-page-manager/vendor/pdfjs-runtime.min.js', 'utf8');
    const context = browserLikeContext();
    vm.runInContext(compat, context, { filename: 'compat.js' });
    vm.runInContext(source, context, { filename: 'pdfjs-runtime.min.js' });
    assert.equal(context.pdfjsLib.version, '5.7.284');
    assert.equal(typeof context.pdfjsWorker.WorkerMessageHandler.setup, 'function');
    const task = context.pdfjsLib.getDocument({
        data: new Uint8Array(bytes),
        useWasm: false,
        isEvalSupported: false,
        verbosity: context.pdfjsLib.VerbosityLevel.ERRORS
    });
    const document = await task.promise;
    assert.equal(document.numPages, 2);
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    assert.deepEqual([viewport.width, viewport.height], [300, 500]);
    await task.destroy();
}

function testCoreOperations() {
    const pages = [
        { id: 'a', sourceId: 'one', sourcePageIndex: 0, rotation: 0 },
        { id: 'b', sourceId: 'one', sourcePageIndex: 1, rotation: 0 },
        { id: 'c', sourceId: 'two', sourcePageIndex: 0, rotation: 0 },
        { id: 'd', sourceId: 'two', sourcePageIndex: 1, rotation: 0 }
    ];

    assert.equal(core.normalizeRotation(-90), 270);
    assert.equal(core.normalizeRotation(451), 90);
    assert.deepEqual(core.rangeIds(pages, 'b', 'd'), ['b', 'c', 'd']);
    assert.deepEqual(core.movePagesBefore(pages, ['b', 'c'], 'a').map(function(page) { return page.id; }), ['b', 'c', 'a', 'd']);
    assert.deepEqual(core.shiftPages(pages, ['b', 'd'], -1).map(function(page) { return page.id; }), ['b', 'a', 'd', 'c']);
    assert.deepEqual(core.shiftPages(pages, ['a', 'c'], 1).map(function(page) { return page.id; }), ['b', 'a', 'd', 'c']);
    assert.deepEqual(core.deletePages(pages, ['b', 'd']).map(function(page) { return page.id; }), ['a', 'c']);
    assert.deepEqual(core.rotatePages(pages, ['a', 'c'], -90).map(function(page) { return page.rotation; }), [270, 0, 270, 0]);
    assert.deepEqual(core.buildExportPages(pages, ['d', 'b'], 'selected').map(function(page) { return page.id; }), ['b', 'd']);

    let duplicateId = 0;
    const duplicated = core.duplicatePages(pages, ['a', 'c'], function() { return 'copy-' + (++duplicateId); });
    assert.deepEqual(duplicated.pages.map(function(page) { return page.id; }), ['a', 'copy-1', 'b', 'c', 'copy-2', 'd']);
    assert.deepEqual(duplicated.createdIds, ['copy-1', 'copy-2']);
    assert.equal(core.sanitizeBaseName('../报告:终稿.pdf'), '-报告-终稿');

    const used = new Set();
    assert.equal(core.splitFilename('报告.pdf', 2, 12, used), '报告-p002.pdf');
    assert.equal(core.splitFilename('报告.pdf', 2, 12, used), '报告-p002-2.pdf');
}

async function testRealPdfExports() {
    const firstBytes = await createPdf([
        { width: 300, height: 500, rotation: 0 },
        { width: 640, height: 360, rotation: 90 }
    ]);
    const secondBytes = await createPdf([
        { width: 420, height: 420, rotation: 0 }
    ]);
    await testBundledPdfJsParsing(firstBytes);
    const sources = new Map([
        ['first', fileSource('first', 'first.pdf', firstBytes)],
        ['second', fileSource('second', 'second.pdf', secondBytes)]
    ]);
    const pages = [
        { id: 'first-2', sourceId: 'first', sourcePageIndex: 1, rotation: 90 },
        { id: 'second-1', sourceId: 'second', sourcePageIndex: 0, rotation: 0 },
        { id: 'first-1', sourceId: 'first', sourcePageIndex: 0, rotation: 0 },
        { id: 'first-1-copy', sourceId: 'first', sourcePageIndex: 0, rotation: 180 }
    ];

    const progress = [];
    const mergedBytes = await engine.exportDocument(pages, sources, function(update) { progress.push(update.phase); });
    const merged = await global.PDFLib.PDFDocument.load(mergedBytes, { updateMetadata: false });
    assert.equal(merged.getPageCount(), 4);
    assert.deepEqual(merged.getPages().map(function(page) { return page.getRotation().angle; }), [180, 0, 0, 180]);
    assert.deepEqual(
        merged.getPages().map(function(page) { return [page.getWidth(), page.getHeight()]; }),
        [[640, 360], [420, 420], [300, 500], [300, 500]]
    );
    assert(progress.includes('read'));
    assert(progress.includes('copy'));
    assert(progress.includes('save'));

    const splitBytes = await engine.exportSplitDocuments(pages.slice(0, 3), sources);
    assert.equal(splitBytes.length, 3);
    for (const bytes of splitBytes) {
        const document = await global.PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
        assert.equal(document.getPageCount(), 1);
    }
}

function testRuntimeSurface() {
    const html = fs.readFileSync('tool-apps/pdf-page-manager/index.html', 'utf8');
    const css = fs.readFileSync('tool-apps/pdf-page-manager/app.css', 'utf8');
    const app = fs.readFileSync('tool-apps/pdf-page-manager/app.js', 'utf8');
    const engineSource = fs.readFileSync('tool-apps/pdf-page-manager/pdf-engine.js', 'utf8');
    const runtimeEntry = fs.readFileSync('scripts/pdfjs_runtime_entry.mjs', 'utf8');
    const manifest = JSON.parse(fs.readFileSync('_site/site-manifest.json', 'utf8'));

    assert.match(html, /connect-src 'self'/);
    assert.match(html, /worker-src 'none'/);
    assert.match(html, /tool-runtime\.js/);
    assert.match(html, /pdfjs-runtime\.min\.js/);
    assert(html.indexOf('tool-runtime.js') < html.indexOf('pdfjs-runtime.min.js'));
    assert(html.indexOf('compat.js') < html.indexOf('pdfjs-runtime.min.js'));
    assert.doesNotMatch(html, /https:\/\//);
    assert.doesNotMatch(html, /localStorage/);
    assert.match(css, /\.pages-toolbar\s*\{[^}]*grid-row:\s*1/s);
    assert.match(css, /\.workspace-warning\s*\{[^}]*grid-row:\s*2/s);
    assert.match(css, /\.pages-scroll\s*\{[^}]*grid-row:\s*3/s);
    assert.equal(manifest.routes.some(function(route) {
        return String(route.source_path || '').startsWith('tool-apps/pdf-page-manager/');
    }), false, 'tool implementation files must not appear as content routes');
    assert.match(runtimeEntry, /WorkerMessageHandler/);
    assert.match(runtimeEntry, /globalThis\.pdfjsWorker/);
    assert.match(engineSource, /isEvalSupported: false/);
    assert.match(engineSource, /useWorkerFetch: false/);
    assert.match(engineSource, /PDFDocument\.load/);
    assert.match(engineSource, /copyPages/);
    assert.match(app, /IntersectionObserver/);
    assert.match(app, /window\.Sortable\.create/);
    assert.match(app, /window\.fflate\.zipSync/);
    assert.match(app, /toolStorage\.setItem\('preferences'/);
    assert.doesNotMatch(app, /toolStorage\.setItem\([^)]*(?:file|bytes|pdf)/i);

    const dynamicAttributes = new Set([
        'data-page-source', 'data-page-position', 'data-page-select', 'data-page-rotation',
        'data-page-canvas', 'data-page-placeholder', 'data-page-sheet', 'data-source-id',
        'data-remove-source'
    ]);
    const staticSelectors = [...app.matchAll(/(?:one|all)\('(\[data-[^']+\])'/g)].map(function(match) {
        return match[1].slice(1, -1).split('=')[0];
    }).filter(function(attribute) {
        return !dynamicAttributes.has(attribute);
    });
    new Set(staticSelectors).forEach(function(attribute) {
        assert.match(html, new RegExp('\\b' + attribute + '\\b'), 'missing app element for ' + attribute);
    });
}

async function main() {
    testCoreOperations();
    await testRealPdfExports();
    testRuntimeSurface();
    console.log('Validated PDF page manager core, real exports, and isolated runtime surface.');
}

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
