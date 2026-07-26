const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../tool-apps/image-workbench/image-core.js');
const privacy = require('../tool-apps/image-workbench/image-privacy.js');

function bytes() {
    const parts = Array.from(arguments);
    const length = parts.reduce(function(total, part) { return total + part.length; }, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    parts.forEach(function(part) {
        output.set(part, offset);
        offset += part.length;
    });
    return output;
}

function ascii(value) {
    return Uint8Array.from(Buffer.from(value, 'ascii'));
}

function uint32be(value) {
    return Uint8Array.of(
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff
    );
}

function uint32le(value) {
    return Uint8Array.of(
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff
    );
}

function jpegSegment(marker, payload) {
    const length = payload.length + 2;
    return bytes(Uint8Array.of(0xff, marker, (length >>> 8) & 0xff, length & 0xff), payload);
}

function pngChunk(type, payload) {
    return bytes(uint32be(payload.length), ascii(type), payload, new Uint8Array(4));
}

function webpChunk(type, payload) {
    return bytes(
        ascii(type),
        uint32le(payload.length),
        payload,
        payload.length % 2 ? Uint8Array.of(0) : new Uint8Array()
    );
}

function testSettings() {
    const settings = core.normalizeSettings({
        sizeMode: 'unknown',
        format: 'image/gif',
        quality: 4,
        suffix: '../bad:name'
    });
    assert.equal(settings.sizeMode, 'long-edge');
    assert.equal(settings.format, 'image/webp');
    assert.equal(settings.quality, 1);
    assert.equal(settings.suffix.includes('/'), false);
    assert.equal(settings.suffix.includes(':'), false);
}

function testRenderPlans() {
    const reduced = core.renderPlan(4000, 3000, {
        sizeMode: 'long-edge', longEdge: 1600, noUpscale: true
    });
    assert.deepEqual(
        [reduced.targetWidth, reduced.targetHeight, reduced.renderWidth, reduced.renderHeight],
        [1600, 1200, 1600, 1200]
    );

    const untouched = core.renderPlan(800, 600, {
        sizeMode: 'long-edge', longEdge: 1600, noUpscale: true
    });
    assert.deepEqual([untouched.targetWidth, untouched.targetHeight], [800, 600]);

    const covered = core.renderPlan(1600, 900, {
        sizeMode: 'custom', width: 1200, height: 630, fit: 'cover', noUpscale: true
    });
    assert.deepEqual(
        [covered.targetWidth, covered.targetHeight, covered.renderWidth, covered.renderHeight, covered.offsetX, covered.offsetY],
        [1200, 630, 1200, 675, 0, -22]
    );

    const contained = core.renderPlan(1600, 900, {
        sizeMode: 'custom', width: 1200, height: 630, fit: 'contain', noUpscale: true
    });
    assert.deepEqual(
        [contained.renderWidth, contained.renderHeight, contained.offsetX, contained.offsetY],
        [1120, 630, 40, 0]
    );
}

function testNames() {
    const settings = core.normalizeSettings({ format: 'image/jpeg', suffix: '-og' });
    const filename = core.outputFilename('../封面:终稿.png', settings, { width: 1200, height: 630 });
    assert.equal(filename, '-封面-终稿-og-1200x630.jpg');

    const used = new Set();
    assert.equal(core.uniqueFilename('image.jpg', used), 'image.jpg');
    assert.equal(core.uniqueFilename('image.jpg', used), 'image-2.jpg');
}

function testRuntimeSurface() {
    const html = fs.readFileSync('tool-apps/image-workbench/index.html', 'utf8');
    const app = fs.readFileSync('tool-apps/image-workbench/app.js', 'utf8');
    assert.match(html, /connect-src 'none'/);
    assert.match(html, /tool-runtime\.js/);
    assert.doesNotMatch(html, /https:\/\//);
    assert.doesNotMatch(html, /localStorage/);
    assert.match(app, /new window\.Cropper/);
    assert.match(app, /state\.pica\.resize/);
    assert.match(app, /window\.fflate\.zipSync/);
    assert.match(app, /blob\.arrayBuffer\(\)/);
    assert.match(app, /features: \['js'\]/);
    assert.match(html, /vendor\/exifr\.min\.js/);
    assert.match(html, /image-privacy\.js/);
    assert.match(html, /data-inspector-tab="privacy"/);
    assert.match(app, /privacy\.verifySanitized/);
    assert.match(app, /metadataReader\.parse/);
    assert.doesNotMatch(app, /storage\.setItem\([^)]*(?:metadata|exif|gps|privacy)/i);

    const selectors = [...app.matchAll(/(?:one|all)\('(\[data-[^']+\])'/g)].map(function(match) {
        return match[1].slice(1, -1).split('=')[0];
    });
    selectors.forEach(function(attribute) {
        assert.match(html, new RegExp('\\b' + attribute + '\\b'), 'missing app element for ' + attribute);
    });
}

