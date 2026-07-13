(function(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.QRWorkbenchDecoder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
    'use strict';

    const MAX_FILE_BYTES = 24 * 1024 * 1024;
    const MAX_EDGE = 2800;
    const MAX_PIXELS = 12 * 1024 * 1024;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    function decoder() {
        if (typeof root.jsQR !== 'function') throw new Error('二维码识别依赖未加载。');
        return root.jsQR;
    }

    function decodeCanvas(canvas) {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('无法读取图片画布。');
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        return decoder()(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    }

    function imageElement(blob) {
        return new Promise(function(resolve, reject) {
            const url = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = function() {
                URL.revokeObjectURL(url);
                resolve(image);
            };
            image.onerror = function() {
                URL.revokeObjectURL(url);
                reject(new Error('图片无法解码。'));
            };
            image.src = url;
        });
    }

    async function bitmap(blob) {
        if (typeof createImageBitmap === 'function') {
            try {
                return await createImageBitmap(blob, { imageOrientation: 'from-image' });
            } catch (error) {
                return imageElement(blob);
            }
        }
        return imageElement(blob);
    }

    function dimensions(source) {
        return {
            width: Number(source.width || source.naturalWidth || 0),
            height: Number(source.height || source.naturalHeight || 0)
        };
    }

    function renderSize(width, height) {
        const edgeScale = Math.min(1, MAX_EDGE / Math.max(width, height));
        const pixelScale = Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)));
        const scale = Math.min(edgeScale, pixelScale);
        return {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
            scale: scale
        };
    }

    async function decodeFile(file, canvas) {
        if (!file || typeof file.size !== 'number') throw new Error('请选择二维码图片。');
        const extensionTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
        const extension = String(file.name || '').split('.').pop().toLowerCase();
        const detectedType = file.type || extensionTypes[extension] || '';
        if (!ALLOWED_TYPES.includes(detectedType)) throw new Error('仅支持 JPEG、PNG 和 WebP 图片。');
        if (file.size > MAX_FILE_BYTES) throw new Error('图片不能超过 24 MB。');

        const source = await bitmap(file);
        const sourceSize = dimensions(source);
        if (!sourceSize.width || !sourceSize.height) throw new Error('无法读取图片尺寸。');
        const target = renderSize(sourceSize.width, sourceSize.height);
        const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        if (!context) throw new Error('无法创建识别画布。');
        canvas.width = target.width;
        canvas.height = target.height;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, target.width, target.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, target.width, target.height);
        if (typeof source.close === 'function') source.close();

        return {
            result: decodeCanvas(canvas),
            sourceWidth: sourceSize.width,
            sourceHeight: sourceSize.height,
            renderWidth: target.width,
            renderHeight: target.height,
            scale: target.scale
        };
    }

    return {
        ALLOWED_TYPES: ALLOWED_TYPES,
        MAX_FILE_BYTES: MAX_FILE_BYTES,
        decodeCanvas: decodeCanvas,
        decodeFile: decodeFile
    };
});
