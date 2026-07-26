const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function browserContext() {
    const context = vm.createContext({
        console: console,
        Promise: Promise,
        Intl: Intl,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout
    });
    context.globalThis = context;
    context.window = context;
    context.self = context;
    vm.runInContext(
        fs.readFileSync('tool-apps/text-diff/vendor/diff.js', 'utf8'),
        context,
        { filename: 'vendor/diff.js' }
    );
    vm.runInContext(
        fs.readFileSync('tool-apps/text-diff/diff-core.js', 'utf8'),
        context,
        { filename: 'diff-core.js' }
    );
    return context;
}

async function testLineDiffAndIntralineDetail() {
    const core = browserContext().TextDiffCore;
    const result = await core.compare(
        'alpha\nbeta value\ngamma\n',
        'alpha\nbetter value\ngamma\ndelta\n',
        { intraline: 'word' }
    );
    assert.equal(result.ok, true);
    assert.equal(result.equivalent, false);
    assert.deepEqual(
        JSON.parse(JSON.stringify(result.stats)),
        {
            oldLines: 3,
            newLines: 4,
            added: 1,
            removed: 0,
            modified: 1,
            ignored: 0,
            hunks: 2,
            changedOldLines: 1,
            changedNewLines: 2
        }
    );
    assert.deepEqual(Array.from(result.rows, (row) => row.kind), ['equal', 'modified', 'equal', 'added']);
    const modified = result.rows[1];
    assert.equal(modified.refined, true);
    assert.equal(modified.old.segments.some((segment) => segment.kind === 'removed'), true);
    assert.equal(modified.new.segments.some((segment) => segment.kind === 'added'), true);
    assert.equal(modified.old.line, 2);
    assert.equal(modified.new.line, 2);
}

async function testComparisonRulesAndLineEndings() {
    const core = browserContext().TextDiffCore;
    const exact = await core.compare('  Name: Demo\r\n', 'name: demo\n', {});
    assert.equal(exact.equivalent, false);
    assert.equal(exact.lineEndings.old, 'CRLF');
    assert.equal(exact.lineEndings.new, 'LF');
    assert.equal(exact.lineEndings.normalized, true);

    const equivalent = await core.compare(
        '  Name: Demo\r\n',
        'name: demo\n',
        { ignoreCase: true, ignoreWhitespace: true }
    );
    assert.equal(equivalent.ok, true);
    assert.equal(equivalent.equivalent, true);
    assert.equal(equivalent.rawEqual, false);
    assert.equal(equivalent.stats.ignored, 1);
    assert.equal(equivalent.rows[0].kind, 'ignored');

    const missingFinalNewline = await core.compare('value\n', 'value', {});
    assert.equal(missingFinalNewline.equivalent, false);
    assert.equal(missingFinalNewline.rows[0].kind, 'modified');
    assert.equal(missingFinalNewline.rows[0].old.hasNewline, true);
    assert.equal(missingFinalNewline.rows[0].new.hasNewline, false);
}

async function testChineseAndSafeText() {
    const core = browserContext().TextDiffCore;
    const result = await core.compare(
        '负责人：林溪\n<script>alert(1)</script>\n',
        '主要负责人：林溪\n<script>alert(2)</script>\n',
        { intraline: 'auto' }
    );
    assert.equal(result.ok, true);
    assert.equal(result.stats.modified, 2);
    assert.equal(result.rows[0].refined, true);
    assert.equal(result.rows[0].new.segments.some((segment) => segment.kind === 'added'), true);
    assert.match(result.rows[1].old.text, /<script>/);
    assert.match(result.rows[1].new.text, /<script>/);
}

async function testContextFolding() {
    const core = browserContext().TextDiffCore;
    const before = Array.from({ length: 30 }, (_, index) => 'line ' + (index + 1)).join('\n') + '\n';
    const afterLines = before.trimEnd().split('\n');
    afterLines[14] = 'line fifteen changed';
    const result = await core.compare(before, afterLines.join('\n') + '\n', {});
    const compact = core.visibleRows(result.rows, 3);
    assert.equal(compact.some((row) => row.kind === 'fold'), true);
    assert.equal(compact.filter((row) => row.kind === 'modified').length, 1);
    assert.equal(core.visibleRows(result.rows, 'all').length, result.rows.length);
}

