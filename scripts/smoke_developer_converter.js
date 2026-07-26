const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const vm = require('node:vm');

function browserContext() {
    const context = vm.createContext({
        console: console,
        TextEncoder: TextEncoder,
        TextDecoder: TextDecoder,
        URL: URL,
        URLSearchParams: URLSearchParams
    });
    context.globalThis = context;
    context.window = context;
    context.self = context;
    vm.runInContext(
        fs.readFileSync('tool-apps/developer-converter/vendor/config-libs.js', 'utf8'),
        context,
        { filename: 'config-libs.js' }
    );
    vm.runInContext(
        fs.readFileSync('tool-apps/developer-converter/converter-core.js', 'utf8'),
        context,
        { filename: 'converter-core.js' }
    );
    vm.runInContext(
        fs.readFileSync('tool-apps/developer-converter/vendor/json-schema.js', 'utf8'),
        context,
        { filename: 'json-schema.js' }
    );
    vm.runInContext(
        fs.readFileSync('tool-apps/developer-converter/schema-core.js', 'utf8'),
        context,
        { filename: 'schema-core.js' }
    );
    return context;
}

function testConfigConversions() {
    const runtime = browserContext();
    const core = runtime.DeveloperConverterCore;
    const fixtures = {
        json: '{"name":"demo","count":2,"items":[true,3.5]}',
        yaml: 'name: demo\ncount: 2\nitems: [true, 3.5]\n',
        toml: 'name = "demo"\ncount = 2\nitems = [ true, 3.5 ]\n'
    };
    for (const source of ['json', 'yaml', 'toml']) {
        for (const target of ['json', 'yaml', 'toml']) {
            if (source === target) continue;
            const result = core.convert(fixtures[source], { source: source, target: target, mode: 'safe' });
            assert.equal(result.ok, true, source + ' should convert to ' + target);
            assert.equal(result.verification.passed, true, source + ' should round-trip through ' + target);
        }
    }

    const jsonToYaml = core.convert(
        '{"service":"photo","big":9007199254740993,"ratio":1.0,"enabled":true}',
        { source: 'json', target: 'yaml', mode: 'safe' }
    );
    assert.equal(jsonToYaml.ok, true);
    assert.match(jsonToYaml.output, /big: 9007199254740993/);
    assert.match(jsonToYaml.output, /ratio: 1\.0/);
    assert.equal(jsonToYaml.verification.passed, true);

    const yamlToToml = core.convert(
        'service: photo\nretry:\n  attempts: 3\n  backoff: 1.5\nregions: [cn, eu]\n',
        { source: 'yaml', target: 'toml', mode: 'safe' }
    );
    assert.equal(yamlToToml.ok, true);
    assert.match(yamlToToml.output, /service = "photo"/);
    assert.match(yamlToToml.output, /\[retry\]/);
    assert.equal(yamlToToml.verification.passed, true);

    const tomlToYaml = core.convert(
        'name = "demo"\nbig = 9007199254740993\nvalues = [ 1, 2.5 ]\n',
        { source: 'toml', target: 'yaml', mode: 'safe' }
    );
    assert.equal(tomlToYaml.ok, true);
    assert.match(tomlToYaml.output, /9007199254740993/);

    const sorted = core.convert(
        '{"z":1,"a":{"z":2,"a":3}}',
        { source: 'json', target: 'json', mode: 'safe', sortKeys: true }
    );
    assert.equal(sorted.ok, true);
    assert.ok(sorted.output.indexOf('"a"') < sorted.output.indexOf('"z"'));

    const minified = core.convert(
        'a: 1\nb: true\n',
        { source: 'yaml', target: 'json', mode: 'safe', minify: true }
    );
    assert.equal(minified.output, '{"a":1,"b":true}');
}

