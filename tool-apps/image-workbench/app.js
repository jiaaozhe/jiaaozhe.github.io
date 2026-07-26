(function() {
    const core = window.ImageWorkbenchCore;
    const privacy = window.ImagePrivacy;
    const metadataReader = window.exifr;
    const storage = window.toolStorage;
    const host = window.toolHost;
    const MAX_ASSETS = 40;
    const WARN_PIXELS = 32 * 1000 * 1000;
    const MAX_PIXELS = 60 * 1000 * 1000;
    const MAX_OUTPUT_PIXELS = 40 * 1000 * 1000;
    const MAX_ZIP_BYTES = 220 * 1024 * 1024;
    const SETTINGS_KEY = 'image.settings';
    const SCOPE_KEY = 'image.scope';
    const TAB_KEY = 'image.tab';
    const PRIVACY_PARSE_OPTIONS = Object.freeze({
        tiff: true,
        ifd0: true,
        ifd1: false,
        exif: true,
        gps: true,
        interop: false,
        xmp: true,
        iptc: true,
        icc: false,
        jfif: false,
        ihdr: false,
        makerNote: false,
        userComment: true,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
        sanitize: true,
        mergeOutput: true,
        silentErrors: true
    });
    const PRESETS = {
        blog: {
            sizeMode: 'long-edge', longEdge: 1600, format: 'image/webp',
            quality: 0.82, suffix: '-web', transparent: true
        },
        og: {
            sizeMode: 'custom', width: 1200, height: 630, fit: 'cover',
            format: 'image/jpeg', quality: 0.88, suffix: '-og', transparent: false
        },
        avatar: {
            sizeMode: 'custom', width: 512, height: 512, fit: 'cover',
            format: 'image/webp', quality: 0.9, suffix: '-avatar', transparent: true
        }
    };

    function one(selector, root) {
        return (root || document).querySelector(selector);
    }

    function all(selector, root) {
        return Array.from((root || document).querySelectorAll(selector));
    }

    const elements = {
        root: one('[data-workbench]'),
        addButtons: all('[data-add-images]'),
        fileInput: one('[data-file-input]'),
        undo: one('[data-undo]'),
        redo: one('[data-redo]'),
        scopes: all('[data-scope]'),
        preview: one('[data-preview-result]'),
        export: one('[data-export]'),
        assetCount: one('[data-asset-count]'),
        selectedCount: one('[data-selected-count]'),
        selectAll: one('[data-select-all]'),
        assetList: one('[data-asset-list]'),
        queueEmpty: one('[data-queue-empty]'),
        sessionSize: one('[data-session-size]'),
        removeSelected: one('[data-remove-selected]'),
        dropZone: one('[data-drop-zone]'),
        dropOverlay: one('[data-drop-overlay]'),
        activeName: one('[data-active-name]'),
        activeMeta: one('[data-active-meta]'),
        viewButtons: all('[data-view]'),
        stageEmpty: one('[data-stage-empty]'),
        cropStage: one('[data-crop-stage]'),
        editorImage: one('[data-editor-image]'),
        compareStage: one('[data-compare-stage]'),
        compareBefore: one('[data-compare-before]'),
        compareAfter: one('[data-compare-after]'),
        compareAfterWrap: one('[data-compare-after-wrap]'),
        compareDivider: one('[data-compare-divider]'),
        compareSlider: one('[data-compare-slider]'),
        processing: one('[data-processing]'),
        processingLabel: one('[data-processing-label]'),
        processingBar: one('[data-processing-bar]'),
        cropSize: one('[data-crop-size]'),
        outputEstimate: one('[data-output-estimate]'),
        memoryNote: one('[data-memory-note]'),
        tabs: all('[data-inspector-tab]'),
        panels: all('[data-inspector-panel]'),
        ratioButtons: all('[data-ratio]'),
        ratioOutput: one('[data-ratio-output]'),
        transformButtons: all('[data-transform]'),
        resetTransform: one('[data-reset-transform]'),
        sizeModeButtons: all('[data-size-mode]'),
        longEdgeRow: one('[data-long-edge-row]'),
        longEdge: one('[data-long-edge]'),
        customSize: one('[data-custom-size]'),
        outputWidth: one('[data-output-width]'),
        outputHeight: one('[data-output-height]'),
        dimensionLock: one('[data-dimension-lock]'),
        fitControl: one('[data-fit-control]'),
        fitButtons: all('[data-fit]'),
        noUpscale: one('[data-no-upscale]'),
        formatButtons: all('[data-format]'),
        qualityRow: one('[data-quality-row]'),
        quality: one('[data-quality]'),
        qualityOutput: one('[data-quality-output]'),
        transparent: one('[data-transparent]'),
        background: one('[data-background]'),
        suffix: one('[data-suffix]'),
        presetButtons: all('[data-preset]'),
        saveDefault: one('[data-save-default]'),
        privacyTabSignal: one('[data-privacy-tab-signal]'),
        privacyState: one('[data-privacy-state]'),
        privacyKicker: one('[data-privacy-kicker]'),
        privacyTitle: one('[data-privacy-title]'),
        privacySummary: one('[data-privacy-summary]'),
        privacyRisk: one('[data-privacy-risk]'),
        privacyReport: one('[data-privacy-report]'),
        privacySensitiveCount: one('[data-privacy-sensitive-count]'),
        privacyFieldCount: one('[data-privacy-field-count]'),
        privacyCarrierCount: one('[data-privacy-carrier-count]'),
        privacyLocation: one('[data-privacy-location]'),
        privacyCoordinates: one('[data-privacy-coordinates]'),
        privacyPreset: one('[data-privacy-preset]'),
        privacyExport: one('[data-privacy-export]'),
        privacyExportLabel: one('[data-privacy-export-label]'),
        privacyScanNote: one('[data-privacy-scan-note]'),
        privacyGroups: one('[data-privacy-groups]'),
        privacyNoFields: one('[data-privacy-no-fields]'),
        privacyCarriersWrap: one('[data-privacy-carriers-wrap]'),
        privacyCarriersLabel: one('[data-privacy-carriers-label]'),
        privacyCarriers: one('[data-privacy-carriers]'),
        privacyWarnings: one('[data-privacy-warnings]'),
        renderFarm: one('[data-render-farm]'),
        toastRegion: one('[data-toast-region]')
    };

    const state = {
        assets: [],
        selected: new Set(),
        activeId: null,
        cropper: null,
        cropperReady: false,
        restoring: false,
        scope: 'current',
        tab: 'transform',
        view: 'edit',
        dimensionLock: true,
        processing: false,
        dragDepth: 0,
        assetCounter: 0,
        defaultSettings: core ? core.normalizeSettings() : null,
        compareUrls: { before: '', after: '' },
        previewTimer: null,
        pica: null,
        webpSupported: false
    };

    function activeAsset() {
        return state.assets.find(function(asset) { return asset.id === state.activeId; }) || null;
    }

    function ratioValue(value) {
        return value === 'free' ? NaN : Number(value);
    }

    function ratioLabel(value) {
        const labels = { free: '自由', '1': '1:1', '1.3333333333': '4:3', '1.7777777778': '16:9' };
        return labels[value] || '自由';
    }

    function toast(message, tone) {
        const item = document.createElement('div');
        item.className = 'toast';
        item.dataset.tone = tone || 'info';
        item.textContent = message;
        elements.toastRegion.appendChild(item);
        window.setTimeout(function() { item.remove(); }, 3600);
    }

    function reportError(error) {
        console.error(error);
        if (host) host.reportError(error);
    }

    function detectWebp() {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        return canvas.toDataURL('image/webp').startsWith('data:image/webp');
    }

    function safeStoredSettings() {
        try {
            const raw = storage.getItem(SETTINGS_KEY);
            if (!raw) return core.normalizeSettings();
            return core.normalizeSettings(JSON.parse(raw));
        } catch (error) {
            reportError(error);
            return core.normalizeSettings();
        }
    }

    function normalizeForBrowser(settings) {
        const next = core.normalizeSettings(settings);
        if (!state.webpSupported && next.format === 'image/webp') {
            next.format = 'image/jpeg';
            next.transparent = false;
        }
        return next;
    }

    function setTab(name) {
        if (!['transform', 'size', 'export', 'privacy'].includes(name)) return;
        state.tab = name;
        elements.tabs.forEach(function(button) {
            button.setAttribute('aria-selected', String(button.dataset.inspectorTab === name));
        });
        elements.panels.forEach(function(panel) {
            panel.hidden = panel.dataset.inspectorPanel !== name;
        });
        storage.setItem(TAB_KEY, name);
        if (name === 'privacy') renderPrivacyPanel(activeAsset());
    }

    function setScope(name) {
        if (!['current', 'selected', 'all'].includes(name)) return;
        state.scope = name;
        elements.scopes.forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset.scope === name));
        });
        storage.setItem(SCOPE_KEY, name);
        updatePrivacyExportLabel();
    }

    function setView(name) {
        if (name === 'compare' && !state.compareUrls.after) {
            previewActive();
            return;
        }

        state.view = name === 'compare' ? 'compare' : 'edit';
        elements.viewButtons.forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
        });
        elements.cropStage.hidden = state.view !== 'edit' || !activeAsset();
        elements.compareStage.hidden = state.view !== 'compare' || !activeAsset();
    }

    function setProcessing(active, label, progress) {
        state.processing = active;
        elements.processing.hidden = !active;
        elements.processingLabel.textContent = label || '正在处理';
        elements.processingBar.style.width = Math.max(0, Math.min(100, progress || 0)) + '%';
        updateActionState();
    }

    function updateActionState() {
        const asset = activeAsset();
        const hasAssets = state.assets.length > 0;
        const hasSelection = state.selected.size > 0;
        const canTransform = Boolean(asset) && !state.processing;

        elements.preview.disabled = !asset || state.processing;
        elements.export.disabled = !hasAssets || state.processing;
        elements.privacyExport.disabled = !hasAssets || state.processing;
        elements.privacyPreset.disabled = !hasAssets || state.processing;
        elements.selectAll.disabled = !hasAssets;
        elements.removeSelected.disabled = !hasSelection || state.processing;
        elements.resetTransform.disabled = !canTransform;
        elements.transformButtons.forEach(function(button) { button.disabled = !canTransform; });
        elements.ratioButtons.forEach(function(button) { button.disabled = !canTransform; });
        elements.viewButtons.forEach(function(button) {
            if (button.dataset.view === 'compare') button.disabled = !asset || state.processing;
        });
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        const asset = activeAsset();
        const index = asset ? asset.historyIndex : -1;
        const length = asset ? asset.history.length : 0;
        elements.undo.disabled = state.processing || index <= 0;
        elements.redo.disabled = state.processing || index < 0 || index >= length - 1;
    }

    function renderAssetList() {
        elements.assetList.replaceChildren();

        state.assets.forEach(function(asset) {
            const item = document.createElement('div');
            item.className = 'asset-item';
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', '编辑 ' + asset.name);
            item.classList.toggle('is-active', asset.id === state.activeId);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = state.selected.has(asset.id);
            checkbox.setAttribute('aria-label', '选择 ' + asset.name);

            const thumb = document.createElement('span');
            thumb.className = 'asset-thumb';
            const image = document.createElement('img');
            image.src = asset.url;
            image.alt = '';
            thumb.appendChild(image);

            const copy = document.createElement('span');
            copy.className = 'asset-copy';
            const title = document.createElement('strong');
            title.textContent = asset.name;
            const meta = document.createElement('small');
            const result = asset.resultSize ? ' → ' + core.formatBytes(asset.resultSize) : '';
            meta.textContent = asset.width + '×' + asset.height + ' · ' + core.formatBytes(asset.size) + result;
            copy.append(title, meta);

            const status = document.createElement('span');
            status.className = 'asset-state';
            status.dataset.state = asset.state;
            status.title = asset.state === 'processing' ? '处理中' : asset.state === 'done' ? '已生成' : asset.state === 'error' ? '失败' : '就绪';

            const privacyBadge = document.createElement('span');
            const privacyStatus = asset.privacy || { status: 'scanning', report: null };
            const privacyRisk = privacyStatus.status === 'ready' && privacyStatus.report
                ? privacyStatus.report.risk
                : privacyStatus.status;
            const privacyLabels = {
                scanning: '…',
                error: '?',
                high: 'GPS',
                medium: '!',
                low: '✓',
                clean: '✓'
            };
            privacyBadge.className = 'asset-privacy';
            privacyBadge.dataset.risk = privacyRisk;
            privacyBadge.textContent = privacyLabels[privacyRisk] || '?';
            privacyBadge.title = privacyStatus.status === 'scanning'
                ? '正在检查隐私元数据'
                : privacyStatus.status === 'error'
                    ? '隐私元数据检查不完整'
                    : privacyRisk === 'high'
                        ? '发现高风险隐私信息'
                        : privacyRisk === 'medium'
                            ? '发现可识别元数据'
                            : '未发现明显隐私风险';

            checkbox.addEventListener('click', function(event) {
                event.stopPropagation();
                if (checkbox.checked) state.selected.add(asset.id);
                else state.selected.delete(asset.id);
                updateSelectionUI();
            });
            item.addEventListener('click', function() { activateAsset(asset.id); });
            item.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activateAsset(asset.id);
                }
            });

            item.append(checkbox, thumb, copy, status, privacyBadge);
            elements.assetList.appendChild(item);
        });

        elements.assetCount.textContent = String(state.assets.length);
        elements.queueEmpty.hidden = state.assets.length > 0;
        elements.sessionSize.textContent = core.formatBytes(state.assets.reduce(function(total, asset) {
            return total + asset.size;
        }, 0));
        elements.memoryNote.textContent = '会话内存 ' + elements.sessionSize.textContent;
        updateSelectionUI();
        updateActionState();
    }

    function updateSelectionUI() {
        const selectedCount = state.assets.filter(function(asset) { return state.selected.has(asset.id); }).length;
        elements.selectedCount.textContent = String(selectedCount);
        elements.selectAll.checked = state.assets.length > 0 && selectedCount === state.assets.length;
        elements.selectAll.indeterminate = selectedCount > 0 && selectedCount < state.assets.length;
        elements.removeSelected.disabled = selectedCount === 0 || state.processing;
    }

    function updatePrivacyExportLabel() {
        const labels = {
            current: '清理并导出当前图片',
            selected: '清理并导出选中图片',
            all: '清理并导出全部图片'
        };
        elements.privacyExportLabel.textContent = labels[state.scope] || labels.current;
    }

    function setPrivacyState(risk, kicker, title, summary, pill) {
        elements.privacyState.dataset.risk = risk;
        elements.privacyKicker.textContent = kicker;
        elements.privacyTitle.textContent = title;
        elements.privacySummary.textContent = summary;
        elements.privacyRisk.textContent = pill;
    }

    function appendPrivacyGroup(group) {
        const details = document.createElement('details');
        details.className = 'privacy-group';
        details.dataset.risk = group.risk;
        details.open = group.risk === 'high';

        const summary = document.createElement('summary');
        summary.append(document.createTextNode(group.label));
        const count = document.createElement('span');
        count.textContent = String(group.entries.length);
        summary.appendChild(count);
        details.appendChild(summary);

        group.entries.forEach(function(entry) {
            const row = document.createElement('dl');
            row.className = 'privacy-field';
            const term = document.createElement('dt');
            const label = document.createElement('strong');
            const key = document.createElement('code');
            const value = document.createElement('dd');
            label.textContent = entry.label;
            key.textContent = entry.key;
            value.textContent = entry.value;
            term.append(label, key);
            row.append(term, value);
            details.appendChild(row);
        });

        elements.privacyGroups.appendChild(details);
    }

    function appendPrivacyCarrier(item) {
        const row = document.createElement('div');
        row.className = 'privacy-carrier-item';
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        const detail = document.createElement('span');
        const size = document.createElement('small');
        title.textContent = item.label;
        detail.textContent = item.detail || item.kind.toUpperCase();
        size.textContent = core.formatBytes(item.size);
        copy.append(title, detail);
        row.append(copy, size);
        elements.privacyCarriers.appendChild(row);
    }

    function renderPrivacyPanel(asset) {
        elements.privacyGroups.replaceChildren();
        elements.privacyCarriers.replaceChildren();
        elements.privacyWarnings.replaceChildren();
        elements.privacyLocation.hidden = true;
        elements.privacyTabSignal.hidden = true;

        if (!asset) {
            setPrivacyState(
                'empty',
                'PRIVACY SCAN',
                '选择一张图片',
                '导入后将在本地检查 EXIF、GPS、XMP、IPTC 和文本元数据。',
                '--'
            );
            elements.privacyReport.hidden = true;
            return;
        }

        const status = asset.privacy || { status: 'scanning', report: null };
        if (status.status === 'scanning') {
            setPrivacyState(
                'scanning',
                'SCANNING / LOCAL',
                '正在检查隐私元数据',
                '只读取必要的文件片段，图片不会离开当前浏览器。',
                '扫描'
            );
            elements.privacyReport.hidden = true;
            return;
        }

        if (status.status === 'error' || !status.report) {
            setPrivacyState(
                'error',
                'SCAN INCOMPLETE',
                '检查未能完成',
                '仍可安全导出；导出结果会在下载前进行独立复检。',
                '注意'
            );
            elements.privacyReport.hidden = true;
            return;
        }

        const report = status.report;
        const typeLabel = asset.type.replace('image/', '').toUpperCase();
        const riskCopy = {
            high: {
                title: report.location ? '发现精确拍摄位置' : '发现高风险隐私信息',
                summary: '这张图片包含可能定位个人或设备的信息，建议清理后再分享。',
                pill: '高'
            },
            medium: {
                title: '图片包含可识别元数据',
                summary: '检测到设备、时间、描述或文件级元数据，导出时将自动清理。',
                pill: '注意'
            },
            low: {
                title: '仅发现拍摄参数',
                summary: '没有发现明显定位或身份字段，仍会在导出时移除元数据。',
                pill: '低'
            },
            clean: {
                title: '未发现隐私元数据',
                summary: '没有检测到可读取字段或隐私载体，导出结果仍会再次复检。',
                pill: '清爽'
            }
        };
        const copy = riskCopy[report.risk] || riskCopy.medium;

        setPrivacyState(report.risk, typeLabel + ' / LOCAL SCAN', copy.title, copy.summary, copy.pill);
        elements.privacyReport.hidden = false;
        elements.privacySensitiveCount.textContent = String(report.counts.sensitive);
        elements.privacyFieldCount.textContent = String(report.counts.fields);
        elements.privacyCarrierCount.textContent = String(report.counts.carriers);
        elements.privacyNoFields.hidden = report.entries.length > 0;
        elements.privacyCarriersWrap.hidden = report.carriers.length === 0;
        elements.privacyCarriersLabel.textContent = String(report.carriers.length);
        elements.privacyScanNote.textContent = status.lastVerified
            ? '最近生成结果复检通过'
            : report.warnings.length
                ? '部分字段可能未展开'
                : '仅显示可读取字段';
        elements.privacyTabSignal.hidden = report.risk !== 'high' && report.risk !== 'medium';
        elements.privacyTabSignal.dataset.risk = report.risk;

        if (report.location) {
            elements.privacyLocation.hidden = false;
            elements.privacyCoordinates.textContent =
                report.location.latitude.toFixed(6) + ', ' + report.location.longitude.toFixed(6);
        }

        report.groups.forEach(appendPrivacyGroup);
        report.carriers.forEach(appendPrivacyCarrier);

        if (report.warnings.length) {
            elements.privacyWarnings.hidden = false;
            report.warnings.forEach(function(message) {
                const item = document.createElement('p');
                item.textContent = message;
                elements.privacyWarnings.appendChild(item);
            });
        } else {
            elements.privacyWarnings.hidden = true;
        }
    }

    async function parseMetadata(asset, carriers) {
        let source = asset.file;

        if (asset.type === 'image/webp') {
            const exifCarrier = carriers.find(function(item) { return item.kind === 'exif'; });
            if (!exifCarrier || !exifCarrier.payloadSize) return {};
            source = asset.file.slice(
                exifCarrier.payloadOffset,
                exifCarrier.payloadOffset + exifCarrier.payloadSize
            );
            const prefix = new Uint8Array(await source.slice(0, 6).arrayBuffer());
            if (
                prefix.length >= 6 &&
                prefix[0] === 0x45 && prefix[1] === 0x78 && prefix[2] === 0x69 &&
                prefix[3] === 0x66 && prefix[4] === 0 && prefix[5] === 0
            ) {
                source = source.slice(6);
            }
        }

        return (await metadataReader.parse(source, PRIVACY_PARSE_OPTIONS)) || {};
    }

    async function analyzeAssetPrivacy(asset) {
        const warnings = [];
        let carriers = [];
        let metadata = {};
        let carrierFailed = false;
        let metadataFailed = false;

        try {
            carriers = await privacy.scanMetadataCarriers(asset.file, asset.type);
        } catch (error) {
            carrierFailed = true;
            warnings.push('文件结构扫描未完整完成，导出结果仍会单独复检。');
            console.warn('Privacy carrier scan:', error);
        }

        try {
            metadata = await parseMetadata(asset, carriers);
        } catch (error) {
            metadataFailed = true;
            warnings.push('部分元数据字段无法展开，但已识别的元数据载体仍会被清理。');
            console.warn('Metadata parse:', error);
        }

        if (asset.type === 'image/webp' && carriers.some(function(item) { return item.kind === 'xmp'; })) {
            warnings.push('已发现 WebP XMP；当前仅显示其载体，导出时会完整移除。');
        }

        asset.privacy = {
            status: carrierFailed && metadataFailed ? 'error' : 'ready',
            report: privacy.createReport(metadata, carriers, warnings),
            lastVerified: false
        };

        if (!state.assets.includes(asset)) return;
        renderAssetList();
        if (asset.id === state.activeId) renderPrivacyPanel(asset);
    }

    function duplicateKey(file) {
        return [file.name, file.size, file.lastModified].join(':');
    }

    async function sniffImageType(file) {
        const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
            bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
        if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
        return '';
    }

    function imageDimensions(url) {
        return new Promise(function(resolve, reject) {
            const image = new Image();
            image.decoding = 'async';
            image.onload = function() {
                resolve({ width: image.naturalWidth, height: image.naturalHeight });
            };
            image.onerror = function() { reject(new Error('无法读取图片尺寸。')); };
            image.src = url;
        });
    }

    async function addFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length || state.processing) return;
        const existing = new Set(state.assets.map(function(asset) { return asset.duplicateKey; }));
        const available = Math.max(0, MAX_ASSETS - state.assets.length);
        const candidates = files.slice(0, available);
        const addedIds = [];
        let rejected = 0;

        if (files.length > available) {
            toast('单次会话最多保留 ' + MAX_ASSETS + ' 张图片。', 'error');
        }

        for (const file of candidates) {
            const key = duplicateKey(file);
            if (existing.has(key)) continue;
            let url = '';

            try {
                const type = await sniffImageType(file);
                if (!type) {
                    rejected += 1;
                    continue;
                }

                url = URL.createObjectURL(file);
                const dimensions = await imageDimensions(url);
                const pixels = dimensions.width * dimensions.height;

                if (!dimensions.width || !dimensions.height || pixels > MAX_PIXELS) {
                    URL.revokeObjectURL(url);
                    rejected += 1;
                    continue;
                }

                state.assetCounter += 1;
                const id = 'image-' + Date.now().toString(36) + '-' + state.assetCounter.toString(36);
                const asset = {
                    id: id,
                    file: file,
                    url: url,
                    name: file.name || 'image',
                    type: type,
                    size: file.size,
                    width: dimensions.width,
                    height: dimensions.height,
                    duplicateKey: key,
                    ratio: 'free',
                    transform: null,
                    history: [],
                    historyIndex: -1,
                    settings: normalizeForBrowser(state.defaultSettings),
                    state: 'ready',
                    resultSize: null,
                    revision: 0,
                    zoomTimer: null,
                    privacy: {
                        status: 'scanning',
                        report: null,
                        lastVerified: false
                    }
                };
                state.assets.push(asset);
                state.selected.add(id);
                existing.add(key);
                addedIds.push(id);
                analyzeAssetPrivacy(asset);

                if (pixels > WARN_PIXELS) {
                    toast(asset.name + ' 分辨率较高，将顺序处理以控制内存。');
                }
            } catch (error) {
                if (url) URL.revokeObjectURL(url);
                rejected += 1;
                reportError(error);
            }
        }

        if (rejected) toast(rejected + ' 个文件不是受支持的图片或尺寸过大。', 'error');
        renderAssetList();
        if (addedIds.length && !activeAsset()) activateAsset(addedIds[0]);
    }

    function clearCompare() {
        if (state.compareUrls.before) URL.revokeObjectURL(state.compareUrls.before);
        if (state.compareUrls.after) URL.revokeObjectURL(state.compareUrls.after);
        state.compareUrls = { before: '', after: '' };
        elements.compareBefore.removeAttribute('src');
        elements.compareAfter.removeAttribute('src');
        if (state.view === 'compare') setView('edit');
    }

    function invalidateAsset(asset) {
        if (!asset) return;
        asset.revision += 1;
        asset.resultSize = null;
        if (asset.privacy) asset.privacy.lastVerified = false;
        if (asset.state !== 'processing') asset.state = 'ready';
        if (asset.id === state.activeId) {
            clearCompare();
            elements.outputEstimate.textContent = '尚未生成预览';
        }
    }

    function transformData(instance) {
        const data = instance.getData(true);
        return {
            x: Number(data.x) || 0,
            y: Number(data.y) || 0,
            width: Math.max(1, Number(data.width) || 1),
            height: Math.max(1, Number(data.height) || 1),
            rotate: Number(data.rotate) || 0,
            scaleX: Number(data.scaleX) || 1,
            scaleY: Number(data.scaleY) || 1
        };
    }

    function currentSnapshot() {
        const asset = activeAsset();
        if (!asset || !state.cropper || !state.cropperReady) return null;
        return { transform: transformData(state.cropper), ratio: asset.ratio };
    }

    function pushHistory(asset, snapshot) {
        if (!asset || !snapshot || state.restoring) return;
        const previous = asset.history[asset.historyIndex];
        if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return;
        asset.history = asset.history.slice(0, asset.historyIndex + 1);
        asset.history.push(snapshot);
        if (asset.history.length > 30) asset.history.shift();
        asset.historyIndex = asset.history.length - 1;
        updateHistoryButtons();
    }

    function captureActiveTransform(addHistory) {
        const asset = activeAsset();
        const snapshot = currentSnapshot();
        if (!asset || !snapshot) return;
        const changed = JSON.stringify(asset.transform) !== JSON.stringify(snapshot.transform);
        asset.transform = snapshot.transform;
        if (addHistory) pushHistory(asset, snapshot);
        if (changed) invalidateAsset(asset);
        updateCropStatus(snapshot.transform.width, snapshot.transform.height);
    }

    function restoreHistory(index) {
        const asset = activeAsset();
        if (!asset || !state.cropper || index < 0 || index >= asset.history.length) return;
        const snapshot = asset.history[index];
        state.restoring = true;
        asset.historyIndex = index;
        asset.ratio = snapshot.ratio;
        asset.transform = Object.assign({}, snapshot.transform);
        state.cropper.setAspectRatio(ratioValue(asset.ratio));
        state.cropper.setData(asset.transform);
        window.requestAnimationFrame(function() {
            state.restoring = false;
            invalidateAsset(asset);
            syncRatioControls(asset.ratio);
            updateCropStatus(asset.transform.width, asset.transform.height);
            updateHistoryButtons();
            renderAssetList();
        });
    }

    function updateCropStatus(width, height) {
        const w = Math.max(1, Math.round(Number(width) || 1));
        const h = Math.max(1, Math.round(Number(height) || 1));
        elements.cropSize.textContent = w + ' × ' + h;
    }

    function destroyCropper() {
        if (state.cropper) state.cropper.destroy();
        state.cropper = null;
        state.cropperReady = false;
        elements.editorImage.removeAttribute('src');
    }

    function initializeActiveCropper(asset) {
        destroyCropper();
        elements.editorImage.onload = function() {
            state.cropper = new window.Cropper(elements.editorImage, {
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 1,
                responsive: true,
                restore: false,
                checkCrossOrigin: false,
                checkOrientation: false,
                background: false,
                guides: true,
                center: true,
                highlight: false,
                rotatable: true,
                scalable: true,
                zoomable: true,
                zoomOnWheel: true,
                aspectRatio: ratioValue(asset.ratio),
                data: asset.transform || undefined,
                ready: function(event) {
                    if (asset.id !== state.activeId) return;
                    const instance = event.target.cropper || state.cropper;
                    state.cropperReady = true;
                    if (asset.transform) instance.setData(asset.transform);
                    const snapshot = { transform: transformData(instance), ratio: asset.ratio };
                    asset.transform = snapshot.transform;
                    if (!asset.history.length) pushHistory(asset, snapshot);
                    updateCropStatus(snapshot.transform.width, snapshot.transform.height);
                    updateActionState();
                },
                crop: function(event) {
                    if (asset.id !== state.activeId || state.restoring) return;
                    updateCropStatus(event.detail.width, event.detail.height);
                },
                cropend: function() {
                    if (asset.id !== state.activeId || state.restoring) return;
                    captureActiveTransform(true);
                    renderAssetList();
                },
                zoom: function() {
                    if (asset.id !== state.activeId || state.restoring) return;
                    window.clearTimeout(asset.zoomTimer);
                    asset.zoomTimer = window.setTimeout(function() {
                        captureActiveTransform(true);
                    }, 220);
                }
            });
        };
        elements.editorImage.onerror = function() {
            asset.state = 'error';
            renderAssetList();
            toast('无法打开 ' + asset.name, 'error');
        };
        elements.editorImage.src = asset.url;
    }

    function activateAsset(id) {
        if (id === state.activeId || state.processing) return;
        captureActiveTransform(false);
        clearCompare();
        const asset = state.assets.find(function(candidate) { return candidate.id === id; });
        if (!asset) return;

        state.activeId = id;
        state.selected.add(id);
        elements.stageEmpty.hidden = true;
        elements.cropStage.hidden = false;
        elements.compareStage.hidden = true;
        state.view = 'edit';
        elements.activeName.textContent = asset.name;
        elements.activeMeta.textContent = asset.width + '×' + asset.height + ' · ' + core.formatBytes(asset.size);
        elements.outputEstimate.textContent = asset.resultSize
            ? core.formatBytes(asset.resultSize)
            : '尚未生成预览';
        syncRatioControls(asset.ratio);
        syncInspectorSettings();
        renderPrivacyPanel(asset);
        initializeActiveCropper(asset);
        renderAssetList();
        setView('edit');
    }

    function removeSelected() {
        if (!state.selected.size || state.processing) return;
        const removing = new Set(state.selected);
        const activeWasRemoved = removing.has(state.activeId);
        state.assets = state.assets.filter(function(asset) {
            if (!removing.has(asset.id)) return true;
            window.clearTimeout(asset.zoomTimer);
            URL.revokeObjectURL(asset.url);
            return false;
        });
        state.selected.clear();

        if (activeWasRemoved) {
            clearCompare();
            destroyCropper();
            state.activeId = null;
            if (state.assets.length) {
                activateAsset(state.assets[0].id);
            } else {
                showEmptyStage();
            }
        }
        renderAssetList();
    }

    function showEmptyStage() {
        state.activeId = null;
        elements.stageEmpty.hidden = false;
        elements.cropStage.hidden = true;
        elements.compareStage.hidden = true;
        elements.activeName.textContent = '未选择图片';
        elements.activeMeta.textContent = '--';
        elements.cropSize.textContent = '-- × --';
        elements.outputEstimate.textContent = '尚未生成预览';
        syncRatioControls('free');
        syncInspectorSettings();
        renderPrivacyPanel(null);
        updateActionState();
    }

    function syncRatioControls(value) {
        elements.ratioButtons.forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset.ratio === value));
        });
        elements.ratioOutput.textContent = ratioLabel(value);
    }

    function transformActive(action) {
        const asset = activeAsset();
        if (!asset || !state.cropper || !state.cropperReady || state.processing) return;

        if (action === 'rotate-left') state.cropper.rotate(-90);
        if (action === 'rotate-right') state.cropper.rotate(90);
        if (action === 'flip-horizontal') {
            const data = state.cropper.getData();
            state.cropper.scaleX((Number(data.scaleX) || 1) * -1);
        }
        if (action === 'flip-vertical') {
            const data = state.cropper.getData();
            state.cropper.scaleY((Number(data.scaleY) || 1) * -1);
        }

        window.requestAnimationFrame(function() {
            captureActiveTransform(true);
            renderAssetList();
        });
    }

    function resetActiveTransform() {
        const asset = activeAsset();
        if (!asset || !state.cropper || state.processing) return;
        asset.ratio = 'free';
        state.cropper.reset();
        state.cropper.setAspectRatio(NaN);
        syncRatioControls('free');
        window.requestAnimationFrame(function() {
            captureActiveTransform(true);
            renderAssetList();
        });
    }

    function settingsTargets() {
        const asset = activeAsset();
        if (!state.assets.length) return [];
        if (state.scope === 'all') return state.assets.slice();
        if (state.scope === 'selected') {
            const selected = state.assets.filter(function(item) { return state.selected.has(item.id); });
            return selected.length ? selected : asset ? [asset] : [];
        }
        return asset ? [asset] : [];
    }

    function applySettingsPatch(patch) {
        if (state.processing) {
            syncInspectorSettings();
            return;
        }
        const targets = settingsTargets();
        if (!targets.length) {
            state.defaultSettings = normalizeForBrowser(Object.assign({}, state.defaultSettings, patch));
        } else {
            targets.forEach(function(asset) {
                asset.settings = normalizeForBrowser(Object.assign({}, asset.settings, patch));
                invalidateAsset(asset);
            });
        }
        syncInspectorSettings();
        renderAssetList();
    }

    function applyPrivacyPreset() {
        if (state.processing) return;
        const targets = settingsTargets();
        if (!targets.length) return;

        targets.forEach(function(asset) {
            const sourceFormat = core.formatDefinition(asset.type) ? asset.type : 'image/jpeg';
            const format = sourceFormat === 'image/webp' && !state.webpSupported
                ? 'image/jpeg'
                : sourceFormat;
            asset.settings = normalizeForBrowser(Object.assign({}, asset.settings, {
                sizeMode: 'original',
                format: format,
                quality: 0.94,
                transparent: format !== 'image/jpeg',
                suffix: '-clean'
            }));
            invalidateAsset(asset);
        });

        syncInspectorSettings();
        renderAssetList();
        toast('已为 ' + targets.length + ' 张图片套用隐私副本预设。');
    }

    function currentSettings() {
        const asset = activeAsset();
        return asset ? asset.settings : state.defaultSettings;
    }

    function syncPressed(buttons, value, dataKey) {
        buttons.forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset[dataKey] === value));
        });
    }

    function syncInspectorSettings() {
        const settings = normalizeForBrowser(currentSettings());
        elements.longEdge.value = settings.longEdge;
        elements.outputWidth.value = settings.width;
        elements.outputHeight.value = settings.height;
        elements.noUpscale.checked = settings.noUpscale;
        elements.quality.value = Math.round(settings.quality * 100);
        elements.qualityOutput.textContent = String(Math.round(settings.quality * 100));
        elements.transparent.checked = settings.transparent && settings.format !== 'image/jpeg';
        elements.transparent.disabled = settings.format === 'image/jpeg';
        elements.background.value = settings.background;
        elements.background.disabled = settings.format !== 'image/jpeg' && settings.transparent;
        elements.suffix.value = settings.suffix;
        elements.qualityRow.hidden = settings.format === 'image/png';
        elements.longEdgeRow.hidden = settings.sizeMode !== 'long-edge';
        elements.customSize.hidden = settings.sizeMode !== 'custom';
        elements.fitControl.hidden = settings.sizeMode !== 'custom';
        elements.dimensionLock.setAttribute('aria-pressed', String(state.dimensionLock));
        syncPressed(elements.sizeModeButtons, settings.sizeMode, 'sizeMode');
        syncPressed(elements.fitButtons, settings.fit, 'fit');
        syncPressed(elements.formatButtons, settings.format, 'format');
    }

    function cropAspect() {
        const asset = activeAsset();
        if (state.cropper && state.cropperReady) {
            const data = state.cropper.getData();
            if (data.width && data.height) return data.width / data.height;
        }
        return asset ? asset.width / asset.height : 1;
    }

    function applyDimension(source) {
        let width = Math.max(1, Math.min(16384, Number(elements.outputWidth.value) || 1));
        let height = Math.max(1, Math.min(16384, Number(elements.outputHeight.value) || 1));
        if (state.dimensionLock) {
            const aspect = cropAspect();
            if (source === 'width') height = Math.max(1, Math.round(width / aspect));
            else width = Math.max(1, Math.round(height * aspect));
        }
        applySettingsPatch({ width: width, height: height });
    }

    function createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        return canvas;
    }

    function temporaryCroppedCanvas(asset) {
        return new Promise(function(resolve, reject) {
            const wrapper = document.createElement('div');
            const image = document.createElement('img');
            let timer = null;
            let instance = null;

            function cleanup() {
                window.clearTimeout(timer);
                if (instance) instance.destroy();
                wrapper.remove();
            }

            wrapper.appendChild(image);
            elements.renderFarm.appendChild(wrapper);
            image.onload = function() {
                instance = new window.Cropper(image, {
                    viewMode: 1,
                    autoCropArea: 1,
                    responsive: false,
                    restore: false,
                    checkCrossOrigin: false,
                    checkOrientation: false,
                    background: false,
                    rotatable: true,
                    scalable: true,
                    zoomable: false,
                    aspectRatio: ratioValue(asset.ratio),
                    data: asset.transform || undefined,
                    ready: function(event) {
                        const readyInstance = event.target.cropper || instance;
                        if (asset.transform) readyInstance.setData(asset.transform);
                        window.setTimeout(function() {
                            try {
                                const canvas = readyInstance.getCroppedCanvas({
                                    imageSmoothingEnabled: true,
                                    imageSmoothingQuality: 'high',
                                    maxWidth: 12000,
                                    maxHeight: 12000
                                });
                                if (!canvas) throw new Error('裁剪结果为空。');
                                cleanup();
                                resolve(canvas);
                            } catch (error) {
                                cleanup();
                                reject(error);
                            }
                        }, 0);
                    }
                });
            };
            image.onerror = function() {
                cleanup();
                reject(new Error('无法载入 ' + asset.name));
            };
            timer = window.setTimeout(function() {
                cleanup();
                reject(new Error('裁剪处理超时。'));
            }, 10000);
            image.src = asset.url;
        });
    }

    async function croppedCanvas(asset) {
        if (asset.id === state.activeId && state.cropper && state.cropperReady) {
            captureActiveTransform(false);
            const canvas = state.cropper.getCroppedCanvas({
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high',
                maxWidth: 12000,
                maxHeight: 12000
            });
            if (!canvas) throw new Error('裁剪结果为空。');
            return canvas;
        }
        return temporaryCroppedCanvas(asset);
    }

    function canvasBlob(canvas, type, quality) {
        return new Promise(function(resolve, reject) {
            canvas.toBlob(function(blob) {
                if (!blob) {
                    reject(new Error('浏览器未能编码图片。'));
                    return;
                }
                if (type !== 'image/png' && blob.type !== type) {
                    reject(new Error('当前浏览器不支持 ' + type + ' 编码。'));
                    return;
                }
                resolve(blob);
            }, type, quality);
        });
    }

    async function renderOutput(asset, includeBefore) {
        const settings = normalizeForBrowser(asset.settings);
        const source = await croppedCanvas(asset);
        const plan = core.renderPlan(source.width, source.height, settings);
        if (plan.targetWidth * plan.targetHeight > MAX_OUTPUT_PIXELS) {
            throw new Error('输出尺寸超过 4000 万像素限制。');
        }

        const resized = createCanvas(plan.renderWidth, plan.renderHeight);
        if (source.width === resized.width && source.height === resized.height) {
            resized.getContext('2d').drawImage(source, 0, 0);
        } else {
            await state.pica.resize(source, resized, { filter: 'mks2013' });
        }

        const output = createCanvas(plan.targetWidth, plan.targetHeight);
        const context = output.getContext('2d');
        const requiresBackground = settings.format === 'image/jpeg' || !settings.transparent;
        if (requiresBackground) {
            context.fillStyle = settings.background;
            context.fillRect(0, 0, output.width, output.height);
        }
        context.drawImage(resized, plan.offsetX, plan.offsetY);

        const beforeBlob = includeBefore ? await canvasBlob(output, 'image/png', 1) : null;
        const blob = await canvasBlob(output, settings.format, settings.quality);
        const privacyVerification = await privacy.verifySanitized(blob, settings.format);
        if (!privacyVerification.clean) {
            throw new Error('导出复检发现残留元数据，已阻止下载。');
        }
        if (asset.privacy) asset.privacy.lastVerified = true;
        return {
            blob: blob,
            beforeBlob: beforeBlob,
            width: output.width,
            height: output.height,
            filename: core.outputFilename(asset.name, settings, { width: output.width, height: output.height }),
            privacyVerification: privacyVerification
        };
    }

    function outputSummary(asset, result) {
        const saved = asset.size > 0 ? Math.round((1 - result.blob.size / asset.size) * 100) : 0;
        const delta = saved >= 0 ? '节省 ' + saved + '%' : '增加 ' + Math.abs(saved) + '%';
        return result.width + '×' + result.height + ' · ' + core.formatBytes(result.blob.size) +
            ' · ' + delta + ' · 隐私已清理';
    }

    async function previewActive() {
        const asset = activeAsset();
        if (!asset || state.processing) return;
        captureActiveTransform(false);
        const revision = asset.revision;
        setProcessing(true, '正在生成预览', 18);

        try {
            const result = await renderOutput(asset, true);
            if (asset.revision !== revision) return;
            clearCompare();
            state.compareUrls.before = URL.createObjectURL(result.beforeBlob);
            state.compareUrls.after = URL.createObjectURL(result.blob);
            elements.compareBefore.src = state.compareUrls.before;
            elements.compareAfter.src = state.compareUrls.after;
            elements.compareSlider.value = '50';
            updateComparePosition(50);
            asset.resultSize = result.blob.size;
            asset.state = 'done';
            elements.outputEstimate.textContent = outputSummary(asset, result);
            renderAssetList();
            renderPrivacyPanel(asset);
            state.view = 'compare';
            elements.viewButtons.forEach(function(button) {
                button.setAttribute('aria-pressed', String(button.dataset.view === 'compare'));
            });
            elements.cropStage.hidden = true;
            elements.compareStage.hidden = false;
        } catch (error) {
            asset.state = 'error';
            renderAssetList();
            toast(error.message || String(error), 'error');
            reportError(error);
        } finally {
            setProcessing(false, '', 0);
        }
    }

    function updateComparePosition(value) {
        const position = Math.max(0, Math.min(100, Number(value) || 0));
        elements.compareAfterWrap.style.clipPath = 'inset(0 ' + (100 - position) + '% 0 0)';
        elements.compareDivider.style.left = position + '%';
    }

    function exportTargets() {
        const targets = settingsTargets();
        return targets.length ? targets : state.assets.slice();
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function() { URL.revokeObjectURL(url); }, 1500);
    }

    function zipName() {
        const now = new Date();
        const pad = function(value) { return String(value).padStart(2, '0'); };
        return 'images-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
            pad(now.getHours()) + pad(now.getMinutes()) + '.zip';
    }

    async function exportImages() {
        if (state.processing) return;
        const targets = exportTargets();
        if (!targets.length) return;
        const usedNames = new Set();
        const files = {};
        const completed = [];
        let totalBytes = 0;
        let failures = 0;

        captureActiveTransform(false);
        setProcessing(true, '准备导出', 0);

        try {
            for (let index = 0; index < targets.length; index += 1) {
                const asset = targets[index];
                asset.state = 'processing';
                renderAssetList();
                setProcessing(true, '正在处理 ' + (index + 1) + ' / ' + targets.length, (index / targets.length) * 90);

                try {
                    const result = await renderOutput(asset, false);
                    result.filename = core.uniqueFilename(result.filename, usedNames);
                    asset.resultSize = result.blob.size;
                    asset.state = 'done';
                    totalBytes += result.blob.size;
                    if (totalBytes > MAX_ZIP_BYTES && targets.length > 1) {
                        throw new Error('批量结果超过 220 MB，请减少图片数量。');
                    }
                    completed.push(result);
                    if (targets.length > 1) {
                        files[result.filename] = new Uint8Array(await result.blob.arrayBuffer());
                    }
                } catch (error) {
                    failures += 1;
                    asset.state = 'error';
                    reportError(error);
                }
            }

            if (!completed.length) throw new Error('没有图片成功导出。');
            setProcessing(true, targets.length > 1 ? '正在打包 ZIP' : '正在生成文件', 94);

            if (targets.length === 1) {
                downloadBlob(completed[0].blob, completed[0].filename);
            } else {
                const zipped = window.fflate.zipSync(files, { level: 0 });
                downloadBlob(new Blob([zipped], { type: 'application/zip' }), zipName());
            }

            if (failures) toast(failures + ' 张图片处理失败，其余安全结果已导出。', 'error');
            else toast(completed.length + ' 张图片已清理隐私信息并完成导出。');
        } catch (error) {
            toast(error.message || String(error), 'error');
            reportError(error);
        } finally {
            renderAssetList();
            renderPrivacyPanel(activeAsset());
            setProcessing(false, '', 0);
        }
    }

    function saveDefaultSettings() {
        if (state.processing) return;
        const settings = normalizeForBrowser(currentSettings());
        state.defaultSettings = settings;
        storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        toast('默认导出设置已保存。');
    }

    function bindEvents() {
        elements.addButtons.forEach(function(button) {
            button.addEventListener('click', function() { elements.fileInput.click(); });
        });
        elements.fileInput.addEventListener('change', function() {
            addFiles(elements.fileInput.files);
            elements.fileInput.value = '';
        });
        elements.undo.addEventListener('click', function() {
            const asset = activeAsset();
            if (asset) restoreHistory(asset.historyIndex - 1);
        });
        elements.redo.addEventListener('click', function() {
            const asset = activeAsset();
            if (asset) restoreHistory(asset.historyIndex + 1);
        });
        elements.scopes.forEach(function(button) {
            button.addEventListener('click', function() { setScope(button.dataset.scope); });
        });
        elements.preview.addEventListener('click', previewActive);
        elements.export.addEventListener('click', exportImages);
        elements.selectAll.addEventListener('change', function() {
            if (elements.selectAll.checked) {
                state.assets.forEach(function(asset) { state.selected.add(asset.id); });
            } else {
                state.selected.clear();
            }
            renderAssetList();
        });
        elements.removeSelected.addEventListener('click', removeSelected);
        elements.viewButtons.forEach(function(button) {
            button.addEventListener('click', function() { setView(button.dataset.view); });
        });
        elements.compareSlider.addEventListener('input', function() {
            updateComparePosition(elements.compareSlider.value);
        });
        elements.tabs.forEach(function(button) {
            button.addEventListener('click', function() { setTab(button.dataset.inspectorTab); });
        });
        elements.ratioButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                const asset = activeAsset();
                if (!asset || !state.cropper || state.processing) return;
                asset.ratio = button.dataset.ratio;
                syncRatioControls(asset.ratio);
                state.cropper.setAspectRatio(ratioValue(asset.ratio));
                window.requestAnimationFrame(function() {
                    captureActiveTransform(true);
                    renderAssetList();
                });
            });
        });
        elements.transformButtons.forEach(function(button) {
            button.addEventListener('click', function() { transformActive(button.dataset.transform); });
        });
        elements.resetTransform.addEventListener('click', resetActiveTransform);
        elements.sizeModeButtons.forEach(function(button) {
            button.addEventListener('click', function() { applySettingsPatch({ sizeMode: button.dataset.sizeMode }); });
        });
        elements.longEdge.addEventListener('change', function() {
            applySettingsPatch({ longEdge: elements.longEdge.value });
        });
        elements.outputWidth.addEventListener('change', function() { applyDimension('width'); });
        elements.outputHeight.addEventListener('change', function() { applyDimension('height'); });
        elements.dimensionLock.addEventListener('click', function() {
            state.dimensionLock = !state.dimensionLock;
            elements.dimensionLock.setAttribute('aria-pressed', String(state.dimensionLock));
        });
        elements.fitButtons.forEach(function(button) {
            button.addEventListener('click', function() { applySettingsPatch({ fit: button.dataset.fit }); });
        });
        elements.noUpscale.addEventListener('change', function() {
            applySettingsPatch({ noUpscale: elements.noUpscale.checked });
        });
        elements.formatButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                if (button.disabled) return;
                applySettingsPatch({ format: button.dataset.format });
            });
        });
        elements.quality.addEventListener('input', function() {
            elements.qualityOutput.textContent = elements.quality.value;
            applySettingsPatch({ quality: Number(elements.quality.value) / 100 });
        });
        elements.transparent.addEventListener('change', function() {
            applySettingsPatch({ transparent: elements.transparent.checked });
        });
        elements.background.addEventListener('input', function() {
            applySettingsPatch({ background: elements.background.value });
        });
        elements.suffix.addEventListener('change', function() {
            applySettingsPatch({ suffix: elements.suffix.value });
        });
        elements.presetButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                const preset = Object.assign({}, PRESETS[button.dataset.preset]);
                if (!state.webpSupported && preset.format === 'image/webp') preset.format = 'image/jpeg';
                applySettingsPatch(preset);
            });
        });
        elements.saveDefault.addEventListener('click', saveDefaultSettings);
        elements.privacyPreset.addEventListener('click', applyPrivacyPreset);
        elements.privacyExport.addEventListener('click', exportImages);

        document.addEventListener('paste', function(event) {
            const files = event.clipboardData ? Array.from(event.clipboardData.files || []) : [];
            if (files.length) addFiles(files);
        });
        document.addEventListener('dragenter', function(event) {
            if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return;
            event.preventDefault();
            state.dragDepth += 1;
            elements.dropOverlay.hidden = false;
        });
        document.addEventListener('dragover', function(event) {
            if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        });
        document.addEventListener('dragleave', function(event) {
            if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return;
            state.dragDepth = Math.max(0, state.dragDepth - 1);
            if (!state.dragDepth) elements.dropOverlay.hidden = true;
        });
        document.addEventListener('drop', function(event) {
            if (!event.dataTransfer) return;
            event.preventDefault();
            state.dragDepth = 0;
            elements.dropOverlay.hidden = true;
            addFiles(event.dataTransfer.files);
        });
        document.addEventListener('keydown', function(event) {
            const target = event.target;
            const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
            if (editing) return;
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
                event.preventDefault();
                elements.fileInput.click();
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                const asset = activeAsset();
                if (asset) restoreHistory(asset.historyIndex + (event.shiftKey ? 1 : -1));
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') {
                event.preventDefault();
                exportImages();
            }
        });
        window.addEventListener('beforeunload', function() {
            clearCompare();
            state.assets.forEach(function(asset) { URL.revokeObjectURL(asset.url); });
        });
    }

    async function start() {
        if (
            !core || !privacy || !metadataReader || !storage || !host ||
            !window.Cropper || !window.pica || !window.fflate
        ) {
            throw new Error('图像工作台依赖未完整加载。');
        }

        state.webpSupported = detectWebp();
        state.pica = window.pica({ features: ['js'], concurrency: 1 });
        await storage.ready();
        state.defaultSettings = normalizeForBrowser(safeStoredSettings());

        const savedScope = storage.getItem(SCOPE_KEY);
        const savedTab = storage.getItem(TAB_KEY);
        bindEvents();
        setScope(['current', 'selected', 'all'].includes(savedScope) ? savedScope : 'current');
        setTab(['transform', 'size', 'export', 'privacy'].includes(savedTab) ? savedTab : 'transform');
        elements.formatButtons.forEach(function(button) {
            if (button.dataset.format === 'image/webp') {
                button.disabled = !state.webpSupported;
                if (!state.webpSupported) button.title = '当前浏览器不支持 WebP 编码';
            }
        });
        syncInspectorSettings();
        renderAssetList();
        showEmptyStage();
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
        host.markReady();
    }

    start().catch(function(error) {
        toast(error.message || String(error), 'error');
        reportError(error);
    });
})();
