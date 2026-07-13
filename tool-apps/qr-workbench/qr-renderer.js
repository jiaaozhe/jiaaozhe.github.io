(function(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.QRWorkbenchRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
    'use strict';

    function dependencies() {
        if (!root.QRCode || typeof root.QRCode.create !== 'function') throw new Error('二维码生成依赖未加载。');
        if (!root.QRWorkbenchCore) throw new Error('二维码核心模块未加载。');
        return { encoder: root.QRCode, core: root.QRWorkbenchCore };
    }

    function createSymbol(payload, settings) {
        const loaded = dependencies();
        const normalized = loaded.core.normalizeSettings(settings);
        return loaded.encoder.create(payload, { errorCorrectionLevel: normalized.errorLevel });
    }

    function isFinderCell(row, column, size) {
        return (row < 7 && column < 7) ||
            (row < 7 && column >= size - 7) ||
            (row >= size - 7 && column < 7);
    }

    function darkAt(symbol, row, column) {
        return Boolean(symbol.modules.data[row * symbol.modules.size + column]);
    }

    function roundedRect(context, x, y, width, height, radius) {
        const safeRadius = Math.min(radius, width / 2, height / 2);
        context.beginPath();
        context.moveTo(x + safeRadius, y);
        context.lineTo(x + width - safeRadius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
        context.lineTo(x + width, y + height - safeRadius);
        context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
        context.lineTo(x + safeRadius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
        context.lineTo(x, y + safeRadius);
        context.quadraticCurveTo(x, y, x + safeRadius, y);
        context.closePath();
        context.fill();
    }

    function renderCanvas(canvas, symbol, settings, requestedSize) {
        const loaded = dependencies();
        const normalized = loaded.core.normalizeSettings(settings);
        const size = symbol.modules.size;
        const plan = loaded.core.outputPlan(size, requestedSize || normalized.outputSize, normalized.margin);
        const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
        if (!context) throw new Error('当前浏览器无法创建二维码画布。');

        canvas.width = plan.size;
        canvas.height = plan.size;
        context.clearRect(0, 0, plan.size, plan.size);
        context.imageSmoothingEnabled = false;
        if (!normalized.transparent) {
            context.fillStyle = normalized.light;
            context.fillRect(0, 0, plan.size, plan.size);
        }
        context.fillStyle = normalized.dark;

        for (let row = 0; row < size; row += 1) {
            for (let column = 0; column < size; column += 1) {
                if (!darkAt(symbol, row, column)) continue;
                const x = (column + plan.margin) * plan.scale;
                const y = (row + plan.margin) * plan.scale;
                if (normalized.moduleStyle === 'soft' && !isFinderCell(row, column, size) && plan.scale >= 3) {
                    roundedRect(context, x, y, plan.scale, plan.scale, plan.scale * 0.22);
                } else {
                    context.fillRect(x, y, plan.scale, plan.scale);
                }
            }
        }
        return plan;
    }

    function svgEscape(value) {
        return String(value).replace(/[&<>"']/g, function(character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character];
        });
    }

    function svg(symbol, settings) {
        const loaded = dependencies();
        const normalized = loaded.core.normalizeSettings(settings);
        const size = symbol.modules.size;
        const total = size + normalized.margin * 2;
        const squareCommands = [];
        const softRects = [];

        for (let row = 0; row < size; row += 1) {
            for (let column = 0; column < size; column += 1) {
                if (!darkAt(symbol, row, column)) continue;
                const x = column + normalized.margin;
                const y = row + normalized.margin;
                if (normalized.moduleStyle === 'soft' && !isFinderCell(row, column, size)) {
                    softRects.push('<rect x="' + x + '" y="' + y + '" width="1" height="1" rx=".22"/>');
                } else {
                    squareCommands.push('M' + x + ' ' + y + 'h1v1h-1z');
                }
            }
        }

        const parts = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + normalized.outputSize + '" height="' + normalized.outputSize + '" role="img" aria-label="二维码">'
        ];
        if (!normalized.transparent) parts.push('<path fill="' + svgEscape(normalized.light) + '" d="M0 0h' + total + 'v' + total + 'H0z"/>');
        parts.push('<g fill="' + svgEscape(normalized.dark) + '">');
        if (squareCommands.length) parts.push('<path d="' + squareCommands.join('') + '"/>');
        if (softRects.length) parts.push(softRects.join(''));
        parts.push('</g></svg>');
        return parts.join('');
    }

    return {
        createSymbol: createSymbol,
        renderCanvas: renderCanvas,
        svg: svg
    };
});
