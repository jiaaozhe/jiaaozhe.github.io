(function() {
    'use strict';

    const core = window.PDFPageCore;
    const engine = window.PDFPageEngine;
    const one = function(selector, root) { return (root || document).querySelector(selector); };
    const all = function(selector, root) { return Array.from((root || document).querySelectorAll(selector)); };
    const app = one('[data-app]');

    if (!app || !core || !engine || !window.PDFLib || !window.pdfjsLib || !window.Sortable || !window.fflate) {
        const error = new Error('PDF 页管理器依赖未完整加载。');
        if (window.toolHost) window.toolHost.reportError(error);
        throw error;
    }

    const elements = {
        addFiles: all('[data-add-files]'),
        fileInput: one('[data-file-input]'),
        undo: one('[data-undo]'),
        redo: one('[data-redo]'),
        density: one('[data-density-input]'),
        previewButton: one('[data-open-preview]'),
        exportTrigger: one('[data-export-trigger]'),
        sourceCount: one('[data-source-count]'),
        sourceList: one('[data-source-list]'),
        sourceEmpty: one('[data-source-empty]'),
        sessionSize: one('[data-session-size]'),
        clearAll: one('[data-clear-all]'),
        pageSummary: one('[data-page-summary]'),
        activeLabel: one('[data-active-label]'),
        selectionSummary: one('[data-selection-summary]'),
        selectAll: one('[data-select-all]'),
        clearSelection: one('[data-clear-selection]'),
        warning: one('[data-workspace-warning]'),
        warningText: one('[data-workspace-warning-text]'),
        dismissWarning: one('[data-dismiss-warning]'),
        pageGrid: one('[data-page-grid]'),
        pagesScroll: one('[data-pages-scroll]'),
        workspaceEmpty: one('[data-workspace-empty]'),
        dropZone: one('[data-drop-zone]'),
        dropOverlay: one('[data-drop-overlay]'),
        inspector: one('.inspector-panel'),
        closeInspector: one('[data-close-inspector]'),
        inspectorCount: one('[data-inspector-count]'),
        selectionDetail: one('[data-selection-detail]'),
        moveLeft: all('[data-move-left]'),
        moveRight: all('[data-move-right]'),
        rotateLeft: all('[data-rotate-left]'),
        rotateRight: all('[data-rotate-right]'),
        duplicate: all('[data-duplicate]'),
        deletePages: all('[data-delete-pages]'),
        exportModes: all('[data-export-mode]'),
        outputName: one('[data-output-name]'),
        outputExtension: one('[data-output-extension]'),
        exportPages: one('[data-export-pages]'),
        exportSources: one('[data-export-sources]'),
        exportSize: one('[data-export-size]'),
        exportWarning: one('[data-export-warning]'),
        exportButton: one('[data-export]'),
        exportLabel: one('[data-export-label]'),
        mobileActions: one('[data-mobile-actions]'),
        mobileSelection: one('[data-mobile-selection]'),
        preview: one('[data-preview]'),
        previewTitle: one('[data-preview-title]'),
        previewMeta: one('[data-preview-meta]'),
        previewStage: one('[data-preview-stage]'),
        previewCanvas: one('[data-preview-canvas]'),
        previewLoading: one('[data-preview-loading]'),
        previewPrevious: one('[data-preview-previous]'),
        previewNext: one('[data-preview-next]'),
        closePreview: one('[data-close-preview]'),
        processing: one('[data-processing]'),
        processingLabel: one('[data-processing-label]'),
        processingDetail: one('[data-processing-detail]'),
        processingProgress: one('[data-processing-progress]'),
        toast: one('[data-toast]')
    };

    const densityNames = ['small', 'medium', 'large'];
    const densityWidths = { small: 132, medium: 168, large: 214 };
    const HISTORY_LIMIT = 60;
    const LARGE_BYTES = 200 * 1024 * 1024;
    const LARGE_PAGES = 500;
    const state = {
        sources: new Map(),
        pages: [],
        selected: new Set(),
        activeId: null,
        anchorId: null,
        history: [],
        future: [],
        nextSourceId: 1,
        nextPageId: 1,
        density: 'medium',
        exportMode: 'all',
        busy: false,
        importing: false,
        warningDismissed: false,
        pageElements: new Map(),
        renderQueue: [],
        renderQueued: new Set(),
        activeRenders: 0,
        previewId: null,
        previewToken: 0,
        previewResizeTimer: null,
        drag: null,
        dragDepth: 0,
        toastTimer: null,
        clearTimer: null,
        observer: null,
        sortable: null
    };

    function refreshIcons() {
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }

    function icon(name) {
        const node = document.createElement('i');
        node.dataset.lucide = name;
        node.setAttribute('aria-hidden', 'true');
        return node;
    }

    function setDisabled(nodes, disabled) {
        nodes.forEach(function(node) { node.disabled = disabled; });
    }

    function showToast(message, tone) {
        window.clearTimeout(state.toastTimer);
        elements.toast.textContent = message;
        elements.toast.dataset.tone = tone || 'info';
        elements.toast.hidden = false;
        state.toastTimer = window.setTimeout(function() {
            elements.toast.hidden = true;
        }, tone === 'error' ? 6000 : 3200);
    }

    function loadPreferences() {
        try {
            const raw = window.toolStorage.getItem('preferences');
            if (!raw) return;
            const preferences = JSON.parse(raw);
            if (densityNames.includes(preferences.density)) state.density = preferences.density;
            if (['all', 'selected', 'split'].includes(preferences.exportMode)) state.exportMode = preferences.exportMode;
            if (typeof preferences.outputName === 'string') {
                elements.outputName.value = core.sanitizeBaseName(preferences.outputName, 'merged-document');
            }
        } catch (error) {
            console.warn('Unable to restore PDF preferences.', error);
        }
    }

    function savePreferences() {
        try {
            window.toolStorage.setItem('preferences', JSON.stringify({
                density: state.density,
                exportMode: state.exportMode,
                outputName: core.sanitizeBaseName(elements.outputName.value, 'merged-document')
            }));
        } catch (error) {
            console.warn('Unable to save PDF preferences.', error);
        }
    }

    function activePage() {
        return state.pages.find(function(page) { return page.id === state.activeId; }) || null;
    }

    function orderedSelection() {
        return state.pages.filter(function(page) { return state.selected.has(page.id); }).map(function(page) { return page.id; });
    }

    function snapshot() {
        return {
            pages: core.clonePages(state.pages),
            selected: orderedSelection(),
            activeId: state.activeId,
            anchorId: state.anchorId
        };
    }

    function restoreSnapshot(saved) {
        state.pages = saved.pages.filter(function(page) {
            return state.sources.has(page.sourceId);
        }).map(core.clonePage);
        const pageIds = new Set(state.pages.map(function(page) { return page.id; }));
        state.selected = new Set(saved.selected.filter(function(id) { return pageIds.has(id); }));
        state.activeId = pageIds.has(saved.activeId) ? saved.activeId : (state.pages[0] ? state.pages[0].id : null);
        state.anchorId = pageIds.has(saved.anchorId) ? saved.anchorId : state.activeId;
        renderWorkspace();
    }

    function applyPages(nextPages, options) {
        if (core.samePageOrder(state.pages, nextPages)) {
            renderPageGrid();
            return false;
        }

        state.history.push(snapshot());
        if (state.history.length > HISTORY_LIMIT) state.history.shift();
        state.future = [];
        state.pages = nextPages.map(core.clonePage);
        const pageIds = new Set(state.pages.map(function(page) { return page.id; }));
        const config = options || {};

        if (config.selected) {
            state.selected = new Set(config.selected.filter(function(id) { return pageIds.has(id); }));
        } else {
            state.selected = new Set(Array.from(state.selected).filter(function(id) { return pageIds.has(id); }));
        }
        if (Object.prototype.hasOwnProperty.call(config, 'activeId')) {
            state.activeId = pageIds.has(config.activeId) ? config.activeId : null;
        } else if (!pageIds.has(state.activeId)) {
            state.activeId = state.pages[0] ? state.pages[0].id : null;
        }
        if (!pageIds.has(state.anchorId)) state.anchorId = state.activeId;

        renderWorkspace();
        return true;
    }

    function undo() {
        if (!state.history.length || state.busy || state.importing) return;
        state.future.push(snapshot());
        restoreSnapshot(state.history.pop());
    }

    function redo() {
        if (!state.future.length || state.busy || state.importing) return;
        state.history.push(snapshot());
        restoreSnapshot(state.future.pop());
    }

    function sourceBytesForPages(pages) {
        const ids = new Set(pages.map(function(page) { return page.sourceId; }));
        let bytes = 0;
        ids.forEach(function(id) {
            const source = state.sources.get(id);
            if (source) bytes += source.size;
        });
        return bytes;
    }

    function renderSources() {
        elements.sourceList.textContent = '';
        const active = activePage();

        state.sources.forEach(function(source) {
            const item = document.createElement('div');
            item.className = 'source-item';
            item.dataset.sourceId = source.id;
            item.setAttribute('role', 'listitem');
            if (source.status === 'loading') item.classList.add('is-loading');
            if (active && active.sourceId === source.id) item.classList.add('is-active');

            const focus = document.createElement('button');
            focus.type = 'button';
            focus.className = 'source-focus';
            focus.dataset.sourceFocus = source.id;
            focus.setAttribute('aria-label', '定位到 ' + source.name);

            const sourceIcon = document.createElement('span');
            sourceIcon.className = 'source-icon';
            sourceIcon.appendChild(icon(source.status === 'loading' ? 'loader-circle' : 'file-text'));

            const copy = document.createElement('span');
            copy.className = 'source-copy';
            const name = document.createElement('span');
            name.className = 'source-name';
            name.textContent = source.name;
            const meta = document.createElement('span');
            meta.className = 'source-meta';
            if (source.status === 'loading') {
                meta.textContent = '正在读取 · ' + core.formatBytes(source.size);
            } else {
                const used = state.pages.filter(function(page) { return page.sourceId === source.id; }).length;
                meta.textContent = used + '/' + source.pageCount + ' 页 · ' + core.formatBytes(source.size);
            }
            copy.append(name, meta);
            focus.append(sourceIcon, copy);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'icon-button source-remove';
            remove.dataset.removeSource = source.id;
            remove.setAttribute('aria-label', '移除 ' + source.name);
            remove.title = '移除文件';
            remove.appendChild(icon('x'));

            item.append(focus, remove);
            elements.sourceList.appendChild(item);
        });

        refreshIcons();
    }

    function createPageCard(page) {
        const card = document.createElement('article');
        card.className = 'page-card';
        card.dataset.pageId = page.id;
        card.setAttribute('role', 'listitem');
        card.tabIndex = 0;

        const sheet = document.createElement('div');
        sheet.className = 'page-sheet';
        sheet.dataset.pageSheet = '';

        const canvas = document.createElement('canvas');
        canvas.dataset.pageCanvas = '';
        canvas.hidden = true;

        const placeholder = document.createElement('div');
        placeholder.className = 'page-placeholder';
        placeholder.dataset.pagePlaceholder = '';
        placeholder.appendChild(icon('file-text'));

        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'page-select';
        select.dataset.pageSelect = '';
        select.setAttribute('aria-label', '选择页面');
        select.appendChild(icon('check'));

        const drag = document.createElement('button');
        drag.type = 'button';
        drag.className = 'drag-handle';
        drag.dataset.dragHandle = '';
        drag.setAttribute('aria-label', '拖动页面');
        drag.title = '拖动排序';
        drag.appendChild(icon('grip-vertical'));

        const rotation = document.createElement('span');
        rotation.className = 'page-rotation';
        rotation.dataset.pageRotation = '';
        rotation.hidden = true;

        sheet.append(canvas, placeholder, select, drag, rotation);

        const caption = document.createElement('div');
        caption.className = 'page-caption';
        const sourceName = document.createElement('strong');
        sourceName.dataset.pageSource = '';
        const position = document.createElement('span');
        position.dataset.pagePosition = '';
        caption.append(sourceName, position);

        card.append(sheet, caption);
        return card;
    }

    function renderKey(page) {
        return [page.sourceId, page.sourcePageIndex, page.rotation, state.density].join(':');
    }

    function updatePageCard(card, page, index) {
        const source = state.sources.get(page.sourceId);
        const selected = state.selected.has(page.id);
        card.dataset.pageId = page.id;
        card.classList.toggle('is-selected', selected);
        card.classList.toggle('is-active', state.activeId === page.id);
        card.setAttribute('aria-label', '工作区第 ' + (index + 1) + ' 页，来源 ' + (source ? source.name : '未知文件') + ' 第 ' + (page.sourcePageIndex + 1) + ' 页');
        one('[data-page-source]', card).textContent = source ? source.name : '未知文件';
        one('[data-page-position]', card).textContent = String(index + 1).padStart(2, '0') + ' · p' + (page.sourcePageIndex + 1);
        one('[data-page-select]', card).setAttribute('aria-pressed', selected ? 'true' : 'false');
        const rotation = one('[data-page-rotation]', card);
        rotation.textContent = page.rotation + '°';
        rotation.hidden = page.rotation === 0;

        const nextKey = renderKey(page);
        if (card.dataset.requestedKey !== nextKey) {
            card.dataset.requestedKey = nextKey;
            card.dataset.renderedKey = '';
            card.classList.remove('is-error');
            const canvas = one('[data-page-canvas]', card);
            engine.cancelRender(canvas);
            canvas.hidden = true;
            one('[data-page-placeholder]', card).hidden = false;
        }
    }

    function renderPageGrid() {
        const pageIds = new Set(state.pages.map(function(page) { return page.id; }));
        state.pageElements.forEach(function(card, id) {
            if (pageIds.has(id)) return;
            if (state.observer) state.observer.unobserve(card);
            engine.cancelRender(one('[data-page-canvas]', card));
            card.remove();
            state.pageElements.delete(id);
        });

        const fragment = document.createDocumentFragment();
        state.pages.forEach(function(page, index) {
            let card = state.pageElements.get(page.id);
            if (!card) {
                card = createPageCard(page);
                state.pageElements.set(page.id, card);
                if (state.observer) state.observer.observe(card);
            }
            updatePageCard(card, page, index);
            fragment.appendChild(card);
        });
        elements.pageGrid.appendChild(fragment);
        refreshIcons();

        if (!state.observer) {
            state.pages.forEach(function(page) { queueRender(page.id); });
        } else {
            window.requestAnimationFrame(queueVisibleRenders);
        }
    }

    function queueVisibleRenders() {
        const rootBounds = elements.pagesScroll.getBoundingClientRect();
        const margin = 300;
        state.pageElements.forEach(function(card, pageId) {
            const bounds = card.getBoundingClientRect();
            const visible = bounds.bottom >= rootBounds.top - margin &&
                bounds.top <= rootBounds.bottom + margin &&
                bounds.right >= rootBounds.left - margin &&
                bounds.left <= rootBounds.right + margin;
            if (visible) queueRender(pageId);
        });
    }

    function refreshSelectionStyles() {
        state.pages.forEach(function(page, index) {
            const card = state.pageElements.get(page.id);
            if (card) updatePageCard(card, page, index);
        });
        const active = activePage();
        all('[data-source-id]', elements.sourceList).forEach(function(item) {
            item.classList.toggle('is-active', !!active && item.dataset.sourceId === active.sourceId);
        });
        updateUi();
    }

    function queueRender(pageId) {
        const page = state.pages.find(function(item) { return item.id === pageId; });
        const card = state.pageElements.get(pageId);
        if (!page || !card) return;
        const key = renderKey(page);
        if (card.dataset.renderedKey === key) return;
        const queueKey = pageId + '|' + key;
        if (state.renderQueued.has(queueKey)) return;
        state.renderQueued.add(queueKey);
        state.renderQueue.push({ pageId: pageId, key: key, queueKey: queueKey });
        pumpRenders();
    }

    function pumpRenders() {
        while (state.activeRenders < 2 && state.renderQueue.length) {
            const job = state.renderQueue.shift();
            state.renderQueued.delete(job.queueKey);
            renderQueuedPage(job);
        }
    }

    async function renderQueuedPage(job) {
        const page = state.pages.find(function(item) { return item.id === job.pageId; });
        const card = state.pageElements.get(job.pageId);
        if (!page || !card || renderKey(page) !== job.key || card.dataset.renderedKey === job.key) {
            pumpRenders();
            return;
        }
        const source = state.sources.get(page.sourceId);
        if (!source || source.status !== 'ready') {
            pumpRenders();
            return;
        }

        state.activeRenders += 1;
        card.classList.add('is-rendering');
        const canvas = one('[data-page-canvas]', card);
        const placeholder = one('[data-page-placeholder]', card);
        try {
            const result = await engine.renderPage(source, page.sourcePageIndex, page.rotation, canvas, {
                width: densityWidths[state.density],
                maxArea: 3200000
            });
            const current = state.pages.find(function(item) { return item.id === job.pageId; });
            if (!current || renderKey(current) !== job.key) return;
            one('[data-page-sheet]', card).style.aspectRatio = result.width + ' / ' + result.height;
            card.dataset.renderedKey = job.key;
            canvas.hidden = false;
            placeholder.hidden = true;
        } catch (error) {
            if (!error || error.name !== 'RenderingCancelledException') {
                card.classList.add('is-error');
                placeholder.title = error && error.message ? error.message : '页面渲染失败';
                console.error(error);
            }
        } finally {
            card.classList.remove('is-rendering');
            state.activeRenders -= 1;
            pumpRenders();
        }
    }

    function exportSelection() {
        return core.buildExportPages(state.pages, orderedSelection(), state.exportMode);
    }

    function updateUi() {
        const hasPages = state.pages.length > 0;
        const selectedCount = state.selected.size;
        const locked = state.busy || state.importing;
        const active = activePage();
        const totalBytes = Array.from(state.sources.values()).reduce(function(sum, source) { return sum + source.size; }, 0);

        app.setAttribute('aria-busy', locked ? 'true' : 'false');

        elements.sourceCount.textContent = String(state.sources.size);
        elements.sourceEmpty.hidden = state.sources.size > 0;
        elements.sessionSize.textContent = core.formatBytes(totalBytes);
        elements.clearAll.disabled = state.sources.size === 0 || locked;
        elements.workspaceEmpty.hidden = hasPages || state.importing;
        elements.pageSummary.textContent = state.pages.length + ' 页 · ' + state.sources.size + ' 个文件';
        elements.activeLabel.textContent = active && state.sources.get(active.sourceId) ? state.sources.get(active.sourceId).name : '未选择页面';
        elements.selectionSummary.textContent = selectedCount ? selectedCount + ' 页已选择' : '未选择';
        elements.selectAll.disabled = !hasPages || locked || selectedCount === state.pages.length;
        elements.clearSelection.disabled = selectedCount === 0 || locked;
        elements.undo.disabled = !state.history.length || locked;
        elements.redo.disabled = !state.future.length || locked;
        elements.previewButton.disabled = !hasPages || locked;
        elements.exportTrigger.disabled = !hasPages || locked;
        elements.fileInput.disabled = locked;
        elements.density.disabled = locked;
        elements.outputName.disabled = locked;
        elements.addFiles.forEach(function(button) { button.disabled = locked; });
        all('[data-remove-source]', elements.sourceList).forEach(function(button) { button.disabled = locked; });
        if (state.sortable) state.sortable.option('disabled', locked);

        elements.inspectorCount.textContent = String(selectedCount);
        elements.selectionDetail.textContent = selectedCount
            ? selectedCount + ' 页，来自 ' + new Set(state.pages.filter(function(page) { return state.selected.has(page.id); }).map(function(page) { return page.sourceId; })).size + ' 个文件。'
            : '当前没有选中页面。';

        const operationDisabled = selectedCount === 0 || locked;
        setDisabled(elements.moveLeft, operationDisabled);
        setDisabled(elements.moveRight, operationDisabled);
        setDisabled(elements.rotateLeft, operationDisabled);
        setDisabled(elements.rotateRight, operationDisabled);
        setDisabled(elements.duplicate, operationDisabled);
        setDisabled(elements.deletePages, operationDisabled);

        if (selectedCount === 0 && state.exportMode !== 'all') state.exportMode = 'all';
        elements.exportModes.forEach(function(button) {
            const needsSelection = button.dataset.exportMode !== 'all';
            button.disabled = locked || (needsSelection && selectedCount === 0);
            button.setAttribute('aria-pressed', button.dataset.exportMode === state.exportMode ? 'true' : 'false');
        });

        const pages = exportSelection();
        const sourceIds = new Set(pages.map(function(page) { return page.sourceId; }));
        const inputBytes = sourceBytesForPages(pages);
        elements.exportPages.textContent = String(pages.length);
        elements.exportSources.textContent = String(sourceIds.size);
        elements.exportSize.textContent = core.formatBytes(inputBytes);
        elements.outputExtension.textContent = state.exportMode === 'split' ? '.zip' : '.pdf';
        elements.exportLabel.textContent = state.exportMode === 'split' ? '拆分为 ZIP' : '导出 PDF';
        elements.exportButton.disabled = pages.length === 0 || locked;
        elements.exportWarning.hidden = true;
        if (state.exportMode === 'split' && pages.length > 100) {
            elements.exportWarning.textContent = '将生成 ' + pages.length + ' 个 PDF，处理时间和内存占用会明显增加。';
            elements.exportWarning.hidden = false;
        } else if (inputBytes > LARGE_BYTES) {
            elements.exportWarning.textContent = '输入文件较大，导出期间请保持页面打开。';
            elements.exportWarning.hidden = false;
        }

        elements.mobileActions.hidden = selectedCount === 0 || locked;
        elements.mobileSelection.textContent = selectedCount + ' 页';

        const largeWorkspace = totalBytes > LARGE_BYTES || state.pages.length > LARGE_PAGES;
        elements.warning.hidden = !largeWorkspace || state.warningDismissed;
        if (largeWorkspace) {
            elements.warningText.textContent = '当前工作区包含 ' + state.pages.length + ' 页、' + core.formatBytes(totalBytes) + ' 文件；缩略图会按可见区域加载。';
        }
    }

    function renderWorkspace() {
        renderSources();
        renderPageGrid();
        updateUi();
    }

    function selectPage(pageId, event) {
        const page = state.pages.find(function(item) { return item.id === pageId; });
        if (!page) return;
        const additive = !!(event && (event.metaKey || event.ctrlKey));
        const ranged = !!(event && event.shiftKey && state.anchorId);

        if (ranged) {
            const range = core.rangeIds(state.pages, state.anchorId, pageId);
            if (!additive) state.selected.clear();
            range.forEach(function(id) { state.selected.add(id); });
        } else if (additive) {
            if (state.selected.has(pageId)) state.selected.delete(pageId);
            else state.selected.add(pageId);
            state.anchorId = pageId;
        } else {
            state.selected = new Set([pageId]);
            state.anchorId = pageId;
        }
        state.activeId = pageId;
        refreshSelectionStyles();
    }

    function togglePage(pageId, event) {
        const page = state.pages.find(function(item) { return item.id === pageId; });
        if (!page) return;
        if (event && event.shiftKey && state.anchorId) {
            selectPage(pageId, event);
            return;
        }
        if (state.selected.has(pageId)) state.selected.delete(pageId);
        else state.selected.add(pageId);
        state.activeId = pageId;
        state.anchorId = pageId;
        refreshSelectionStyles();
    }

    function selectAllPages() {
        state.selected = new Set(state.pages.map(function(page) { return page.id; }));
        state.activeId = state.pages[0] ? state.pages[0].id : null;
        state.anchorId = state.activeId;
        refreshSelectionStyles();
    }

    function clearSelection() {
        state.selected.clear();
        refreshSelectionStyles();
    }

    function rotateSelection(delta) {
        if (state.busy || state.importing) return;
        const ids = orderedSelection();
        if (!ids.length) return;
        applyPages(core.rotatePages(state.pages, ids, delta));
        if (state.previewId && state.selected.has(state.previewId)) renderPreview();
    }

    function deleteSelection() {
        if (state.busy || state.importing) return;
        const ids = orderedSelection();
        if (!ids.length) return;
        const firstIndex = state.pages.findIndex(function(page) { return ids.includes(page.id); });
        const nextPages = core.deletePages(state.pages, ids);
        const nextActive = nextPages[Math.min(firstIndex, Math.max(0, nextPages.length - 1))] || null;
        applyPages(nextPages, {
            selected: nextActive ? [nextActive.id] : [],
            activeId: nextActive ? nextActive.id : null
        });
        showToast('已删除 ' + ids.length + ' 页，可撤销。');
    }

    function duplicateSelection() {
        if (state.busy || state.importing) return;
        const ids = orderedSelection();
        if (!ids.length) return;
        const result = core.duplicatePages(state.pages, ids, function() {
            return 'page-' + state.nextPageId++;
        });
        applyPages(result.pages, {
            selected: result.createdIds,
            activeId: result.createdIds[0] || state.activeId
        });
        showToast('已复制 ' + result.createdIds.length + ' 页。');
    }

    function shiftSelection(direction) {
        if (state.busy || state.importing) return;
        const ids = orderedSelection();
        if (!ids.length) return;
        applyPages(core.shiftPages(state.pages, ids, direction));
    }

    function friendlyImportError(file, error) {
        if (error && error.name === 'EncryptedPdfError') return '“' + file.name + '”已加密，暂不支持。';
        if (error && error.name === 'InvalidPDFException') return '“' + file.name + '”不是有效的 PDF。';
        return '无法读取“' + file.name + '”：' + (error && error.message ? error.message : String(error));
    }

    function isPdfFile(file) {
        return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
    }

    async function importFiles(fileList) {
        if (state.busy || state.importing) return;
        const files = Array.from(fileList || []).filter(isPdfFile);
        if (!files.length) {
            showToast('请选择 PDF 文件。', 'error');
            return;
        }

        state.importing = true;
        state.history = [];
        state.future = [];
        state.warningDismissed = false;
        updateUi();
        const wasEmpty = state.pages.length === 0;
        let firstImportedPage = null;
        let imported = 0;

        for (const file of files) {
            const source = {
                id: 'source-' + state.nextSourceId++,
                file: file,
                name: file.name || 'document.pdf',
                size: file.size || 0,
                pageCount: 0,
                status: 'loading',
                pdf: null
            };
            state.sources.set(source.id, source);
            renderSources();
            updateUi();

            try {
                const pdf = await engine.openDocument(file);
                if (!state.sources.has(source.id)) {
                    await pdf.task.destroy().catch(function() {});
                    continue;
                }
                source.pdf = pdf;
                source.pageCount = pdf.document.numPages;
                source.status = 'ready';
                for (let pageIndex = 0; pageIndex < source.pageCount; pageIndex += 1) {
                    const descriptor = {
                        id: 'page-' + state.nextPageId++,
                        sourceId: source.id,
                        sourcePageIndex: pageIndex,
                        rotation: 0
                    };
                    if (!firstImportedPage) firstImportedPage = descriptor.id;
                    state.pages.push(descriptor);
                }
                imported += 1;
                renderWorkspace();
            } catch (error) {
                state.sources.delete(source.id);
                showToast(friendlyImportError(file, error), 'error');
                renderWorkspace();
            }
        }

        state.importing = false;
        if (wasEmpty && firstImportedPage) {
            state.activeId = firstImportedPage;
            state.anchorId = firstImportedPage;
            state.selected = new Set([firstImportedPage]);
        } else if (!state.activeId && state.pages[0]) {
            state.activeId = state.pages[0].id;
        }
        renderWorkspace();
        if (firstImportedPage) scrollToPage(firstImportedPage);
        if (imported) showToast('已添加 ' + imported + ' 个 PDF，共 ' + state.pages.length + ' 页。');
    }

    function scrollToPage(pageId) {
        const card = state.pageElements.get(pageId);
        if (!card) return;
        card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        queueRender(pageId);
    }

    async function removeSource(sourceId) {
        const source = state.sources.get(sourceId);
        if (!source || state.busy || state.importing) return;
        const removedIds = new Set(state.pages.filter(function(page) { return page.sourceId === sourceId; }).map(function(page) { return page.id; }));
        state.pages = state.pages.filter(function(page) { return page.sourceId !== sourceId; });
        state.selected = new Set(Array.from(state.selected).filter(function(id) { return !removedIds.has(id); }));
        if (removedIds.has(state.activeId)) state.activeId = state.pages[0] ? state.pages[0].id : null;
        state.anchorId = state.activeId;
        state.sources.delete(sourceId);
        state.history = [];
        state.future = [];
        await engine.destroySource(source);
        renderWorkspace();
        showToast('已移除“' + source.name + '”。');
    }

    async function clearWorkspace() {
        if (!state.sources.size || state.busy || state.importing) return;
        if (elements.clearAll.dataset.armed !== 'true') {
            elements.clearAll.dataset.armed = 'true';
            elements.clearAll.title = '再次点击确认清空';
            showToast('再次点击清空按钮以确认。');
            window.clearTimeout(state.clearTimer);
            state.clearTimer = window.setTimeout(function() {
                delete elements.clearAll.dataset.armed;
                elements.clearAll.title = '清空工作区';
            }, 3500);
            return;
        }

        delete elements.clearAll.dataset.armed;
        elements.clearAll.title = '清空工作区';
        const sources = Array.from(state.sources.values());
        state.sources.clear();
        state.pages = [];
        state.selected.clear();
        state.activeId = null;
        state.anchorId = null;
        state.history = [];
        state.future = [];
        state.warningDismissed = false;
        await Promise.all(sources.map(engine.destroySource));
        renderWorkspace();
        showToast('工作区已清空。');
    }

    function setDensity(index) {
        state.density = densityNames[Math.max(0, Math.min(2, Number(index) || 0))];
        app.dataset.density = state.density;
        elements.density.value = String(densityNames.indexOf(state.density));
        state.pageElements.forEach(function(card) {
            card.dataset.requestedKey = '';
        });
        renderPageGrid();
        savePreferences();
    }

    function setExportMode(mode) {
        if (!['all', 'selected', 'split'].includes(mode)) return;
        if (mode !== 'all' && !state.selected.size) return;
        state.exportMode = mode;
        updateUi();
        savePreferences();
    }

    function updateProgress(progress) {
        const current = Math.max(0, Number(progress.current) || 0);
        const total = Math.max(1, Number(progress.total) || 1);
        let percent = 0;
        if (progress.phase === 'read') percent = 8 + (current / total) * 22;
        else if (progress.phase === 'copy') percent = 32 + (current / total) * 38;
        else if (progress.phase === 'split') percent = 30 + (current / total) * 62;
        else if (progress.phase === 'save') percent = 94;
        elements.processingDetail.textContent = progress.label || '正在处理文件';
        elements.processingProgress.style.width = Math.min(98, percent) + '%';
    }

    function downloadBytes(bytes, mimeType, filename) {
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    async function exportWorkspace() {
        if (state.busy || state.importing) return;
        const pages = exportSelection();
        if (!pages.length) return;
        state.busy = true;
        closeInspector();
        elements.processing.hidden = false;
        elements.processingLabel.textContent = state.exportMode === 'split' ? '正在拆分 PDF' : '正在生成 PDF';
        elements.processingDetail.textContent = '准备来源文件';
        elements.processingProgress.style.width = '4%';
        updateUi();

        try {
            const baseName = core.sanitizeBaseName(elements.outputName.value, 'merged-document');
            if (state.exportMode === 'split') {
                const documents = await engine.exportSplitDocuments(pages, state.sources, updateProgress);
                const used = new Set();
                const files = Object.create(null);
                pages.forEach(function(page, index) {
                    const source = state.sources.get(page.sourceId);
                    const filename = core.splitFilename(source ? source.name : 'document', page.sourcePageIndex + 1, source ? source.pageCount : 1, used);
                    files[filename] = [documents[index], { level: 0 }];
                });
                elements.processingDetail.textContent = '打包 ZIP';
                elements.processingProgress.style.width = '97%';
                const archive = window.fflate.zipSync(files, { level: 0 });
                const filename = core.outputFilename(baseName, 'zip');
                downloadBytes(archive, 'application/zip', filename);
                showToast('已导出 ' + pages.length + ' 个页面文件。');
            } else {
                const bytes = await engine.exportDocument(pages, state.sources, updateProgress);
                elements.processingProgress.style.width = '100%';
                const filename = core.outputFilename(baseName, 'pdf');
                downloadBytes(bytes, 'application/pdf', filename);
                showToast('已导出 ' + pages.length + ' 页 PDF。');
            }
        } catch (error) {
            console.error(error);
            showToast(error && error.message ? error.message : 'PDF 导出失败。', 'error');
            window.toolHost.reportError(error);
        } finally {
            state.busy = false;
            elements.processing.hidden = true;
            updateUi();
        }
    }

    function previewIndex() {
        return state.pages.findIndex(function(page) { return page.id === state.previewId; });
    }

    function openPreview(pageId) {
        const id = pageId || state.activeId || (state.pages[0] && state.pages[0].id);
        if (!id || state.busy) return;
        state.previewId = id;
        elements.preview.hidden = false;
        renderPreview();
        elements.closePreview.focus();
    }

    async function renderPreview() {
        const token = ++state.previewToken;
        const page = state.pages.find(function(item) { return item.id === state.previewId; });
        if (!page || elements.preview.hidden) return;
        const source = state.sources.get(page.sourceId);
        if (!source) return;
        const index = previewIndex();
        state.activeId = page.id;
        elements.previewTitle.textContent = source.name;
        elements.previewMeta.textContent = '工作区 ' + (index + 1) + '/' + state.pages.length + ' · 原文件 p' + (page.sourcePageIndex + 1);
        elements.previewPrevious.disabled = index <= 0;
        elements.previewNext.disabled = index < 0 || index >= state.pages.length - 1;
        elements.previewLoading.hidden = false;
        elements.previewCanvas.hidden = true;
        engine.cancelRender(elements.previewCanvas);
        refreshSelectionStyles();

        await new Promise(function(resolve) { window.requestAnimationFrame(resolve); });
        try {
            const width = Math.max(240, Math.min(1080, elements.previewStage.clientWidth - 56));
            await engine.renderPage(source, page.sourcePageIndex, page.rotation, elements.previewCanvas, {
                width: width,
                pixelRatio: Math.min(window.devicePixelRatio || 1, 1.6),
                maxArea: 12000000
            });
            if (token !== state.previewToken || elements.preview.hidden) return;
            elements.previewCanvas.hidden = false;
            elements.previewLoading.hidden = true;
        } catch (error) {
            if (!error || error.name !== 'RenderingCancelledException') {
                showToast('页面预览失败：' + (error.message || String(error)), 'error');
                closePreview();
            }
        }
    }

    function navigatePreview(delta) {
        const index = previewIndex();
        const next = state.pages[index + delta];
        if (!next) return;
        state.previewId = next.id;
        renderPreview();
    }

    function closePreview() {
        if (elements.preview.hidden) return;
        state.previewToken += 1;
        engine.cancelRender(elements.previewCanvas);
        elements.preview.hidden = true;
        const card = state.pageElements.get(state.activeId);
        if (card) card.focus();
    }

    function openInspector() {
        elements.inspector.classList.add('is-open');
        elements.outputName.focus();
        elements.outputName.select();
    }

    function closeInspector() {
        elements.inspector.classList.remove('is-open');
    }

    function hasFileDrag(event) {
        return event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files');
    }

    function bindDragAndDrop() {
        elements.dropZone.addEventListener('dragenter', function(event) {
            if (!hasFileDrag(event) || state.busy || state.importing) return;
            event.preventDefault();
            state.dragDepth += 1;
            elements.dropOverlay.hidden = false;
        });
        elements.dropZone.addEventListener('dragover', function(event) {
            if (!hasFileDrag(event) || state.busy || state.importing) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        });
        elements.dropZone.addEventListener('dragleave', function(event) {
            if (!hasFileDrag(event)) return;
            state.dragDepth = Math.max(0, state.dragDepth - 1);
            if (!state.dragDepth) elements.dropOverlay.hidden = true;
        });
        elements.dropZone.addEventListener('drop', function(event) {
            if (!hasFileDrag(event)) return;
            event.preventDefault();
            state.dragDepth = 0;
            elements.dropOverlay.hidden = true;
            importFiles(event.dataTransfer.files);
        });
    }

    function bindPageGrid() {
        elements.pageGrid.addEventListener('click', function(event) {
            const card = event.target.closest('[data-page-id]');
            if (!card) return;
            if (event.target.closest('[data-drag-handle]')) return;
            if (event.target.closest('[data-page-select]')) {
                togglePage(card.dataset.pageId, event);
                return;
            }
            selectPage(card.dataset.pageId, event);
        });

        elements.pageGrid.addEventListener('dblclick', function(event) {
            const card = event.target.closest('[data-page-id]');
            if (card && !event.target.closest('button')) openPreview(card.dataset.pageId);
        });

        elements.pageGrid.addEventListener('keydown', function(event) {
            const card = event.target.closest('[data-page-id]');
            if (!card || event.target !== card) return;
            if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                togglePage(card.dataset.pageId, event);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                openPreview(card.dataset.pageId);
            } else if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                deleteSelection();
            } else if (event.altKey && event.key === 'ArrowLeft') {
                event.preventDefault();
                shiftSelection(-1);
            } else if (event.altKey && event.key === 'ArrowRight') {
                event.preventDefault();
                shiftSelection(1);
            }
        });
    }

    function initializeSortable() {
        state.sortable = window.Sortable.create(elements.pageGrid, {
            animation: 160,
            draggable: '.page-card',
            handle: '[data-drag-handle]',
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            delay: 120,
            delayOnTouchOnly: true,
            touchStartThreshold: 4,
            onStart: function(event) {
                const pageId = event.item.dataset.pageId;
                if (!state.selected.has(pageId)) {
                    state.selected = new Set([pageId]);
                    state.activeId = pageId;
                    state.anchorId = pageId;
                    refreshSelectionStyles();
                }
                state.drag = {
                    pageId: pageId,
                    movingIds: orderedSelection()
                };
            },
            onEnd: function(event) {
                if (!state.drag) return;
                let sibling = event.item.nextElementSibling;
                const moving = new Set(state.drag.movingIds);
                while (sibling && moving.has(sibling.dataset.pageId)) sibling = sibling.nextElementSibling;
                const beforeId = sibling ? sibling.dataset.pageId : null;
                const nextPages = core.movePagesBefore(state.pages, state.drag.movingIds, beforeId);
                state.drag = null;
                applyPages(nextPages);
            }
        });
    }

    function bindEvents() {
        elements.addFiles.forEach(function(button) {
            button.addEventListener('click', function() { elements.fileInput.click(); });
        });
        elements.fileInput.addEventListener('change', function() {
            importFiles(elements.fileInput.files);
            elements.fileInput.value = '';
        });
        elements.undo.addEventListener('click', undo);
        elements.redo.addEventListener('click', redo);
        elements.density.addEventListener('input', function() { setDensity(elements.density.value); });
        elements.previewButton.addEventListener('click', function() { openPreview(); });
        elements.exportTrigger.addEventListener('click', function() {
            if (window.matchMedia('(max-width: 860px)').matches) openInspector();
            else exportWorkspace();
        });
        elements.selectAll.addEventListener('click', selectAllPages);
        elements.clearSelection.addEventListener('click', clearSelection);
        elements.clearAll.addEventListener('click', clearWorkspace);
        elements.dismissWarning.addEventListener('click', function() {
            state.warningDismissed = true;
            updateUi();
        });
        elements.sourceList.addEventListener('click', function(event) {
            const remove = event.target.closest('[data-remove-source]');
            if (remove) {
                removeSource(remove.dataset.removeSource);
                return;
            }
            const focus = event.target.closest('[data-source-focus]');
            if (!focus) return;
            const page = state.pages.find(function(item) { return item.sourceId === focus.dataset.sourceFocus; });
            if (!page) {
                showToast('该文件当前没有工作区页面。');
                return;
            }
            state.activeId = page.id;
            state.anchorId = page.id;
            refreshSelectionStyles();
            scrollToPage(page.id);
        });

        elements.moveLeft.forEach(function(button) { button.addEventListener('click', function() { shiftSelection(-1); }); });
        elements.moveRight.forEach(function(button) { button.addEventListener('click', function() { shiftSelection(1); }); });
        elements.rotateLeft.forEach(function(button) { button.addEventListener('click', function() { rotateSelection(-90); }); });
        elements.rotateRight.forEach(function(button) { button.addEventListener('click', function() { rotateSelection(90); }); });
        elements.duplicate.forEach(function(button) { button.addEventListener('click', duplicateSelection); });
        elements.deletePages.forEach(function(button) { button.addEventListener('click', deleteSelection); });
        elements.exportModes.forEach(function(button) {
            button.addEventListener('click', function() { setExportMode(button.dataset.exportMode); });
        });
        elements.outputName.addEventListener('change', function() {
            elements.outputName.value = core.sanitizeBaseName(elements.outputName.value, 'merged-document');
            savePreferences();
        });
        elements.exportButton.addEventListener('click', exportWorkspace);
        elements.closeInspector.addEventListener('click', closeInspector);
        elements.closePreview.addEventListener('click', closePreview);
        elements.previewPrevious.addEventListener('click', function() { navigatePreview(-1); });
        elements.previewNext.addEventListener('click', function() { navigatePreview(1); });

        window.addEventListener('keydown', function(event) {
            const editable = event.target.matches && event.target.matches('input, textarea, [contenteditable="true"]');
            if (!elements.preview.hidden && event.key === 'Tab') {
                const focusable = all('button:not(:disabled)', elements.preview);
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
                return;
            }
            if (event.key === 'Escape') {
                if (!elements.preview.hidden) closePreview();
                else closeInspector();
                return;
            }
            if (!elements.preview.hidden && event.key === 'ArrowLeft') {
                event.preventDefault();
                navigatePreview(-1);
                return;
            }
            if (!elements.preview.hidden && event.key === 'ArrowRight') {
                event.preventDefault();
                navigatePreview(1);
                return;
            }
            if (editable) return;
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (event.shiftKey) redo();
                else undo();
            } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                selectAllPages();
            } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected.size) {
                event.preventDefault();
                deleteSelection();
            }
        });

        window.addEventListener('paste', function(event) {
            if (state.busy || state.importing || !event.clipboardData) return;
            const files = Array.from(event.clipboardData.files || []).filter(isPdfFile);
            if (files.length) importFiles(files);
        });

        window.addEventListener('resize', function() {
            window.clearTimeout(state.previewResizeTimer);
            state.previewResizeTimer = window.setTimeout(function() {
                if (!elements.preview.hidden) renderPreview();
            }, 120);
        });
        window.addEventListener('beforeunload', function() {
            state.sources.forEach(function(source) { engine.destroySource(source); });
        });

        bindDragAndDrop();
        bindPageGrid();
    }

    async function initialize() {
        try {
            await window.toolStorage.ready();
        } catch (error) {
            console.warn('Tool storage handshake failed.', error);
        }
        loadPreferences();
        app.dataset.density = state.density;
        elements.density.value = String(densityNames.indexOf(state.density));
        state.observer = 'IntersectionObserver' in window ? new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) queueRender(entry.target.dataset.pageId);
            });
        }, { root: elements.pagesScroll, rootMargin: '280px 120px', threshold: 0.01 }) : null;
        bindEvents();
        initializeSortable();
        renderWorkspace();
        refreshIcons();
        window.toolHost.markReady();
    }

    initialize().catch(function(error) {
        console.error(error);
        window.toolHost.reportError(error);
        showToast(error.message || String(error), 'error');
    });
})();
