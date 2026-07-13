(function() {
    'use strict';

    const core = window.QRWorkbenchCore;
    const renderer = window.QRWorkbenchRenderer;
    const decoder = window.QRWorkbenchDecoder;
    const storage = window.toolStorage;
    const host = window.toolHost;
    const PREFERENCES_KEY = 'preferences';

    const one = function(selector, root) { return (root || document).querySelector(selector); };
    const all = function(selector, root) { return Array.from((root || document).querySelectorAll(selector)); };

    const elements = {
        app: one('[data-app]'),
        modeButtons: all('[data-mode-button]'),
        modePanels: all('[data-mode-panel]'),
        payloadButtons: all('[data-payload-type]'),
        payloadForms: all('[data-payload-form]'),
        fields: all('[data-field]'),
        settingInputs: all('[data-setting]'),
        settingButtons: all('[data-setting-button]'),
        payloadBytes: one('[data-payload-bytes]'),
        previewType: one('[data-preview-type]'),
        previewSummary: one('[data-preview-summary]'),
        symbolVersion: one('[data-symbol-version]'),
        symbolSize: one('[data-symbol-size]'),
        previewStage: one('[data-preview-stage]'),
        qrSheet: one('[data-qr-sheet]'),
        previewCanvas: one('[data-preview-canvas]'),
        previewPlaceholder: one('[data-preview-placeholder]'),
        previewSignal: one('[data-preview-signal]'),
        previewStatus: one('[data-preview-status]'),
        previewDetail: one('[data-preview-detail]'),
        contrastValue: one('[data-contrast-value]'),
        darkChip: one('[data-dark-chip]'),
        lightChip: one('[data-light-chip]'),
        darkCode: one('[data-dark-code]'),
        lightCode: one('[data-light-code]'),
        verificationCard: one('[data-verification-state]'),
        verificationTitle: one('[data-verification-title]'),
        verificationCopy: one('[data-verification-copy]'),
        verificationWarnings: one('[data-verification-warnings]'),
        modulePixels: one('[data-module-pixels]'),
        exportButtons: all('[data-export], [data-export-top]'),
        exportLabels: all('[data-export-label], [data-export-top-label]'),
        reset: one('[data-reset]'),
        wifiPasswordRow: one('[data-wifi-password-row]'),
        togglePassword: one('[data-toggle-password]'),
        pickScan: one('[data-pick-scan]'),
        scanDrop: one('[data-scan-drop]'),
        scanInput: one('[data-scan-input]'),
        scanCanvas: one('[data-scan-canvas]'),
        scanStageTitle: one('[data-scan-stage-title]'),
        scanStageMeta: one('[data-scan-stage-meta]'),
        scanEmpty: one('[data-scan-empty]'),
        scanProgress: one('[data-scan-progress]'),
        scanSignal: one('[data-scan-signal]'),
        scanStatus: one('[data-scan-status]'),
        scanFileSize: one('[data-scan-file-size]'),
        sourceFile: one('[data-source-file]'),
        sourceName: one('[data-source-name]'),
        sourceMeta: one('[data-source-meta]'),
        clearScan: one('[data-clear-scan]'),
        resultEmpty: one('[data-result-empty]'),
        resultContent: one('[data-result-content]'),
        resultType: one('[data-result-type]'),
        resultLabel: one('[data-result-label]'),
        resultBadgeIcon: one('[data-result-badge-icon]'),
        resultFields: one('[data-result-fields]'),
        resultRaw: one('[data-result-raw]'),
        copyResult: one('[data-copy-result]'),
        useResult: one('[data-use-result]'),
        dropOverlay: one('[data-drop-overlay]'),
        toastRegion: one('[data-toast-region]')
    };

    const state = {
        mode: 'generate',
        payloadType: 'url',
        settings: null,
        payload: null,
        symbol: null,
        plan: null,
        verificationPassed: false,
        renderTimer: null,
        renderToken: 0,
        scanToken: 0,
        scanResult: null,
        parsedResult: null,
        dragDepth: 0
    };

    const RESULT_ICONS = {
        text: 'text',
        url: 'link-2',
        wifi: 'wifi',
        vcard: 'contact',
        email: 'mail',
        phone: 'phone'
    };

    const RESULT_FIELD_LABELS = {
        text: { text: '内容' },
        url: { url: '网址' },
        wifi: { ssid: '网络名称', security: '安全类型', password: '密码', hidden: '隐藏网络' },
        vcard: { name: '姓名', organization: '组织', title: '职位', phone: '电话', email: '邮箱', url: '网址' },
        email: { address: '收件邮箱', subject: '主题', body: '正文' },
        phone: { phone: '电话号码' }
    };

    function reportError(error) {
        if (host && host.reportError) host.reportError(error);
        else console.error(error);
    }

    function formatBytes(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function toast(message, tone) {
        const item = document.createElement('div');
        item.className = 'toast';
        item.dataset.tone = tone || 'default';
        item.textContent = message;
        elements.toastRegion.appendChild(item);
        window.setTimeout(function() { item.remove(); }, 3400);
    }

    function readPreferences() {
        try {
            const value = storage.getItem(PREFERENCES_KEY);
            return core.normalizePreferences(value ? JSON.parse(value) : {});
        } catch (error) {
            return core.normalizePreferences({});
        }
    }

    function savePreferences() {
        const preferences = {
            mode: state.mode,
            payloadType: state.payloadType,
            settings: state.settings
        };
        storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    }

    function fieldParts(element) {
        const parts = String(element.dataset.field || '').split('.');
        return { type: parts[0], name: parts[1] };
    }

    function collectFields(type) {
        const result = {};
        elements.fields.forEach(function(element) {
            const parts = fieldParts(element);
            if (parts.type !== type || !parts.name) return;
            result[parts.name] = element.type === 'checkbox' ? element.checked : element.value;
        });
        return result;
    }

    function setField(type, name, value) {
        const element = one('[data-field="' + type + '.' + name + '"]');
        if (!element) return;
        if (element.type === 'checkbox') element.checked = value === true;
        else element.value = value == null ? '' : String(value);
    }

    function clearPayloadFields() {
        elements.fields.forEach(function(element) {
            if (element.type === 'checkbox') element.checked = false;
            else if (element.tagName === 'SELECT') element.selectedIndex = 0;
            else element.value = '';
        });
        setField('url', 'url', 'https://jiaaozhe.github.io/');
        setField('wifi', 'security', 'WPA');
        syncWifiPassword();
    }

    function selectPayloadType(type, persist) {
        state.payloadType = core.PAYLOAD_TYPES.includes(type) ? type : 'url';
        elements.payloadButtons.forEach(function(button) {
            button.setAttribute('aria-selected', String(button.dataset.payloadType === state.payloadType));
        });
        elements.payloadForms.forEach(function(form) {
            form.hidden = form.dataset.payloadForm !== state.payloadType;
        });
        if (persist !== false) savePreferences();
        scheduleRender();
    }

    function setMode(mode, persist) {
        state.mode = mode === 'scan' ? 'scan' : 'generate';
        elements.app.dataset.mode = state.mode;
        elements.modeButtons.forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset.modeButton === state.mode));
        });
        elements.modePanels.forEach(function(panel) {
            panel.hidden = panel.dataset.modePanel !== state.mode;
        });
        if (persist !== false) savePreferences();
        if (state.mode === 'generate') scheduleRender();
    }

    function syncWifiPassword() {
        const security = one('[data-field="wifi.security"]');
        const password = one('[data-field="wifi.password"]');
        const open = security && security.value === 'nopass';
        if (elements.wifiPasswordRow) elements.wifiPasswordRow.hidden = open;
        if (password) password.disabled = open;
    }

    function syncSettings() {
        state.settings = core.normalizeSettings(state.settings);
        elements.settingInputs.forEach(function(input) {
            const key = input.dataset.setting;
            if (!Object.prototype.hasOwnProperty.call(state.settings, key)) return;
            if (input.type === 'checkbox') input.checked = state.settings[key] === true;
            else input.value = String(state.settings[key]);
        });
        elements.settingButtons.forEach(function(button) {
            const key = button.dataset.settingButton;
            button.setAttribute('aria-pressed', String(String(state.settings[key]) === button.dataset.value));
        });
        elements.darkChip.style.background = state.settings.dark;
        elements.lightChip.style.background = state.settings.light;
        elements.darkCode.textContent = state.settings.dark;
        elements.lightCode.textContent = state.settings.light;
        elements.contrastValue.textContent = core.contrastRatio(state.settings.dark, state.settings.light).toFixed(1) + ':1';
        elements.exportLabels.forEach(function(label) {
            label.textContent = '下载 ' + state.settings.outputFormat.toUpperCase();
        });
    }

    function setExportEnabled(enabled) {
        elements.exportButtons.forEach(function(button) { button.disabled = !enabled; });
    }

    function clearVerification(message, tone) {
        const signal = tone || 'idle';
        elements.previewSignal.dataset.previewSignal = signal;
        elements.previewStatus.textContent = message || '等待内容';
        elements.previewDetail.textContent = signal === 'error' ? '请检查左侧内容' : '本地生成 · 独立回读';
        elements.verificationCard.dataset.verificationState = signal;
        elements.verificationTitle.textContent = signal === 'error' ? '无法生成' : '等待自检';
        elements.verificationCopy.textContent = message || '生成后会使用独立识别器回读二维码。';
        elements.verificationWarnings.hidden = true;
        elements.verificationWarnings.replaceChildren();
        elements.modulePixels.textContent = '-';
        state.verificationPassed = false;
        setExportEnabled(false);
    }

    function showPlaceholder(message) {
        elements.previewPlaceholder.hidden = false;
        elements.previewCanvas.hidden = true;
        const strong = one('strong', elements.previewPlaceholder);
        if (strong) strong.textContent = message || '输入有效内容';
        elements.symbolVersion.textContent = 'V-';
        elements.symbolSize.textContent = '- × -';
        elements.payloadBytes.textContent = '0 B';
    }

    function updateVerification(result) {
        const stateName = result.state;
        elements.previewSignal.dataset.previewSignal = stateName;
        elements.previewStatus.textContent = result.title;
        elements.previewDetail.textContent = stateName === 'ok' ? '内容已完整回读' : '请查看右侧提示';
        elements.verificationCard.dataset.verificationState = stateName;
        elements.verificationTitle.textContent = result.title;
        elements.verificationCopy.textContent = stateName === 'ok' ? '生成结果已经通过独立识别器回读。' : (stateName === 'error' ? '当前渲染结果无法被本地识别器完整回读。' : '二维码可以回读，但建议处理以下风险。');
        elements.verificationWarnings.replaceChildren();
        result.warnings.forEach(function(warning) {
            const item = document.createElement('li');
            item.textContent = warning;
            elements.verificationWarnings.appendChild(item);
        });
        elements.verificationWarnings.hidden = result.warnings.length === 0;
        elements.modulePixels.textContent = result.modulePixels + ' px';
        state.verificationPassed = stateName !== 'error';
        setExportEnabled(state.verificationPassed);
    }

    function scheduleRender() {
        window.clearTimeout(state.renderTimer);
        state.renderTimer = window.setTimeout(renderPreview, 70);
    }

    async function renderPreview() {
        const token = ++state.renderToken;
        state.verificationPassed = false;
        setExportEnabled(false);
        syncSettings();

        let built;
        try {
            built = core.buildPayload(state.payloadType, collectFields(state.payloadType));
        } catch (error) {
            state.payload = null;
            state.symbol = null;
            showPlaceholder(error.message);
            elements.previewType.textContent = core.TYPE_LABELS[state.payloadType];
            elements.previewSummary.textContent = error.message;
            clearVerification(error.message, 'idle');
            return;
        }

        try {
            const symbol = renderer.createSymbol(built.payload, state.settings);
            const plan = renderer.renderCanvas(elements.previewCanvas, symbol, state.settings, state.settings.outputSize);
            state.payload = built;
            state.symbol = symbol;
            state.plan = plan;
            elements.previewPlaceholder.hidden = true;
            elements.previewCanvas.hidden = false;
            elements.payloadBytes.textContent = formatBytes(built.bytes);
            elements.previewType.textContent = built.label;
            elements.previewSummary.textContent = built.summary;
            elements.symbolVersion.textContent = 'V' + symbol.version;
            elements.symbolSize.textContent = symbol.modules.size + ' × ' + symbol.modules.size;
            elements.previewStage.classList.add('is-verifying');
            elements.previewSignal.dataset.previewSignal = 'idle';
            elements.previewStatus.textContent = '正在独立回读';
            elements.verificationCard.dataset.verificationState = 'idle';
            elements.verificationTitle.textContent = '正在自检';
            elements.verificationCopy.textContent = '正在把渲染结果交给本地识别器。';

            await new Promise(function(resolve) { window.requestAnimationFrame(resolve); });
            if (token !== state.renderToken) return;
            const verificationCanvas = document.createElement('canvas');
            const verificationSettings = Object.assign({}, state.settings, {
                transparent: false,
                light: state.settings.transparent ? '#ffffff' : state.settings.light
            });
            renderer.renderCanvas(verificationCanvas, symbol, verificationSettings, state.settings.outputSize);
            const decoded = decoder.decodeCanvas(verificationCanvas);
            const passed = Boolean(decoded && decoded.data === built.payload);
            const reliability = core.reliability(state.settings, symbol.modules.size, plan.size, passed, built.bytes);
            if (token !== state.renderToken) return;
            updateVerification(reliability);
        } catch (error) {
            state.payload = null;
            state.symbol = null;
            showPlaceholder('内容超出容量');
            elements.previewSummary.textContent = error.message || '二维码生成失败';
            clearVerification(error.message || '二维码生成失败', 'error');
        } finally {
            if (token === state.renderToken) elements.previewStage.classList.remove('is-verifying');
        }
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    function exportQr() {
        if (!state.payload || !state.symbol || !state.verificationPassed) {
            toast('请先生成并通过自检。', 'warning');
            return;
        }
        try {
            if (state.settings.outputFormat === 'svg') {
                const source = renderer.svg(state.symbol, state.settings);
                downloadBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), core.filename(state.payload.type, 'svg'));
            } else {
                const canvas = document.createElement('canvas');
                renderer.renderCanvas(canvas, state.symbol, state.settings, state.settings.outputSize);
                canvas.toBlob(function(blob) {
                    if (!blob) {
                        toast('PNG 导出失败。', 'error');
                        return;
                    }
                    downloadBlob(blob, core.filename(state.payload.type, 'png'));
                }, 'image/png');
            }
            toast('二维码已准备下载。');
        } catch (error) {
            toast(error.message || '导出失败。', 'error');
            reportError(error);
        }
    }

    function resetWorkbench() {
        clearPayloadFields();
        state.settings = core.normalizeSettings(core.DEFAULT_SETTINGS);
        syncSettings();
        selectPayloadType('url', false);
        savePreferences();
        scheduleRender();
        toast('已恢复默认设置。');
    }

    function resultRows(parsed) {
        const labels = RESULT_FIELD_LABELS[parsed.type] || RESULT_FIELD_LABELS.text;
        return Object.keys(labels).map(function(key) {
            let value = parsed.fields[key];
            if (typeof value === 'boolean') value = value ? '是' : '否';
            if (value == null || value === '') return null;
            return { label: labels[key], value: String(value) };
        }).filter(Boolean);
    }

    function renderResult(parsed) {
        state.parsedResult = parsed;
        elements.resultEmpty.hidden = true;
        elements.resultContent.hidden = false;
        elements.resultType.textContent = parsed.label;
        elements.resultLabel.textContent = parsed.label;
        elements.resultRaw.value = parsed.raw;
        elements.resultFields.replaceChildren();
        resultRows(parsed).forEach(function(row) {
            const wrapper = document.createElement('div');
            const term = document.createElement('dt');
            const detail = document.createElement('dd');
            term.textContent = row.label;
            detail.textContent = row.value;
            wrapper.append(term, detail);
            elements.resultFields.appendChild(wrapper);
        });
        elements.resultBadgeIcon.replaceChildren();
        const icon = document.createElement('i');
        icon.dataset.lucide = RESULT_ICONS[parsed.type] || 'text';
        icon.setAttribute('aria-hidden', 'true');
        elements.resultBadgeIcon.appendChild(icon);
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }

    function clearResult() {
        state.scanResult = null;
        state.parsedResult = null;
        elements.resultEmpty.hidden = false;
        elements.resultContent.hidden = true;
        elements.resultType.textContent = '-';
        elements.resultFields.replaceChildren();
        elements.resultRaw.value = '';
    }

    function drawScanLocation(result) {
        if (!result || !result.location) return;
        const location = result.location;
        const points = [location.topLeftCorner, location.topRightCorner, location.bottomRightCorner, location.bottomLeftCorner];
        if (points.some(function(point) { return !point; })) return;
        const context = elements.scanCanvas.getContext('2d');
        context.save();
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(function(point) { context.lineTo(point.x, point.y); });
        context.closePath();
        context.lineWidth = Math.max(3, Math.min(elements.scanCanvas.width, elements.scanCanvas.height) / 220);
        context.strokeStyle = '#3568d4';
        context.shadowColor = 'rgba(8, 12, 18, 0.72)';
        context.shadowBlur = 5;
        context.stroke();
        context.restore();
    }

    async function scanFile(file) {
        const token = ++state.scanToken;
        setMode('scan');
        clearResult();
        elements.scanProgress.hidden = false;
        elements.scanEmpty.hidden = true;
        elements.scanCanvas.hidden = true;
        elements.scanSignal.dataset.scanSignal = 'idle';
        elements.scanStatus.textContent = '正在本地识别';
        elements.scanStageTitle.textContent = file.name || '剪贴板图片';
        elements.scanStageMeta.textContent = '正在读取图片像素';
        elements.scanFileSize.textContent = formatBytes(file.size);
        elements.sourceFile.hidden = false;
        elements.sourceName.textContent = file.name || 'clipboard-image.png';
        elements.sourceMeta.textContent = formatBytes(file.size) + ' · ' + (file.type || 'image');

        try {
            const decoded = await decoder.decodeFile(file, elements.scanCanvas);
            if (token !== state.scanToken) return;
            elements.scanProgress.hidden = true;
            elements.scanCanvas.hidden = false;
            elements.scanStageMeta.textContent = decoded.sourceWidth + ' × ' + decoded.sourceHeight + ' · 本地缩放 ' + Math.round(decoded.scale * 100) + '%';
            if (!decoded.result) {
                elements.scanSignal.dataset.scanSignal = 'error';
                elements.scanStatus.textContent = '未发现可识别二维码';
                toast('没有在图片中找到二维码。', 'warning');
                return;
            }
            state.scanResult = decoded.result;
            drawScanLocation(decoded.result);
            const parsed = core.parsePayload(decoded.result.data);
            renderResult(parsed);
            elements.scanSignal.dataset.scanSignal = 'ok';
            elements.scanStatus.textContent = '已识别 · ' + parsed.label;
            elements.scanStageMeta.textContent = decoded.sourceWidth + ' × ' + decoded.sourceHeight + ' · QR Version ' + decoded.result.version;
        } catch (error) {
            if (token !== state.scanToken) return;
            elements.scanProgress.hidden = true;
            elements.scanEmpty.hidden = false;
            elements.scanCanvas.hidden = true;
            elements.scanSignal.dataset.scanSignal = 'error';
            elements.scanStatus.textContent = error.message || '图片识别失败';
            toast(error.message || '图片识别失败。', 'error');
        }
    }

    function clearScan() {
        state.scanToken += 1;
        clearResult();
        elements.scanInput.value = '';
        elements.sourceFile.hidden = true;
        elements.scanFileSize.textContent = '0 B';
        elements.scanCanvas.hidden = true;
        elements.scanCanvas.width = 1;
        elements.scanCanvas.height = 1;
        elements.scanEmpty.hidden = false;
        elements.scanProgress.hidden = true;
        elements.scanSignal.dataset.scanSignal = 'idle';
        elements.scanStatus.textContent = '尚未选择图片';
        elements.scanStageTitle.textContent = '等待图片';
        elements.scanStageMeta.textContent = '拖入、粘贴或选择二维码图片';
    }

    function applyParsedResult() {
        if (!state.parsedResult) return;
        clearPayloadFields();
        const parsed = state.parsedResult;
        Object.keys(parsed.fields).forEach(function(key) { setField(parsed.type, key, parsed.fields[key]); });
        selectPayloadType(parsed.type, false);
        setMode('generate', false);
        savePreferences();
        scheduleRender();
        toast('识别结果已载入生成器。');
    }

    async function copyText(value) {
        function fallbackCopy() {
            const area = document.createElement('textarea');
            area.value = value;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const copied = document.execCommand('copy');
            area.remove();
            return copied;
        }

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(value);
            } else if (!fallbackCopy()) throw new Error('Copy command failed.');
            toast('内容已复制。');
        } catch (error) {
            if (fallbackCopy()) {
                toast('内容已复制。');
                return;
            }
            elements.resultRaw.focus();
            elements.resultRaw.select();
            toast('请使用系统复制命令。', 'warning');
        }
    }

    function filesFromClipboard(event) {
        if (!event.clipboardData) return [];
        return Array.from(event.clipboardData.items || []).filter(function(item) {
            return item.kind === 'file' && item.type.indexOf('image/') === 0;
        }).map(function(item) { return item.getAsFile(); }).filter(Boolean);
    }

    function bindEvents() {
        elements.modeButtons.forEach(function(button) {
            button.addEventListener('click', function() { setMode(button.dataset.modeButton); });
        });
        elements.payloadButtons.forEach(function(button) {
            button.addEventListener('click', function() { selectPayloadType(button.dataset.payloadType); });
        });
        elements.fields.forEach(function(element) {
            const eventName = element.tagName === 'SELECT' || element.type === 'checkbox' ? 'change' : 'input';
            element.addEventListener(eventName, function() {
                if (element.dataset.field === 'wifi.security') syncWifiPassword();
                scheduleRender();
            });
        });
        elements.settingInputs.forEach(function(input) {
            const eventName = input.type === 'color' ? 'input' : 'change';
            input.addEventListener(eventName, function() {
                state.settings[input.dataset.setting] = input.type === 'checkbox' ? input.checked : (input.dataset.setting === 'outputSize' ? Number(input.value) : input.value);
                state.settings = core.normalizeSettings(state.settings);
                syncSettings();
                savePreferences();
                scheduleRender();
            });
        });
        elements.settingButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                state.settings[button.dataset.settingButton] = button.dataset.value;
                state.settings = core.normalizeSettings(state.settings);
                syncSettings();
                savePreferences();
                scheduleRender();
            });
        });
        elements.exportButtons.forEach(function(button) { button.addEventListener('click', exportQr); });
        elements.reset.addEventListener('click', resetWorkbench);
        elements.togglePassword.addEventListener('click', function() {
            const input = one('[data-field="wifi.password"]');
            const visible = input.type === 'text';
            input.type = visible ? 'password' : 'text';
            elements.togglePassword.setAttribute('aria-label', visible ? '显示密码' : '隐藏密码');
            elements.togglePassword.title = visible ? '显示密码' : '隐藏密码';
        });

        [elements.pickScan, elements.scanDrop].forEach(function(button) {
            button.addEventListener('click', function() { elements.scanInput.click(); });
        });
        elements.scanInput.addEventListener('change', function() {
            if (elements.scanInput.files && elements.scanInput.files[0]) scanFile(elements.scanInput.files[0]);
        });
        elements.clearScan.addEventListener('click', clearScan);
        elements.copyResult.addEventListener('click', function() {
            if (state.parsedResult) copyText(state.parsedResult.raw);
        });
        elements.useResult.addEventListener('click', applyParsedResult);

        document.addEventListener('paste', function(event) {
            const files = filesFromClipboard(event);
            if (files.length) {
                event.preventDefault();
                scanFile(files[0]);
            }
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
            const files = Array.from(event.dataTransfer.files || []);
            if (files[0]) scanFile(files[0]);
        });
        document.addEventListener('keydown', function(event) {
            if (!(event.metaKey || event.ctrlKey)) return;
            if (event.key.toLowerCase() === 'e' && state.mode === 'generate') {
                event.preventDefault();
                exportQr();
            }
            if (event.key.toLowerCase() === 'o' && state.mode === 'scan') {
                event.preventDefault();
                elements.scanInput.click();
            }
        });
    }

    async function start() {
        if (!core || !renderer || !decoder || !storage || !host || !window.QRCode || !window.jsQR) {
            throw new Error('二维码工作台依赖未完整加载。');
        }
        await storage.ready();
        const preferences = readPreferences();
        state.settings = preferences.settings;
        bindEvents();
        syncSettings();
        syncWifiPassword();
        selectPayloadType(preferences.payloadType, false);
        setMode(preferences.mode, false);
        clearScan();
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
        scheduleRender();
        host.markReady();
    }

    start().catch(function(error) {
        toast(error.message || String(error), 'error');
        reportError(error);
    });
})();