function testLossGuardsAndDiagnostics() {
    const core = browserContext().DeveloperConverterCore;
    const commentBlocked = core.convert(
        '# private note\na: 1\n',
        { source: 'yaml', target: 'json', mode: 'safe' }
    );
    assert.equal(commentBlocked.ok, false);
    assert.equal(commentBlocked.blocked, true);
    assert.equal(commentBlocked.issues.some((item) => item.code === 'yaml-comments' && item.level === 'error'), true);

    const commentPractical = core.convert(
        '# private note\na: 1\n',
        { source: 'yaml', target: 'json', mode: 'practical' }
    );
    assert.equal(commentPractical.ok, true);
    assert.equal(commentPractical.issues.some((item) => item.code === 'yaml-comments' && item.level === 'warning'), true);

    const dateBlocked = core.convert(
        'created = 2026-07-26T12:30:00Z\n',
        { source: 'toml', target: 'json', mode: 'safe' }
    );
    assert.equal(dateBlocked.blocked, true);
    assert.equal(dateBlocked.issues.some((item) => item.code === 'datetime-to-string'), true);

    const nullBlocked = core.convert(
        '{"name":null}',
        { source: 'json', target: 'toml', mode: 'safe' }
    );
    assert.equal(nullBlocked.blocked, true);
    const nullPractical = core.convert(
        '{"name":null}',
        { source: 'json', target: 'toml', mode: 'practical' }
    );
    assert.equal(nullPractical.ok, true);
    assert.match(nullPractical.output, /name = "null"/);

    const preciseFloat = core.convert(
        '{"measurement":0.123456789012345678901}',
        { source: 'json', target: 'toml', mode: 'safe' }
    );
    assert.equal(preciseFloat.blocked, true);
    assert.equal(preciseFloat.issues.some((item) => item.code === 'float-precision'), true);
    const preciseJson = core.convert(
        'measurement: 0.123456789012345678901\n',
        { source: 'yaml', target: 'json', mode: 'safe' }
    );
    assert.equal(preciseJson.ok, true);
    assert.match(preciseJson.output, /0\.123456789012345678901/);

    const malformed = core.convert(
        '{\n  "a": 1,\n}',
        { source: 'json', target: 'yaml', mode: 'safe' }
    );
    assert.equal(malformed.ok, false);
    assert.equal(malformed.issues[0].level, 'error');
    assert.ok(malformed.issues[0].line);

    assert.equal(core.detectFormat('a = 1\n[server]\nport = 8080\n').format, 'toml');
    assert.equal(core.detectFormat('{"a":1}').format, 'json');
    assert.equal(core.detectFormat('a: 1\nb: true\n').format, 'yaml');
}

function testStructureQueries() {
    const core = browserContext().DeveloperConverterCore;
    const converted = core.convert(
        '{"server":{"name":"primary","ports":[8080,8081]},"services":[{"name":"photos"},{"name":"search"}],"a/b":{"~key":true},"large":9007199254740993}',
        { source: 'json', target: 'yaml', mode: 'safe' }
    );
    assert.equal(converted.ok, true);
    assert.ok(converted.structure);

    const pointer = core.queryStructure(converted.structure, '/server/ports/1');
    assert.equal(pointer.ok, true);
    assert.equal(pointer.results[0].path, '$.server.ports[1]');
    assert.equal(pointer.results[0].value, '8081');

    const fragment = core.queryStructure(converted.structure, '#/a~1b/~0key');
    assert.equal(fragment.ok, true);
    assert.equal(fragment.results[0].value, 'true');

    const recursive = core.queryStructure(converted.structure, '$..name');
    assert.equal(recursive.ok, true);
    assert.deepEqual(Array.from(recursive.results, (item) => item.preview), ['"primary"', '"photos"', '"search"']);

    const wildcard = core.queryStructure(converted.structure, '$.server.ports[*]');
    assert.equal(wildcard.results.length, 2);
    assert.equal(wildcard.results[0].type, 'integer');

    const blockedFilter = core.queryStructure(converted.structure, '$.services[?(@.name)]');
    assert.equal(blockedFilter.ok, false);
    assert.match(blockedFilter.error, /不会执行|仅支持/);

    const broadInput = {
        groups: Array.from({ length: 250 }, (_item, index) => index === 249 ? { wanted: 'last' } : { other: index })
    };
    const broad = core.convert(
        JSON.stringify(broadInput),
        { source: 'json', target: 'yaml', mode: 'safe' }
    );
    const lateMatch = core.queryStructure(broad.structure, '$.groups[*].wanted');
    assert.equal(lateMatch.ok, true);
    assert.equal(lateMatch.results.length, 1);
    assert.equal(lateMatch.results[0].preview, '"last"');
    const capped = core.queryStructure(broad.structure, '$.groups[*]');
    assert.equal(capped.results.length, 200);
    assert.equal(capped.truncated, true);

    const largeValue = core.convert(
        JSON.stringify({ payload: 'x'.repeat(30000) }),
        { source: 'json', target: 'yaml', mode: 'safe' }
    );
    const largePreview = core.queryStructure(largeValue.structure, '$.payload');
    assert.equal(largePreview.results[0].valueTruncated, true);
    assert.ok(largePreview.results[0].value.length <= 12000);

    const validation = core.validationValue(converted.structure);
    assert.equal(validation.value.server.name, 'primary');
    assert.equal(validation.issues.some((item) => item.code === 'schema-integer-precision' && item.path === '/large'), true);
}

