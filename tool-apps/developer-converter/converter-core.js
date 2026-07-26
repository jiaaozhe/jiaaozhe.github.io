(function(root, factory) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        module.exports = factory;
    } else {
        root.DeveloperConverterCore = factory(root.DeveloperConverterLibraries);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(libraries) {
    'use strict';

    if (!libraries || !libraries.YAML || !libraries.parseToml || !libraries.parseLosslessJson) {
        throw new Error('配置转换依赖未加载。');
    }

    const YAML = libraries.YAML;
    const FORMATS = Object.freeze(['json', 'yaml', 'toml']);
    const STANDARD_YAML_TAG = /^tag:yaml\.org,2002:/;

    function normalizeFormat(value) {
        const format = String(value || '').toLowerCase();
        return format === 'yml' ? 'yaml' : format;
    }

    function positionAt(text, offset) {
        const before = String(text).slice(0, Math.max(0, Number(offset) || 0));
        const lines = before.split(/\r\n|\r|\n/);
        return { line: lines.length, column: lines[lines.length - 1].length + 1 };
    }

    function issue(level, code, message, details) {
        return Object.assign({
            level: level,
            code: code,
            message: message,
            lossy: false,
            blocking: level === 'error'
        }, details || {});
    }

    function parseError(format, error, text) {
        let line = Number(error && error.line) || 0;
        let column = Number(error && (error.column || error.col)) || 0;
        if ((!line || !column) && error && error.linePos && error.linePos[0]) {
            line = error.linePos[0].line;
            column = error.linePos[0].col;
        }
        if ((!line || !column) && error && Array.isArray(error.pos)) {
            const pos = positionAt(text, error.pos[0]);
            line = pos.line;
            column = pos.column;
        }
        if (!line || !column) {
            const match = String(error && error.message || '').match(/(?:position|at)\s+(\d+)/i);
            if (match) {
                const pos = positionAt(text, Number(match[1]));
                line = pos.line;
                column = pos.column;
            }
        }
        const rawMessage = String(error && error.message || error || '无法解析输入');
        const message = rawMessage.split(/\n\s*\n/)[0].replace(/^Invalid TOML document:\s*/i, '');
        return issue('error', format + '-parse', message, {
            line: line || undefined,
            column: column || undefined
        });
    }

    function scanTomlComments(text) {
        let quote = '';
        let triple = false;
        let escaped = false;
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            const three = text.slice(index, index + 3);
            if (!quote && (three === '"""' || three === "'''")) {
                quote = char;
                triple = true;
                index += 2;
                continue;
            }
            if (quote && triple && three === quote.repeat(3)) {
                quote = '';
                triple = false;
                index += 2;
                continue;
            }
            if (!quote && (char === '"' || char === "'")) {
                quote = char;
                triple = false;
                escaped = false;
                continue;
            }
            if (quote && !triple) {
                if (quote === '"' && char === '\\' && !escaped) {
                    escaped = true;
                    continue;
                }
                if (char === quote && !escaped) quote = '';
                escaped = false;
                continue;
            }
            if (!quote && char === '#') return true;
        }
        return false;
    }

    function numericNode(value, raw) {
        const source = String(raw === undefined ? value : raw);
        if (/^-0(?:\.0*)?(?:[eE][+-]?\d+)?$/.test(source.replace(/_/g, ''))) {
            return { type: 'number', raw: source.replace(/_/g, '') };
        }
        if (typeof value === 'bigint' || /^[-+]?\d+$/.test(source.replace(/_/g, ''))) {
            return { type: 'integer', raw: source.replace(/_/g, '').replace(/^\+/, '') };
        }
        return { type: 'number', raw: source.replace(/_/g, '') };
    }

    function unsafeTomlFloats(text) {
        if (typeof libraries.isSafeNumber !== 'function') return [];
        const values = [];
        const pattern = /(?:^|[=,[{]\s*)([-+]?(?:\d[\d_]*\.\d[\d_]*(?:[eE][-+]?\d+)?|\d[\d_]*[eE][-+]?\d+))/gm;
        let match;
        while ((match = pattern.exec(text))) {
            const value = match[1].replace(/_/g, '').replace(/^\+/, '');
            if (!libraries.isSafeNumber(value, { approx: false })) values.push(value);
        }
        return Array.from(new Set(values));
    }

    function normalizePlain(value, sourceFormat, seen) {
        if (value === null) return { type: 'null' };
        if (libraries.isLosslessNumber && libraries.isLosslessNumber(value)) {
            return numericNode(value, value.toString());
        }
        if (typeof value === 'bigint') return { type: 'integer', raw: value.toString() };
        if (typeof value === 'number') {
            if (Number.isNaN(value)) return { type: 'number', raw: 'NaN' };
            if (value === Infinity) return { type: 'number', raw: 'Infinity' };
            if (value === -Infinity) return { type: 'number', raw: '-Infinity' };
            if (Object.is(value, -0)) return { type: 'number', raw: '-0.0' };
            return {
                type: Number.isInteger(value) ? 'integer' : 'number',
                raw: String(value)
            };
        }
        if (typeof value === 'string') return { type: 'string', value: value };
        if (typeof value === 'boolean') return { type: 'boolean', value: value };
        if (value instanceof libraries.TomlDate) {
            return {
                type: 'datetime',
                value: value.toISOString(),
                dateType: value.isDate() ? 'date' : value.isTime() ? 'time' : value.isLocal() ? 'local-datetime' : 'offset-datetime'
            };
        }
        if (Array.isArray(value)) {
            return {
                type: 'array',
                items: value.map(function(item) {
                    return normalizePlain(item, sourceFormat, seen);
                })
            };
        }
        if (value && typeof value === 'object') {
            if (seen.has(value)) throw new Error('检测到循环引用，无法转换。');
            seen.add(value);
            const entries = Object.keys(value).map(function(key) {
                return [key, normalizePlain(value[key], sourceFormat, seen)];
            });
            seen.delete(value);
            return { type: 'object', entries: entries };
        }
        throw new Error('不支持的值类型：' + typeof value);
    }

    function yamlScalarRaw(node) {
        if (typeof node.source === 'string' && node.source) return node.source;
        if (Number.isNaN(node.value)) return '.nan';
        if (node.value === Infinity) return '.inf';
        if (node.value === -Infinity) return '-.inf';
        return String(node.value);
    }

    function normalizeYamlNode(node, document, state, path) {
        if (YAML.isAlias(node)) {
            const resolved = node.resolve(document);
            if (!resolved) throw new Error('YAML 别名 *' + node.source + ' 找不到对应锚点。');
            if (state.aliasStack.has(resolved)) throw new Error('YAML 锚点包含循环引用，无法展开。');
            state.aliasStack.add(resolved);
            const result = normalizeYamlNode(resolved, document, state, path);
            state.aliasStack.delete(resolved);
            return result;
        }
        if (YAML.isScalar(node)) {
            const value = node.value;
            if (value === null) return { type: 'null' };
            if (typeof value === 'bigint') return { type: 'integer', raw: value.toString() };
            if (typeof value === 'number') return numericNode(value, yamlScalarRaw(node));
            if (typeof value === 'boolean') return { type: 'boolean', value: value };
            return { type: 'string', value: String(value) };
        }
        if (YAML.isSeq(node)) {
            return {
                type: 'array',
                items: node.items.map(function(item, index) {
                    return normalizeYamlNode(item, document, state, path + '[' + index + ']');
                })
            };
        }
        if (YAML.isMap(node)) {
            const keys = new Set();
            const entries = node.items.map(function(pair) {
                let key;
                if (YAML.isScalar(pair.key) && typeof pair.key.value === 'string') {
                    key = pair.key.value;
                } else if (YAML.isScalar(pair.key) && (
                    typeof pair.key.value === 'number' ||
                    typeof pair.key.value === 'bigint' ||
                    typeof pair.key.value === 'boolean'
                )) {
                    key = String(pair.key.value);
                    state.issues.push(issue('warning', 'yaml-non-string-key', 'YAML 的非字符串键会转换为字符串。', {
                        path: path,
                        lossy: true
                    }));
                } else {
                    throw new Error('YAML 复合键无法转换为 JSON/TOML 对象键。');
                }
                if (keys.has(key)) throw new Error('键转换为字符串后发生冲突：' + key);
                keys.add(key);
                return [key, normalizeYamlNode(pair.value, document, state, path ? path + '.' + key : key)];
            });
            return { type: 'object', entries: entries };
        }
        if (node === null) return { type: 'null' };
        throw new Error('无法识别 YAML 节点。');
    }

    function parseJson(text) {
        try {
            const value = libraries.parseLosslessJson(text);
            return { root: normalizePlain(value, 'json', new Set()), issues: [] };
        } catch (error) {
            return { root: null, issues: [parseError('json', error, text)] };
        }
    }

    function parseYaml(text) {
        const lineCounter = new YAML.LineCounter();
        let documents;
        try {
            documents = YAML.parseAllDocuments(text, {
                intAsBigInt: true,
                keepSourceTokens: true,
                lineCounter: lineCounter,
                prettyErrors: true,
                schema: 'core',
                uniqueKeys: true
            });
        } catch (error) {
            return { root: null, issues: [parseError('yaml', error, text)] };
        }
        const errors = [];
        documents.forEach(function(document) {
            document.errors.forEach(function(error) {
                errors.push(parseError('yaml', error, text));
            });
        });
        if (errors.length) return { root: null, issues: errors };
        if (documents.length !== 1) {
            return {
                root: null,
                issues: [issue('error', 'yaml-multiple-documents', '一次只能转换一个 YAML 文档；当前检测到 ' + documents.length + ' 个。')]
            };
        }

        const document = documents[0];
        const featureIssues = [];
        let hasComments = Boolean(document.commentBefore || document.comment);
        let hasAnchors = false;
        let hasAliases = false;
        let hasExplicitTags = false;
        YAML.visit(document, {
            Node: function(_key, node) {
                if (node.commentBefore || node.comment) hasComments = true;
                if (node.anchor) hasAnchors = true;
                if (node.tag && (!STANDARD_YAML_TAG.test(node.tag) || node.srcToken && node.srcToken.props && node.srcToken.props.length)) {
                    hasExplicitTags = true;
                }
            },
            Alias: function() {
                hasAliases = true;
            }
        });
        if (hasComments) {
            featureIssues.push(issue('warning', 'yaml-comments', 'YAML 注释不会出现在转换结果中。', { lossy: true }));
        }
        if (hasAnchors || hasAliases) {
            featureIssues.push(issue('warning', 'yaml-aliases', 'YAML 锚点与别名会展开为普通值，引用关系不会保留。', { lossy: true }));
        }
        if (hasExplicitTags) {
            featureIssues.push(issue('warning', 'yaml-tags', 'YAML 显式标签的标注方式不会保留。', { lossy: true }));
        }
        document.warnings.forEach(function(warning) {
            featureIssues.push(issue('warning', 'yaml-warning', warning.message, {
                line: warning.linePos && warning.linePos[0] ? warning.linePos[0].line : undefined,
                column: warning.linePos && warning.linePos[0] ? warning.linePos[0].col : undefined
            }));
        });
        try {
            const state = { issues: featureIssues, aliasStack: new Set() };
            const root = normalizeYamlNode(document.contents, document, state, '');
            return { root: root, issues: featureIssues };
        } catch (error) {
            return { root: null, issues: featureIssues.concat([parseError('yaml', error, text)]) };
        }
    }

    function parseToml(text) {
        try {
            const value = libraries.parseToml(text, { integersAsBigInt: 'asNeeded' });
            const issues = [];
            if (scanTomlComments(text)) {
                issues.push(issue('warning', 'toml-comments', 'TOML 注释不会出现在转换结果中。', { lossy: true }));
            }
            const unsafeFloats = unsafeTomlFloats(text);
            if (unsafeFloats.length) {
                issues.push(issue('warning', 'toml-float-precision', 'TOML 浮点数超出 JavaScript 可精确表示范围：' + unsafeFloats.slice(0, 3).join('、') + (unsafeFloats.length > 3 ? '…' : '') + '。', {
                    lossy: true
                }));
            }
            return { root: normalizePlain(value, 'toml', new Set()), issues: issues };
        } catch (error) {
            return { root: null, issues: [parseError('toml', error, text)] };
        }
    }

    function parseByFormat(text, format) {
        if (format === 'json') return parseJson(text);
        if (format === 'yaml') return parseYaml(text);
        if (format === 'toml') return parseToml(text);
        return { root: null, issues: [issue('error', 'unknown-format', '不支持的输入格式：' + format)] };
    }

    function extensionFormat(filename) {
        const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/);
        if (!match) return '';
        return normalizeFormat(match[1]);
    }

    function detectFormat(text, filename) {
        const source = String(text || '');
        const trimmed = source.trim();
        const scores = { json: 0, yaml: 0, toml: 0 };
        const reasons = { json: [], yaml: [], toml: [] };
        const extension = extensionFormat(filename);
        if (FORMATS.includes(extension)) {
            scores[extension] += 12;
            reasons[extension].push('文件扩展名');
        }
        if (/^[{[]/.test(trimmed)) {
            scores.json += 5;
            reasons.json.push('起始符号');
        }
        if (/^(?:---|\.\.\.)\s*$/m.test(source) || /^\s*[-?]\s+/m.test(source) || /^\s*[^#\n][^=\n]*:\s*(?:$|[^/])/m.test(source)) {
            scores.yaml += 5;
            reasons.yaml.push('YAML 结构');
        }
        if (/^\s*\[\[?[^\]\n]+\]\]?\s*(?:#.*)?$/m.test(source) || /^\s*[A-Za-z0-9_.-]+\s*=/m.test(source)) {
            scores.toml += 7;
            reasons.toml.push('TOML 赋值/表头');
        }
        FORMATS.forEach(function(format) {
            const result = parseByFormat(source, format);
            if (result.root && !result.issues.some(function(item) { return item.level === 'error'; })) {
                scores[format] += 3;
                reasons[format].push('语法校验通过');
            } else {
                scores[format] -= 20;
            }
        });
        const ranked = FORMATS.slice().sort(function(a, b) {
            return scores[b] - scores[a];
        });
        const best = ranked[0];
        const gap = scores[best] - scores[ranked[1]];
        return {
            format: best,
            confidence: scores[best] < 0 ? 'low' : gap >= 6 ? 'high' : gap >= 2 ? 'medium' : 'low',
            scores: scores,
            reasons: reasons[best]
        };
    }

    function cloneNode(node) {
        if (node.type === 'object') {
            return { type: 'object', entries: node.entries.map(function(entry) {
                return [entry[0], cloneNode(entry[1])];
            }) };
        }
        if (node.type === 'array') {
            return { type: 'array', items: node.items.map(cloneNode) };
        }
        return Object.assign({}, node);
    }

    function walkNode(node, callback, path) {
        const currentPath = path || '$';
        callback(node, currentPath);
        if (node.type === 'object') {
            node.entries.forEach(function(entry) {
                walkNode(entry[1], callback, currentPath + '.' + entry[0]);
            });
        } else if (node.type === 'array') {
            node.items.forEach(function(item, index) {
                walkNode(item, callback, currentPath + '[' + index + ']');
            });
        }
    }

    function adaptForTarget(root, target, issues) {
        function adapt(node, path) {
            if (node.type === 'datetime' && target !== 'toml') {
                issues.push(issue('warning', 'datetime-to-string', 'TOML 日期时间在 ' + path + ' 会转换为字符串。', {
                    path: path,
                    lossy: true
                }));
                return { type: 'string', value: node.value };
            }
            if (node.type === 'null' && target === 'toml') {
                issues.push(issue('warning', 'null-to-string', 'TOML 没有 null；' + path + ' 会转换为字符串 \"null\"。', {
                    path: path,
                    lossy: true
                }));
                return { type: 'string', value: 'null' };
            }
            if (node.type === 'number' && target === 'json' && !Number.isFinite(Number(node.raw))) {
                issues.push(issue('warning', 'non-finite-to-string', 'JSON 不支持 ' + node.raw + '；' + path + ' 会转换为字符串。', {
                    path: path,
                    lossy: true
                }));
                return { type: 'string', value: node.raw };
            }
            if (node.type === 'number' && target !== 'json' && Number.isFinite(Number(node.raw)) &&
                typeof libraries.isSafeNumber === 'function' &&
                !libraries.isSafeNumber(node.raw.replace(/^\+/, ''), { approx: false })) {
                issues.push(issue('warning', 'float-precision', path + ' 的高精度浮点数会受 JavaScript Number 精度限制。', {
                    path: path,
                    lossy: true
                }));
            }
            if (node.type === 'object') {
                return {
                    type: 'object',
                    entries: node.entries.map(function(entry) {
                        return [entry[0], adapt(entry[1], path + '.' + entry[0])];
                    })
                };
            }
            if (node.type === 'array') {
                return {
                    type: 'array',
                    items: node.items.map(function(item, index) {
                        return adapt(item, path + '[' + index + ']');
                    })
                };
            }
            return cloneNode(node);
        }

        let adapted = adapt(root, '$');
        if (target === 'toml' && adapted.type !== 'object') {
            issues.push(issue('warning', 'toml-root-wrapper', 'TOML 文档必须以表为根；结果会包装为 value = …。', {
                path: '$',
                lossy: true
            }));
            adapted = { type: 'object', entries: [['value', adapted]] };
        }
        return adapted;
    }

    function sortNode(node) {
        if (node.type === 'object') {
            return {
                type: 'object',
                entries: node.entries
                    .map(function(entry) { return [entry[0], sortNode(entry[1])]; })
                    .sort(function(a, b) { return a[0].localeCompare(b[0]); })
            };
        }
        if (node.type === 'array') return { type: 'array', items: node.items.map(sortNode) };
        return cloneNode(node);
    }

    function serializeJson(node, options, depth) {
        const level = depth || 0;
        const minify = Boolean(options.minify);
        const unit = ' '.repeat(options.indent);
        const pad = unit.repeat(level);
        const nextPad = unit.repeat(level + 1);
        if (node.type === 'null') return 'null';
        if (node.type === 'string') return JSON.stringify(node.value);
        if (node.type === 'boolean') return node.value ? 'true' : 'false';
        if (node.type === 'integer' || node.type === 'number') return node.raw;
        if (node.type === 'datetime') return JSON.stringify(node.value);
        if (node.type === 'array') {
            if (!node.items.length) return '[]';
            const values = node.items.map(function(item) {
                return serializeJson(item, options, level + 1);
            });
            return minify ? '[' + values.join(',') + ']' : '[\n' + nextPad + values.join(',\n' + nextPad) + '\n' + pad + ']';
        }
        if (node.type === 'object') {
            if (!node.entries.length) return '{}';
            const values = node.entries.map(function(entry) {
                const separator = minify ? ':' : ': ';
                return JSON.stringify(entry[0]) + separator + serializeJson(entry[1], options, level + 1);
            });
            return minify ? '{' + values.join(',') + '}' : '{\n' + nextPad + values.join(',\n' + nextPad) + '\n' + pad + '}';
        }
        throw new Error('无法序列化未知 JSON 节点。');
    }

    function yamlNode(node) {
        if (node.type === 'null') return new YAML.Scalar(null);
        if (node.type === 'string') return new YAML.Scalar(node.value);
        if (node.type === 'boolean') return new YAML.Scalar(node.value);
        if (node.type === 'datetime') return new YAML.Scalar(node.value);
        if (node.type === 'integer') return new YAML.Scalar(BigInt(node.raw));
        if (node.type === 'number') {
            const value = Number(node.raw);
            const scalar = new YAML.Scalar(value);
            if (Number.isFinite(value)) {
                const fraction = String(node.raw).match(/\.(\d+)/);
                scalar.minFractionDigits = fraction ? Math.max(1, fraction[1].length) : 1;
                if (/[eE]/.test(node.raw)) scalar.format = 'EXP';
            }
            return scalar;
        }
        if (node.type === 'array') {
            const sequence = new YAML.YAMLSeq();
            sequence.items = node.items.map(yamlNode);
            return sequence;
        }
        if (node.type === 'object') {
            const map = new YAML.YAMLMap();
            map.items = node.entries.map(function(entry) {
                return new YAML.Pair(new YAML.Scalar(entry[0]), yamlNode(entry[1]));
            });
            return map;
        }
        throw new Error('无法序列化未知 YAML 节点。');
    }

    function plainForToml(node) {
        if (node.type === 'null') return null;
        if (node.type === 'string') return node.value;
        if (node.type === 'boolean') return node.value;
        if (node.type === 'integer') return BigInt(node.raw);
        if (node.type === 'number') return Number(node.raw);
        if (node.type === 'datetime') return new libraries.TomlDate(node.value);
        if (node.type === 'array') return node.items.map(plainForToml);
        if (node.type === 'object') {
            const object = {};
            node.entries.forEach(function(entry) {
                object[entry[0]] = plainForToml(entry[1]);
            });
            return object;
        }
        throw new Error('无法序列化未知 TOML 节点。');
    }

    function serialize(node, target, options) {
        if (target === 'json') {
            return serializeJson(node, options, 0) + (options.minify ? '' : '\n');
        }
        if (target === 'yaml') {
            const document = new YAML.Document();
            document.contents = yamlNode(node);
            return document.toString({
                indent: options.indent,
                lineWidth: 0,
                simpleKeys: false
            });
        }
        if (target === 'toml') {
            return libraries.stringifyToml(plainForToml(node), {
                maxDepth: 100,
                numbersAsFloat: true
            });
        }
        throw new Error('不支持的目标格式：' + target);
    }

    function canonical(node) {
        if (node.type === 'integer') {
            try {
                return ['integer', BigInt(node.raw).toString()];
            } catch (_error) {
                return ['integer', node.raw];
            }
        }
        if (node.type === 'number') {
            const value = Number(node.raw);
            if (Number.isNaN(value)) return ['number', 'NaN'];
            if (Object.is(value, -0)) return ['number', '-0'];
            return ['number', String(value)];
        }
        if (node.type === 'string') return ['string', node.value];
        if (node.type === 'boolean') return ['boolean', node.value];
        if (node.type === 'null') return ['null'];
        if (node.type === 'datetime') return ['datetime', node.dateType, node.value];
        if (node.type === 'array') return ['array', node.items.map(canonical)];
        if (node.type === 'object') {
            return ['object', node.entries
                .map(function(entry) {
                    return [entry[0], canonical(entry[1])];
                })
                .sort(function(a, b) { return a[0].localeCompare(b[0]); })];
        }
        return ['unknown'];
    }

    function verifyRoundTrip(output, target, expected) {
        const parsed = parseByFormat(output, target);
        const errors = parsed.issues.filter(function(item) { return item.level === 'error'; });
        if (!parsed.root || errors.length) {
            return { passed: false, message: '目标文本无法重新解析。', issues: errors };
        }
        const passed = JSON.stringify(canonical(parsed.root)) === JSON.stringify(canonical(expected));
        return {
            passed: passed,
            message: passed ? '目标格式回读后语义一致。' : '目标格式回读后检测到类型或值变化。',
            issues: []
        };
    }

    function statsFor(root) {
        let nodes = 0;
        let maxDepth = 0;
        let keys = 0;
        function visit(node, depth) {
            nodes += 1;
            maxDepth = Math.max(maxDepth, depth);
            if (node.type === 'object') {
                keys += node.entries.length;
                node.entries.forEach(function(entry) { visit(entry[1], depth + 1); });
            } else if (node.type === 'array') {
                node.items.forEach(function(item) { visit(item, depth + 1); });
            }
        }
        visit(root, 1);
        return { nodes: nodes, keys: keys, depth: maxDepth };
    }

    function byteLength(text) {
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
        return unescape(encodeURIComponent(text)).length;
    }

    function convert(text, rawOptions) {
        const input = String(text || '');
        const options = Object.assign({
            source: 'auto',
            target: 'yaml',
            mode: 'safe',
            indent: 2,
            minify: false,
            sortKeys: false,
            filename: ''
        }, rawOptions || {});
        options.source = normalizeFormat(options.source);
        options.target = normalizeFormat(options.target);
        options.mode = options.mode === 'practical' ? 'practical' : 'safe';
        options.indent = options.indent === 4 ? 4 : 2;
        if (!input.trim()) {
            return { ok: false, output: '', issues: [issue('error', 'empty-input', '请先粘贴配置内容或导入文件。')] };
        }
        if (!FORMATS.includes(options.target)) {
            return { ok: false, output: '', issues: [issue('error', 'target-format', '请选择 JSON、YAML 或 TOML 作为目标格式。')] };
        }

        const detection = options.source === 'auto' ? detectFormat(input, options.filename) : {
            format: options.source,
            confidence: 'explicit',
            reasons: ['手动选择']
        };
        const sourceFormat = detection.format;
        if (!FORMATS.includes(sourceFormat)) {
            return { ok: false, output: '', issues: [issue('error', 'source-format', '无法识别输入格式。')] };
        }
        const parsed = parseByFormat(input, sourceFormat);
        const issues = parsed.issues.slice();
        if (!parsed.root || issues.some(function(item) { return item.level === 'error'; })) {
            return {
                ok: false,
                output: '',
                sourceFormat: sourceFormat,
                targetFormat: options.target,
                detection: detection,
                issues: issues
            };
        }

        let adapted = adaptForTarget(parsed.root, options.target, issues);
        if (options.sortKeys) adapted = sortNode(adapted);
        const losses = issues.filter(function(item) { return item.lossy; });
        if (options.mode === 'safe' && losses.length) {
            return {
                ok: false,
                blocked: true,
                output: '',
                sourceFormat: sourceFormat,
                targetFormat: options.target,
                detection: detection,
                issues: issues.map(function(item) {
                    if (!item.lossy) return item;
                    return Object.assign({}, item, {
                        level: 'error',
                        blocking: true,
                        message: '保真策略已阻止：' + item.message
                    });
                }),
                stats: statsFor(parsed.root)
            };
        }

        let output;
        try {
            output = serialize(adapted, options.target, options);
        } catch (error) {
            issues.push(issue('error', 'serialize', error.message || String(error)));
            return {
                ok: false,
                output: '',
                sourceFormat: sourceFormat,
                targetFormat: options.target,
                detection: detection,
                issues: issues,
                stats: statsFor(parsed.root)
            };
        }

        const verification = verifyRoundTrip(output, options.target, adapted);
        if (!verification.passed) {
            issues.push(issue('error', 'round-trip', verification.message));
        } else {
            issues.push(issue('info', 'round-trip', verification.message));
        }
        return {
            ok: verification.passed,
            output: output,
            sourceFormat: sourceFormat,
            targetFormat: options.target,
            detection: detection,
            issues: issues,
            verification: verification,
            stats: Object.assign(statsFor(parsed.root), {
                inputBytes: byteLength(input),
                outputBytes: byteLength(output)
            })
        };
    }

    function outputFilename(inputName, target) {
        const safeName = String(inputName || 'config')
            .replace(/\.[^.]+$/, '')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/^\.+/, '')
            .trim() || 'config';
        return safeName + '.' + (normalizeFormat(target) === 'yaml' ? 'yaml' : normalizeFormat(target));
    }

    return Object.freeze({
        FORMATS: FORMATS,
        convert: convert,
        detectFormat: detectFormat,
        normalizeFormat: normalizeFormat,
        outputFilename: outputFilename,
        parseByFormat: parseByFormat,
        scanTomlComments: scanTomlComments
    });
});
