// Synthetic local fixtures for browser regression checks; no user files are used.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const pdf = require('../tool-apps/pdf-page-manager/vendor/pdf-lib.min.js');
function crc32(data) {
    let crc = -1;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}
async function main() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-regression-'));
    const document = await pdf.PDFDocument.create();
    const font = await document.embedFont(pdf.StandardFonts.Helvetica);
    for (let index = 0; index < 80; index++) {
        const page = document.addPage([420, 594]);
        page.drawText('Synthetic page ' + (index + 1), { x: 30, y: 500, size: 24, font: font });
    }
    fs.writeFileSync(path.join(directory, 'pages.pdf'), await document.save());
    const header = Buffer.alloc(13);
    header.writeUInt32BE(512, 0); header.writeUInt32BE(384, 4); header[8] = 8; header[9] = 2;
    const raw = Buffer.alloc((512 * 3 + 1) * 384);
    for (let y = 0; y < 384; y++) for (let x = 0; x < 512; x++) {
        const offset = y * 1537 + 1 + x * 3;
        raw[offset] = x % 256; raw[offset + 1] = y % 256; raw[offset + 2] = 100;
    }
    const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    fs.writeFileSync(path.join(directory, 'gradient-a.png'), png);
    fs.writeFileSync(path.join(directory, 'gradient-b.png'), png);
    console.log(directory);
}
main().catch(function(error) { console.error(error); process.exitCode = 1; });
