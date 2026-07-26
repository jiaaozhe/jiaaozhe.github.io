(function(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.ImagePrivacy = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const GROUP_ORDER = ['location', 'identity', 'device', 'time', 'content', 'technical'];
    const GROUP_DEFINITIONS = Object.freeze({
        location: Object.freeze({ label: '位置', risk: 'high' }),
        identity: Object.freeze({ label: '身份与标识', risk: 'high' }),
        device: Object.freeze({ label: '设备', risk: 'medium' }),
        time: Object.freeze({ label: '时间', risk: 'medium' }),
        content: Object.freeze({ label: '描述与版权', risk: 'medium' }),
        technical: Object.freeze({ label: '拍摄参数', risk: 'low' })
    });

    const FRIENDLY_LABELS = Object.freeze({
        latitude: '纬度',
        longitude: '经度',
        GPSLatitude: 'GPS 纬度',
        GPSLongitude: 'GPS 经度',
        GPSAltitude: 'GPS 海拔',
        GPSDateStamp: 'GPS 日期',
        GPSTimeStamp: 'GPS 时间',
        GPSImgDirection: '拍摄方向',
        GPSDestBearing: '目标方向',
        GPSAreaInformation: 'GPS 区域',
        Make: '设备品牌',
        Model: '相机型号',
        LensMake: '镜头品牌',
        LensModel: '镜头型号',
        Software: '处理软件',
        HostComputer: '处理设备',
        BodySerialNumber: '机身序列号',
        CameraSerialNumber: '相机序列号',
        SerialNumber: '设备序列号',
        LensSerialNumber: '镜头序列号',
        ImageUniqueID: '图片唯一标识',
        OwnerName: '设备所有者',
        CameraOwnerName: '相机所有者',
        Artist: '作者',
        Author: '作者',
        Creator: '创作者',
        Credit: '署名',
        Byline: '署名',
        Copyright: '版权',
        Rights: '权利声明',
        DateTimeOriginal: '拍摄时间',
        CreateDate: '创建时间',
        ModifyDate: '修改时间',
        MetadataDate: '元数据时间',
        DateCreated: '内容创建时间',
        DigitalCreationDate: '数字化时间',
        ImageDescription: '图片描述',
        Description: '描述',
        UserComment: '用户注释',
        Comment: '注释',
        Caption: '说明文字',
        Headline: '标题',
        Title: '标题',
        Subject: '主题',
        Keywords: '关键词',
        Instructions: '编辑说明',
        Orientation: '方向',
        ExposureTime: '曝光时间',
        FNumber: '光圈',
        ISO: 'ISO',
        FocalLength: '焦距',
        FocalLengthIn35mmFormat: '35mm 等效焦距',
        ExposureProgram: '曝光程序',
        ExposureMode: '曝光模式',
        MeteringMode: '测光模式',
        Flash: '闪光灯',
        WhiteBalance: '白平衡',
        ColorSpace: '色彩空间',
        ImageWidth: '图像宽度',
        ImageHeight: '图像高度',
        ExifImageWidth: 'EXIF 宽度',
        ExifImageHeight: 'EXIF 高度',
        XResolution: '水平分辨率',
        YResolution: '垂直分辨率',
        ResolutionUnit: '分辨率单位'
    });

    const LOCATION_PATTERN = /(?:^gps|latitude|longitude|location|sublocation|city|country|province|state|address|altitude|geotag)/i;
    const IDENTITY_PATTERN = /(?:artist|author|creator|credit|byline|owner|serial|unique.?id|document.?id|instance.?id|email|phone|contact)/i;
    const DEVICE_PATTERN = /(?:^make$|^model$|lens|software|hostcomputer|camera|device|firmware)/i;
    const TIME_PATTERN = /(?:date|time|timestamp|created|modified)/i;
    const CONTENT_PATTERN = /(?:description|comment|caption|headline|title|subject|keyword|copyright|rights|instruction|rating|label)/i;
    const DUPLICATE_GPS_KEYS = new Set(['GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef']);

    function ascii(bytes, start, end) {
        let output = '';
        const limit = Math.min(bytes.length, end == null ? bytes.length : end);
        for (let index = Math.max(0, start || 0); index < limit; index += 1) {
            const value = bytes[index];
            output += value >= 32 && value <= 126 ? String.fromCharCode(value) : '\0';
        }
        return output;
    }

    function startsWithAscii(bytes, value) {
        if (!bytes || bytes.length < value.length) return false;
        for (let index = 0; index < value.length; index += 1) {
            if (bytes[index] !== value.charCodeAt(index)) return false;
        }
        return true;
    }

    function uint16be(bytes, offset) {
        return ((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0);
    }

    function uint32be(bytes, offset) {
        return (
            ((bytes[offset] || 0) * 0x1000000) +
            ((bytes[offset + 1] || 0) << 16) +
            ((bytes[offset + 2] || 0) << 8) +
            (bytes[offset + 3] || 0)
        ) >>> 0;
    }

    function uint32le(bytes, offset) {
        return (
            (bytes[offset] || 0) +
            ((bytes[offset + 1] || 0) << 8) +
            ((bytes[offset + 2] || 0) << 16) +
            ((bytes[offset + 3] || 0) * 0x1000000)
        ) >>> 0;
    }

    async function readBytes(blob, offset, length) {
        if (!blob || typeof blob.slice !== 'function' || length <= 0) return new Uint8Array();
        const safeOffset = Math.max(0, Math.min(blob.size, offset));
        const safeEnd = Math.max(safeOffset, Math.min(blob.size, safeOffset + length));
        return new Uint8Array(await blob.slice(safeOffset, safeEnd).arrayBuffer());
    }

    function carrier(kind, label, offset, size, detail) {
        return {
            kind: kind,
            label: label,
            offset: Math.max(0, Number(offset) || 0),
            size: Math.max(0, Number(size) || 0),
            detail: detail || ''
        };
    }

    async function scanJpeg(blob) {
        const signature = await readBytes(blob, 0, 2);
        if (signature[0] !== 0xff || signature[1] !== 0xd8) return [];
        const carriers = [];
        let offset = 2;
        let segments = 0;

        while (offset + 4 <= blob.size && segments < 1024) {
            const header = await readBytes(blob, offset, 4);
            if (header.length < 2 || header[0] !== 0xff) break;
            let marker = header[1];

            if (marker === 0xff) {
                offset += 1;
                continue;
            }
            if (marker === 0xd9 || marker === 0xda) break;
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
                offset += 2;
                continue;
            }
            if (header.length < 4) break;

            const segmentLength = uint16be(header, 2);
            if (segmentLength < 2 || offset + 2 + segmentLength > blob.size) break;
            const payloadOffset = offset + 4;
            const payloadSize = segmentLength - 2;
            const prefix = await readBytes(blob, payloadOffset, Math.min(payloadSize, 128));
            const prefixText = ascii(prefix);

            if (marker === 0xe1) {
                if (startsWithAscii(prefix, 'Exif\0\0')) {
                    carriers.push(carrier('exif', 'EXIF / GPS', offset, segmentLength + 2));
                } else if (prefixText.includes('http://ns.adobe.com/xap/1.0/')) {
                    carriers.push(carrier('xmp', 'XMP', offset, segmentLength + 2));
                } else {
                    carriers.push(carrier('app-metadata', 'APP1 应用元数据', offset, segmentLength + 2));
                }
            } else if (marker === 0xed) {
                carriers.push(carrier('iptc', 'IPTC / Photoshop', offset, segmentLength + 2));
            } else if (marker === 0xfe) {
                carriers.push(carrier(
                    'comment',
                    'JPEG 注释',
                    offset,
                    segmentLength + 2,
                    prefixText.replace(/\0/g, '').trim().slice(0, 160)
                ));
            } else if (marker === 0xec) {
                carriers.push(carrier('app-metadata', 'APP12 编辑器元数据', offset, segmentLength + 2));
            } else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) {
                carriers.push(carrier(
                    'app-metadata',
                    'APP' + (marker - 0xe0) + ' 应用元数据',
                    offset,
                    segmentLength + 2
                ));
            } else if (marker === 0xe2 && !startsWithAscii(prefix, 'ICC_PROFILE')) {
                carriers.push(carrier('app-metadata', 'APP2 应用元数据', offset, segmentLength + 2));
            }

            offset += 2 + segmentLength;
            segments += 1;
        }

        return carriers;
    }

    async function scanPng(blob) {
        const signature = await readBytes(blob, 0, 8);
        const expected = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        if (signature.length < 8 || expected.some(function(value, index) { return signature[index] !== value; })) {
            return [];
        }

        const carriers = [];
        let offset = 8;
        let chunks = 0;

        while (offset + 12 <= blob.size && chunks < 100000) {
            const header = await readBytes(blob, offset, 8);
            if (header.length < 8) break;
            const dataSize = uint32be(header, 0);
            const type = ascii(header, 4, 8);
            const totalSize = dataSize + 12;
            if (!/^[A-Za-z]{4}$/.test(type) || offset + totalSize > blob.size) break;

            if (type === 'eXIf') {
                carriers.push(carrier('exif', 'PNG EXIF / GPS', offset, totalSize));
            } else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
                const preview = await readBytes(blob, offset + 8, Math.min(dataSize, 256));
                const detail = ascii(preview).replace(/\0+/g, ' · ').trim().slice(0, 160);
                const isXmp = detail.includes('XML:com.adobe.xmp') || detail.includes('adobe:ns:meta');
                carriers.push(carrier(
                    isXmp ? 'xmp' : 'text',
                    isXmp ? 'PNG XMP' : 'PNG 文本元数据',
                    offset,
                    totalSize,
                    detail
                ));
            } else if (type === 'tIME') {
                carriers.push(carrier('timestamp', 'PNG 修改时间', offset, totalSize));
            }

            offset += totalSize;
            chunks += 1;
            if (type === 'IEND') break;
        }

        return carriers;
    }

    async function scanWebp(blob) {
        const signature = await readBytes(blob, 0, 12);
        if (
            signature.length < 12 ||
            !startsWithAscii(signature, 'RIFF') ||
            ascii(signature, 8, 12) !== 'WEBP'
        ) {
            return [];
        }

        const carriers = [];
        let offset = 12;
        let chunks = 0;

        while (offset + 8 <= blob.size && chunks < 100000) {
            const header = await readBytes(blob, offset, 8);
            if (header.length < 8) break;
            const type = ascii(header, 0, 4);
            const dataSize = uint32le(header, 4);
            const totalSize = 8 + dataSize + (dataSize % 2);
            if (!/^[\x20-\x7e]{4}$/.test(type) || offset + totalSize > blob.size) break;

            if (type === 'EXIF') {
                const item = carrier('exif', 'WebP EXIF / GPS', offset, totalSize);
                item.payloadOffset = offset + 8;
                item.payloadSize = dataSize;
                carriers.push(item);
            } else if (type === 'XMP ') {
                const item = carrier('xmp', 'WebP XMP', offset, totalSize);
                item.payloadOffset = offset + 8;
                item.payloadSize = dataSize;
                carriers.push(item);
            }

            offset += totalSize;
            chunks += 1;
        }

        return carriers;
    }

    async function scanMetadataCarriers(blob, mimeType) {
        const type = String(mimeType || (blob && blob.type) || '').toLowerCase();
        if (type === 'image/jpeg' || type === 'image/jpg') return scanJpeg(blob);
        if (type === 'image/png') return scanPng(blob);
        if (type === 'image/webp') return scanWebp(blob);

        const signature = await readBytes(blob, 0, 12);
        if (signature[0] === 0xff && signature[1] === 0xd8) return scanJpeg(blob);
        if (signature[0] === 0x89 && ascii(signature, 1, 4) === 'PNG') return scanPng(blob);
        if (startsWithAscii(signature, 'RIFF') && ascii(signature, 8, 12) === 'WEBP') return scanWebp(blob);
        return [];
    }

    function humanizeKey(key) {
        return String(key || '')
            .replace(/[_-]+/g, ' ')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .trim() || '未命名字段';
    }

    function isBinary(value) {
        return (
            value instanceof ArrayBuffer ||
            (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value))
        );
    }

    function dateValue(value) {
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
        const pad = function(part) { return String(part).padStart(2, '0'); };
        return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate()) + ' ' +
            pad(value.getHours()) + ':' + pad(value.getMinutes()) + ':' + pad(value.getSeconds());
    }

    function displayValue(value, key) {
        if (value == null) return '';
        if (value instanceof Date) return dateValue(value);
        if (isBinary(value)) return '二进制数据（' + (value.byteLength || 0) + ' B）';
        if (Array.isArray(value)) {
            return value.slice(0, 24).map(function(item) {
                return displayValue(item, key);
            }).filter(Boolean).join(', ').slice(0, 500);
        }
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value).slice(0, 500);
            } catch (error) {
                return String(value).slice(0, 500);
            }
        }
        if (typeof value === 'number' && /latitude|longitude/i.test(key)) {
            return value.toFixed(6);
        }
        const text = String(value).replace(/\s+/g, ' ').trim();
        return text.slice(0, 500);
    }

    function groupForKey(key) {
        if (LOCATION_PATTERN.test(key)) return 'location';
        if (IDENTITY_PATTERN.test(key)) return 'identity';
        if (DEVICE_PATTERN.test(key)) return 'device';
        if (TIME_PATTERN.test(key)) return 'time';
        if (CONTENT_PATTERN.test(key)) return 'content';
        return 'technical';
    }

    function metadataEntries(metadata) {
        const source = metadata && typeof metadata === 'object' ? metadata : {};
        const hasNormalizedLocation = Number.isFinite(Number(source.latitude)) && Number.isFinite(Number(source.longitude));

        return Object.keys(source).sort(function(left, right) {
            const leftGroup = GROUP_ORDER.indexOf(groupForKey(left));
            const rightGroup = GROUP_ORDER.indexOf(groupForKey(right));
            return leftGroup - rightGroup || left.localeCompare(right);
        }).map(function(key) {
            if (hasNormalizedLocation && DUPLICATE_GPS_KEYS.has(key)) return null;
            const value = displayValue(source[key], key);
            if (!value) return null;
            const group = groupForKey(key);
            return {
                key: key,
                label: FRIENDLY_LABELS[key] || humanizeKey(key),
                value: value,
                group: group,
                risk: GROUP_DEFINITIONS[group].risk
            };
        }).filter(Boolean);
    }

    function createReport(metadata, carriers, warnings) {
        const entries = metadataEntries(metadata);
        const groups = GROUP_ORDER.map(function(name) {
            const definition = GROUP_DEFINITIONS[name];
            return {
                name: name,
                label: definition.label,
                risk: definition.risk,
                entries: entries.filter(function(entry) { return entry.group === name; })
            };
        }).filter(function(group) { return group.entries.length > 0; });

        const hasHigh = entries.some(function(entry) { return entry.risk === 'high'; });
        const hasMedium = entries.some(function(entry) { return entry.risk === 'medium'; });
        const carrierList = Array.isArray(carriers) ? carriers : [];
        let risk = 'clean';
        if (hasHigh) risk = 'high';
        else if (hasMedium || carrierList.length) risk = 'medium';
        else if (entries.length) risk = 'low';

        const latitude = Number(metadata && metadata.latitude);
        const longitude = Number(metadata && metadata.longitude);
        const location = Number.isFinite(latitude) && Number.isFinite(longitude)
            ? { latitude: latitude, longitude: longitude }
            : null;

        return {
            risk: risk,
            entries: entries,
            groups: groups,
            carriers: carrierList,
            warnings: Array.isArray(warnings) ? warnings.filter(Boolean) : [],
            location: location,
            counts: {
                fields: entries.length,
                sensitive: entries.filter(function(entry) {
                    return entry.risk === 'high' || entry.risk === 'medium';
                }).length,
                carriers: carrierList.length
            }
        };
    }

    async function verifySanitized(blob, mimeType) {
        const carriers = await scanMetadataCarriers(blob, mimeType);
        return { clean: carriers.length === 0, carriers: carriers };
    }

    return Object.freeze({
        GROUP_DEFINITIONS: GROUP_DEFINITIONS,
        metadataEntries: metadataEntries,
        createReport: createReport,
        scanMetadataCarriers: scanMetadataCarriers,
        verifySanitized: verifySanitized
    });
});
