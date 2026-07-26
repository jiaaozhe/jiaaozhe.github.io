(function(root, factory) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        module.exports = factory;
    } else {
        root.DeveloperSchemaCore = factory(root.DeveloperSchemaLibrary);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(library) {
    'use strict';

    const AGGREGATE_KEYWORDS = new Set([
        'allOf',
        'anyOf',
        'contains',
        'dependentSchemas',
        'if',
        'items',
        'oneOf',
        'patternProperties',
        'properties'
    ]);
    const KEYWORD_LABELS = Object.freeze({
        additionalProperties: '额外属性',
        const: '固定值',
        contains: '数组包含项',
        dependentRequired: '依赖字段',
        enum: '枚举值',
        exclusiveMaximum: '独占最大值',
        exclusiveMinimum: '独占最小值',
        format: '格式',
        maxItems: '数组长度上限',
        maxLength: '字符串长度上限',
        maxProperties: '属性数量上限',
        maximum: '最大值',
        minItems: '数组长度下限',
        minLength: '字符串长度下限',
        minProperties: '属性数量下限',
        minimum: '最小值',
        multipleOf: '数值倍数',
        pattern: '正则模式',
        required: '必填字段',
        type: '类型',
        uniqueItems: '数组唯一性'
    });

    function issue(level, code, message, details) {
        return Object.assign({
            level: level,
            code: code,
            message: message
        }, details || {});
    }

    function markSource(items, source) {
        return (items || []).map(function(item) {
            return Object.assign({}, item, { source: source });
        });
    }

    function parseSchema(text, configCore, filename) {
        const input = String(text || '');
        if (!input.trim()) {
            return {
                ok: false,
                issues: [issue('error', 'schema-empty', '请先粘贴或导入 JSON Schema。', { source: 'schema' })]
            };
        }
        const detection = configCore.detectFormat(input, filename || 'schema.json');
        const parsed = configCore.parseByFormat(input, detection.format);
        const errors = (parsed.issues || []).filter(function(item) { return item.level === 'error'; });
        if (!parsed.root || errors.length) {
            return {
                ok: false,
                format: detection.format,
                issues: errors.length
                    ? markSource(errors, 'schema')
                    : [issue('error', 'schema-parse', 'Schema 无法解析。', { source: 'schema' })]
            };
        }
        const converted = configCore.validationValue(parsed.root);
        const schema = converted.value;
        if (!(schema === true || schema === false || schema && typeof schema === 'object' && !Array.isArray(schema))) {
            return {
                ok: false,
                format: detection.format,
                issues: [issue('error', 'schema-root', 'JSON Schema 根节点必须是对象或布尔值。', { source: 'schema' })]
            };
        }
        if (schema && typeof schema.$schema === 'string' && !/2020-12/.test(schema.$schema)) {
            return {
                ok: false,
                format: detection.format,
                issues: [issue('error', 'schema-draft', '当前校验器固定使用 Draft 2020-12；该 Schema 声明了其他版本。', { source: 'schema' })]
            };
        }
        return {
            ok: true,
            format: detection.format,
            schema: schema,
            issues: markSource((parsed.issues || []).filter(function(item) {
                return item.level !== 'error';
            }), 'schema').concat(markSource(converted.issues, 'schema'))
        };
    }

    function externalReferences(schema) {
        const references = [];
        function visit(value, path) {
            if (!value || typeof value !== 'object') return;
            if (Array.isArray(value)) {
                value.forEach(function(item, index) { visit(item, path + '/' + index); });
                return;
            }
            ['$ref', '$dynamicRef'].forEach(function(keyword) {
                const reference = value[keyword];
                if (typeof reference === 'string' && !reference.startsWith('#')) {
                    references.push({ keyword: keyword, reference: reference, path: path + '/' + keyword });
                }
            });
            Object.keys(value).forEach(function(key) {
                visit(value[key], path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'));
            });
        }
        visit(schema, '#');
        return references;
    }

    function compactErrors(rawErrors) {
        const errors = rawErrors || [];
        return errors.filter(function(error, index) {
            if (error.keyword === 'false') {
                return !errors.some(function(candidate, candidateIndex) {
                    return candidateIndex !== index &&
                        candidate.keyword === 'additionalProperties' &&
                        error.instanceLocation.startsWith(candidate.instanceLocation);
                });
            }
            if (!AGGREGATE_KEYWORDS.has(error.keyword)) return true;
            return !errors.some(function(candidate, candidateIndex) {
                if (candidateIndex === index) return false;
                const sameOrDeeperInstance = candidate.instanceLocation === error.instanceLocation ||
                    candidate.instanceLocation.startsWith(error.instanceLocation + '/');
                const deeperKeyword = candidate.keywordLocation.startsWith(error.keywordLocation + '/');
                return sameOrDeeperInstance && deeperKeyword;
            });
        }).filter(function(error, index, list) {
            return list.findIndex(function(candidate) {
                return candidate.keyword === error.keyword &&
                    candidate.instanceLocation === error.instanceLocation &&
                    candidate.keywordLocation === error.keywordLocation &&
                    candidate.error === error.error;
            }) === index;
        });
    }

    function publicError(error) {
        const pointer = String(error.instanceLocation || '#').replace(/^#/, '');
        const keyword = String(error.keyword || 'schema');
        const label = KEYWORD_LABELS[keyword] || keyword;
        return issue('error', 'schema-' + keyword, label + '：' + String(error.error || '不符合 Schema。'), {
            path: pointer || '/',
            keyword: keyword,
            keywordPath: String(error.keywordLocation || '#'),
            source: 'instance'
        });
    }

    function validate(structure, schemaText, configCore, filename) {
        if (!library || typeof library.Validator !== 'function') {
            return {
                ok: false,
                valid: false,
                issues: [issue('error', 'schema-library', 'JSON Schema 校验器未正确加载。')]
            };
        }
        if (!structure) {
            return {
                ok: false,
                valid: false,
                issues: [issue('error', 'schema-instance', '请先提供一份可解析的配置。')]
            };
        }
        const parsedSchema = parseSchema(schemaText, configCore, filename);
        if (!parsedSchema.ok) {
            return {
                ok: false,
                valid: false,
                format: parsedSchema.format,
                issues: parsedSchema.issues
            };
        }
        const references = externalReferences(parsedSchema.schema);
        if (references.length) {
            return {
                ok: false,
                valid: false,
                format: parsedSchema.format,
                issues: references.slice(0, 20).map(function(reference) {
                    return issue(
                        'error',
                        'schema-external-ref',
                        '离线模式不读取外部引用：' + reference.reference,
                        { path: reference.path, source: 'schema' }
                    );
                })
            };
        }
        const instance = configCore.validationValue(structure);
        try {
            const validator = new library.Validator(parsedSchema.schema, '2020-12', false);
            const result = validator.validate(instance.value);
            const compacted = compactErrors(result.errors);
            const visible = compacted.slice(0, 100).map(publicError);
            if (compacted.length > visible.length) {
                visible.push(issue('warning', 'schema-truncated', '其余 ' + (compacted.length - visible.length) + ' 条错误已折叠。'));
            }
            return {
                ok: true,
                valid: Boolean(result.valid),
                format: parsedSchema.format,
                issues: (parsedSchema.issues || []).concat(markSource(instance.issues, 'instance')).concat(visible),
                errorCount: compacted.length
            };
        } catch (error) {
            return {
                ok: false,
                valid: false,
                format: parsedSchema.format,
                issues: [issue('error', 'schema-invalid', String(error && error.message || error || 'Schema 无法编译。'))]
            };
        }
    }

    return Object.freeze({
        compactErrors: compactErrors,
        externalReferences: externalReferences,
        parseSchema: parseSchema,
        validate: validate
    });
});
