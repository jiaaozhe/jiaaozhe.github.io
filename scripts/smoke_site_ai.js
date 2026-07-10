const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const manifest = JSON.parse(fs.readFileSync('_site/site-manifest.json', 'utf8'));
const content = JSON.parse(fs.readFileSync('_site/site-content.json', 'utf8'));
let contentReads = 0;

global.localStorage = {
    getItem: function() { return null; },
    removeItem: function() {},
    setItem: function() {}
};
global.window = {
    siteData: {
        getContent: async function(id) {
            contentReads += 1;
            return content.pages[id] || null;
        },
        loadContent: async function() {
            contentReads += 1;
            return content;
        },
        loadManifest: async function() {
            return manifest;
        }
    }
};

vm.runInThisContext(fs.readFileSync('assets/js/site-ai.js', 'utf8'), {
    filename: 'assets/js/site-ai.js'
});

async function main() {
    const posts = await window.siteAI.answerAsync('你有哪些文章？');
    assert(posts.some(function(line) {
        return line.includes('Hermes Agent 源码深度技术解读');
    }));
    assert.equal(contentReads, 0, 'catalog questions must not load page content');

    const ghostty = await window.siteAI.answerAsync('ghostty 配置是什么？');
    assert(ghostty.some(function(line) {
        return line.includes('font-family = CaskaydiaMono Nerd Font Mono');
    }));
    assert.equal(contentReads, 1, 'page-specific questions should load content once');

    console.log('Validated lazy site AI demo behavior.');
}

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