function testSchemaValidation() {
    const runtime = browserContext();
    const configCore = runtime.DeveloperConverterCore;
    const schemaCore = runtime.DeveloperSchemaCore;
    const schema = JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: ['service', 'retry'],
        properties: {
            service: { type: 'string', minLength: 2 },
            retry: {
                $ref: '#/$defs/retry'
            }
        },
        $defs: {
            retry: {
                type: 'object',
                required: ['attempts'],
                properties: {
                    attempts: { type: 'integer', minimum: 0 }
                },
                additionalProperties: false
            }
        },
        additionalProperties: false
    });
    const validConfig = configCore.convert(
        '{"service":"photos","retry":{"attempts":3}}',
        { source: 'json', target: 'yaml', mode: 'safe' }
    );
    const valid = schemaCore.validate(validConfig.structure, schema, configCore, 'service.schema.json');
    assert.equal(valid.ok, true);
    assert.equal(valid.valid, true);
    assert.equal(valid.errorCount, 0);

    const invalidConfig = configCore.convert(
        '{"service":1,"retry":{"attempts":-1,"extra":true}}',
        { source: 'json', target: 'yaml', mode: 'safe' }
    );
    const invalid = schemaCore.validate(invalidConfig.structure, schema, configCore, 'service.schema.json');
    assert.equal(invalid.ok, true);
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errorCount >= 3);
    assert.equal(invalid.issues.some((item) => item.level === 'error' && item.path === '/service'), true);
    assert.equal(invalid.issues.some((item) => item.level === 'error' && item.path === '/retry/attempts'), true);
    assert.equal(invalid.issues.filter((item) => item.level === 'error').every((item) => item.source === 'instance'), true);

    const yamlSchema = [
        '$schema: https://json-schema.org/draft/2020-12/schema',
        'type: object',
        'required: [service]',
        'properties:',
        '  service:',
        '    type: string',
        ''
    ].join('\n');
    const parsedYaml = schemaCore.parseSchema(yamlSchema, configCore, 'service.schema.yaml');
    assert.equal(parsedYaml.ok, true);
    assert.equal(parsedYaml.format, 'yaml');

    const external = schemaCore.validate(
        validConfig.structure,
        '{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"https://example.com/schema.json"}',
        configCore,
        'external.schema.json'
    );
    assert.equal(external.ok, false);
    assert.equal(external.issues[0].code, 'schema-external-ref');
    assert.equal(external.issues[0].source, 'schema');

    const wrongDraft = schemaCore.parseSchema(
        '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object"}',
        configCore,
        'draft7.json'
    );
    assert.equal(wrongDraft.ok, false);
    assert.equal(wrongDraft.issues[0].code, 'schema-draft');
}

