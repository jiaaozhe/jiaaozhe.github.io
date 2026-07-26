(function(root, factory) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        module.exports = factory;
    } else {
        root.TextDiffCore = factory(root.Diff);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(library) {
    'use strict';

    if (!library || typeof library.diffArrays !== 'function' ||
        typeof library.createTwoFilesPatch !== 'function' ||
        typeof library.applyPatch !== 'function') {
        throw new Error('文本差异依赖未加载。');
    }

    const DEFAULT_OPTIONS = Object.freeze({
        ignoreCase: false,
        ignoreWhitespace: false,
        intraline: 'auto',
        context: 3,
        timeout: 1800,
        maxEditLength: 16000
    });
    const CHANGE_KINDS = new Set(['added', 'removed', 'modified']);
    const CJK_PATTERN = /[\u2e80-\u2eff\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

    function normalizeOptions(raw) {
        const options = Object.assign({}, DEFAULT_OPTIONS, raw || {});
        options.ignoreCase = Boolean(options.ignoreCase);
        options.ignoreWhitespace = Boolean(options.ignoreWhitespace);
        options.intraline = ['auto', 'word', 'char', 'none'].includes(options.intraline)
            ? options.intraline
            : 'auto';
        options.context = options.context === 'all' ? 'all' : [3, 5].includes(Number(options.context))
            ? Number(options.context)
            : 3;
        options.timeout = Math.max(100, Math.min(5000, Number(options.timeout) || DEFAULT_OPTIONS.timeout));
        options.maxEditLength = Math.max(100, Math.min(50000, Number(options.maxEditLength) || DEFAULT_OPTIONS.maxEditLength));
        return options;
    }

    function normalizeLineEndings(value) {
        return String(value || '').replace(/\r\n?|\u2028|\u2029/g, '\n');
    }

    function newlineStyle(value) {
        const source = String(value || '');
        const crlf = (source.match(/\r\n/g) || []).length;
        const bareCr = (source.match(/\r(?!\n)/g) || []).length;
        const bareLf = (source.match(/(^|[^\r])\n/g) || []).length;
        const styles = [];
        if (crlf) styles.push('CRLF');
        if (bareLf) styles.push('LF');
        if (bareCr) styles.push('CR');
        if (!styles.length) return 'NONE';
        return styles.length === 1 ? styles[0] : 'MIXED';
    }

    function splitLineTokens(value) {
        const source = normalizeLineEndings(value);
        if (!source) return [];
        return source.match(/[^\n]*\n|[^\n]+$/g) || [];
    }

    function tokenInfo(token) {
        const source = String(token || '');
        const hasNewline = source.endsWith('\n');
        return {
            text: hasNewline ? source.slice(0, -1) : source,
            hasNewline: hasNewline
        };
    }

    function comparableToken(token, options) {
        const info = tokenInfo(token);
        let text = info.text;
        if (options.ignoreWhitespace) text = text.trim();
        if (options.ignoreCase) text = text.toLowerCase();
        return text + (info.hasNewline ? '\n' : '\u0000');
    }

    function tokensEqual(left, right, options) {
        return comparableToken(left, options) === comparableToken(right, options);
    }

    function appendSegment(target, text, kind) {
        if (!text) return;
        const previous = target[target.length - 1];
        if (previous && previous.kind === kind) {
            previous.text += text;
            return;
        }
        target.push({ text: text, kind: kind });
    }

    function intralineMode(left, right, requested) {
        if (requested !== 'auto') return requested;
        return CJK_PATTERN.test(left + right) ? 'char' : 'word';
    }

    function intralineSegments(left, right, options) {
        const mode = intralineMode(left, right, options.intraline);
        if (mode === 'none' || left.length + right.length > 12000) {
            return {
                left: [{ text: left, kind: 'removed' }],
                right: [{ text: right, kind: 'added' }],
                refined: false
            };
        }

        const diffOptions = {
            ignoreCase: options.ignoreCase,
            maxEditLength: 4000,
            timeout: Math.min(options.timeout, 250)
        };
        const changes = mode === 'char'
            ? library.diffChars(left, right, diffOptions)
            : library.diffWordsWithSpace(left, right, diffOptions);
        if (!changes) {
            return {
                left: [{ text: left, kind: 'removed' }],
                right: [{ text: right, kind: 'added' }],
                refined: false
            };
        }

        const leftSegments = [];
        const rightSegments = [];
        let leftOffset = 0;
        let rightOffset = 0;
        changes.forEach(function(change) {
            const length = String(change.value || '').length;
            if (change.removed) {
                appendSegment(leftSegments, left.slice(leftOffset, leftOffset + length), 'removed');
                leftOffset += length;
                return;
            }
            if (change.added) {
                appendSegment(rightSegments, right.slice(rightOffset, rightOffset + length), 'added');
                rightOffset += length;
                return;
            }
            appendSegment(leftSegments, left.slice(leftOffset, leftOffset + length), 'equal');
            appendSegment(rightSegments, right.slice(rightOffset, rightOffset + length), 'equal');
            leftOffset += length;
            rightOffset += length;
        });
        appendSegment(leftSegments, left.slice(leftOffset), 'removed');
        appendSegment(rightSegments, right.slice(rightOffset), 'added');
        return { left: leftSegments, right: rightSegments, refined: true };
    }

    function makeSide(token, lineNumber, segments) {
        if (token === undefined) return null;
        const info = tokenInfo(token);
        return {
            line: lineNumber,
            text: info.text,
            hasNewline: info.hasNewline,
            segments: segments || [{ text: info.text, kind: 'equal' }]
        };
    }

    function buildRows(changes, oldTokens, newTokens, options) {
        const rows = [];
        let oldCursor = 0;
        let newCursor = 0;
        let pendingOld = [];
        let pendingNew = [];

        function flushPending() {
            const count = Math.max(pendingOld.length, pendingNew.length);
            for (let index = 0; index < count; index += 1) {
                const oldEntry = pendingOld[index];
                const newEntry = pendingNew[index];
                let kind = 'removed';
                let segments = null;
                if (oldEntry && newEntry) {
                    kind = 'modified';
                    segments = intralineSegments(
                        tokenInfo(oldEntry.token).text,
                        tokenInfo(newEntry.token).text,
                        options
                    );
                } else if (newEntry) {
                    kind = 'added';
                }
                rows.push({
                    kind: kind,
                    old: oldEntry ? makeSide(oldEntry.token, oldEntry.line, segments && segments.left) : null,
                    new: newEntry ? makeSide(newEntry.token, newEntry.line, segments && segments.right) : null,
                    refined: Boolean(segments && segments.refined)
                });
            }
            pendingOld = [];
            pendingNew = [];
        }

        changes.forEach(function(change) {
            const count = Number(change.count) || (Array.isArray(change.value) ? change.value.length : 0);
            if (!change.added && !change.removed) {
                flushPending();
                for (let index = 0; index < count; index += 1) {
                    const oldToken = oldTokens[oldCursor];
                    const newToken = newTokens[newCursor];
                    const ignored = oldToken !== newToken && tokensEqual(oldToken, newToken, options);
                    rows.push({
                        kind: ignored ? 'ignored' : 'equal',
                        old: makeSide(oldToken, oldCursor + 1),
                        new: makeSide(newToken, newCursor + 1),
                        refined: false
                    });
                    oldCursor += 1;
                    newCursor += 1;
                }
                return;
            }
            if (change.removed) {
                for (let index = 0; index < count; index += 1) {
                    pendingOld.push({ token: oldTokens[oldCursor], line: oldCursor + 1 });
                    oldCursor += 1;
                }
            }
            if (change.added) {
                for (let index = 0; index < count; index += 1) {
                    pendingNew.push({ token: newTokens[newCursor], line: newCursor + 1 });
                    newCursor += 1;
                }
            }
        });
        flushPending();

        let hunk = 0;
        let insideChange = false;
        rows.forEach(function(row, index) {
            row.index = index;
            if (CHANGE_KINDS.has(row.kind)) {
                if (!insideChange) hunk += 1;
                insideChange = true;
                row.hunk = hunk;
            } else {
                insideChange = false;
                row.hunk = null;
            }
        });
        return rows;
    }

    function statsFor(rows, oldTokens, newTokens) {
        const stats = {
            oldLines: oldTokens.length,
            newLines: newTokens.length,
            added: 0,
            removed: 0,
            modified: 0,
            ignored: 0,
            hunks: 0
        };
        rows.forEach(function(row) {
            if (row.kind === 'added') stats.added += 1;
            else if (row.kind === 'removed') stats.removed += 1;
            else if (row.kind === 'modified') stats.modified += 1;
            else if (row.kind === 'ignored') stats.ignored += 1;
            if (row.hunk) stats.hunks = Math.max(stats.hunks, row.hunk);
        });
        stats.changedOldLines = stats.removed + stats.modified;
        stats.changedNewLines = stats.added + stats.modified;
        return stats;
    }

    function compare(oldValue, newValue, rawOptions) {
        const options = normalizeOptions(rawOptions);
        const oldRaw = String(oldValue || '');
        const newRaw = String(newValue || '');
        const oldText = normalizeLineEndings(oldRaw);
        const newText = normalizeLineEndings(newRaw);
        const oldTokens = splitLineTokens(oldText);
        const newTokens = splitLineTokens(newText);

        return new Promise(function(resolve, reject) {
            try {
                library.diffArrays(oldTokens, newTokens, {
                    comparator: function(left, right) {
                        return tokensEqual(left, right, options);
                    },
                    oneChangePerToken: true,
                    timeout: options.timeout,
                    maxEditLength: options.maxEditLength,
                    callback: function(changes) {
                        if (!changes) {
                            resolve({
                                ok: false,
                                reason: 'complexity-limit',
                                message: '文本差异过大，已停止计算以避免页面卡顿。',
                                options: options
                            });
                            return;
                        }
                        const rows = buildRows(changes, oldTokens, newTokens, options);
                        const stats = statsFor(rows, oldTokens, newTokens);
                        resolve({
                            ok: true,
                            oldText: oldText,
                            newText: newText,
                            rows: rows,
                            stats: stats,
                            options: options,
                            rawEqual: oldRaw === newRaw,
                            normalizedEqual: oldText === newText,
                            equivalent: stats.added === 0 && stats.removed === 0 && stats.modified === 0,
                            lineEndings: {
                                old: newlineStyle(oldRaw),
                                new: newlineStyle(newRaw),
                                normalized: oldRaw !== oldText || newRaw !== newText
                            }
                        });
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function visibleRows(rows, context) {
        const source = Array.isArray(rows) ? rows : [];
        if (context === 'all' || !source.length) return source.slice();
        const radius = [3, 5].includes(Number(context)) ? Number(context) : 3;
        const visible = new Array(source.length).fill(false);
        let hasChanges = false;
        source.forEach(function(row, index) {
            if (!CHANGE_KINDS.has(row.kind)) return;
            hasChanges = true;
            const start = Math.max(0, index - radius);
            const end = Math.min(source.length - 1, index + radius);
            for (let cursor = start; cursor <= end; cursor += 1) visible[cursor] = true;
        });
        if (!hasChanges) return [];

        const output = [];
        let index = 0;
        while (index < source.length) {
            if (visible[index]) {
                output.push(source[index]);
                index += 1;
                continue;
            }
            const start = index;
            while (index < source.length && !visible[index]) index += 1;
            output.push({
                kind: 'fold',
                count: index - start,
                startIndex: start,
                endIndex: index - 1
            });
        }
        return output;
    }

    function safeFilename(value, fallback) {
        const filename = String(value || '')
            .replace(/[\r\n\t]/g, ' ')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/^\.+/, '')
            .trim();
        return filename || fallback;
    }

    function createPatch(oldValue, newValue, rawOptions) {
        const options = normalizeOptions(rawOptions);
        const oldText = normalizeLineEndings(oldValue);
        const newText = normalizeLineEndings(newValue);
        const oldName = safeFilename(rawOptions && rawOptions.oldName, 'before.txt');
        const newName = safeFilename(rawOptions && rawOptions.newName, 'after.txt');
        const context = options.context === 'all' ? Number.MAX_SAFE_INTEGER : options.context;
        const patch = library.createTwoFilesPatch(
            oldName,
            newName,
            oldText,
            newText,
            '',
            '',
            {
                context: context,
                timeout: options.timeout,
                maxEditLength: options.maxEditLength,
                stripTrailingCr: true
            }
        );
        if (patch === undefined) {
            return {
                ok: false,
                patch: '',
                verified: false,
                message: '精确 Patch 计算超过复杂度限制。'
            };
        }
        const applied = library.applyPatch(oldText, patch, { autoConvertLineEndings: true });
        return {
            ok: applied !== false && applied === newText,
            patch: patch,
            verified: applied !== false && applied === newText,
            oldName: oldName,
            newName: newName,
            normalizedLineEndings: String(oldValue || '') !== oldText || String(newValue || '') !== newText,
            message: applied !== false && applied === newText
                ? 'Patch 回放后与新文本一致。'
                : 'Patch 回放验证失败。'
        };
    }

    return Object.freeze({
        CHANGE_KINDS: CHANGE_KINDS,
        compare: compare,
        createPatch: createPatch,
        newlineStyle: newlineStyle,
        normalizeLineEndings: normalizeLineEndings,
        normalizeOptions: normalizeOptions,
        safeFilename: safeFilename,
        splitLineTokens: splitLineTokens,
        tokenInfo: tokenInfo,
        visibleRows: visibleRows
    });
});
