const assert = require('node:assert/strict');
const library = require('../tool-apps/image-workbench/vendor/fflate.js');
const archives = require('../assets/js/tool-archive.js');

async function main() {
    const archive = archives.create(library, 4 * 1024 * 1024);
    const data = new Uint8Array(2500000).fill(42);
    await archive.add('中文.txt', new Blob(['archive test']));
    let yielded = false;
    setTimeout(function() { yielded = true; }, 0);
    await archive.add('large.bin', data);
    assert(yielded, 'large files must yield between chunks');
    await archive.add('empty.txt', new Uint8Array());
    await assert.rejects(archive.add('too-large.bin', data), /内存预算/);
    const blob = await archive.finish();
    const decoded = library.unzipSync(new Uint8Array(await blob.arrayBuffer()));
    assert.equal(new TextDecoder().decode(decoded['中文.txt']), 'archive test');
    assert.deepEqual(decoded['large.bin'], data);
    assert.equal(decoded['empty.txt'].length, 0);
    assert.equal(Object.hasOwn(decoded, 'too-large.bin'), false);
    archive.dispose();
    console.log('Validated chunked ZIP round trips, yielding, and archive size limits.');
}
main().catch(function(error) { console.error(error); process.exitCode = 1; });