function testRequestPrivacyCore() {
    const core = require('../tool-apps/developer-converter/request-core.js');
    const summary = {
        method: 'post',
        raw_url: 'https://api.example.com/items?access_token=query-secret',
        headers: {
            Authorization: 'Bearer header-secret',
            'Content-Type': 'application/json'
        },
        cookies: { session_id: 'cookie-secret' },
        queries: { access_token: 'query-secret' },
        data: { client_secret: 'body-secret', public: 'visible' }
    };
    const source = [
        'import requests',
        '',
        "headers = {'Authorization': 'Bearer header-secret', 'Content-Type': 'application/json'}",
        "cookies = {'session_id': 'cookie-secret'}",
        "params = {'access_token': 'query-secret'}",
        "json_data = {'client_secret': 'body-secret', 'public': 'visible'}",
        "response = requests.post('https://api.example.com/items', params=params, cookies=cookies, headers=headers, json=json_data)",
        ''
    ].join('\n');
    const protectedCode = core.protectPython(source, summary, {
        reprStr(value, quote) {
            const delimiter = quote || "'";
            return delimiter + value.replaceAll('\\', '\\\\').replaceAll(delimiter, '\\' + delimiter) + delimiter;
        }
    });
    assert.equal(protectedCode.protectedEntries.length, 4);
    assert.match(protectedCode.code, /^import os/m);
    assert.match(protectedCode.code, /os\.environ\['AUTHORIZATION'\]/);
    assert.match(protectedCode.code, /os\.environ\['COOKIE_SESSION_ID'\]/);
    assert.doesNotMatch(protectedCode.code, /header-secret|cookie-secret|query-secret|body-secret/);

    const redacted = core.redactSummary(summary);
    assert.equal(redacted.headers.Authorization, '••••');
    assert.equal(redacted.cookies.session_id, '••••');
    assert.equal(redacted.queries.access_token, '••••');
    assert.doesNotMatch(redacted.raw_url, /query-secret/);
    assert.match(core.appendResponseOutput(source), /response\.raise_for_status\(\)/);

    const shortSecret = core.protectCommand(
        "curl 'https://api.example.com' -H 'Authorization: x'",
        { headers: { Authorization: 'x' } }
    );
    assert.equal(shortSecret.protectedEntries.length, 0);
    assert.equal(shortSecret.missedEntries.length, 1);
}

