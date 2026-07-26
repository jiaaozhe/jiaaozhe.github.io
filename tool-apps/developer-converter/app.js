(function() {
    'use strict';

    const app = document.querySelector('[data-app]');
    if (!app || !window.DeveloperConverterCore || !window.DeveloperRequestCore || !window.DeveloperSchemaCore) return;

    const configCore = window.DeveloperConverterCore;
    const requestCore = window.DeveloperRequestCore;
    const schemaCore = window.DeveloperSchemaCore;
    const PREFERENCES_KEY = 'developer-converter.preferences.v1';
    const CONFIG_SAMPLE = '{\n  "service": "photo-api",\n  "enabled": true,\n  "retry": {\n    "attempts": 3,\n    "backoff": 1.5\n  },\n  "limits": {\n    "upload_bytes": 9007199254740993\n  },\n  "regions": ["cn-east", "eu-west"]\n}\n';
    const REQUEST_SAMPLE = "curl 'https://api.example.com/v1/photos?limit=12' \\\n  -X POST \\\n  -H 'Authorization: Bearer demo-token-replace-me' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{\"album\":\"street\",\"private\":true}'";

    const SCHEMA_SAMPLE = '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object",\n  "required": ["service", "enabled", "retry", "regions"],\n  "properties": {\n    "service": { "type": "string", "minLength": 2 },\n    "enabled": { "type": "boolean" },\n    "retry": {\n      "type": "object",\n      "required": ["attempts"],\n      "properties": {\n        "attempts": { "type": "integer", "minimum": 0 },\n        "backoff": { "type": "number", "exclusiveMinimum": 0 }\n      },\n      "additionalProperties": false\n    },\n    "limits": {\n      "type": "object",\n      "properties": {\n        "upload_bytes": { "type": "integer", "minimum": 1 }\n      }\n    },\n    "regions": {\n      "type": "array",\n      "minItems": 1,\n      "items": { "type": "string", "pattern": "^[a-z]{2}-[a-z]+$" }\n    }\n  },\n  "additionalProperties": false\n}\n';

    const state = {
        mode: 'config',
        policy: 'safe',
        configLab: 'trace',
        configName: 'config.json',
        schemaName: 'schema.json',
        configText: '',
        configResult: null,
        queryResult: null,
        schemaResult: null,
        schemaValidated: false,
        structureRows: new Map(),
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
        configLabButtons: all('[data-config-lab]'),
        configLabPanels: all('[data-config-lab-panel]'),
        structureCount: one('[data-structure-count]'),
        structureTree: one('[data-structure-tree]'),
        structureExpand: one('[data-structure-expand]'),
        structureCollapse: one('[data-structure-collapse]'),
        configQuery: one('[data-config-query]'),
        configQueryRun: one('[data-config-query-run]'),
        queryHealth: one('[data-query-health]'),
        querySummary: one('[data-query-summary]'),
        queryCopy: one('[data-query-copy]'),
        queryResults: one('[data-query-results]'),
        schemaCount: one('[data-schema-count]'),
        schemaInput: one('[data-schema-input]'),
        schemaLines: one('[data-schema-lines]'),
        schemaStats: one('[data-schema-stats]'),
        schemaFormat: one('[data-schema-format]'),
        schemaFile: one('[data-schema-file]'),
        schemaHealth: one('[data-schema-health]'),
        schemaResults: one('[data-schema-results]'),
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
        requestTarget: one('[data-request-target]'),
        requestOutputKicker: one('[data-request-output-kicker]'),
        requestOutputLabel: one('[data-request-output-label]'),
        requestActionLabel: one('[data-request-action-label]'),
        requestDownloadLabel: one('[data-request-download]'),
        requestEmptyMark: one('[data-request-empty-mark]'),
        requestEmptyLabel: one('[data-request-empty-label]'),
        requestRuntime: one('[data-request-runtime]'),
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
        if (item.source !== 'schema' && item.path && String(item.path).startsWith('/')) {
            row.classList.add('is-navigable');
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.setAttribute('aria-label', item.message + '，定位到 ' + item.path);
            const navigate = function() {
                switchConfigLab('structure');
                focusStructurePath(item.path === '/' ? '' : item.path);
            };
            row.addEventListener('click', navigate);
            row.addEventListener('keydown', function(event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                navigate();
            });
        }
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
            responseOutput: elements.requestResponse.checked,
            requestTarget: elements.requestTarget.value,
            configLab: state.configLab
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
        elements.requestTarget.value = Object.prototype.hasOwnProperty.call(requestCore.TARGETS, preferences.requestTarget)
            ? preferences.requestTarget
            : 'python';
        all('[data-policy]').forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset.policy === state.policy));
        });
        updatePolicyPresentation();
        switchMode(preferences.mode === 'request' ? 'request' : 'config', false);
        switchConfigLab(['trace', 'structure', 'schema'].includes(preferences.configLab) ? preferences.configLab : 'trace', false);
        updateTargetPresentation();
        updateRequestTargetPresentation();
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

    function switchConfigLab(lab, persist) {
        state.configLab = ['trace', 'structure', 'schema'].includes(lab) ? lab : 'trace';
        elements.configLabButtons.forEach(function(button) {
            button.setAttribute('aria-pressed', String(button.dataset.configLab === state.configLab));
        });
        elements.configLabPanels.forEach(function(panel) {
            panel.hidden = panel.dataset.configLabPanel !== state.configLab;
        });
        if (persist !== false) savePreferences();
    }

    function updateTargetPresentation() {
        const target = elements.configTarget.value.toUpperCase();
        elements.configOutputLabel.textContent = target;
        elements.configMinify.disabled = target !== 'JSON';
    }

    function updateRequestTargetPresentation() {
        const target = requestCore.targetInfo(elements.requestTarget.value);
        const presentation = {
            python: { short: 'PY', action: '生成 Python', label: '可执行 Requests 脚本', aria: 'Python 转换结果' },
            node: { short: 'JS', action: '生成 JavaScript', label: '可执行 Fetch 模块', aria: 'JavaScript 转换结果' },
            go: { short: 'GO', action: '生成 Go', label: '可执行 net/http 程序', aria: 'Go 转换结果' },
            http: { short: 'HTTP', action: '生成 HTTP', label: '原始 HTTP 请求报文', aria: 'Raw HTTP 转换结果' },
            har: { short: 'HAR', action: '生成 HAR', label: 'HAR 1.2 请求档案', aria: 'HAR 转换结果' }
        }[target.id];
        const extension = target.filename.slice(target.filename.lastIndexOf('.'));
        elements.requestOutputKicker.textContent = 'RESULT / ' + target.label.split(' · ')[0];
        elements.requestOutputLabel.textContent = presentation.label;
        elements.requestActionLabel.textContent = presentation.action;
        elements.requestDownloadLabel.textContent = '下载 ' + extension;
        elements.requestEmptyMark.textContent = presentation.short;
        elements.requestEmptyLabel.textContent = '解析后生成' + presentation.label;
        elements.requestRuntime.textContent = target.runtime;
        elements.requestOutput.setAttribute('aria-label', presentation.aria);
        elements.requestResponse.disabled = !target.responseOutput;
        elements.requestResponse.closest('.inline-toggle').classList.toggle('is-disabled', !target.responseOutput);
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

    function pointerToken(value) {
        return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
    }

    function pathProperty(value) {
        const key = String(value);
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
            ? '.' + key
            : '[' + JSON.stringify(key) + ']';
    }

    function structurePreview(node) {
        if (node.type === 'object') return node.entries.length + ' keys';
        if (node.type === 'array') return node.items.length + ' items';
        const value = configCore.serializeNode(node);
        return value.length > 100 ? value.slice(0, 97) + '…' : value;
    }

    function structureChildren(node, pointer, path) {
        if (node.type === 'object') {
            return node.entries.map(function(entry) {
                return {
                    node: entry[1],
                    key: entry[0],
                    pointer: pointer + '/' + pointerToken(entry[0]),
                    path: path + pathProperty(entry[0])
                };
            });
        }
        if (node.type === 'array') {
            return node.items.map(function(item, index) {
                return {
                    node: item,
                    key: '[' + index + ']',
                    pointer: pointer + '/' + index,
                    path: path + '[' + index + ']'
                };
            });
        }
        return [];
    }

    function createStructureNode(record, depth, budget) {
        budget.count += 1;
        const expandable = record.node.type === 'object' || record.node.type === 'array';
        const container = document.createElement(expandable ? 'details' : 'div');
        container.className = 'structure-node';
        container.dataset.pointer = record.pointer;
        if (expandable) container.open = depth < 2;

        const row = document.createElement(expandable ? 'summary' : 'div');
        row.className = 'structure-row';
        const key = document.createElement('strong');
        key.className = 'structure-key';
        key.textContent = record.key === null ? '$' : record.key;
        const type = document.createElement('span');
        type.className = 'node-type type-' + record.node.type;
        type.textContent = record.node.type;
        const preview = document.createElement('code');
        preview.className = 'structure-preview';
        preview.textContent = structurePreview(record.node);
        const path = document.createElement('code');
        path.className = 'structure-path';
        path.textContent = record.pointer || '/';
        path.title = record.path;
        row.append(key, type, preview, path);
        container.append(row);
        state.structureRows.set(record.pointer, row);

        if (expandable) {
            const children = document.createElement('div');
            children.className = 'structure-children';
            structureChildren(record.node, record.pointer, record.path).forEach(function(child) {
                if (budget.count >= budget.limit) return;
                children.append(createStructureNode(child, depth + 1, budget));
            });
            container.append(children);
        }
        return container;
    }

    function renderStructure(structure, stats) {
        elements.structureTree.replaceChildren();
        state.structureRows = new Map();
        if (!structure) {
            const empty = document.createElement('p');
            empty.className = 'quiet-message';
            empty.textContent = '输入可解析后显示节点、类型与精确路径。';
            elements.structureTree.append(empty);
            elements.structureCount.textContent = '—';
            renderQueryResult(null);
            return;
        }
        const budget = { count: 0, limit: 2000 };
        elements.structureTree.append(createStructureNode({
            node: structure,
            key: null,
            pointer: '',
            path: '$'
        }, 0, budget));
        if (stats && stats.nodes > budget.limit) {
            const note = document.createElement('p');
            note.className = 'tree-limit-note';
            note.textContent = '结构树仅渲染前 ' + budget.limit + ' 个节点；路径查询仍针对完整文档。';
            elements.structureTree.append(note);
        }
        elements.structureCount.textContent = stats ? String(stats.nodes) : String(budget.count);
    }

    function focusStructurePath(pointer) {
        const normalized = pointer === '/' ? '' : String(pointer || '');
        const row = state.structureRows.get(normalized);
        if (!row) {
            showToast('该节点未出现在当前渲染范围内，可用路径查询直接查看。');
            return;
        }
        let parent = row.parentElement;
        while (parent) {
            if (parent.tagName === 'DETAILS') parent.open = true;
            parent = parent.parentElement;
        }
        state.structureRows.forEach(function(item) { item.classList.remove('is-focused'); });
        row.classList.add('is-focused');
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function renderQueryResult(result) {
        elements.queryResults.replaceChildren();
        state.queryResult = result;
        if (!result) {
            elements.querySummary.textContent = '尚未执行';
            elements.queryCopy.disabled = true;
            setHealth(elements.queryHealth, 'idle', '待查询');
            const empty = document.createElement('p');
            empty.className = 'quiet-message';
            empty.textContent = '查询结果会显示精确路径、类型和值预览。';
            elements.queryResults.append(empty);
            return;
        }
        if (!result.ok) {
            elements.querySummary.textContent = result.error;
            elements.queryCopy.disabled = true;
            setHealth(elements.queryHealth, 'error', '表达式错误');
            const error = document.createElement('p');
            error.className = 'query-error';
            error.textContent = result.error;
            elements.queryResults.append(error);
            return;
        }
        const clippedValues = result.results.filter(function(item) { return item.valueTruncated; }).length;
        elements.querySummary.textContent = result.results.length + ' 个结果 · ' + result.mode.toUpperCase() +
            (result.truncated ? ' · 结果已截断' : '') +
            (clippedValues ? ' · ' + clippedValues + ' 个值预览截断' : '');
        elements.queryCopy.disabled = !result.results.length;
        setHealth(elements.queryHealth, result.results.length ? 'ok' : 'warning', result.results.length ? '已命中' : '无结果');
        if (!result.results.length) {
            const empty = document.createElement('p');
            empty.className = 'quiet-message';
            empty.textContent = '表达式有效，但没有匹配节点。';
            elements.queryResults.append(empty);
            return;
        }
        result.results.forEach(function(item) {
            const row = document.createElement('div');
            row.className = 'query-result';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.setAttribute('aria-label', '定位到 ' + item.path);
            const heading = document.createElement('div');
            const path = document.createElement('code');
            path.textContent = item.path;
            path.title = item.pointer || '/';
            const type = document.createElement('span');
            type.className = 'node-type type-' + item.type;
            type.textContent = item.type;
            heading.append(path, type);
            const preview = document.createElement('pre');
            preview.textContent = item.value;
            if (item.valueTruncated) preview.title = '值过大，仅显示前 12,000 个字符。';
            row.append(heading, preview);
            const navigate = function() {
                switchConfigLab('structure');
                focusStructurePath(item.pointer);
            };
            row.addEventListener('click', navigate);
            row.addEventListener('keydown', function(event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                navigate();
            });
            elements.queryResults.append(row);
        });
    }

    function executeQuery(showMessage) {
        const refreshed = ensureConfigCurrent();
        if (refreshed && state.schemaValidated) validateSchema(false);
        const structure = state.configResult && state.configResult.structure;
        const result = configCore.queryStructure(structure, elements.configQuery.value);
        renderQueryResult(result);
        if (showMessage) {
            showToast(result.ok
                ? '查询完成，共命中 ' + result.results.length + ' 个节点。'
                : result.error);
        }
    }

    function renderSchemaResult(result) {
        state.schemaResult = result;
        renderDiagnostics(elements.schemaResults, result.issues || [], result.valid ? 'Schema 验证通过，未发现约束问题。' : '尚无验证结果。');
        elements.schemaFormat.textContent = result.format
            ? result.format.toUpperCase() + ' · Draft 2020-12'
            : 'JSON / YAML';
        if (result.ok && result.valid) {
            setHealth(elements.schemaHealth, 'ok', '验证通过');
            elements.schemaCount.textContent = '0';
        } else if (result.ok) {
            setHealth(elements.schemaHealth, 'error', (result.errorCount || 0) + ' 条错误');
            elements.schemaCount.textContent = String(result.errorCount || 0);
        } else {
            setHealth(elements.schemaHealth, 'error', 'Schema 错误');
            elements.schemaCount.textContent = '!';
        }
    }

    function validateSchema(showMessage) {
        const refreshed = ensureConfigCurrent();
        if (refreshed && state.queryResult) executeQuery(false);
        state.schemaValidated = true;
        const result = schemaCore.validate(
            state.configResult && state.configResult.structure,
            elements.schemaInput.value,
            configCore,
            state.schemaName
        );
        renderSchemaResult(result);
        if (showMessage) {
            if (result.ok && result.valid) showToast('当前配置符合 Schema。');
            else if (result.ok) showToast('发现 ' + result.errorCount + ' 条 Schema 约束问题。');
            else showToast('Schema 暂时无法执行，请查看验证结果。');
        }
    }

    function resetSchemaResult() {
        state.schemaValidated = false;
        state.schemaResult = null;
        elements.schemaResults.replaceChildren();
        const empty = document.createElement('p');
        empty.className = 'quiet-message';
        empty.textContent = 'Schema 已变化，请重新验证当前配置。';
        elements.schemaResults.append(empty);
        elements.schemaCount.textContent = '—';
        elements.schemaFormat.textContent = 'JSON / YAML';
        setHealth(elements.schemaHealth, 'idle', '待验证');
    }

    function loadSchemaText(text, filename) {
        elements.schemaInput.value = text;
        state.schemaName = filename || 'schema.json';
        updateLines(elements.schemaInput, elements.schemaLines);
        syncStats(elements.schemaInput, elements.schemaStats);
        resetSchemaResult();
    }

    function renderConfigResult(result, refreshInspections) {
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
        renderStructure(result.structure, result.stats);
        if (refreshInspections !== false) {
            if (state.queryResult) executeQuery(false);
            if (state.schemaValidated) validateSchema(false);
        }
    }

    function convertConfig(showMessage, refreshInspections) {
        window.clearTimeout(state.configTimer);
        state.configText = elements.configInput.value;
        const result = configCore.convert(elements.configInput.value, configOptions());
        renderConfigResult(result, refreshInspections);
        if (showMessage) {
            if (result.ok) showToast('转换完成，并已通过目标格式回读复检。');
            else if (result.blocked) showToast('保真策略阻止了有损转换；可查看诊断，或切换到宽松模式继续。');
            else showToast('输入存在问题，请查看诊断信息。');
        }
    }

    function ensureConfigCurrent() {
        if (state.configText === elements.configInput.value) return false;
        convertConfig(false, false);
        return true;
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
        if (result.target && Object.prototype.hasOwnProperty.call(requestCore.TARGETS, result.target)) {
            elements.requestTarget.value = result.target;
        }
        updateRequestTargetPresentation();
        elements.requestOutput.value = result.code || '';
        updateLines(elements.requestOutput, elements.requestOutputLines);
        syncStats(elements.requestOutput, elements.requestOutputStats);
        elements.requestEmpty.hidden = Boolean(result.code);
        setButtonOutput([elements.requestCopy, elements.requestDownload], Boolean(result.code));
        renderDiagnostics(
            elements.requestWarnings,
            result.warnings || [],
            result.stale ? 'cURL 已变化，请重新生成目标输出。' : '未发现不兼容参数或安全问题。'
        );

        const errors = (result.warnings || []).filter(function(item) { return item.level === 'error'; });
        const warnings = (result.warnings || []).filter(function(item) { return item.level === 'warning'; });
        if (errors.length) setHealth(elements.requestHealth, 'error', '解析失败');
        else if (warnings.length) setHealth(elements.requestHealth, 'warning', warnings.length + ' 条提示');
        else if (result.ok) setHealth(elements.requestHealth, 'ok', '可导出');
        else setHealth(elements.requestHealth, 'idle', '待解析');

        elements.requestOutputStats.textContent = result.code
            ? formatBytes(textBytes(result.code)) + ' · ' + lineCount(result.code) + ' 行'
            : '尚未生成';
        elements.requestSecretStatus.textContent = result.stale
            ? '等待重新分析凭据'
            : result.detectedSecretCount
            ? (result.protectedEntries && result.protectedEntries.length
                ? '✓ ' + result.protectedEntries.length + ' 处凭据已环境变量化'
                : '⚠ 检测到 ' + result.detectedSecretCount + ' 处凭据')
            : '未检测到需改写的字面凭据';
        renderRequestSummary(result.summary);
        renderEnvironment(result.protectedEntries || []);
    }

    function invalidateRequestResult() {
        setRequestOutput({
            ok: false,
            stale: true,
            code: '',
            summary: null,
            target: elements.requestTarget.value,
            warnings: [],
            protectedEntries: [],
            detectedSecretCount: 0
        });
        state.requestResult = null;
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
                appendResponseOutput: elements.requestResponse.checked,
                target: elements.requestTarget.value
            });
            setRequestOutput(result);
            if (showMessage) {
                showToast(result.ok
                    ? requestCore.targetInfo(result.target).label + ' 已生成；浏览器未发送任何请求。'
                    : 'cURL 解析失败，请查看提示。');
            }
        } catch (error) {
            const result = {
                ok: false,
                code: '',
                summary: null,
                target: elements.requestTarget.value,
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
        invalidateRequestResult();
    }

    async function readFile(file, kind) {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            showToast('文本文件不能超过 2 MB。');
            return;
        }
        const text = await file.text();
        if (kind === 'request') loadRequestText(text);
        else if (kind === 'schema') loadSchemaText(text, file.name);
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

    elements.configLabButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            switchConfigLab(button.dataset.configLab);
        });
    });

    elements.structureExpand.addEventListener('click', function() {
        all('.structure-tree details').forEach(function(item) { item.open = true; });
    });
    elements.structureCollapse.addEventListener('click', function() {
        all('.structure-tree details').forEach(function(item, index) { item.open = index === 0; });
    });
    elements.configQueryRun.addEventListener('click', function() { executeQuery(true); });
    elements.configQuery.addEventListener('keydown', function(event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        executeQuery(true);
    });
    elements.configQuery.addEventListener('input', function() {
        if (state.queryResult) renderQueryResult(null);
    });
    elements.queryCopy.addEventListener('click', function() {
        if (!state.queryResult || !state.queryResult.ok) return;
        copyText(state.queryResult.results.map(function(item) {
            return item.path + ' = ' + item.value + (item.valueTruncated ? ' [值预览已截断]' : '');
        }).join('\n'));
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
    elements.requestTarget.addEventListener('change', function() {
        updateRequestTargetPresentation();
        savePreferences();
        if (state.requestResult) convertRequest(false);
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

    elements.schemaInput.addEventListener('input', resetSchemaResult);
    one('[data-schema-validate]').addEventListener('click', function() { validateSchema(true); });
    one('[data-schema-sample]').addEventListener('click', function() {
        loadSchemaText(SCHEMA_SAMPLE, 'service.schema.json');
    });
    one('[data-schema-import]').addEventListener('click', function() { elements.schemaFile.click(); });
    elements.schemaFile.addEventListener('change', function() {
        readFile(elements.schemaFile.files[0], 'schema').catch(function(error) { showToast(error.message || String(error)); });
        elements.schemaFile.value = '';
    });
    one('[data-schema-clear]').addEventListener('click', function() {
        loadSchemaText('', 'schema.json');
        elements.schemaInput.focus();
    });

    elements.requestInput.addEventListener('input', function() {
        if (state.requestResult || elements.requestOutput.value) invalidateRequestResult();
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
        elements.requestInput.focus();
    });
    elements.requestCopy.addEventListener('click', function() { copyText(elements.requestOutput.value); });
    elements.requestDownload.addEventListener('click', function() {
        const target = requestCore.targetInfo(elements.requestTarget.value);
        downloadText(elements.requestOutput.value, target.filename, target.mime);
    });

    all('[data-drop-zone]').forEach(bindDropZone);
    document.addEventListener('dragend', function() { elements.dropCurtain.hidden = true; });
    document.addEventListener('drop', function() { elements.dropCurtain.hidden = true; });
    document.addEventListener('keydown', function(event) {
        if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
        event.preventDefault();
        if (state.mode === 'request') convertRequest(true);
        else if (state.configLab === 'schema') validateSchema(true);
        else if (state.configLab === 'structure') executeQuery(true);
        else convertConfig(true);
    });

    bindEditor(elements.configInput, elements.configInputLines, elements.configInputStats);
    bindEditor(elements.configOutput, elements.configOutputLines, elements.configOutputStats);
    bindEditor(elements.schemaInput, elements.schemaLines, elements.schemaStats);
    bindEditor(elements.requestInput, elements.requestInputLines, elements.requestInputStats);
    bindEditor(elements.requestOutput, elements.requestOutputLines, elements.requestOutputStats);

    elements.configInput.value = CONFIG_SAMPLE;
    elements.schemaInput.value = SCHEMA_SAMPLE;
    elements.requestInput.value = REQUEST_SAMPLE;
    [
        [elements.configInput, elements.configInputLines, elements.configInputStats],
        [elements.configOutput, elements.configOutputLines, elements.configOutputStats],
        [elements.schemaInput, elements.schemaLines, elements.schemaStats],
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
