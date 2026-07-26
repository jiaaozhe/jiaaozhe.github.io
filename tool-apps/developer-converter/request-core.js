(function(root, factory) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DeveloperRequestCore = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const SENSITIVE_KEY = /(?:^|[-_.\s])(authorization|proxy[-_.\s]?authorization|cookie|api[-_.\s]?key|x[-_.\s]?api[-_.\s]?key|access[-_.\s]?token|refresh[-_.\s]?token|token|secret|client[-_.\s]?secret|password|passwd|signature|credential|session)(?:$|[-_.\s])/i;
    const AUTH_VALUE = /^(?:bearer|basic|token|digest|aws4-hmac-sha256)\s+/i;
    const TARGETS = Object.freeze({
        python: Object.freeze({
            id: 'python',
            label: 'Python · Requests',
            generator: 'toPythonWarn',
            filename: 'request.py',
            mime: 'text/x-python',
            runtime: 'python -m pip install requests',
            responseOutput: true
        }),
        node: Object.freeze({
            id: 'node',
            label: 'JavaScript · Fetch',
            generator: 'toNodeWarn',
            filename: 'request.js',
            mime: 'text/javascript',
            runtime: 'npm install node-fetch',
            responseOutput: false
        }),
        go: Object.freeze({
            id: 'go',
            label: 'Go · net/http',
            generator: 'toGoWarn',
            filename: 'request.go',
            mime: 'text/x-go',
            runtime: 'go run request.go',
            responseOutput: false
        }),
        http: Object.freeze({
            id: 'http',
            label: 'Raw HTTP',
            generator: 'toHTTPWarn',
            filename: 'request.http',
            mime: 'message/http',
            runtime: '环境变量以 ${NAME} 占位',
            responseOutput: false
        }),
        har: Object.freeze({
            id: 'har',
            label: 'HAR 1.2',
            generator: 'toHarStringWarn',
            filename: 'request.har',
            mime: 'application/json',
            runtime: '可导入支持 HAR 1.2 的调试工具',
            responseOutput: false
        })
    });

    function uniqueWarnings(warnings) {
        const seen = new Set();
        return warnings.filter(function(item) {
            const key = item.code + '\u0000' + item.message;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function normalizeWarnings(raw) {
        return (raw || []).map(function(item) {
            if (Array.isArray(item)) {
                return { level: 'warning', code: String(item[0] || 'curl-warning'), message: String(item[1] || 'cURL 选项可能未完整转换。') };
            }
            return {
                level: item && item.level || 'warning',
                code: item && item.code || 'curl-warning',
                message: item && item.message || String(item)
            };
        });
    }

    function redactWarningSecrets(warnings, secrets) {
        const values = new Set();
        (secrets || []).forEach(function(secret) {
            const value = String(secret.value || '');
            if (value.length < 4) return;
            const encoded = encodeURIComponent(value);
            values.add(value);
            values.add(encoded);
            values.add(encoded.replace(/%20/g, '+'));
        });
        const ordered = Array.from(values).filter(Boolean).sort(function(a, b) { return b.length - a.length; });
        return warnings.map(function(warning) {
            let message = String(warning.message || '');
            ordered.forEach(function(value) {
                message = message.split(value).join('••••');
            });
            return Object.assign({}, warning, { message: message });
        });
    }

    function envSegment(value) {
        return String(value || '')
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .replace(/[^A-Za-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .toUpperCase()
            .slice(0, 48) || 'VALUE';
    }

    function isSensitiveKey(key) {
        return SENSITIVE_KEY.test(String(key || '').replace(/([a-z])([A-Z])/g, '$1_$2'));
    }

    function collectNestedSecrets(value, path, prefix, output) {
        if (!value || typeof value !== 'object') return;
        Object.keys(value).forEach(function(key) {
            const item = value[key];
            const nextPath = path + '.' + key;
            if (isSensitiveKey(key)) {
                if (Array.isArray(item)) {
                    item.forEach(function(entry, index) {
                        if (typeof entry === 'string' && entry && !isEnvironmentReference(entry)) {
                            output.push({ path: nextPath + '[' + index + ']', value: entry, baseName: prefix + '_' + envSegment(key) });
                        }
                    });
                } else if ((typeof item === 'string' || typeof item === 'number') && !isEnvironmentReference(item)) {
                    output.push({ path: nextPath, value: String(item), baseName: prefix + '_' + envSegment(key) });
                }
            } else if (item && typeof item === 'object') {
                collectNestedSecrets(item, nextPath, prefix, output);
            }
        });
    }

    function isEnvironmentReference(value) {
        return /^\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)$/.test(String(value || ''));
    }

    function collectUrlSecrets(rawUrl, output) {
        if (!rawUrl) return;
        try {
            const url = new URL(String(rawUrl));
            url.searchParams.forEach(function(value, key) {
                if (value && isSensitiveKey(key) && !isEnvironmentReference(value)) {
                    output.push({
                        path: 'queries.' + key,
                        value: value,
                        baseName: 'QUERY_' + envSegment(key)
                    });
                }
            });
            if (url.password && !isEnvironmentReference(url.password)) {
                output.push({
                    path: 'url.password',
                    value: decodeURIComponent(url.password),
                    baseName: 'CURL_PASSWORD'
                });
            }
        } catch (_error) {
            // curlconverter will report malformed URLs; do not guess at their boundaries here.
        }
    }

    function collectSecrets(summary) {
        const output = [];
        const headers = summary && summary.headers || {};
        let cookieHeader = '';
        Object.keys(headers).forEach(function(key) {
            const value = String(headers[key] === undefined ? '' : headers[key]);
            if (key.toLowerCase() === 'cookie') {
                cookieHeader = value;
                return;
            }
            const authPayload = AUTH_VALUE.test(value) ? value.replace(AUTH_VALUE, '').trim() : '';
            if (value && !isEnvironmentReference(value) && !isEnvironmentReference(authPayload) &&
                    (isSensitiveKey(key) || AUTH_VALUE.test(value))) {
                output.push({ path: 'headers.' + key, value: value, baseName: envSegment(key) });
            }
        });

        const cookies = summary && summary.cookies || {};
        let parsedCookieCount = 0;
        Object.keys(cookies).forEach(function(key) {
            const value = String(cookies[key] === undefined ? '' : cookies[key]);
            if (!value) return;
            parsedCookieCount += 1;
            if (!isEnvironmentReference(value)) {
                output.push({ path: 'cookies.' + key, value: value, baseName: 'COOKIE_' + envSegment(key) });
            }
        });
        if (cookieHeader && !parsedCookieCount && !isEnvironmentReference(cookieHeader)) {
            output.push({ path: 'headers.Cookie', value: cookieHeader, baseName: 'COOKIE' });
        }

        if (summary && summary.auth && summary.auth.password !== undefined &&
                !isEnvironmentReference(summary.auth.password)) {
            output.push({
                path: 'auth.password',
                value: String(summary.auth.password),
                baseName: 'CURL_PASSWORD'
            });
        }
        collectNestedSecrets(summary && summary.queries, 'queries', 'QUERY', output);
        collectNestedSecrets(summary && summary.data, 'data', 'BODY', output);
        collectUrlSecrets(summary && (summary.raw_url || summary.url), output);

        const seen = new Set();
        return output.filter(function(entry) {
            const key = entry.path + '\u0000' + entry.value;
            if (!entry.value || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function pythonQuoted(value, quote) {
        let output = quote;
        for (const char of String(value)) {
            const code = char.codePointAt(0);
            if (char === '\\') output += '\\\\';
            else if (char === quote) output += '\\' + quote;
            else if (char === '\n') output += '\\n';
            else if (char === '\r') output += '\\r';
            else if (char === '\t') output += '\\t';
            else if (char === '\b') output += '\\b';
            else if (char === '\f') output += '\\f';
            else if (code < 32 || code === 127) output += '\\x' + code.toString(16).padStart(2, '0');
            else if (code > 0xffff) output += '\\U' + code.toString(16).padStart(8, '0');
            else if (code > 126) output += '\\u' + code.toString(16).padStart(4, '0');
            else output += char;
        }
        return output + quote;
    }

    function literalCandidates(value, library) {
        const candidates = new Set([
            pythonQuoted(value, "'"),
            pythonQuoted(value, '"'),
            JSON.stringify(String(value))
        ]);
        if (library && typeof library.reprStr === 'function') {
            candidates.add(library.reprStr(String(value)));
            candidates.add(library.reprStr(String(value), "'"));
            candidates.add(library.reprStr(String(value), '"'));
        }
        return Array.from(candidates).sort(function(a, b) { return b.length - a.length; });
    }

    function allocateEnvironmentNames(secrets) {
        const used = new Map();
        return secrets.map(function(secret) {
            const base = envSegment(secret.baseName);
            const count = (used.get(base) || 0) + 1;
            used.set(base, count);
            return Object.assign({}, secret, {
                envName: count === 1 ? base : base + '_' + count
            });
        });
    }

    function environmentEntries(summary) {
        const allocated = allocateEnvironmentNames(collectSecrets(summary));
        const byValue = new Map();
        allocated.forEach(function(entry) {
            if (byValue.has(entry.value)) {
                byValue.get(entry.value).paths.push(entry.path);
                return;
            }
            byValue.set(entry.value, Object.assign({}, entry, { paths: [entry.path] }));
        });
        return Array.from(byValue.values()).sort(function(a, b) {
            return b.value.length - a.value.length;
        });
    }

    function protectCommand(command, summary) {
        const source = String(command || '');
        const protectedEntries = [];
        const missedEntries = [];
        const candidates = [];
        const entries = environmentEntries(summary);
        entries.forEach(function(entry, entryIndex) {
            if (entry.value.length < 4) return;
            candidates.push({ entryIndex: entryIndex, value: entry.value, encoded: false });
            const encodedValue = encodeURIComponent(entry.value);
            const formEncodedValue = encodedValue.replace(/%20/g, '+');
            const lowercaseEscapes = function(value) {
                return value.replace(/%[0-9A-F]{2}/g, function(escape) { return escape.toLowerCase(); });
            };
            const encodedVariants = new Set([
                encodedValue,
                formEncodedValue,
                lowercaseEscapes(encodedValue),
                lowercaseEscapes(formEncodedValue)
            ]);
            encodedVariants.forEach(function(value) {
                if (value !== entry.value) candidates.push({ entryIndex: entryIndex, value: value, encoded: true });
            });
        });
        candidates.sort(function(a, b) { return b.value.length - a.value.length; });

        const counts = entries.map(function() { return 0; });
        const encodedEntries = new Set();
        let output = '';
        let quote = '';
        let escaped = false;
        let index = 0;
        while (index < source.length) {
            const candidate = !escaped && candidates.find(function(item) {
                return source.startsWith(item.value, index);
            });
            if (candidate) {
                const entry = entries[candidate.entryIndex];
                output += quote === "'"
                    ? "'${" + entry.envName + "}'"
                    : '${' + entry.envName + '}';
                index += candidate.value.length;
                counts[candidate.entryIndex] += 1;
                if (candidate.encoded) encodedEntries.add(candidate.entryIndex);
                continue;
            }
            const char = source[index];
            output += char;
            index += 1;
            if (escaped) {
                escaped = false;
                continue;
            }
            if (quote === "'") {
                if (char === "'") quote = '';
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (quote === '"') {
                if (char === '"') quote = '';
                continue;
            }
            if (char === "'" || char === '"') quote = char;
        }

        entries.forEach(function(entry, entryIndex) {
            const publicEntry = {
                path: entry.paths.join('、'),
                paths: entry.paths.slice(),
                envName: entry.envName,
                encoded: encodedEntries.has(entryIndex)
            };
            if (counts[entryIndex]) protectedEntries.push(publicEntry);
            else missedEntries.push(publicEntry);
        });
        return {
            command: output,
            protectedEntries: protectedEntries,
            missedEntries: missedEntries
        };
    }

    function addOsImport(code) {
        if (/^(?:from\s+\S+\s+import\s+\S+|import\s+[^#\n]*\bos\b)/m.test(code)) return code;
        const requestsImport = /^import requests[ \t]*$/m;
        if (requestsImport.test(code)) return code.replace(requestsImport, 'import os\nimport requests');
        return 'import os\n' + code;
    }

    function addEnvironmentNote(code, entries) {
        if (!entries.length) return code;
        const names = entries.map(function(entry) { return entry.envName; }).join(', ');
        const marker = '# Sensitive values are read from environment variables: ' + names + '\n';
        const split = code.indexOf('\n\n');
        if (split === -1) return marker + code;
        return code.slice(0, split + 2) + marker + code.slice(split + 2);
    }

    function protectPython(code, summary, library) {
        let output = code;
        const entries = allocateEnvironmentNames(collectSecrets(summary));
        const protectedEntries = [];
        const missedEntries = [];
        entries.forEach(function(entry) {
            const replacement = "os.environ[" + pythonQuoted(entry.envName, "'") + "]";
            let replaced = false;
            literalCandidates(entry.value, library).forEach(function(candidate) {
                if (!candidate || !output.includes(candidate)) return;
                output = output.split(candidate).join(replacement);
                replaced = true;
            });
            const publicEntry = { path: entry.path, envName: entry.envName };
            if (replaced) protectedEntries.push(publicEntry);
            else missedEntries.push(publicEntry);
        });
        if (protectedEntries.length) {
            output = addOsImport(output);
            output = addEnvironmentNote(output, protectedEntries);
        }
        return { code: output, protectedEntries: protectedEntries, missedEntries: missedEntries };
    }

    function redactUrl(raw) {
        const value = String(raw || '');
        try {
            const url = new URL(value);
            Array.from(url.searchParams.keys()).forEach(function(key) {
                if (isSensitiveKey(key)) url.searchParams.set(key, '••••');
            });
            if (url.password) url.password = '••••';
            return url.toString();
        } catch (_error) {
            return value.replace(/([?&](?:token|access_token|refresh_token|api_key|password|secret)=)[^&#\s]*/gi, '$1••••');
        }
    }

    function redactSummary(summary) {
        const clone = {};
        Object.keys(summary || {}).forEach(function(key) {
            const value = summary[key];
            if (key === 'raw_url' || key === 'url') {
                clone[key] = redactUrl(value);
            } else if (key === 'cookies') {
                clone[key] = Object.fromEntries(Object.keys(value || {}).map(function(cookie) {
                    return [cookie, '••••'];
                }));
            } else if (key === 'auth' && value && typeof value === 'object') {
                clone[key] = Object.assign({}, value, { password: '••••' });
            } else if (key === 'headers' && value && typeof value === 'object') {
                clone[key] = Object.fromEntries(Object.keys(value).map(function(header) {
                    const headerValue = String(value[header]);
                    return [header, isSensitiveKey(header) || AUTH_VALUE.test(headerValue) ? '••••' : headerValue];
                }));
            } else if (value && typeof value === 'object') {
                clone[key] = redactNested(value);
            } else {
                clone[key] = value;
            }
        });
        return clone;
    }

    function redactNested(value) {
        if (Array.isArray(value)) return value.map(redactNested);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.keys(value).map(function(key) {
            return [key, isSensitiveKey(key) ? '••••' : redactNested(value[key])];
        }));
    }

    function appendResponseOutput(code) {
        if (!/\bresponse\s*=\s*(?:requests|session)\./.test(code)) return code;
        if (/print\(response\.text\)/.test(code)) return code;
        return code.replace(/\s*$/, '') + '\n\nresponse.raise_for_status()\nprint(response.text)\n';
    }

    function parseErrorMessage(error) {
        const raw = String(error && error.message || error || '');
        if (/command should begin with "curl"/i.test(raw)) return '命令必须以 curl 开头。';
        const unknownOption = raw.match(/\boption\s+(--?[A-Za-z0-9-]+)/i);
        if (unknownOption && /\bunknown\b/i.test(raw)) return '不支持的 cURL 参数：' + unknownOption[1] + '。';
        if (/Bash parsing error/i.test(raw)) return 'Bash 语法无法解析，请检查引号、换行与转义。';
        return '无法解析 cURL 命令，请检查命令结构与参数。';
    }

    function targetInfo(value) {
        const id = Object.prototype.hasOwnProperty.call(TARGETS, value) ? value : 'python';
        return TARGETS[id];
    }

    function adaptProtectionForTarget(protection, target) {
        if (target.id !== 'http' && target.id !== 'har') return protection;
        const used = new Set(protection.protectedEntries.map(function(entry) { return entry.envName; }));
        protection.protectedEntries.forEach(function(entry) {
            if (!entry.paths.includes('auth.password')) return;
            used.delete(entry.envName);
            let envName = 'BASIC_AUTH_BASE64';
            let suffix = 2;
            while (used.has(envName)) {
                envName = 'BASIC_AUTH_BASE64_' + suffix;
                suffix += 1;
            }
            used.add(envName);
            protection.command = protection.command.split('${' + entry.envName + '}').join('${' + envName + '}');
            entry.envName = envName;
            entry.basicAuthBase64 = true;
        });
        return protection;
    }

    function normalizeTargetOutput(code, target, protectedEntries) {
        let output = String(code);
        const warnings = [];
        if (target.id === 'http') {
            output = output.replace(/^(\S+\s+)\?/, '$1/?');
            if (protectedEntries.length) {
                output = output.replace(/^Content-Length:[^\r\n]*(?:\r?\n)/gmi, '');
            }
        }
        protectedEntries.filter(function(entry) {
            return entry.basicAuthBase64;
        }).forEach(function(entry) {
            const placeholder = '${' + entry.envName + '}';
            let replaced = false;
            if (target.id === 'http') {
                output = output.replace(/^(Authorization:\s+Basic\s+)\S+\s*$/gmi, function(_match, prefix) {
                    replaced = true;
                    return prefix + placeholder;
                });
            } else if (target.id === 'har') {
                const document = JSON.parse(output);
                const requestEntries = document && document.log && document.log.entries || [];
                requestEntries.forEach(function(requestEntry) {
                    const headers = requestEntry && requestEntry.request && requestEntry.request.headers || [];
                    headers.forEach(function(header) {
                        if (String(header.name).toLowerCase() !== 'authorization' || !/^Basic\s+/i.test(String(header.value))) return;
                        header.value = 'Basic ' + placeholder;
                        replaced = true;
                    });
                });
                output = JSON.stringify(document, null, 4) + '\n';
            }
            if (!replaced) {
                throw new Error(target.label + ' 无法安全表达 Basic Auth 环境变量。');
            }
            warnings.push({
                level: 'warning',
                code: 'basic-auth-placeholder',
                message: entry.envName + ' 需要设置为 base64(username:password) 的完整值，而不是仅设置密码。'
            });
        });
        return { code: output, warnings: warnings };
    }

    async function convert(command, library, rawOptions) {
        const input = String(command || '');
        const options = Object.assign({
            secretPolicy: 'environment',
            appendResponseOutput: true,
            target: 'python'
        }, rawOptions || {});
        const target = targetInfo(options.target);
        if (!input.trim()) {
            return {
                ok: false,
                code: '',
                summary: null,
                warnings: [{ level: 'error', code: 'empty-input', message: '请先粘贴一条 cURL 命令。' }]
            };
        }
        if (!library || typeof library[target.generator] !== 'function' || typeof library.toJsonObjectWarn !== 'function') {
            return {
                ok: false,
                code: '',
                summary: null,
                warnings: [{ level: 'error', code: 'library', message: 'cURL 解析器尚未加载完成。' }]
            };
        }

        try {
            const summaryResult = library.toJsonObjectWarn(input, []);
            const summary = summaryResult[0] || {};
            const detectedSecrets = collectSecrets(summary);
            let protection = { command: input, protectedEntries: [], missedEntries: [] };

            if (options.secretPolicy === 'environment') {
                protection = protectCommand(input, summary);
                if (protection.missedEntries.length) {
                    return {
                        ok: false,
                        code: '',
                        summary: redactSummary(summary),
                        warnings: protection.missedEntries.map(function(entry) {
                            return {
                                level: 'error',
                                code: 'secret-not-rewritten',
                                message: entry.path + ' 疑似敏感，但无法在原命令中安全定位；为避免泄露，已阻止生成。'
                            };
                        }),
                        protectedEntries: protection.protectedEntries,
                        detectedSecretCount: detectedSecrets.length,
                        target: target.id
                    };
                }
                protection = adaptProtectionForTarget(protection, target);
            }

            const generatedResult = library[target.generator](protection.command, []);
            const normalized = normalizeTargetOutput(generatedResult[0], target, protection.protectedEntries);
            let code = normalized.code;
            let warnings = normalizeWarnings((generatedResult[1] || []).concat(summaryResult[1] || []))
                .concat(normalized.warnings);

            if (options.secretPolicy === 'environment') {
                if (protection.protectedEntries.length) {
                    warnings.push({
                        level: 'info',
                        code: 'secrets-protected',
                        message: '已将 ' + protection.protectedEntries.length + ' 处敏感值改为环境变量。'
                    });
                }
                protection.protectedEntries.filter(function(entry) { return entry.encoded; }).forEach(function(entry) {
                    warnings.push({
                        level: 'warning',
                        code: 'encoded-secret',
                        message: entry.path + ' 原值来自 URL 编码；代码型目标会重新编码，HTTP/HAR 模板替换时请保持等价编码。'
                    });
                });
            } else if (detectedSecrets.length) {
                warnings.push({
                    level: 'warning',
                    code: 'secret-literal',
                    message: '生成代码保留了 ' + detectedSecrets.length + ' 处疑似密钥或凭据字面量。'
                });
            }
            if (summary.insecure === false) {
                warnings.push({
                    level: 'warning',
                    code: 'tls-disabled',
                    message: '原命令使用了 --insecure，生成代码会关闭 TLS 证书校验。'
                });
            }
            if (options.appendResponseOutput && target.responseOutput) code = appendResponseOutput(code);
            warnings = redactWarningSecrets(warnings, detectedSecrets);

            return {
                ok: true,
                code: code,
                summary: redactSummary(summary),
                warnings: uniqueWarnings(warnings),
                protectedEntries: protection.protectedEntries,
                detectedSecretCount: detectedSecrets.length,
                target: target.id,
                targetInfo: target
            };
        } catch (error) {
            return {
                ok: false,
                code: '',
                summary: null,
                warnings: [{
                    level: 'error',
                    code: 'curl-parse',
                    message: parseErrorMessage(error)
                }]
            };
        }
    }

    function outputFilename(target) {
        return targetInfo(target).filename;
    }

    return Object.freeze({
        TARGETS: TARGETS,
        appendResponseOutput: appendResponseOutput,
        collectSecrets: collectSecrets,
        convert: convert,
        isSensitiveKey: isSensitiveKey,
        outputFilename: outputFilename,
        protectCommand: protectCommand,
        protectPython: protectPython,
        redactSummary: redactSummary,
        targetInfo: targetInfo
    });
});
