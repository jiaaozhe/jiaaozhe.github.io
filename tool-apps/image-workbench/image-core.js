(function(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.ImageWorkbenchCore = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const DEFAULT_SETTINGS = Object.freeze({
        sizeMode: 'long-edge',
        longEdge: 1600,
        width: 1200,
        height: 630,
        fit: 'contain',
        noUpscale: true,
        format: 'image/webp',
        quality: 0.82,
        background: '#ffffff',
        transparent: true,
        suffix: '-web'
    });

    const FORMATS = Object.freeze({
        'image/jpeg': Object.freeze({ extension: 'jpg', label: 'JPEG', lossy: true }),
        'image/png': Object.freeze({ extension: 'png', label: 'PNG', lossy: false }),
        'image/webp': Object.freeze({ extension: 'webp', label: 'WebP', lossy: true })
    });

    function clampNumber(value, minimum, maximum, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(maximum, Math.max(minimum, parsed));
    }

    function positiveInteger(value, fallback, maximum) {
        return Math.round(clampNumber(value, 1, maximum || 16384, fallback));
    }

    function normalizeSettings(input) {
        const source = input && typeof input === 'object' ? input : {};
        const format = Object.prototype.hasOwnProperty.call(FORMATS, source.format)
            ? source.format
            : DEFAULT_SETTINGS.format;
        const sizeMode = ['original', 'long-edge', 'custom'].includes(source.sizeMode)
            ? source.sizeMode
            : DEFAULT_SETTINGS.sizeMode;
        const fit = source.fit === 'cover' ? 'cover' : 'contain';
        const background = /^#[0-9a-f]{6}$/i.test(source.background || '')
            ? source.background.toLowerCase()
            : DEFAULT_SETTINGS.background;
        const suffix = String(source.suffix == null ? DEFAULT_SETTINGS.suffix : source.suffix)
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
            .slice(0, 40);

        return {
            sizeMode: sizeMode,
            longEdge: positiveInteger(source.longEdge, DEFAULT_SETTINGS.longEdge),
            width: positiveInteger(source.width, DEFAULT_SETTINGS.width),
            height: positiveInteger(source.height, DEFAULT_SETTINGS.height),
            fit: fit,
            noUpscale: source.noUpscale !== false,
            format: format,
            quality: clampNumber(source.quality, 0.1, 1, DEFAULT_SETTINGS.quality),
            background: background,
            transparent: source.transparent !== false,
            suffix: suffix
        };
    }

    function renderPlan(sourceWidth, sourceHeight, inputSettings) {
        const sourceW = positiveInteger(sourceWidth, 1, 65535);
        const sourceH = positiveInteger(sourceHeight, 1, 65535);
        const settings = normalizeSettings(inputSettings);
        let targetWidth = sourceW;
        let targetHeight = sourceH;
        let scale = 1;

        if (settings.sizeMode === 'long-edge') {
            scale = settings.longEdge / Math.max(sourceW, sourceH);
            if (settings.noUpscale) scale = Math.min(1, scale);
            targetWidth = Math.max(1, Math.round(sourceW * scale));
            targetHeight = Math.max(1, Math.round(sourceH * scale));
        }

        if (settings.sizeMode === 'custom') {
            targetWidth = settings.width;
            targetHeight = settings.height;
            const widthScale = targetWidth / sourceW;
            const heightScale = targetHeight / sourceH;
            scale = settings.fit === 'cover'
                ? Math.max(widthScale, heightScale)
                : Math.min(widthScale, heightScale);
            if (settings.noUpscale) scale = Math.min(1, scale);
        }

        const renderWidth = Math.max(1, Math.round(sourceW * scale));
        const renderHeight = Math.max(1, Math.round(sourceH * scale));

        return {
            sourceWidth: sourceW,
            sourceHeight: sourceH,
            targetWidth: targetWidth,
            targetHeight: targetHeight,
            renderWidth: renderWidth,
            renderHeight: renderHeight,
            offsetX: Math.round((targetWidth - renderWidth) / 2),
            offsetY: Math.round((targetHeight - renderHeight) / 2),
            scale: scale,
            fit: settings.fit
        };
    }

    function fileStem(filename) {
        const normalized = String(filename || 'image')
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
            .replace(/^\.+|\.+$/g, '')
            .trim();
        const withoutExtension = normalized.replace(/\.[^.]+$/, '');
        return withoutExtension || 'image';
    }

    function outputFilename(filename, inputSettings, dimensions) {
        const settings = normalizeSettings(inputSettings);
        const format = FORMATS[settings.format] || FORMATS[DEFAULT_SETTINGS.format];
        const size = dimensions && dimensions.width && dimensions.height
            ? '-' + positiveInteger(dimensions.width, 1) + 'x' + positiveInteger(dimensions.height, 1)
            : '';
        return fileStem(filename) + settings.suffix + size + '.' + format.extension;
    }

    function uniqueFilename(filename, usedNames) {
        const used = usedNames instanceof Set ? usedNames : new Set();
        if (!used.has(filename)) {
            used.add(filename);
            return filename;
        }

        const match = String(filename).match(/^(.*?)(\.[^.]+)?$/);
        const stem = match ? match[1] : filename;
        const extension = match && match[2] ? match[2] : '';
        let index = 2;
        let candidate = stem + '-' + index + extension;

        while (used.has(candidate)) {
            index += 1;
            candidate = stem + '-' + index + extension;
        }

        used.add(candidate);
        return candidate;
    }

    function formatBytes(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return Math.round(bytes) + ' B';
        const units = ['KB', 'MB', 'GB'];
        let size = bytes / 1024;
        let unit = units[0];

        for (let index = 1; index < units.length && size >= 1024; index += 1) {
            size /= 1024;
            unit = units[index];
        }

        return (size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)) + ' ' + unit;
    }

    function formatDefinition(mimeType) {
        return FORMATS[mimeType] || null;
    }

    return Object.freeze({
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        FORMATS: FORMATS,
        normalizeSettings: normalizeSettings,
        renderPlan: renderPlan,
        fileStem: fileStem,
        outputFilename: outputFilename,
        uniqueFilename: uniqueFilename,
        formatBytes: formatBytes,
        formatDefinition: formatDefinition
    });
});
