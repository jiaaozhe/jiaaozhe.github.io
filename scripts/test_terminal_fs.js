const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const filesystem = require('../assets/js/site-terminal-fs.js');
const manifest = JSON.parse(fs.readFileSync('_site/site-manifest.json', 'utf8'));

test('terminal filesystem derives sections, aliases, and links from the manifest', function() {
    const { root, shortcuts } = filesystem.create(manifest);
    const post = manifest.routes.find(route => route.type === 'post');
    const entry = filesystem.getNode(root, ['posts', post.source_path.split('/').pop()]);
    assert.equal(entry.route, post.url);
    assert.equal(entry.contentId, post.id);
    assert.equal(filesystem.getNode(root, ['uses', 'ghostty']).route, '/uses/ghostty/');
    assert.equal(shortcuts.about, '/introduction/');
    assert.equal(filesystem.getNode(root, ['missing']), null);
    assert.equal(filesystem.byteLength('中文'), 6);
});

test('terminal paths handle root, home, relative parents, and empty input', function() {
    const cwd = ['posts', 'article'];
    assert.deepEqual(filesystem.resolveParts('../other', cwd), ['posts', 'other']);
    assert.deepEqual(filesystem.resolveParts('~/uses/ghostty', cwd), ['uses', 'ghostty']);
    assert.deepEqual(filesystem.resolveParts('/../../', cwd), []);
    assert.deepEqual(filesystem.resolveParts('', cwd), cwd);
    assert.deepEqual(cwd, ['posts', 'article']);
});
