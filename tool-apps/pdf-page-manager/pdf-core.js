(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.PDFPageCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    function normalizeRotation(value) {
        const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
        const snapped = Math.round(numeric / 90) * 90;
        return ((snapped % 360) + 360) % 360;
    }

    function clonePage(page) {
        return {
            id: page.id,
            sourceId: page.sourceId,
            sourcePageIndex: page.sourcePageIndex,
            rotation: normalizeRotation(page.rotation)
        };
    }

    function clonePages(pages) {
        return pages.map(clonePage);
    }

    function rotatePages(pages, pageIds, delta) {
        const selected = new Set(pageIds);
        return pages.map(function(page) {
            if (!selected.has(page.id)) return clonePage(page);
            const next = clonePage(page);
            next.rotation = normalizeRotation(next.rotation + delta);
            return next;
        });
    }

    function deletePages(pages, pageIds) {
        const selected = new Set(pageIds);
        return pages.filter(function(page) {
            return !selected.has(page.id);
        }).map(clonePage);
    }

    function duplicatePages(pages, pageIds, makeId) {
        const selected = new Set(pageIds);
        const createdIds = [];
        const nextPages = [];

        pages.forEach(function(page) {
            nextPages.push(clonePage(page));
            if (!selected.has(page.id)) return;
            const duplicate = clonePage(page);
            duplicate.id = makeId(page);
            createdIds.push(duplicate.id);
            nextPages.push(duplicate);
        });

        return { pages: nextPages, createdIds: createdIds };
    }

    function movePagesBefore(pages, pageIds, beforeId) {
        const movingIds = new Set(pageIds);
        const moving = pages.filter(function(page) {
            return movingIds.has(page.id);
        }).map(clonePage);
        const remaining = pages.filter(function(page) {
            return !movingIds.has(page.id);
        }).map(clonePage);

        if (!moving.length) return clonePages(pages);
        const targetIndex = beforeId ? remaining.findIndex(function(page) {
            return page.id === beforeId;
        }) : -1;
        const insertAt = targetIndex < 0 ? remaining.length : targetIndex;
        remaining.splice.apply(remaining, [insertAt, 0].concat(moving));
        return remaining;
    }

    function shiftPages(pages, pageIds, direction) {
        const selected = new Set(pageIds);
        const next = clonePages(pages);

        if (direction < 0) {
            for (let index = 1; index < next.length; index += 1) {
                if (selected.has(next[index].id) && !selected.has(next[index - 1].id)) {
                    const previous = next[index - 1];
                    next[index - 1] = next[index];
                    next[index] = previous;
                }
            }
        } else {
            for (let index = next.length - 2; index >= 0; index -= 1) {
                if (selected.has(next[index].id) && !selected.has(next[index + 1].id)) {
                    const following = next[index + 1];
                    next[index + 1] = next[index];
                    next[index] = following;
                }
            }
        }

        return next;
    }

    function rangeIds(pages, firstId, lastId) {
        const first = pages.findIndex(function(page) { return page.id === firstId; });
        const last = pages.findIndex(function(page) { return page.id === lastId; });
        if (first < 0 || last < 0) return lastId ? [lastId] : [];
        const start = Math.min(first, last);
        const end = Math.max(first, last);
        return pages.slice(start, end + 1).map(function(page) { return page.id; });
    }

    function buildExportPages(pages, selectedIds, mode) {
        if (mode === 'selected' || mode === 'split') {
            const selected = new Set(selectedIds);
            return pages.filter(function(page) { return selected.has(page.id); }).map(clonePage);
        }
        return clonePages(pages);
    }

    function stripPdfExtension(value) {
        return String(value || '').replace(/\.pdf$/i, '');
    }

    function sanitizeBaseName(value, fallback) {
        const cleaned = stripPdfExtension(value)
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/^\.+/, '')
            .replace(/[. ]+$/g, '')
            .trim()
            .slice(0, 120);
        return cleaned || fallback || 'document';
    }

    function outputFilename(value, extension) {
        const ext = String(extension || 'pdf').replace(/^\.+/, '').toLowerCase();
        return sanitizeBaseName(value, 'document') + '.' + ext;
    }

    function uniqueFilename(name, used) {
        if (!used.has(name)) {
            used.add(name);
            return name;
        }

        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const extension = dot > 0 ? name.slice(dot) : '';
        let suffix = 2;
        let candidate = stem + '-' + suffix + extension;
        while (used.has(candidate)) {
            suffix += 1;
            candidate = stem + '-' + suffix + extension;
        }
        used.add(candidate);
        return candidate;
    }

    function splitFilename(sourceName, pageNumber, pageCount, used) {
        const width = Math.max(3, String(Math.max(1, pageCount)).length);
        const number = String(Math.max(1, pageNumber)).padStart(width, '0');
        const base = sanitizeBaseName(sourceName, 'document');
        return uniqueFilename(base + '-p' + number + '.pdf', used);
    }

    function formatBytes(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return Math.round(bytes) + ' B';
        const units = ['KB', 'MB', 'GB'];
        let size = bytes / 1024;
        let index = 0;
        while (size >= 1024 && index < units.length - 1) {
            size /= 1024;
            index += 1;
        }
        const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2;
        return size.toFixed(precision) + ' ' + units[index];
    }

    function samePageOrder(left, right) {
        if (left.length !== right.length) return false;
        return left.every(function(page, index) {
            const other = right[index];
            return other && page.id === other.id &&
                page.sourceId === other.sourceId &&
                page.sourcePageIndex === other.sourcePageIndex &&
                normalizeRotation(page.rotation) === normalizeRotation(other.rotation);
        });
    }

    return Object.freeze({
        normalizeRotation: normalizeRotation,
        clonePage: clonePage,
        clonePages: clonePages,
        rotatePages: rotatePages,
        deletePages: deletePages,
        duplicatePages: duplicatePages,
        movePagesBefore: movePagesBefore,
        shiftPages: shiftPages,
        rangeIds: rangeIds,
        buildExportPages: buildExportPages,
        sanitizeBaseName: sanitizeBaseName,
        outputFilename: outputFilename,
        uniqueFilename: uniqueFilename,
        splitFilename: splitFilename,
        formatBytes: formatBytes,
        samePageOrder: samePageOrder
    });
});
