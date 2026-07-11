const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../tool-apps/image-workbench/image-core.js');

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

    const selectors = [...app.matchAll(/(?:one|all)\('(\[data-[^']+\])'/g)].map(function(match) {
        return match[1].slice(1, -1).split('=')[0];
    });
    selectors.forEach(function(attribute) {
        assert.match(html, new RegExp('\\b' + attribute + '\\b'), 'missing app element for ' + attribute);
    });
}

testSettings();
testRenderPlans();
testNames();
testRuntimeSurface();
console.log('Validated image workbench core and offline runtime surface.');
