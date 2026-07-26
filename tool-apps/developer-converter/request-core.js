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
                        if (typeof entry === 'string' && entry) {
                            output.push({ path: nextPath + '[' + index + ']', value: entry, baseName: prefix + '_' + envSegment(key) });
                        }
                    });
                } else if (typeof item === 'string' || typeof item === 'number') {
                    output.push({ path: nextPath, value: String(item), baseName: prefix + '_' + envSegment(key) });
                }
            } else if (item && typeof item === 'object') {
                collectNestedSecrets(item, nextPath, prefix, output);
            }
        });
    }

    function collectSecrets(summary) {
        const output = [];
        const headers = summary && summary.headers || {};
        Object.keys(headers).forEach(function(key) {
            const value = String(headers[key] === undefined ? '' : headers[key]);
            if (value && (isSensitiveKey(key) || AUTH_VALUE.test(value))) {
                output.push({ path: 'headers.' + key, value: value, baseName: envSegment(key) });
            }
        });

        const cookies = summary && summary.cookies || {};
        Object.keys(cookies).forEach(function(key) {
            const value = String(cookies[key] === undefined ? '' : cookies[key]);
            if (value) output.push({ path: 'cookies.' + key, value: value, baseName: 'COOKIE_' + envSegment(key) });
        });

        if (summary && summary.auth && summary.auth.password !== undefined) {
            output.push({
                path: 'auth.password',
                value: String(summary.auth.password),
                baseName: 'CURL_PASSWORD'
            });
        }
        collectNestedSecrets(summary && summary.queries, 'queries', 'QUERY', output);
        collectNestedSecrets(summary && summary.data, 'data', 'BODY', output);

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

    async function convert(command, library, rawOptions) {
        const input = String(command || '');
        const options = Object.assign({
            secretPolicy: 'environment',
            appendResponseOutput: true
        }, rawOptions || {});
        if (!input.trim()) {
            return {
                ok: false,
                code: '',
                summary: null,
                warnings: [{ level: 'error', code: 'empty-input', message: '请先粘贴一条 cURL 命令。' }]
            };
        }
        if (!library || typeof library.toPythonWarn !== 'function' || typeof library.toJsonObjectWarn !== 'function') {
            return {
                ok: false,
                code: '',
                summary: null,
                warnings: [{ level: 'error', code: 'library', message: 'cURL 解析器尚未加载完成。' }]
            };
        }

        try {
            const pythonResult = library.toPythonWarn(input, []);
            const summaryResult = library.toJsonObjectWarn(input, []);
            let code = pythonResult[0];
            const summary = summaryResult[0] || {};
            let warnings = normalizeWarnings((pythonResult[1] || []).concat(summaryResult[1] || []));
            const detectedSecrets = collectSecrets(summary);
            let protection = { code: code, protectedEntries: [], missedEntries: [] };

            if (options.secretPolicy === 'environment') {
                protection = protectPython(code, summary, library);
                code = protection.code;
                if (protection.protectedEntries.length) {
                    warnings.push({
                        level: 'info',
                        code: 'secrets-protected',
                        message: '已将 ' + protection.protectedEntries.length + ' 处敏感值改为环境变量。'
                    });
                }
                protection.missedEntries.forEach(function(entry) {
                    warnings.push({
                        level: 'warning',
                        code: 'secret-not-rewritten',
                        message: entry.path + ' 疑似敏感，但无法安全定位生成代码中的字面量；请手动检查。'
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
            if (options.appendResponseOutput) code = appendResponseOutput(code);

            return {
                ok: true,
                code: code,
                summary: redactSummary(summary),
                warnings: uniqueWarnings(warnings),
                protectedEntries: protection.protectedEntries,
                detectedSecretCount: detectedSecrets.length
            };
        } catch (error) {
            return {
                ok: false,
                code: '',
                summary: null,
                warnings: [{
                    level: 'error',
                    code: 'curl-parse',
                    message: String(error && error.message || error || '无法解析 cURL 命令。').split(/\n\s*\n/)[0]
                }]
            };
        }
    }

    function outputFilename() {
        return 'request.py';
    }

    return Object.freeze({
        appendResponseOutput: appendResponseOutput,
        collectSecrets: collectSecrets,
        convert: convert,
        isSensitiveKey: isSensitiveKey,
        outputFilename: outputFilename,
        protectPython: protectPython,
        redactSummary: redactSummary
    });
});