async function testComplexityGuard() {
    const core = browserContext().TextDiffCore;
    const oldText = Array.from({ length: 180 }, (_, index) => 'old-' + index).join('\n');
    const newText = Array.from({ length: 180 }, (_, index) => 'new-' + index).join('\n');
    const result = await core.compare(oldText, newText, {
        maxEditLength: 100,
        timeout: 1000
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'complexity-limit');
}

function testPatchRoundTrip() {
    const runtime = browserContext();
    const core = runtime.TextDiffCore;
    const before = 'one\ntwo\nthree\n';
    const after = 'one\nsecond\nthree\nfour\n';
    const result = core.createPatch(before, after, {
        oldName: '../draft:v1.txt',
        newName: 'draft/v2.txt',
        context: 3
    });
    assert.equal(result.ok, true);
    assert.equal(result.verified, true);
    assert.equal(result.oldName, '-draft-v1.txt');
    assert.equal(result.newName, 'draft-v2.txt');
    assert.match(result.patch, /--- -draft-v1\.txt/);
    assert.match(result.patch, /\+second/);
    assert.match(result.patch, /\+four/);
    assert.equal(runtime.Diff.applyPatch(before, result.patch), after);
}

function testRuntimeSurface() {
    const html = fs.readFileSync('tool-apps/text-diff/index.html', 'utf8');
    const app = fs.readFileSync('tool-apps/text-diff/app.js', 'utf8');
    const core = fs.readFileSync('tool-apps/text-diff/diff-core.js', 'utf8');
    const css = fs.readFileSync('tool-apps/text-diff/app.css', 'utf8');
    const vendor = fs.readFileSync('tool-apps/text-diff/vendor/diff.js', 'utf8');

    assert.match(html, /connect-src 'none'/);
    assert.match(html, /worker-src 'none'/);
    assert.match(html, /tool-runtime\.js/);
    assert.match(html, /vendor\/diff\.js/);
    assert.match(html, /diff-core\.js/);
    assert.doesNotMatch(html, /localStorage/);
    assert.doesNotMatch(app, /localStorage/);
    assert.doesNotMatch(app, /innerHTML/);
    assert.match(app, /toolStorage\.setItem\(PREFERENCES_KEY/);
    assert.doesNotMatch(app, /toolStorage\.setItem\([^)]*(?:oldInput|newInput|raw|patch|text)/i);
    assert.match(app, /navigator\.clipboard/);
    assert.match(app, /URL\.createObjectURL/);
    assert.match(app, /TextDecoder\('utf-8', \{ fatal: true \}\)/);
    assert.match(app, /MAX_FILE_BYTES = 2 \* 1024 \* 1024/);
    assert.doesNotMatch(core, /document|window/);
    assert.match(css, /@media \(max-width: 860px\)/);
    assert.match(css, /@media \(max-width: 600px\)/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(vendor, /createTwoFilesPatch/);
    assert.match(vendor, /diffWordsWithSpace/);

    const selectors = [...app.matchAll(/(?:one|all)\('([^']+)'\)/g)]
        .map((match) => match[1])
        .filter((selector) => /^\[data-[^\]]+\]$/.test(selector));
    new Set(selectors).forEach((selector) => {
        const attribute = selector.slice(1, -1).split('=')[0];
        assert.match(html, new RegExp('\\b' + attribute + '\\b'), 'missing app element for ' + attribute);
    });
}

async function main() {
    await testLineDiffAndIntralineDetail();
    await testComparisonRulesAndLineEndings();
    await testChineseAndSafeText();
    await testContextFolding();
    await testComplexityGuard();
    testPatchRoundTrip();
    testRuntimeSurface();
    console.log('Validated text diff rules, intraline detail, folding, complexity limits, exact Patch replay, and offline runtime surface.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