async function testRealCurlBundle() {
    const context = vm.createContext({
        console: console,
        TextEncoder: TextEncoder,
        TextDecoder: TextDecoder,
        Uint8Array: Uint8Array,
        ArrayBuffer: ArrayBuffer,
        WebAssembly: WebAssembly,
        atob: atob,
        btoa: btoa,
        performance: performance,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout
    });
    context.globalThis = context;
    context.self = context;
    context.window = context;
    context.document = { currentScript: null };
    vm.runInContext(
        fs.readFileSync('tool-apps/developer-converter/vendor/curlconverter.js', 'utf8'),
        context,
        { filename: 'curlconverter.js' }
    );
    const library = context.DeveloperCurlConverter;
    await library.ready;
    ['toPythonWarn', 'toNodeWarn', 'toGoWarn', 'toHTTPWarn', 'toHarStringWarn', 'toJsonObjectWarn'].forEach((name) => {
        assert.equal(typeof library[name], 'function', name + ' should be exported');
    });

    const command = "curl 'https://api.example.com/v1/items?limit=2' -X POST -H 'Authorization: Bearer fake-token' -H 'Content-Type: application/json' --data-raw '{\"name\":\"demo\"}'";
    const [python, pythonWarnings] = library.toPythonWarn(command, []);
    const [summary] = library.toJsonObjectWarn(command, []);
    assert.match(python, /import requests/);
    assert.match(python, /requests\.post/);
    assert.equal(summary.method, 'post');
    assert.equal(summary.headers.Authorization, 'Bearer fake-token');
    assert.ok(Array.isArray(pythonWarnings));

    const requestCore = require('../tool-apps/developer-converter/request-core.js');
    const converted = await requestCore.convert(command, library, {
        secretPolicy: 'environment',
        appendResponseOutput: true,
        target: 'python'
    });
    assert.equal(converted.ok, true);
    assert.match(converted.code, /os\.getenv\('AUTHORIZATION'/);
    assert.doesNotMatch(converted.code, /fake-token/);
    assert.match(converted.code, /response\.raise_for_status\(\)/);
    assert.equal(converted.summary.headers.Authorization, '••••');
    const compiled = spawnSync('python3', ['-c', 'import sys; compile(sys.stdin.read(), "request.py", "exec")'], {
        input: converted.code,
        encoding: 'utf8'
    });
    assert.equal(compiled.status, 0, compiled.stderr);

    const targetPatterns = {
        python: /os\.getenv\('AUTHORIZATION'/,
        node: /process\.env\['AUTHORIZATION'\]/,
        go: /os\.Getenv\("AUTHORIZATION"\)/,
        http: /Authorization: \$\{AUTHORIZATION\}/,
        har: /"value": "\$\{AUTHORIZATION\}"/
    };
    for (const target of Object.keys(targetPatterns)) {
        const result = await requestCore.convert(command, library, {
            secretPolicy: 'environment',
            appendResponseOutput: true,
            target: target
        });
        assert.equal(result.ok, true, target + ' should convert');
        assert.equal(result.target, target);
        assert.match(result.code, targetPatterns[target]);
        assert.doesNotMatch(result.code, /fake-token/);
        assert.equal(result.protectedEntries[0].envName, 'AUTHORIZATION');
        assert.equal(requestCore.outputFilename(target), requestCore.TARGETS[target].filename);
        if (target !== 'python') assert.doesNotMatch(result.code, /response\.raise_for_status/);
        if (target === 'node') {
            const syntax = spawnSync(process.execPath, ['--check', '--input-type=module'], {
                input: result.code,
                encoding: 'utf8'
            });
            assert.equal(syntax.status, 0, syntax.stderr);
        }
        if (target === 'har') assert.equal(JSON.parse(result.code).log.version, '1.2');
    }

    const compoundCommand = "curl 'https://api.example.com/items?access_token=query-secret' -H 'Cookie: session_id=cookie-secret' -H 'Content-Type: application/json' --data-raw '{\"client_secret\":\"body-secret\",\"public\":\"visible\"}'";
    for (const target of Object.keys(requestCore.TARGETS)) {
        const result = await requestCore.convert(compoundCommand, library, {
            secretPolicy: 'environment',
            target: target
        });
        assert.equal(result.ok, true, target + ' should protect compound credentials');
        assert.deepEqual(
            result.protectedEntries.map((entry) => entry.envName).sort(),
            ['BODY_CLIENT_SECRET', 'COOKIE_SESSION_ID', 'QUERY_ACCESS_TOKEN']
        );
        assert.doesNotMatch(result.code, /query-secret|cookie-secret|body-secret/);
        assert.match(result.code, /BODY_CLIENT_SECRET/);
        assert.match(result.code, /QUERY_ACCESS_TOKEN/);
        assert.match(result.code, /COOKIE_SESSION_ID/);
        if (target === 'http') assert.doesNotMatch(result.code, /^Content-Length:/mi);
    }

    const parameterized = await requestCore.convert(
        'curl https://api.example.com -H "Authorization: Bearer $TOKEN"',
        library,
        { secretPolicy: 'environment', target: 'python' }
    );
    assert.equal(parameterized.ok, true);
    assert.equal(parameterized.detectedSecretCount, 0);
    assert.equal(parameterized.protectedEntries.length, 0);
    assert.match(parameterized.code, /os\.getenv\('TOKEN'/);

    const warningRedaction = await requestCore.convert(
        "curl 'https://api.example.com/{x}?access_token=top-secret'",
        library,
        { secretPolicy: 'environment', target: 'python' }
    );
    assert.equal(warningRedaction.ok, true);
    assert.doesNotMatch(warningRedaction.code, /top-secret/);
    assert.doesNotMatch(JSON.stringify(warningRedaction.warnings), /top-secret/);
    assert.match(JSON.stringify(warningRedaction.warnings), /••••/);

    const malformedSecret = await requestCore.convert(
        "curl https://api.example.com -H 'Authorization: Bearer top-secret",
        library,
        { secretPolicy: 'environment', target: 'python' }
    );
    assert.equal(malformedSecret.ok, false);
    assert.doesNotMatch(JSON.stringify(malformedSecret.warnings), /top-secret/);
    assert.match(malformedSecret.warnings[0].message, /Bash 语法/);

    const encodedQuery = await requestCore.convert(
        "curl 'https://api.example.com?access_token=space+token'",
        library,
        { secretPolicy: 'environment', target: 'http' }
    );
    assert.equal(encodedQuery.ok, true);
    assert.match(encodedQuery.code, /^GET \/\?access_token=\$\{QUERY_ACCESS_TOKEN\} HTTP\/1\.1/m);
    assert.doesNotMatch(encodedQuery.code, /space\+token/);
    assert.equal(encodedQuery.warnings.some((item) => item.code === 'encoded-secret'), true);

    const basicCommand = "curl 'https://user:password-secret@api.example.com/path'";
    for (const target of ['http', 'har']) {
        const result = await requestCore.convert(basicCommand, library, {
            secretPolicy: 'environment',
            target: target
        });
        assert.equal(result.ok, true);
        assert.equal(result.protectedEntries[0].envName, 'BASIC_AUTH_BASE64');
        assert.match(result.code, /Basic \$\{BASIC_AUTH_BASE64\}/);
        assert.doesNotMatch(result.code, /password-secret/);
        assert.equal(result.warnings.some((item) => item.code === 'basic-auth-placeholder'), true);
    }
}

function testRuntimeSurface() {
    const html = fs.readFileSync('tool-apps/developer-converter/index.html', 'utf8');
    const app = fs.readFileSync('tool-apps/developer-converter/app.js', 'utf8');
    const css = fs.readFileSync('tool-apps/developer-converter/app.css', 'utf8');
    const curlBundle = fs.readFileSync('tool-apps/developer-converter/vendor/curlconverter.js', 'utf8');
    const schemaBundle = fs.readFileSync('tool-apps/developer-converter/vendor/json-schema.js', 'utf8');

    assert.match(html, /script-src 'self' 'wasm-unsafe-eval'/);
    assert.match(html, /connect-src 'none'/);
    assert.match(html, /tool-runtime\.js/);
    assert.match(html, /vendor\/config-libs\.js/);
    assert.match(html, /vendor\/json-schema\.js/);
    assert.match(html, /schema-core\.js/);
    assert.match(html, /request-core\.js/);
    assert.match(html, /data-config-lab="structure"/);
    assert.match(html, /data-config-lab="schema"/);
    assert.match(html, /data-request-target/);
    assert.doesNotMatch(html, /localStorage/);
    assert.doesNotMatch(app, /localStorage/);
    assert.doesNotMatch(app, /innerHTML/);
    assert.match(app, /script\.src = 'vendor\/curlconverter\.js'/);
    assert.match(app, /storage\.getItem\(PREFERENCES_KEY/);
    assert.match(app, /toolStorage\.setItem\(PREFERENCES_KEY/);
    assert.doesNotMatch(app, /toolStorage\.setItem\([^)]*(?:configInput|requestInput|configOutput|requestOutput|curl|secret)/i);
    assert.match(app, /navigator\.clipboard/);
    assert.match(app, /URL\.createObjectURL/);
    assert.match(css, /@media \(max-width: 860px\)/);
    assert.match(css, /prefers-reduced-motion/);
    assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
    assert.match(curlBundle, /DeveloperCurlConverter/);
    assert.match(curlBundle, /AGFzbQ/);
    assert.match(schemaBundle, /DeveloperSchemaLibrary/);
    assert.doesNotMatch(schemaBundle, /new Function|\beval\(/);

    const selectors = [...app.matchAll(/(?:one|all)\('(\[data-[^']+\])'/g)].map(function(match) {
        return match[1].slice(1, -1).split('=')[0];
    });
    new Set(selectors).forEach(function(attribute) {
        assert.match(html, new RegExp('\\b' + attribute + '\\b'), 'missing app element for ' + attribute);
    });
}

async function main() {
    testConfigConversions();
    testLossGuardsAndDiagnostics();
    testStructureQueries();
    testSchemaValidation();
    testRequestPrivacyCore();
    await testRealCurlBundle();
    testRuntimeSurface();
    console.log('Validated config round-trips, structure queries, JSON Schema, five cURL targets, credential protection, and the offline runtime surface.');
}

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
