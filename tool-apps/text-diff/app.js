(function() {
    'use strict';

    const app = document.querySelector('[data-app]');
    if (!app || !window.TextDiffCore) return;

    const core = window.TextDiffCore;
    const PREFERENCES_KEY = 'text-diff.preferences.v1';
    const MAX_FILE_BYTES = 2 * 1024 * 1024;
    const AUTO_COMPARE_BYTES = 256 * 1024;
    const SAMPLE_OLD = [
        '部署检查清单',
        '',
        '1. 构建静态站点',
        '2. 上传资源',
        '3. 清理缓存',
        '',
        '超时时间：30 秒',
        '负责人：林溪',
        ''
    ].join('\n');
    const SAMPLE_NEW = [
        '部署检查清单',
        '',
        '1. 构建并校验静态站点',
        '2. 上传压缩资源',
        '3. 刷新边缘缓存',
        '4. 执行冒烟测试',
        '',
        '超时时间：45 秒',
        '负责人：林溪',
        ''
    ].join('\n');

    const state = {
        view: 'split',
        old: { raw: '', name: 'before.txt', encoding: 'UTF-8' },
        new: { raw: '', name: 'after.txt', encoding: 'UTF-8' },
        result: null,
        patch: null,
        compareToken: 0,
        currentHunk: 0,
        expandedFolds: new Set(),
        autoTimer: 0,
        toastTimer: 0
    };

    function one(selector) {
        return app.querySelector(selector);
    }

    function all(selector) {
        return Array.from(app.querySelectorAll(selector));
    }

    const elements = {
        stateCode: one('[data-state-code]'),
        stateTitle: one('[data-state-title]'),
        ignoreWhitespace: one('[data-ignore-whitespace]'),
        ignoreCase: one('[data-ignore-case]'),
        intraline: one('[data-intraline]'),
        context: one('[data-context]'),
        compareButton: one('[data-compare]'),
        compareLabel: one('[data-compare-label]'),
        oldInput: one('[data-old-input]'),
        newInput: one('[data-new-input]'),
        oldLines: one('[data-old-lines]'),
        newLines: one('[data-new-lines]'),
        oldName: one('[data-old-name]'),
        newName: one('[data-new-name]'),
        oldStats: one('[data-old-stats]'),
        newStats: one('[data-new-stats]'),
        oldNewline: one('[data-old-newline]'),
        newNewline: one('[data-new-newline]'),
        oldFile: one('[data-old-file]'),
        newFile: one('[data-new-file]'),
        resultHeading: one('[data-result-heading]'),
        statAdded: one('[data-stat-added]'),
        statRemoved: one('[data-stat-removed]'),
        statModified: one('[data-stat-modified]'),
        statHunks: one('[data-stat-hunks]'),
        previousHunk: one('[data-previous-hunk]'),
        nextHunk: one('[data-next-hunk]'),
        hunkPosition: one('[data-hunk-position]'),
        patchToggle: one('[data-patch-toggle]'),
        resultEmpty: one('[data-result-empty]'),
        emptyIcon: one('[data-result-empty] > span'),
        emptyTitle: one('[data-result-empty] > strong'),
        emptyText: one('[data-result-empty] > p'),
        resultBusy: one('[data-result-busy]'),
        diffScroll: one('[data-diff-scroll]'),
        diffTable: one('[data-diff-table]'),
        patchPanel: one('[data-patch-panel]'),
        patchTitle: one('[data-patch-title]'),
        patchVerification: one('[data-patch-verification]'),
        patchNote: one('[data-patch-note]'),
        patchOutput: one('[data-patch-output]'),
        dropCurtain: one('[data-drop-curtain]'),
        dropTitle: one('[data-drop-title]'),
        toast: one('[data-toast]')
    };

    function textBytes(value) {
        return new TextEncoder().encode(String(value || '')).length;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function editorLineCount(value) {
        return String(value || '').split(/\r\n|\r|\n/).length;
    }

    function updateLineNumbers(textarea, gutter) {
        const count = Math.max(1, editorLineCount(textarea.value));
        let output = '';
        for (let line = 1; line <= count; line += 1) output += line + (line === count ? '' : '\n');
        gutter.textContent = output;
        gutter.scrollTop = textarea.scrollTop;
    }

    function sideElements(side) {
        return side === 'old'
            ? {
                input: elements.oldInput,
                lines: elements.oldLines,
                name: elements.oldName,
                stats: elements.oldStats,
                newline: elements.oldNewline
            }
            : {
                input: elements.newInput,
                lines: elements.newLines,
                name: elements.newName,
                stats: elements.newStats,
                newline: elements.newNewline
            };
    }

    function updateSideMetadata(side) {
        const data = state[side];
        const targets = sideElements(side);
        targets.name.textContent = data.name;
        targets.name.title = data.name;
        targets.stats.textContent = formatBytes(textBytes(data.raw)) + ' · ' +
            editorLineCount(core.normalizeLineEndings(data.raw)) + ' 行 · ' + data.encoding;
        targets.newline.textContent = '换行：' + core.newlineStyle(data.raw);
        updateLineNumbers(targets.input, targets.lines);
    }

    function loadSide(side, raw, filename, encoding) {
        state[side] = {
            raw: String(raw || ''),
            name: core.safeFilename(filename, side === 'old' ? 'before.txt' : 'after.txt'),
            encoding: encoding || 'UTF-8'
        };
        const targets = sideElements(side);
        targets.input.value = core.normalizeLineEndings(state[side].raw);
        targets.input.scrollTop = 0;
        targets.input.scrollLeft = 0;
        updateSideMetadata(side);
    }

    function setAppState(type, code, title) {
        app.dataset.state = type;
        elements.stateCode.textContent = code;
        elements.stateTitle.textContent = title;
    }

    function showToast(message) {
        window.clearTimeout(state.toastTimer);
        elements.toast.textContent = message;
        elements.toast.hidden = false;
        state.toastTimer = window.setTimeout(function() {
            elements.toast.hidden = true;
        }, 2800);
    }

    function setBusy(active) {
        elements.resultBusy.hidden = !active;
        elements.compareButton.disabled = active;
        elements.compareLabel.textContent = active ? '正在比较' : '比较文本';
        elements.compareButton.setAttribute('aria-busy', String(active));
    }

    function comparisonOptions() {
        return {
            ignoreWhitespace: elements.ignoreWhitespace.checked,
            ignoreCase: elements.ignoreCase.checked,
            intraline: elements.intraline.value,
            context: elements.context.value === 'all' ? 'all' : Number(elements.context.value),
            timeout: 1800,
            maxEditLength: 16000
        };
    }

    function currentPreferences() {
        const options = comparisonOptions();
        return {
            view: state.view,
            ignoreWhitespace: options.ignoreWhitespace,
            ignoreCase: options.ignoreCase,
            intraline: options.intraline,
            context: options.context
        };
    }

    function savePreferences() {
        try {
            window.toolStorage.setItem(PREFERENCES_KEY, JSON.stringify(currentPreferences()));
        } catch (error) {
            console.warn('Unable to save text diff preferences.', error);
        }
    }

    function setView(view, persist) {
        state.view = view === 'unified' ? 'unified' : 'split';
        app.dataset.view = state.view;
        all('[data-view-button]').forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset.viewButton === state.view));
        });
        if (state.result && state.result.ok && !state.result.equivalent) renderDiff();
        if (persist !== false) savePreferences();
    }

    function applyPreferences(raw) {
        const preferences = raw && typeof raw === 'object' ? raw : {};
        const mobileDefault = window.matchMedia && window.matchMedia('(max-width: 700px)').matches;
        elements.ignoreWhitespace.checked = Boolean(preferences.ignoreWhitespace);
        elements.ignoreCase.checked = Boolean(preferences.ignoreCase);
        elements.intraline.value = ['auto', 'word', 'char', 'none'].includes(preferences.intraline)
            ? preferences.intraline
            : 'auto';
        elements.context.value = preferences.context === 'all'
            ? 'all'
            : preferences.context === 5 ? '5' : '3';
        setView(preferences.view === 'unified' || (!preferences.view && mobileDefault) ? 'unified' : 'split', false);
    }

    function invalidatePatch() {
        state.patch = null;
        elements.patchPanel.hidden = true;
        elements.patchOutput.textContent = '';
    }

    function markStale() {
        state.compareToken += 1;
        setBusy(false);
        invalidatePatch();
        elements.patchToggle.disabled = true;
        if (state.result) setAppState('stale', 'STALE', '内容已变化，等待重新比较');
    }

    function scheduleAutoCompare() {
        window.clearTimeout(state.autoTimer);
        if (!state.result) return;
        const total = textBytes(state.old.raw) + textBytes(state.new.raw);
        if (total > AUTO_COMPARE_BYTES) return;
        state.autoTimer = window.setTimeout(function() {
            compareTexts(false);
        }, 420);
    }

    function bindEditor(side) {
        const targets = sideElements(side);
        targets.input.addEventListener('scroll', function() {
            targets.lines.scrollTop = targets.input.scrollTop;
        });
        targets.input.addEventListener('input', function() {
            state[side].raw = targets.input.value;
            state[side].encoding = 'UTF-8';
            updateSideMetadata(side);
            markStale();
            scheduleAutoCompare();
        });
        targets.input.addEventListener('keydown', function(event) {
            if (event.key !== 'Tab') return;
            event.preventDefault();
            const start = targets.input.selectionStart;
            const end = targets.input.selectionEnd;
            targets.input.setRangeText('    ', start, end, 'end');
            targets.input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    function resetStats() {
        elements.statAdded.textContent = '0';
        elements.statRemoved.textContent = '0';
        elements.statModified.textContent = '0';
        elements.statHunks.textContent = '0';
        elements.hunkPosition.textContent = '0 / 0';
        elements.previousHunk.disabled = true;
        elements.nextHunk.disabled = true;
    }

    function setEmptyResult(icon, title, message, type) {
        elements.diffScroll.hidden = true;
        elements.resultEmpty.hidden = false;
        elements.resultEmpty.className = 'result-empty' + (type ? ' is-' + type : '');
        elements.emptyIcon.textContent = icon;
        elements.emptyTitle.textContent = title;
        elements.emptyText.textContent = message;
    }

    function renderError(result) {
        state.currentHunk = 0;
        resetStats();
        elements.resultHeading.textContent = '比较已停止';
        elements.patchToggle.disabled = true;
        setEmptyResult('!', '无法完成比较', result.message || '请检查输入后重试。', 'error');
        setAppState('error', 'LIMIT', result.message || '比较失败');
    }

    function renderEquivalent(result) {
        state.currentHunk = 0;
        resetStats();
        elements.patchToggle.disabled = result.rawEqual || (result.normalizedEqual && result.stats.ignored === 0);
        if (result.rawEqual) {
            elements.resultHeading.textContent = '文本完全相同';
            setEmptyResult('=', '没有发现差异', '两侧文本逐字一致。', 'equal');
            setAppState('equal', 'EQUAL', '文本完全相同');
            return;
        }
        if (result.stats.ignored) {
            const description = '当前规则忽略了 ' + result.stats.ignored + ' 行差异；精确 Patch 仍会保留这些变化。';
            elements.resultHeading.textContent = '按当前规则一致';
            setEmptyResult('≈', '按当前规则没有差异', description, 'equal');
            setAppState('equal', 'EQUIV', '按当前规则一致 · ' + result.stats.ignored + ' 行已忽略');
            return;
        }
        elements.resultHeading.textContent = '文本内容相同';
        setEmptyResult('↵', '仅换行风格不同', result.lineEndings.old + ' 与 ' + result.lineEndings.new + ' 已统一为 LF 比较。', 'equal');
        setAppState('equal', 'EOL', '内容相同 · 换行风格不同');
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = String(text);
        return element;
    }

    function appendSegments(code, side) {
        if (!side) return;
        const segments = side.segments && side.segments.length
            ? side.segments
            : [{ text: side.text, kind: 'equal' }];
        segments.forEach(function(segment) {
            const span = createElement('span', segment.kind === 'equal' ? '' : 'segment-' + segment.kind, segment.text);
            code.append(span);
        });
        if (!side.hasNewline) {
            code.append(createElement('span', 'no-newline', '↵ 文件末尾无换行'));
        }
    }

    function markerFor(kind, position) {
        if (kind === 'ignored') return '≈';
        if (position === 'old' && (kind === 'removed' || kind === 'modified')) return '−';
        if (position === 'new' && (kind === 'added' || kind === 'modified')) return '+';
        return '';
    }

    function createSplitCell(side, position, kind) {
        const cell = createElement('div', 'diff-cell ' + position + '-cell' + (!side ? ' is-empty' : ''));
        cell.append(createElement('span', 'diff-line-number', side ? side.line : ''));
        cell.append(createElement('span', 'diff-marker', markerFor(kind, position)));
        const code = createElement('code', 'diff-code');
        appendSegments(code, side);
        cell.append(code);
        return cell;
    }

    function markHunkStart(element, row, seen) {
        if (!row.hunk || seen.has(row.hunk)) return;
        seen.add(row.hunk);
        element.dataset.hunkStart = String(row.hunk);
    }

    function renderSplitRow(row, seen) {
        const element = createElement('div', 'diff-row split-row row-' + row.kind);
        element.dataset.rowIndex = String(row.index);
        markHunkStart(element, row, seen);
        element.append(createSplitCell(row.old, 'old', row.kind));
        element.append(createSplitCell(row.new, 'new', row.kind));
        return element;
    }

    function createUnifiedRow(oldSide, newSide, kind, marker, segmentSide) {
        const element = createElement('div', 'diff-row unified-row row-' + kind);
        element.append(createElement('span', 'diff-line-number', oldSide ? oldSide.line : ''));
        element.append(createElement('span', 'diff-line-number', newSide ? newSide.line : ''));
        element.append(createElement('span', 'diff-marker', marker));
        const code = createElement('code', 'diff-code');
        appendSegments(code, segmentSide || newSide || oldSide);
        element.append(code);
        return element;
    }

    function renderUnifiedRows(row, seen) {
        const output = [];
        if (row.kind === 'modified') {
            const removed = createUnifiedRow(row.old, null, 'removed', '−', row.old);
            const added = createUnifiedRow(null, row.new, 'added', '+', row.new);
            markHunkStart(removed, row, seen);
            output.push(removed, added);
            return output;
        }
        const marker = row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : row.kind === 'ignored' ? '≈' : '';
        const element = createUnifiedRow(row.old, row.new, row.kind, marker, row.new || row.old);
        markHunkStart(element, row, seen);
        output.push(element);
        return output;
    }

    function foldKey(item) {
        return item.startIndex + ':' + item.endIndex;
    }

    function rowsForDisplay() {
        const visible = core.visibleRows(state.result.rows, elements.context.value === 'all' ? 'all' : Number(elements.context.value));
        const output = [];
        visible.forEach(function(item) {
            if (item.kind !== 'fold' || !state.expandedFolds.has(foldKey(item))) {
                output.push(item);
                return;
            }
            state.result.rows.slice(item.startIndex, item.endIndex + 1).forEach(function(row) {
                output.push(row);
            });
        });
        return output;
    }

    function createFold(item) {
        const button = createElement('button', 'fold-row', '展开中间 ' + item.count + ' 行未变化内容');
        button.type = 'button';
        button.dataset.foldStart = String(item.startIndex);
        button.dataset.foldEnd = String(item.endIndex);
        button.addEventListener('click', function() {
            state.expandedFolds.add(foldKey(item));
            renderDiff();
        });
        return button;
    }

    function createColumnHead() {
        if (state.view === 'split') {
            const head = createElement('div', 'diff-column-head split-head');
            head.append(createElement('span', '', 'A / ORIGINAL · ' + state.old.name));
            head.append(createElement('span', '', 'B / REVISED · ' + state.new.name));
            return head;
        }
        const head = createElement('div', 'diff-column-head unified-head');
        head.append(createElement('span', '', 'UNIFIED DIFF · ' + state.old.name + ' → ' + state.new.name));
        return head;
    }

    function updateHunkHighlight() {
        all('.hunk-focus').forEach(function(element) {
            element.classList.remove('hunk-focus');
        });
        if (!state.currentHunk) return;
        const target = elements.diffTable.querySelector('[data-hunk-start="' + state.currentHunk + '"]');
        if (target) target.classList.add('hunk-focus');
    }

    function renderDiff() {
        if (!state.result || !state.result.ok || state.result.equivalent) return;
        const fragment = document.createDocumentFragment();
        const seen = new Set();
        fragment.append(createColumnHead());
        rowsForDisplay().forEach(function(item) {
            if (item.kind === 'fold') {
                fragment.append(createFold(item));
                return;
            }
            if (state.view === 'split') {
                fragment.append(renderSplitRow(item, seen));
                return;
            }
            renderUnifiedRows(item, seen).forEach(function(row) {
                fragment.append(row);
            });
        });
        elements.diffTable.className = 'diff-table view-' + state.view;
        elements.diffTable.replaceChildren(fragment);
        elements.resultEmpty.hidden = true;
        elements.diffScroll.hidden = false;
        updateHunkHighlight();
    }

    function updateHunkControls() {
        const total = state.result && state.result.ok ? state.result.stats.hunks : 0;
        const enabled = total > 0;
        elements.previousHunk.disabled = !enabled;
        elements.nextHunk.disabled = !enabled;
        if (!enabled) state.currentHunk = 0;
        else if (state.currentHunk < 1 || state.currentHunk > total) state.currentHunk = 1;
        elements.hunkPosition.textContent = state.currentHunk + ' / ' + total;
    }

    function renderChanged(result) {
        elements.resultHeading.textContent = result.stats.hunks + ' 个差异块';
        elements.statAdded.textContent = String(result.stats.added);
        elements.statRemoved.textContent = String(result.stats.removed);
        elements.statModified.textContent = String(result.stats.modified);
        elements.statHunks.textContent = String(result.stats.hunks);
        elements.patchToggle.disabled = false;
        state.currentHunk = result.stats.hunks ? 1 : 0;
        updateHunkControls();
        renderDiff();

        const changedLines = result.stats.changedOldLines + result.stats.changedNewLines;
        const endingNote = result.lineEndings.old !== result.lineEndings.new
            ? ' · 换行已统一'
            : '';
        const ignoredNote = result.stats.ignored
            ? ' · ' + result.stats.ignored + ' 行已忽略'
            : '';
        setAppState('changed', 'DIFF', result.stats.hunks + ' 个差异块 · ' + changedLines + ' 行受影响' + ignoredNote + endingNote);
    }

    function renderResult(result) {
        invalidatePatch();
        state.expandedFolds.clear();
        if (!result.ok) {
            renderError(result);
            return;
        }
        elements.statAdded.textContent = String(result.stats.added);
        elements.statRemoved.textContent = String(result.stats.removed);
        elements.statModified.textContent = String(result.stats.modified);
        elements.statHunks.textContent = String(result.stats.hunks);
        if (result.equivalent) {
            renderEquivalent(result);
            updateHunkControls();
            return;
        }
        renderChanged(result);
    }

    async function compareTexts(showMessage) {
        window.clearTimeout(state.autoTimer);
        if (textBytes(state.old.raw) > MAX_FILE_BYTES || textBytes(state.new.raw) > MAX_FILE_BYTES) {
            const oversized = {
                ok: false,
                message: '每侧文本不能超过 2 MB，请缩小输入后重试。'
            };
            state.result = oversized;
            renderError(oversized);
            if (showMessage) showToast(oversized.message);
            return;
        }
        const token = ++state.compareToken;
        setBusy(true);
        setAppState('ready', 'WORK', '正在计算差异');
        try {
            const result = await core.compare(state.old.raw, state.new.raw, comparisonOptions());
            if (token !== state.compareToken) return;
            state.result = result;
            renderResult(result);
            if (showMessage) {
                if (!result.ok) showToast(result.message);
                else if (result.rawEqual) showToast('两侧文本完全相同。');
                else if (result.equivalent) showToast('按当前比较规则没有差异。');
                else showToast('比较完成，共发现 ' + result.stats.hunks + ' 个差异块。');
            }
        } catch (error) {
            if (token !== state.compareToken) return;
            const result = { ok: false, message: error.message || String(error) };
            state.result = result;
            renderError(result);
            if (showMessage) showToast('比较失败，请检查输入。');
        } finally {
            if (token === state.compareToken) setBusy(false);
        }
    }

    function goToHunk(direction) {
        if (!state.result || !state.result.ok || !state.result.stats.hunks) return;
        const total = state.result.stats.hunks;
        state.currentHunk = ((state.currentHunk - 1 + direction + total) % total) + 1;
        elements.hunkPosition.textContent = state.currentHunk + ' / ' + total;
        updateHunkHighlight();
        const target = elements.diffTable.querySelector('[data-hunk-start="' + state.currentHunk + '"]');
        if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function patchFilename() {
        function base(name) {
            return String(name || '').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9\u3400-\u9fff._-]+/g, '-');
        }
        return (base(state.old.name) || 'before') + '-to-' + (base(state.new.name) || 'after') + '.diff';
    }

    function generatePatch() {
        const options = comparisonOptions();
        options.oldName = state.old.name;
        options.newName = state.new.name;
        const result = core.createPatch(state.old.raw, state.new.raw, options);
        state.patch = result;
        if (!result.ok) {
            showToast(result.message || '无法生成 Patch。');
            return false;
        }
        elements.patchTitle.textContent = result.oldName + ' → ' + result.newName;
        elements.patchOutput.textContent = result.patch;
        elements.patchVerification.textContent = result.verified ? '✓ 回放一致' : '× 回放失败';
        elements.patchVerification.className = 'verification-badge ' + (result.verified ? 'ok' : 'error');
        elements.patchNote.textContent = options.ignoreWhitespace || options.ignoreCase
            ? '当前视图启用了忽略规则；此 Patch 仍根据原始文本精确生成。'
            : result.normalizedLineEndings
                ? 'Patch 已将 CRLF / CR 统一为 LF，并通过回放验证。'
                : 'Patch 根据原始文本精确生成，并已回放验证。';
        return true;
    }

    function openPatch() {
        if (!generatePatch()) return;
        elements.patchPanel.hidden = false;
        elements.patchPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    async function copyText(text) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch (_error) {
            const helper = document.createElement('textarea');
            helper.value = text;
            helper.setAttribute('readonly', '');
            document.body.append(helper);
            helper.select();
            document.execCommand('copy');
            helper.remove();
        }
    }

    function downloadText(text, filename) {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/x-diff;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function() {
            URL.revokeObjectURL(url);
        }, 1000);
    }

    async function decodeTextFile(file) {
        if (!file) return null;
        if (file.size > MAX_FILE_BYTES) throw new Error('单个文本文件不能超过 2 MB。');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
        if (sample.includes(0)) throw new Error('检测到二进制内容，只支持 UTF-8 文本文件。');
        const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
        let text;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (_error) {
            throw new Error('文件不是有效的 UTF-8 文本。');
        }
        return { text: text, encoding: hasBom ? 'UTF-8 BOM' : 'UTF-8' };
    }

    async function loadFile(side, file) {
        const decoded = await decodeTextFile(file);
        if (!decoded) return;
        loadSide(side, decoded.text, file.name, decoded.encoding);
        markStale();
        await compareTexts(false);
        showToast('已载入 ' + file.name + '，文件内容未离开当前页面。');
    }

    function bindDropZone(panel) {
        const side = panel.dataset.dropZone;
        ['dragenter', 'dragover'].forEach(function(type) {
            panel.addEventListener(type, function(event) {
                event.preventDefault();
                panel.classList.add('is-dragging');
                elements.dropTitle.textContent = side === 'old' ? '释放到原始文本 A' : '释放到新文本 B';
                elements.dropCurtain.hidden = false;
            });
        });
        panel.addEventListener('dragleave', function(event) {
            if (panel.contains(event.relatedTarget)) return;
            panel.classList.remove('is-dragging');
            elements.dropCurtain.hidden = true;
        });
        panel.addEventListener('drop', function(event) {
            event.preventDefault();
            panel.classList.remove('is-dragging');
            elements.dropCurtain.hidden = true;
            const file = event.dataTransfer.files && event.dataTransfer.files[0];
            loadFile(side, file).catch(function(error) {
                showToast(error.message || String(error));
            });
        });
    }

    all('[data-view-button]').forEach(function(button) {
        button.addEventListener('click', function() {
            setView(button.dataset.viewButton);
        });
    });

    [elements.ignoreWhitespace, elements.ignoreCase, elements.intraline].forEach(function(control) {
        control.addEventListener('change', function() {
            savePreferences();
            invalidatePatch();
            if (state.result) compareTexts(false);
        });
    });

    elements.context.addEventListener('change', function() {
        savePreferences();
        state.expandedFolds.clear();
        if (state.result && state.result.ok && !state.result.equivalent) renderDiff();
        if (!elements.patchPanel.hidden) openPatch();
    });

    elements.compareButton.addEventListener('click', function() {
        compareTexts(true);
    });
    one('[data-load-sample]').addEventListener('click', function() {
        loadSide('old', SAMPLE_OLD, 'deploy-check-v1.txt', 'UTF-8');
        loadSide('new', SAMPLE_NEW, 'deploy-check-v2.txt', 'UTF-8');
        markStale();
        compareTexts(false);
    });
    one('[data-swap]').addEventListener('click', function() {
        const old = state.old;
        const revised = state.new;
        loadSide('old', revised.raw, revised.name, revised.encoding);
        loadSide('new', old.raw, old.name, old.encoding);
        markStale();
        compareTexts(false);
    });
    one('[data-clear]').addEventListener('click', function() {
        window.clearTimeout(state.autoTimer);
        state.compareToken += 1;
        setBusy(false);
        state.result = null;
        loadSide('old', '', 'before.txt', 'UTF-8');
        loadSide('new', '', 'after.txt', 'UTF-8');
        invalidatePatch();
        resetStats();
        setEmptyResult('Δ', '差异结果将在这里展开', '粘贴两段文本或导入文件，然后开始比较。', '');
        elements.resultHeading.textContent = '等待比较';
        elements.patchToggle.disabled = true;
        setAppState('ready', 'READY', '等待比较');
        elements.oldInput.focus();
    });

    one('[data-old-import]').addEventListener('click', function() {
        elements.oldFile.click();
    });
    one('[data-new-import]').addEventListener('click', function() {
        elements.newFile.click();
    });
    elements.oldFile.addEventListener('change', function() {
        loadFile('old', elements.oldFile.files[0]).catch(function(error) {
            showToast(error.message || String(error));
        });
        elements.oldFile.value = '';
    });
    elements.newFile.addEventListener('change', function() {
        loadFile('new', elements.newFile.files[0]).catch(function(error) {
            showToast(error.message || String(error));
        });
        elements.newFile.value = '';
    });

    elements.previousHunk.addEventListener('click', function() {
        goToHunk(-1);
    });
    elements.nextHunk.addEventListener('click', function() {
        goToHunk(1);
    });
    elements.patchToggle.addEventListener('click', openPatch);
    one('[data-close-patch]').addEventListener('click', function() {
        elements.patchPanel.hidden = true;
    });
    one('[data-copy-patch]').addEventListener('click', function() {
        if (!state.patch && !generatePatch()) return;
        copyText(state.patch.patch).then(function() {
            showToast('Patch 已复制。');
        });
    });
    one('[data-download-patch]').addEventListener('click', function() {
        if (!state.patch && !generatePatch()) return;
        downloadText(state.patch.patch, patchFilename());
        showToast('已生成 ' + patchFilename() + '。');
    });

    all('[data-drop-zone]').forEach(bindDropZone);
    document.addEventListener('dragend', function() {
        elements.dropCurtain.hidden = true;
        all('[data-drop-zone]').forEach(function(panel) {
            panel.classList.remove('is-dragging');
        });
    });
    document.addEventListener('drop', function(event) {
        event.preventDefault();
        elements.dropCurtain.hidden = true;
    });
    document.addEventListener('keydown', function(event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            compareTexts(true);
            return;
        }
        if (event.altKey && event.key === 'ArrowDown') {
            event.preventDefault();
            goToHunk(1);
            return;
        }
        if (event.altKey && event.key === 'ArrowUp') {
            event.preventDefault();
            goToHunk(-1);
            return;
        }
        if (event.key === 'Escape' && !elements.patchPanel.hidden) {
            elements.patchPanel.hidden = true;
        }
    });

    bindEditor('old');
    bindEditor('new');
    loadSide('old', SAMPLE_OLD, 'deploy-check-v1.txt', 'UTF-8');
    loadSide('new', SAMPLE_NEW, 'deploy-check-v2.txt', 'UTF-8');
    resetStats();

    window.toolStorage.ready().then(function(storage) {
        let preferences = {};
        try {
            preferences = JSON.parse(storage.getItem(PREFERENCES_KEY) || '{}');
        } catch (_error) {
            preferences = {};
        }
        applyPreferences(preferences);
        return compareTexts(false);
    }).then(function() {
        window.toolHost.markReady();
    }).catch(function(error) {
        applyPreferences({});
        renderError({ ok: false, message: error.message || String(error) });
        window.toolHost.reportError(error);
        window.toolHost.markReady();
    });
})();
