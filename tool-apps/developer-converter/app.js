(function() {
    'use strict';

    const app = document.querySelector('[data-app]');
    if (!app || !window.DeveloperConverterCore || !window.DeveloperRequestCore) return;

    const configCore = window.DeveloperConverterCore;
    const requestCore = window.DeveloperRequestCore;
    const PREFERENCES_KEY = 'developer-converter.preferences.v1';
    const CONFIG_SAMPLE = '{\n  "service": "photo-api",\n  "enabled": true,\n  "retry": {\n    "attempts": 3,\n    "backoff": 1.5\n  },\n  "limits": {\n    "upload_bytes": 9007199254740993\n  },\n  "regions": ["cn-east", "eu-west"]\n}\n';
    const REQUEST_SAMPLE = "curl 'https://api.example.com/v1/photos?limit=12' \\\n  -X POST \\\n  -H 'Authorization: Bearer demo-token-replace-me' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{\"album\":\"street\",\"private\":true}'";

    const state = {
        mode: 'config',
        policy: 'safe',
        configName: 'config.json',
        configResult: null,
        requestResult: null,
        curlLibrary: null,
        curlLibraryPromise: null,
        toastTimer: 0,
        configTimer: 0
    };

    function one(selector) {
        return app.querySelector(selector);
    }

    function all(selector) {
        return Array.from(app.querySelectorAll(selector));
    }

    const elements = {
        configSource: one('[data-config-source]'),
        configTarget: one('[data-config-target]'),
        configInput: one('[data-config-input]'),
        configOutput: one('[data-config-output]'),
        configInputLines: one('[data-config-input-lines]'),
        configOutputLines: one('[data-config-output-lines]'),
        configDetected: one('[data-config-detected]'),
        configInputLabel: one('[data-config-input-label]'),
        configOutputLabel: one('[data-config-output-label]'),
        configInputStats: one('[data-config-input-stats]'),
        configOutputStats: one('[data-config-output-stats]'),
        configVerification: one('[data-config-verification]'),
        policyCaption: one('[data-policy-caption]'),
        configDiagnostics: one('[data-config-diagnostics]'),
        configHealth: one('[data-config-health]'),
        traceDetected: one('[data-trace-detected]'),
        traceStructure: one('[data-trace-structure]'),
        traceRoundtrip: one('[data-trace-roundtrip]'),
        configIndent: one('[data-config-indent]'),
        configSort: one('[data-config-sort]'),
        configMinify: one('[data-config-minify]'),
        configFile: one('[data-config-file]'),
        configCopy: one('[data-config-copy]'),
        configDownload: one('[data-config-download]'),
        configEmpty: one('[data-config-empty]'),
        requestInput: one('[data-request-input]'),
        requestOutput: one('[data-request-output]'),
        requestInputLines: one('[data-request-input-lines]'),
        requestOutputLines: one('[data-request-output-lines]'),
        requestInputStats: one('[data-request-input-stats]'),
        requestOutputStats: one('[data-request-output-stats]'),
        requestSecretStatus: one('[data-request-secret-status]'),
        requestProtect: one('[data-request-protect]'),
        requestResponse: one('[data-request-response]'),
        requestFile: one('[data-request-file]'),
        requestCopy: one('[data-request-copy]'),
        requestDownload: one('[data-request-download]'),
        requestEmpty: one('[data-request-empty]'),
        requestSummary: one('[data-request-summary]'),
        requestWarnings: one('[data-request-warnings]'),
        requestHealth: one('[data-request-health]'),
        requestMethod: one('[data-request-method]'),
        requestEnvironment: one('[data-request-environment]'),
        requestLoading: one('[data-request-loading]'),
        dropCurtain: one('[data-drop-curtain]'),
        toast: one('[data-toast]')
    };

    function textBytes(text) {
        return new TextEncoder().encode(String(text)).length;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function lineCount(text) {
        return String(text).split(/\r\n|\r|\n/).length;
    }

    function updateLines(textarea, gutter) {
        const count = Math.max(1, lineCount(textarea.value));
        let output = '';
        for (let index = 1; index <= count; index += 1) output += index + (index === count ? '' : '\n');
        gutter.textContent = output;
        gutter.scrollTop = textarea.scrollTop;
    }

    function syncStats(textarea, target) {
        target.textContent = formatBytes(textBytes(textarea.value)) + ' · ' + lineCount(textarea.value) + ' 行';
    }

    function bindEditor(textarea, gutter, stats) {
        textarea.addEventListener('scroll', function() {
            gutter.scrollTop = textarea.scrollTop;
        });
        textarea.addEventListener('input', function() {
            updateLines(textarea, gutter);
            syncStats(textarea, stats);
        });
        textarea.addEventListener('keydown', function(event) {
            if (event.key !== 'Tab' || textarea.readOnly) return;
            event.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.setRangeText('  ', start, end, 'end');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    function showToast(message) {
        window.clearTimeout(state.toastTimer);
        elements.toast.textContent = message;
        elements.toast.hidden = false;
        state.toastTimer = window.setTimeout(function() {
            elements.toast.hidden = true;
        }, 2600);
    }

    function setButtonOutput(buttons, hasOutput) {
        buttons.forEach(function(button) { button.disabled = !hasOutput; });
    }

    function setHealth(element, type, label) {
        element.className = 'health-badge ' + type;
        element.textContent = label;
    }

    function createDiagnostic(item) {
        const row = document.createElement('div');
        row.className = 'diagnostic-item ' + (item.level || 'info');
        const dot = document.createElement('i');
        dot.setAttribute('aria-hidden', 'true');
        const message = document.createElement('p');
        message.textContent = item.message;
        const location = document.createElement('code');
        const parts = [];
        if (item.line) parts.push('L' + item.line + (item.column ? ':' + item.column : ''));
        if (item.path) parts.push(item.path);
        location.textContent = parts.join(' · ');
        row.append(dot, message, location);
        return row;
    }

    function renderDiagnostics(container, items, emptyMessage) {
        container.replaceChildren();
        if (!items.length) {
            const empty = document.createElement('p');
            empty.className = 'quiet-message';
            empty.textContent = emptyMessage;
            container.append(empty);
            return;
        }
        items.forEach(function(item) {
            container.append(createDiagnostic(item));
        });
    }

    function currentPreferences() {
        return {
            mode: state.mode,
            policy: state.policy,
            configSource: elements.configSource.value,
            configTarget: elements.configTarget.value,
            indent: Number(elements.configIndent.value),
            sortKeys: elements.configSort.checked,
            minify: elements.configMinify.checked,
            protectSecrets: elements.requestProtect.checked,
            responseOutput: elements.requestResponse.checked
        };
    }

    function savePreferences() {
        try {
            window.toolStorage.setItem(PREFERENCES_KEY, JSON.stringify(currentPreferences()));
        } catch (error) {
            console.warn('Unable to save tool preferences.', error);
        }
    }

    function updatePolicyPresentation() {
        elements.policyCaption.textContent = state.policy === 'safe'
            ? '策略 · 有损时阻止'
            : '策略 · 警告后继续';
    }

    function applyPreferences(raw) {
        const preferences = raw && typeof raw === 'object' ? raw : {};
        state.policy = preferences.policy === 'practical' ? 'practical' : 'safe';
        elements.configSource.value = ['auto', 'json', 'yaml', 'toml'].includes(preferences.configSource) ? preferences.configSource : 'auto';
        elements.configTarget.value = ['json', 'yaml', 'toml'].includes(preferences.configTarget) ? preferences.configTarget : 'yaml';
        elements.configIndent.value = preferences.indent === 4 ? '4' : '2';
        elements.configSort.checked = Boolean(preferences.sortKeys);
        elements.configMinify.checked = Boolean(preferences.minify);
        elements.requestProtect.checked = preferences.protectSecrets !== false;
        elements.requestResponse.checked = preferences.responseOutput !== false;
        all('[data-policy]').forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset.policy === state.policy));
        });
        updatePolicyPresentation();
        switchMode(preferences.mode === 'request' ? 'request' : 'config', false);
        updateTargetPresentation();
    }

    function switchMode(mode, persist) {
        state.mode = mode === 'request' ? 'request' : 'config';
        app.dataset.mode = state.mode;
        all('[data-mode-button]').forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset.modeButton === state.mode));
        });
        all('[data-mode-panel]').forEach(function(panel) {
            panel.hidden = panel.dataset.modePanel !== state.mode;
        });
        if (persist !== false) savePreferences();
    }

    function updateTargetPresentation() {
        const target = elements.configTarget.value.toUpperCase();
        elements.configOutputLabel.textContent = target;
        elements.configMinify.disabled = target !== 'JSON';
    }

    function configOptions() {
        return {
            source: elements.configSource.value,
            target: elements.configTarget.value,
            mode: state.policy,
            indent: Number(elements.configIndent.value),
            sortKeys: elements.configSort.checked,
            minify: elements.configMinify.checked && elements.configTarget.value === 'json',
            filename: state.configName
        };
    }

    function renderConfigResult(result) {
        state.configResult = result;
        elements.configOutput.value = result.output || '';
        updateLines(elements.configOutput, elements.configOutputLines);
        syncStats(elements.configOutput, elements.configOutputStats);
        elements.configEmpty.hidden = Boolean(result.output);
        setButtonOutput([elements.configCopy, elements.configDownload], Boolean(result.output));
        renderDiagnostics(elements.configDiagnostics, result.issues || [], '未发现语法或信息损失问题。');

        const detected = result.sourceFormat ? result.sourceFormat.toUpperCase() : '未知';
        elements.configDetected.textContent = result.detection && result.detection.confidence !== 'explicit'
            ? detected + ' · ' + String(result.detection.confidence || '').toUpperCase()
            : detected;
        elements.configDetected.classList.toggle('detected', Boolean(result.sourceFormat));
        elements.configInputLabel.textContent = result.sourceFormat ? detected + ' 输入' : '自动检测';
        elements.traceDetected.textContent = result.sourceFormat
            ? detected + (result.detection && result.detection.reasons && result.detection.reasons.length ? ' · ' + result.detection.reasons.join('、') : '')
            : '—';
        elements.traceStructure.textContent = result.stats
            ? result.stats.nodes + ' 节点 · ' + result.stats.keys + ' 键 · 深度 ' + result.stats.depth
            : '—';
        elements.traceRoundtrip.textContent = result.verification
            ? (result.verification.passed ? 'PASS · 语义一致' : 'FAIL · 语义变化')
            : result.blocked ? 'BLOCKED · 未生成' : '—';
        elements.configVerification.textContent = result.verification
            ? (result.verification.passed ? '✓ 回读语义一致' : '× 回读失败')
            : result.blocked ? '保真策略已阻止' : '等待回读复检';

        const hasErrors = (result.issues || []).some(function(item) { return item.level === 'error'; });
        const hasWarnings = (result.issues || []).some(function(item) { return item.level === 'warning'; });
        if (hasErrors) setHealth(elements.configHealth, 'error', result.blocked ? '已阻止' : '错误');
        else if (hasWarnings) setHealth(elements.configHealth, 'warning', '有约定');
        else if (result.ok) setHealth(elements.configHealth, 'ok', '可导出');
        else setHealth(elements.configHealth, 'idle', '待转换');
        if (!result.output) elements.configOutputStats.textContent = '尚未生成';
    }

    function convertConfig(showMessage) {
        window.clearTimeout(state.configTimer);
        const result = configCore.convert(elements.configInput.value, configOptions());
        renderConfigResult(result);
        if (showMessage) {
            if (result.ok) showToast('转换完成，并已通过目标格式回读复检。');
            else if (result.blocked) showToast('保真策略阻止了有损转换；可查看诊断，或切换到宽松模式继续。');
            else showToast('输入存在问题，请查看诊断信息。');
        }
    }

    function scheduleConfigConversion() {
        window.clearTimeout(state.configTimer);
        state.configTimer = window.setTimeout(function() {
            convertConfig(false);
        }, 260);
    }

    function loadConfigText(text, filename) {
        elements.configInput.value = text;
        state.configName = filename || 'config.txt';
        updateLines(elements.configInput, elements.configInputLines);
        syncStats(elements.configInput, elements.configInputStats);
        convertConfig(false);
    }

    function setRequestOutput(result) {
        state.requestResult = result;
        elements.requestOutput.value = result.code || '';
        updateLines(elements.requestOutput, elements.requestOutputLines);
        syncStats(elements.requestOutput, elements.requestOutputStats);
        elements.requestEmpty.hidden = Boolean(result.code);
        setButtonOutput([elements.requestCopy, elements.requestDownload], Boolean(result.code));
        renderDiagnostics(elements.requestWarnings, result.warnings || [], '未发现不兼容参数或安全问题。');

        const errors = (result.warnings || []).filter(function(item) { return item.level === 'error'; });
        const warnings = (result.warnings || []).filter(function(item) { return item.level === 'warning'; });
        if (errors.length) setHealth(elements.requestHealth, 'error', '解析失败');
        else if (warnings.length) setHealth(elements.requestHealth, 'warning', warnings.length + ' 条提示');
        else if (result.ok) setHealth(elements.requestHealth, 'ok', '可运行');
        else setHealth(elements.requestHealth, 'idle', '待解析');

        elements.requestOutputStats.textContent = result.code
            ? formatBytes(textBytes(result.code)) + ' · ' + lineCount(result.code) + ' 行'
            : '尚未生成';
        elements.requestSecretStatus.textContent = result.detectedSecretCount
            ? (result.protectedEntries && result.protectedEntries.length
                ? '✓ ' + result.protectedEntries.length + ' 处凭据已环境变量化'
                : '⚠ 检测到 ' + result.detectedSecretCount + ' 处凭据')
            : '未检测到明显凭据';
        renderRequestSummary(result.summary);
        renderEnvironment(result.protectedEntries || []);
    }

    function renderRequestSummary(summary) {
        elements.requestSummary.replaceChildren();
        elements.requestMethod.textContent = summary && summary.method ? String(summary.method).toUpperCase() : '—';
        if (!summary) {
            const empty = document.createElement('p');
            empty.className = 'quiet-message';
            empty.textContent = '解析成功后显示请求结构。';
            elements.requestSummary.append(empty);
            return;
        }
        const url = document.createElement('p');
        url.className = 'summary-url';
        url.title = summary.raw_url || summary.url || '';
        url.textContent = summary.raw_url || summary.url || '未识别 URL';
        elements.requestSummary.append(url);

        const grid = document.createElement('div');
        grid.className = 'summary-grid';
        const metrics = [
            ['方法', String(summary.method || 'GET').toUpperCase()],
            ['Headers', Object.keys(summary.headers || {}).length],
            ['Query', Object.keys(summary.queries || {}).length],
            ['Body', summary.data !== undefined || summary.files ? 'YES' : 'NO'],
            ['Redirect', summary.follow_redirects === undefined ? 'DEFAULT' : summary.follow_redirects ? 'YES' : 'NO'],
            ['TLS', summary.insecure === false ? 'NO VERIFY' : 'VERIFY']
        ];
        metrics.forEach(function(metric) {
            const item = document.createElement('div');
            item.className = 'summary-metric';
            const label = document.createElement('span');
            label.textContent = metric[0];
            const value = document.createElement('strong');
            value.textContent = String(metric[1]);
            item.append(label, value);
            grid.append(item);
        });
        elements.requestSummary.append(grid);

        const detailsValue = Object.assign({}, summary);
        delete detailsValue.raw_url;
        delete detailsValue.url;
        delete detailsValue.method;
        if (Object.keys(detailsValue).length) {
            const details = document.createElement('details');
            details.className = 'summary-details';
            const title = document.createElement('summary');
            title.textContent = '查看已脱敏的解析结果';
            const content = document.createElement('pre');
            content.textContent = JSON.stringify(detailsValue, null, 2);
            details.append(title, content);
            elements.requestSummary.append(details);
        }
    }

    function renderEnvironment(entries) {
        elements.requestEnvironment.replaceChildren();
        if (!entries.length) {
            const empty = document.createElement('span');
            empty.className = 'quiet-message';
            empty.textContent = elements.requestProtect.checked ? '未生成环境变量' : '当前保留原始字面量';
            elements.requestEnvironment.append(empty);
            return;
        }
        const list = document.createElement('div');
        list.className = 'environment-list';
        entries.forEach(function(entry) {
            const item = document.createElement('code');
            item.title = entry.path;
            item.textContent = entry.envName;
            list.append(item);
        });
        elements.requestEnvironment.append(list);
    }

    async function loadCurlLibrary() {
        if (state.curlLibrary) return state.curlLibrary;
        if (!state.curlLibraryPromise) {
            elements.requestLoading.hidden = false;
            state.curlLibraryPromise = new Promise(function(resolve, reject) {
                const script = document.createElement('script');
                script.src = 'vendor/curlconverter.js';
                script.onload = function() {
                    const library = window.DeveloperCurlConverter;
                    if (!library || !library.ready) {
                        reject(new Error('cURL 转换器未正确初始化。'));
                        return;
                    }
                    Promise.resolve(library.ready).then(function() {
                        state.curlLibrary = library;
                        resolve(library);
                    }, reject);
                };
                script.onerror = function() {
                    reject(new Error('无法载入本地 cURL 转换器。'));
                };
                document.head.append(script);
            }).catch(function(error) {
                state.curlLibraryPromise = null;
                throw error;
            }).finally(function() {
                elements.requestLoading.hidden = true;
            });
        }
        return state.curlLibraryPromise;
    }

    async function convertRequest(showMessage) {
        const button = one('[data-request-convert]');
        button.disabled = true;
        try {
            const library = await loadCurlLibrary();
            const result = await requestCore.convert(elements.requestInput.value, library, {
                secretPolicy: elements.requestProtect.checked ? 'environment' : 'literal',
                appendResponseOutput: elements.requestResponse.checked
            });
            setRequestOutput(result);
            if (showMessage) {
                showToast(result.ok ? 'Python 脚本已生成；浏览器未发送任何请求。' : 'cURL 解析失败，请查看提示。');
            }
        } catch (error) {
            const result = {
                ok: false,
                code: '',
                summary: null,
                warnings: [{ level: 'error', code: 'runtime', message: error.message || String(error) }]
            };
            setRequestOutput(result);
            if (showMessage) showToast('Bash 解析器启动失败。');
        } finally {
            button.disabled = false;
        }
    }

    function loadRequestText(text) {
        elements.requestInput.value = text;
        updateLines(elements.requestInput, elements.requestInputLines);
        syncStats(elements.requestInput, elements.requestInputStats);
    }

    async function readFile(file, kind) {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            showToast('文本文件不能超过 2 MB。');
            return;
        }
        const text = await file.text();
        if (kind === 'request') loadRequestText(text);
        else loadConfigText(text, file.name);
    }

    async function copyText(text) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            showToast('已复制到剪贴板。');
        } catch (_error) {
            const helper = document.createElement('textarea');
            helper.value = text;
            helper.setAttribute('readonly', '');
            document.body.append(helper);
            helper.select();
            document.execCommand('copy');
            helper.remove();
            showToast('已复制到剪贴板。');
        }
    }

    function downloadText(text, filename, type) {
        if (!text) return;
        const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        showToast('已生成 ' + filename + '。');
    }

    function bindDropZone(panel) {
        const kind = panel.dataset.dropZone;
        ['dragenter', 'dragover'].forEach(function(type) {
            panel.addEventListener(type, function(event) {
                event.preventDefault();
                panel.classList.add('is-dragging');
                elements.dropCurtain.hidden = false;
            });
        });
        ['dragleave', 'drop'].forEach(function(type) {
            panel.addEventListener(type, function(event) {
                event.preventDefault();
                panel.classList.remove('is-dragging');
                elements.dropCurtain.hidden = true;
            });
        });
        panel.addEventListener('drop', function(event) {
            const file = event.dataTransfer.files && event.dataTransfer.files[0];
            readFile(file, kind).catch(function(error) {
                showToast(error.message || String(error));
            });
        });
    }

    all('[data-mode-button]').forEach(function(button) {
        button.addEventListener('click', function() {
            switchMode(button.dataset.modeButton);
        });
    });

    all('[data-policy]').forEach(function(button) {
        button.addEventListener('click', function() {
            state.policy = button.dataset.policy;
            all('[data-policy]').forEach(function(item) {
                item.setAttribute('aria-pressed', String(item === button));
            });
            updatePolicyPresentation();
            savePreferences();
            convertConfig(false);
        });
    });

    elements.configInput.addEventListener('input', scheduleConfigConversion);
    elements.configSource.addEventListener('change', function() {
        savePreferences();
        convertConfig(false);
    });
    elements.configTarget.addEventListener('change', function() {
        updateTargetPresentation();
        savePreferences();
        convertConfig(false);
    });
    [elements.configIndent, elements.configSort, elements.configMinify].forEach(function(control) {
        control.addEventListener('change', function() {
            savePreferences();
            convertConfig(false);
        });
    });
    [elements.requestProtect, elements.requestResponse].forEach(function(control) {
        control.addEventListener('change', function() {
            savePreferences();
            if (state.requestResult) convertRequest(false);
        });
    });

    one('[data-config-convert]').addEventListener('click', function() { convertConfig(true); });
    one('[data-config-sample]').addEventListener('click', function() {
        elements.configSource.value = 'auto';
        elements.configTarget.value = 'yaml';
        updateTargetPresentation();
        loadConfigText(CONFIG_SAMPLE, 'service.json');
        savePreferences();
    });
    one('[data-config-import]').addEventListener('click', function() { elements.configFile.click(); });
    elements.configFile.addEventListener('change', function() {
        readFile(elements.configFile.files[0], 'config').catch(function(error) { showToast(error.message || String(error)); });
        elements.configFile.value = '';
    });
    one('[data-config-clear]').addEventListener('click', function() {
        loadConfigText('', 'config.txt');
        elements.configInput.focus();
    });
    one('[data-config-swap]').addEventListener('click', function() {
        if (!state.configResult || !state.configResult.output) {
            showToast('请先生成可交换的转换结果。');
            return;
        }
        const previousSource = state.configResult.sourceFormat;
        const previousTarget = elements.configTarget.value;
        const output = state.configResult.output;
        elements.configSource.value = previousTarget;
        elements.configTarget.value = previousSource;
        state.configName = configCore.outputFilename(state.configName, previousTarget);
        elements.configInput.value = output;
        updateTargetPresentation();
        updateLines(elements.configInput, elements.configInputLines);
        syncStats(elements.configInput, elements.configInputStats);
        savePreferences();
        convertConfig(false);
    });
    elements.configCopy.addEventListener('click', function() { copyText(elements.configOutput.value); });
    elements.configDownload.addEventListener('click', function() {
        const target = elements.configTarget.value;
        downloadText(elements.configOutput.value, configCore.outputFilename(state.configName, target), target === 'json' ? 'application/json' : 'text/plain');
    });

    elements.requestInput.addEventListener('input', function() {
        state.requestResult = null;
    });
    one('[data-request-convert]').addEventListener('click', function() { convertRequest(true); });
    one('[data-request-sample]').addEventListener('click', function() { loadRequestText(REQUEST_SAMPLE); });
    one('[data-request-import]').addEventListener('click', function() { elements.requestFile.click(); });
    elements.requestFile.addEventListener('change', function() {
        readFile(elements.requestFile.files[0], 'request').catch(function(error) { showToast(error.message || String(error)); });
        elements.requestFile.value = '';
    });
    one('[data-request-clear]').addEventListener('click', function() {
        loadRequestText('');
        setRequestOutput({ ok: false, code: '', summary: null, warnings: [], protectedEntries: [], detectedSecretCount: 0 });
        elements.requestInput.focus();
    });
    elements.requestCopy.addEventListener('click', function() { copyText(elements.requestOutput.value); });
    elements.requestDownload.addEventListener('click', function() {
        downloadText(elements.requestOutput.value, requestCore.outputFilename(), 'text/x-python');
    });

    all('[data-drop-zone]').forEach(bindDropZone);
    document.addEventListener('dragend', function() { elements.dropCurtain.hidden = true; });
    document.addEventListener('drop', function() { elements.dropCurtain.hidden = true; });
    document.addEventListener('keydown', function(event) {
        if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
        event.preventDefault();
        if (state.mode === 'request') convertRequest(true);
        else convertConfig(true);
    });

    bindEditor(elements.configInput, elements.configInputLines, elements.configInputStats);
    bindEditor(elements.configOutput, elements.configOutputLines, elements.configOutputStats);
    bindEditor(elements.requestInput, elements.requestInputLines, elements.requestInputStats);
    bindEditor(elements.requestOutput, elements.requestOutputLines, elements.requestOutputStats);

    elements.configInput.value = CONFIG_SAMPLE;
    elements.requestInput.value = REQUEST_SAMPLE;
    [
        [elements.configInput, elements.configInputLines, elements.configInputStats],
        [elements.configOutput, elements.configOutputLines, elements.configOutputStats],
        [elements.requestInput, elements.requestInputLines, elements.requestInputStats],
        [elements.requestOutput, elements.requestOutputLines, elements.requestOutputStats]
    ].forEach(function(entry) {
        updateLines(entry[0], entry[1]);
        syncStats(entry[0], entry[2]);
    });

    window.toolStorage.ready().then(function(storage) {
        let preferences = {};
        try {
            preferences = JSON.parse(storage.getItem(PREFERENCES_KEY) || '{}');
        } catch (_error) {
            preferences = {};
        }
        applyPreferences(preferences);
        convertConfig(false);
        window.toolHost.markReady();
    }).catch(function(error) {
        applyPreferences({});
        convertConfig(false);
        window.toolHost.reportError(error);
        window.toolHost.markReady();
    });
})();