function testPrivacyClassification() {
    const report = privacy.createReport({
        latitude: 31.230416,
        longitude: 121.473701,
        BodySerialNumber: 'CAMERA-123',
        Model: 'Example Camera',
        DateTimeOriginal: new Date(2026, 6, 26, 10, 30, 0),
        FNumber: 2.8
    }, [{ kind: 'exif', label: 'EXIF / GPS', offset: 2, size: 128 }]);

    assert.equal(report.risk, 'high');
    assert.deepEqual(report.location, { latitude: 31.230416, longitude: 121.473701 });
    assert.equal(report.groups.some(function(group) { return group.name === 'location'; }), true);
    assert.equal(report.groups.some(function(group) { return group.name === 'identity'; }), true);
    assert.equal(report.entries.find(function(entry) {
        return entry.key === 'BodySerialNumber';
    }).label, '机身序列号');

    const clean = privacy.createReport({}, []);
    assert.equal(clean.risk, 'clean');
    assert.equal(clean.counts.fields, 0);
}

async function testPrivacyCarriers() {
    const jpegWithExif = new Blob([
        bytes(
            Uint8Array.of(0xff, 0xd8),
            jpegSegment(0xe1, bytes(ascii('Exif'), Uint8Array.of(0, 0), ascii('private'))),
            Uint8Array.of(0xff, 0xd9)
        )
    ], { type: 'image/jpeg' });
    const jpegClean = new Blob([
        bytes(
            Uint8Array.of(0xff, 0xd8),
            jpegSegment(0xe0, ascii('JFIF')),
            Uint8Array.of(0xff, 0xd9)
        )
    ], { type: 'image/jpeg' });

    const pngSignature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    const pngWithText = new Blob([
        bytes(
            pngSignature,
            pngChunk('tEXt', ascii('Author\0Private Name')),
            pngChunk('IEND', new Uint8Array())
        )
    ], { type: 'image/png' });

    const exifChunk = webpChunk('EXIF', bytes(ascii('Exif'), Uint8Array.of(0, 0), ascii('private')));
    const webpPayload = bytes(ascii('WEBP'), exifChunk);
    const webpWithExif = new Blob([
        bytes(ascii('RIFF'), uint32le(webpPayload.length), webpPayload)
    ], { type: 'image/webp' });

    assert.deepEqual(
        (await privacy.scanMetadataCarriers(jpegWithExif, 'image/jpeg')).map(function(item) { return item.kind; }),
        ['exif']
    );
    assert.equal((await privacy.scanMetadataCarriers(pngWithText, 'image/png'))[0].kind, 'text');
    assert.equal((await privacy.scanMetadataCarriers(webpWithExif, 'image/webp'))[0].kind, 'exif');
    assert.equal((await privacy.verifySanitized(jpegClean, 'image/jpeg')).clean, true);
    assert.equal((await privacy.verifySanitized(jpegWithExif, 'image/jpeg')).clean, false);
}

async function main() {
    testSettings();
    testRenderPlans();
    testNames();
    testRuntimeSurface();
    testPrivacyClassification();
    await testPrivacyCarriers();
    console.log('Validated image workbench core, privacy scan, sanitized export guard, and offline runtime surface.');
}

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
