const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('tool-apps/lengyi-markdown-editor/index.html', 'utf8');
function between(start, end) {
    const offset = source.indexOf(start);
    const finish = source.indexOf(end, offset);
    assert(offset >= 0 && finish > offset);
    return source.slice(offset, finish);
}
async function main() {
    assert.match(source, /mermaid\.initialize\(\{[^\n]*htmlLabels: false/, 'Mermaid labels must use SVG text compatible with sanitization');
    assert.match(source, /DOMPurify\.sanitize\(svg, \{ USE_PROFILES: \{ svg: true, svgFilters: true \} \}\)/);
    const editor = { value: '# Restored draft' };
    const saved = [];
    const context = vm.createContext({
        editor: editor, previewSource: { value: '', style: {}, focus() {} }, preview: { style: {} },
        previewMode: 'preview', PREVIEW_MODE_KEY: 'mode', storage: { setItem: (...args) => saved.push(args) },
        document: { querySelectorAll: () => [] }, updatePreview() {}, updateCount() {},
        autoSave: () => { throw new Error('Switching view must not overwrite the draft'); }
    });
    vm.runInContext(between('    function setPreviewMode(mode)', '    // 自动保存'), context);
    vm.runInContext("setPreviewMode('preview')", context);
    assert.equal(editor.value, '# Restored draft', 'initial preview must preserve the restored draft');
    vm.runInContext("setPreviewMode('source')", context);
    assert.equal(context.previewSource.value, editor.value);
    editor.value = 'latest editor input';
    vm.runInContext("setPreviewMode('preview')", context);
    assert.equal(editor.value, 'latest editor input', 'stale source text must not replace current editor input');

    let resolve, reject;
    const hints = { textContent: '', classList: { add() {}, remove() {} } };
    const saveContext = vm.createContext({
        editor: editor, filenameInput: { value: 'test.md' }, saveHint: hints,
        currentLang: 'zh-CN', STORAGE_KEY: 'draft', FILENAME_KEY: 'filename',
        storage: { setItems: () => new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; }) },
        document: { addEventListener() {} }, window: { addEventListener() {} },
        setTimeout: () => 1, clearTimeout() {}, t: key => key, showToast() {}
    });
    vm.runInContext(between('    let saveTimer;', '    // 导出文件'), saveContext);
    const failed = vm.runInContext('persistDocument(true)', saveContext);
    assert.equal(hints.textContent, '正在保存…');
    reject(new Error('disk full'));
    await failed;
    assert.equal(hints.textContent, '保存失败，请重试');
    const retry = vm.runInContext('persistDocument(true)', saveContext);
    resolve();
    await retry;
    assert.equal(hints.textContent, '✓ saved');
    console.log('Validated Markdown restoration, source/preview switching, and confirmed save feedback.');
}
main().catch(function(error) { console.error(error); process.exitCode = 1; });
