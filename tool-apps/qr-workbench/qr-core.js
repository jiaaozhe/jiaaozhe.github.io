(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.QRWorkbenchCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const PAYLOAD_TYPES = ['text', 'url', 'wifi', 'vcard', 'email', 'phone'];
    const ERROR_LEVELS = ['L', 'M', 'Q', 'H'];
    const OUTPUT_SIZES = [256, 512, 1024, 2048];
    const DEFAULT_SETTINGS = Object.freeze({
        dark: '#151814',
        light: '#ffffff',
        transparent: false,
        errorLevel: 'M',
        outputSize: 512,
        outputFormat: 'png',
        moduleStyle: 'square',
        margin: 4
    });

    const TYPE_LABELS = Object.freeze({
        text: '纯文本',
        url: '网址',
        wifi: 'Wi-Fi',
        vcard: '联系人',
        email: '邮件',
        phone: '电话'
    });

    function string(value) {
        return value == null ? '' : String(value);
    }

    function trim(value) {
        return string(value).trim();
    }

    function normalizeHex(value, fallback) {
        const candidate = trim(value).toLowerCase();
        return /^#[0-9a-f]{6}$/.test(candidate) ? candidate : fallback;
    }

    function normalizeSettings(value) {
        const input = value && typeof value === 'object' ? value : {};
        return {
            dark: normalizeHex(input.dark, DEFAULT_SETTINGS.dark),
            light: normalizeHex(input.light, DEFAULT_SETTINGS.light),
            transparent: input.transparent === true,
            errorLevel: ERROR_LEVELS.includes(input.errorLevel) ? input.errorLevel : DEFAULT_SETTINGS.errorLevel,
            outputSize: OUTPUT_SIZES.includes(Number(input.outputSize)) ? Number(input.outputSize) : DEFAULT_SETTINGS.outputSize,
            outputFormat: input.outputFormat === 'svg' ? 'svg' : 'png',
            moduleStyle: input.moduleStyle === 'soft' ? 'soft' : 'square',
            margin: DEFAULT_SETTINGS.margin
        };
    }

    function normalizePreferences(value) {
        const input = value && typeof value === 'object' ? value : {};
        return {
            mode: input.mode === 'scan' ? 'scan' : 'generate',
            payloadType: PAYLOAD_TYPES.includes(input.payloadType) ? input.payloadType : 'url',
            settings: normalizeSettings(input.settings)
        };
    }

    function byteLength(value) {
        const text = string(value);
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
        return unescape(encodeURIComponent(text)).length;
    }

    function escapeWifi(value) {
        return string(value).replace(/[\\";,:]/g, function(character) {
            return '\\' + character;
        });
    }

    function unescapeValue(value) {
        let result = '';
        let escaped = false;
        string(value).split('').forEach(function(character) {
            if (escaped) {
                result += character;
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else {
                result += character;
            }
        });
        if (escaped) result += '\\';
        return result;
    }

    function splitEscaped(value, separator) {
        const parts = [];
        let current = '';
        let escaped = false;
        string(value).split('').forEach(function(character) {
            if (escaped) {
                current += '\\' + character;
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === separator) {
                parts.push(current);
                current = '';
            } else {
                current += character;
            }
        });
        if (escaped) current += '\\';
        parts.push(current);
        return parts;
    }

    function escapeVCard(value) {
        return string(value)
            .replace(/\\/g, '\\\\')
            .replace(/\r?\n/g, '\\n')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,');
    }

    function unescapeVCard(value) {
        return string(value)
            .replace(/\\n/gi, '\n')
            .replace(/\\([\\;,])/g, '$1');
    }

    function validEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function buildPayload(type, fields) {
        const selected = PAYLOAD_TYPES.includes(type) ? type : 'text';
        const input = fields && typeof fields === 'object' ? fields : {};
        let payload = '';
        let summary = '';

        if (selected === 'text') {
            payload = string(input.text);
            if (!payload.trim()) throw new Error('请输入要编码的文本。');
            summary = payload.trim().replace(/\s+/g, ' ').slice(0, 72);
        }

        if (selected === 'url') {
            payload = trim(input.url);
            if (!/^https?:\/\/[^\s]+$/i.test(payload)) throw new Error('请输入包含 http:// 或 https:// 的完整网址。');
            summary = payload;
        }

        if (selected === 'wifi') {
            const ssid = trim(input.ssid);
            const security = ['WPA', 'WEP', 'nopass'].includes(input.security) ? input.security : 'WPA';
            const password = string(input.password);
            if (!ssid) throw new Error('请输入 Wi-Fi 名称。');
            if (security !== 'nopass' && !password) throw new Error('请输入 Wi-Fi 密码，或选择无密码网络。');
            payload = 'WIFI:T:' + security + ';S:' + escapeWifi(ssid) + ';';
            if (security !== 'nopass') payload += 'P:' + escapeWifi(password) + ';';
            if (input.hidden === true) payload += 'H:true;';
            payload += ';';
            summary = ssid + ' · ' + (security === 'nopass' ? '开放网络' : security);
        }

        if (selected === 'vcard') {
            const name = trim(input.name);
            if (!name) throw new Error('请输入联系人姓名。');
            const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:;' + escapeVCard(name) + ';;;', 'FN:' + escapeVCard(name)];
            const mappings = [
                ['organization', 'ORG:'],
                ['title', 'TITLE:'],
                ['phone', 'TEL;TYPE=CELL:'],
                ['email', 'EMAIL;TYPE=INTERNET:'],
                ['url', 'URL:']
            ];
            mappings.forEach(function(mapping) {
                const value = trim(input[mapping[0]]);
                if (value) lines.push(mapping[1] + escapeVCard(value));
            });
            lines.push('END:VCARD');
            payload = lines.join('\r\n');
            summary = name + (trim(input.organization) ? ' · ' + trim(input.organization) : '');
        }

        if (selected === 'email') {
            const address = trim(input.address);
            if (!validEmail(address)) throw new Error('请输入有效的收件邮箱。');
            const params = [];
            if (trim(input.subject)) params.push('subject=' + encodeURIComponent(trim(input.subject)));
            if (string(input.body)) params.push('body=' + encodeURIComponent(string(input.body)));
            payload = 'mailto:' + address + (params.length ? '?' + params.join('&') : '');
            summary = address;
        }

        if (selected === 'phone') {
            const phone = trim(input.phone);
            if (!/[0-9]/.test(phone) || !/^[+0-9().\-\s]+$/.test(phone)) throw new Error('请输入有效的电话号码。');
            payload = 'tel:' + phone;
            summary = phone;
        }

        return {
            type: selected,
            label: TYPE_LABELS[selected],
            payload: payload,
            summary: summary,
            bytes: byteLength(payload)
        };
    }

    function parseWifi(raw) {
        const fields = { ssid: '', security: 'WPA', password: '', hidden: false };
        splitEscaped(raw.slice(5), ';').forEach(function(part) {
            if (!part) return;
            const divider = part.indexOf(':');
            if (divider < 0) return;
            const key = part.slice(0, divider);
            const value = unescapeValue(part.slice(divider + 1));
            if (key === 'S') fields.ssid = value;
            if (key === 'T') fields.security = ['WPA', 'WEP', 'nopass'].includes(value) ? value : 'WPA';
            if (key === 'P') fields.password = value;
            if (key === 'H') fields.hidden = value.toLowerCase() === 'true';
        });
        return fields;
    }

    function parseVCard(raw) {
        const fields = { name: '', organization: '', title: '', phone: '', email: '', url: '' };
        raw.replace(/\r\n[ \t]/g, '').split(/\r?\n/).forEach(function(line) {
            const divider = line.indexOf(':');
            if (divider < 0) return;
            const key = line.slice(0, divider).split(';')[0].toUpperCase();
            const value = unescapeVCard(line.slice(divider + 1));
            if (key === 'FN') fields.name = value;
            if (key === 'ORG') fields.organization = value;
            if (key === 'TITLE') fields.title = value;
            if (key === 'TEL' && !fields.phone) fields.phone = value;
            if (key === 'EMAIL' && !fields.email) fields.email = value;
            if (key === 'URL' && !fields.url) fields.url = value;
        });
        return fields;
    }

    function safeDecode(value) {
        try {
            return decodeURIComponent(string(value).replace(/\+/g, '%20'));
        } catch (error) {
            return string(value);
        }
    }

    function parsePayload(value) {
        const raw = string(value);
        let type = 'text';
        let fields = { text: raw };

        if (/^WIFI:/i.test(raw)) {
            type = 'wifi';
            fields = parseWifi(raw);
        } else if (/^BEGIN:VCARD\r?\n/i.test(raw)) {
            type = 'vcard';
            fields = parseVCard(raw);
        } else if (/^mailto:/i.test(raw)) {
            type = 'email';
            const body = raw.slice(7);
            const divider = body.indexOf('?');
            fields = { address: safeDecode(divider < 0 ? body : body.slice(0, divider)), subject: '', body: '' };
            const query = divider < 0 ? '' : body.slice(divider + 1);
            query.split('&').forEach(function(item) {
                const separator = item.indexOf('=');
                const key = safeDecode(separator < 0 ? item : item.slice(0, separator));
                const itemValue = safeDecode(separator < 0 ? '' : item.slice(separator + 1));
                if (key === 'subject') fields.subject = itemValue;
                if (key === 'body') fields.body = itemValue;
            });
        } else if (/^tel:/i.test(raw)) {
            type = 'phone';
            fields = { phone: raw.slice(4) };
        } else if (/^https?:\/\//i.test(raw)) {
            type = 'url';
            fields = { url: raw };
        }

        return {
            type: type,
            label: TYPE_LABELS[type],
            raw: raw,
            fields: fields,
            bytes: byteLength(raw)
        };
    }

    function hexRgb(value) {
        const normalized = normalizeHex(value, '#000000').slice(1);
        return [0, 2, 4].map(function(index) { return parseInt(normalized.slice(index, index + 2), 16); });
    }

    function luminance(value) {
        const rgb = hexRgb(value).map(function(channel) {
            const normalized = channel / 255;
            return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }

    function contrastRatio(dark, light) {
        const first = luminance(dark);
        const second = luminance(light);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }

    function outputPlan(symbolSize, requestedSize, margin) {
        const safeSymbol = Math.max(21, Math.round(Number(symbolSize) || 21));
        const safeMargin = Math.max(4, Math.round(Number(margin) || 4));
        const cells = safeSymbol + safeMargin * 2;
        const scale = Math.max(1, Math.ceil(Math.max(64, Number(requestedSize) || 512) / cells));
        return { cells: cells, scale: scale, size: cells * scale, modulePixels: scale, margin: safeMargin };
    }

    function reliability(settings, symbolSize, actualSize, selfTestPassed, payloadBytes) {
        const normalized = normalizeSettings(settings);
        const warnings = [];
        const ratio = contrastRatio(normalized.dark, normalized.light);
        const plan = outputPlan(symbolSize, actualSize, normalized.margin);
        if (normalized.transparent) warnings.push('透明背景依赖使用场景，打印前请再次确认。');
        if (luminance(normalized.dark) >= luminance(normalized.light)) warnings.push('前景色应当比背景色更深。');
        if (ratio < 3) warnings.push('前景与背景对比不足。');
        if (normalized.moduleStyle === 'soft') warnings.push('圆角模块比标准方形更依赖扫描环境。');
        if (plan.modulePixels < 4) warnings.push('每个模块的输出像素过少。');
        if (symbolSize > 57) warnings.push('内容较密集，建议提高输出尺寸。');
        if (Number(payloadBytes) > 1000) warnings.push('内容较长，二维码密度较高。');
        return {
            state: selfTestPassed === false ? 'error' : (warnings.length ? 'warning' : 'ok'),
            title: selfTestPassed === false ? '未通过自检' : (warnings.length ? '可识别，存在提示' : '回读验证通过'),
            warnings: warnings,
            contrast: ratio,
            modulePixels: plan.modulePixels
        };
    }

    function filename(type, extension, now) {
        const date = now instanceof Date ? now : new Date();
        const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('');
        const safeType = PAYLOAD_TYPES.includes(type) ? type : 'text';
        const safeExtension = extension === 'svg' ? 'svg' : 'png';
        return 'qr-' + safeType + '-' + stamp + '.' + safeExtension;
    }

    return {
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        PAYLOAD_TYPES: PAYLOAD_TYPES,
        TYPE_LABELS: TYPE_LABELS,
        buildPayload: buildPayload,
        byteLength: byteLength,
        contrastRatio: contrastRatio,
        escapeWifi: escapeWifi,
        filename: filename,
        normalizePreferences: normalizePreferences,
        normalizeSettings: normalizeSettings,
        outputPlan: outputPlan,
        parsePayload: parsePayload,
        reliability: reliability
    };
});
