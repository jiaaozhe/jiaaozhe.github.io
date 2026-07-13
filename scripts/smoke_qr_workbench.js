const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const core = require('../tool-apps/qr-workbench/qr-core.js');

function browserContext() {
    const context = vm.createContext({
        console: console,
        TextEncoder: TextEncoder,
        TextDecoder: TextDecoder,
        Uint8Array: Uint8Array,
        Uint8ClampedArray: Uint8ClampedArray,
        ArrayBuffer: ArrayBuffer,
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout
    });
    context.globalThis = context;
    context.window = context;
    context.self = context;
    vm.runInContext(fs.readFileSync('tool-apps/qr-workbench/vendor/qrcode.js', 'utf8'), context, { filename: 'qrcode.js' });
    vm.runInContext(fs.readFileSync('tool-apps/qr-workbench/vendor/jsqr.js', 'utf8'), context, { filename: 'jsqr.js' });
    context.QRWorkbenchCore = core;
    vm.runInContext(fs.readFileSync('tool-apps/qr-workbench/qr-renderer.js', 'utf8'), context, { filename: 'qr-renderer.js' });
    return context;
}

function rasterize(symbol, margin, scale) {
    const modules = symbol.modules.size;
    const cells = modules + margin * 2;
    const width = cells * scale;
    const data = new Uint8ClampedArray(width * width * 4);
    data.fill(255);
    for (let row = 0; row < modules; row += 1) {
        for (let column = 0; column < modules; column += 1) {
            if (!symbol.modules.data[row * modules + column]) continue;
            for (let y = 0; y < scale; y += 1) {
                for (let x = 0; x < scale; x += 1) {
                    const pixel = (((row + margin) * scale + y) * width + (column + margin) * scale + x) * 4;
                    data[pixel] = 0;
                    data[pixel + 1] = 0;
                    data[pixel + 2] = 0;
                    data[pixel + 3] = 255;
                }
            }
        }
    }
    return { data: data, width: width };
}

function testPayloadBuilders() {
    const wifi = core.buildPayload('wifi', {
        ssid: 'Guest;Lab\\2', security: 'WPA', password: 'p:a,ss"', hidden: true
    });
    assert.equal(wifi.payload, 'WIFI:T:WPA;S:Guest\\;Lab\\\\2;P:p\\:a\\,ss\\";H:true;;');
    const parsedWifi = core.parsePayload(wifi.payload);
    assert.deepEqual(parsedWifi.fields, {
        ssid: 'Guest;Lab\\2', security: 'WPA', password: 'p:a,ss"', hidden: true
    });

    const card = core.buildPayload('vcard', {
        name: '张三', organization: '示例;实验室', title: '研究员', phone: '+86 138 0000 0000',
        email: 'zhang@example.com', url: 'https://example.com'
    });
    assert.match(card.payload, /BEGIN:VCARD\r\nVERSION:3\.0/);
    assert.match(card.payload, /ORG:示例\\;实验室/);
    assert.equal(core.parsePayload(card.payload).fields.name, '张三');

    assert.equal(core.buildPayload('url', { url: 'https://example.com/Case' }).payload, 'https://example.com/Case');
    assert.equal(core.buildPayload('email', { address: 'hello@example.com', subject: '你好 世界' }).payload, 'mailto:hello@example.com?subject=%E4%BD%A0%E5%A5%BD%20%E4%B8%96%E7%95%8C');
    assert.equal(core.buildPayload('phone', { phone: '+86 138-0000-0000' }).payload, 'tel:+86 138-0000-0000');
    assert.throws(function() { core.buildPayload('url', { url: 'example.com' }); }, /完整网址/);
    assert.throws(function() { core.buildPayload('wifi', { ssid: 'Guest', security: 'WPA' }); }, /密码/);
}

function testSettingsAndPrivacy() {
    const preferences = core.normalizePreferences({
        mode: 'bad', payloadType: 'unknown',
        settings: { dark: 'red', errorLevel: 'X', outputSize: 999, transparent: true }
    });
    assert.equal(preferences.mode, 'generate');
    assert.equal(preferences.payloadType, 'url');
    assert.equal(preferences.settings.dark, '#151814');
    assert.equal(preferences.settings.errorLevel, 'M');
    assert.equal(preferences.settings.outputSize, 512);
    assert.equal(preferences.settings.transparent, true);
    assert.equal(core.outputPlan(29, 512, 4).size, 518);
    assert.equal(core.outputPlan(29, 512, 4).modulePixels, 14);
    assert.equal(core.reliability({ dark: '#ffffff', light: '#000000' }, 29, 512, true, 24).state, 'warning');
    assert.equal(core.filename('wifi', 'svg', new Date('2026-07-13T00:00:00Z')), 'qr-wifi-20260713.svg');
}

function testRealRoundTrips() {
    const runtime = browserContext();
    assert.equal(typeof runtime.QRCode.create, 'function');
    assert.equal(typeof runtime.jsQR, 'function');
    const fixtures = [
        core.buildPayload('text', { text: '本地二维码 · hello 👋' }),
        core.buildPayload('url', { url: 'https://jiaaozhe.github.io/tools/' }),
        core.buildPayload('wifi', { ssid: 'Guest;Lab', security: 'WPA', password: 'a:b,c' }),
        core.buildPayload('vcard', { name: '张三', phone: '+86 138 0000 0000', email: 'zhang@example.com' }),
        core.buildPayload('email', { address: 'hello@example.com', subject: '二维码测试', body: '本地处理' }),
        core.buildPayload('phone', { phone: '+86 138-0000-0000' })
    ];

    fixtures.forEach(function(fixture) {
        const symbol = runtime.QRWorkbenchRenderer.createSymbol(fixture.payload, { errorLevel: 'M' });
        const image = rasterize(symbol, 4, 8);
        const decoded = runtime.jsQR(image.data, image.width, image.width, { inversionAttempts: 'attemptBoth' });
        assert(decoded, 'fixture should decode: ' + fixture.type);
        assert.equal(decoded.data, fixture.payload, 'fixture should round-trip: ' + fixture.type);
        const svg = runtime.QRWorkbenchRenderer.svg(symbol, { outputSize: 512, moduleStyle: 'square' });
        assert.match(svg, /^<svg/);
        assert.match(svg, /viewBox="0 0 /);
        assert.doesNotMatch(svg, /<script/i);
    });
}

function testRuntimeSurface() {
    const html = fs.readFileSync('tool-apps/qr-workbench/index.html', 'utf8');
    const app = fs.readFileSync('tool-apps/qr-workbench/app.js', 'utf8');
    const css = fs.readFileSync('tool-apps/qr-workbench/app.css', 'utf8');
    assert.match(html, /connect-src 'none'/);
    assert.match(html, /worker-src 'none'/);
    assert.match(html, /tool-runtime\.js/);
    assert.match(html, /vendor\/qrcode\.js/);
    assert.match(html, /vendor\/jsqr\.js/);
    assert.doesNotMatch(html, /localStorage/);
    assert.doesNotMatch(app, /localStorage/);
    assert.doesNotMatch(app, /innerHTML/);
    assert.match(app, /storage\.setItem\(PREFERENCES_KEY/);
    assert.doesNotMatch(app, /storage\.setItem\([^)]*(?:payload|password|image|raw)/i);
    assert.match(app, /decoder\.decodeCanvas/);
    assert.match(app, /decoder\.decodeFile/);
    assert.match(app, /navigator\.clipboard/);
    assert.match(css, /@media \(max-width: 860px\)/);
    assert.match(css, /prefers-reduced-motion/);

    const dynamicAttributes = new Set([]);
    const staticSelectors = [...app.matchAll(/(?:one|all)\('([^']+)'/g)].flatMap(function(match) {
        return [...match[1].matchAll(/\[(data-[A-Za-z0-9-]+)/g)].map(function(attributeMatch) {
            return attributeMatch[1];
        });
    }).filter(function(attribute) { return !dynamicAttributes.has(attribute); });
    new Set(staticSelectors).forEach(function(attribute) {
        assert.match(html, new RegExp('\\b' + attribute + '\\b'), 'missing app element for ' + attribute);
    });
}

testPayloadBuilders();
testSettingsAndPrivacy();
testRealRoundTrips();
testRuntimeSurface();
console.log('Validated QR payloads, real generation/decoding round-trips, privacy, and offline runtime surface.');
