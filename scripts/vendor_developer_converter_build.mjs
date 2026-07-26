import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dependencyRoot = process.argv[2] ? path.resolve(process.argv[2]) : '';
const nodeModules = path.basename(dependencyRoot) === 'node_modules'
    ? dependencyRoot
    : path.join(dependencyRoot, 'node_modules');

if (!dependencyRoot || !path.isAbsolute(nodeModules)) {
    throw new Error('Usage: node scripts/vendor_developer_converter_build.mjs <dependency-root>');
}

const esbuildModule = await import(pathToFileURL(path.join(nodeModules, 'esbuild', 'lib', 'main.js')).href);
const treeSitterWasm = await readFile(path.join(nodeModules, 'web-tree-sitter', 'tree-sitter.wasm'));
const bashWasm = await readFile(path.join(nodeModules, 'curlconverter', 'dist', 'tree-sitter-bash.wasm'));
const treeSitterEntry = path.join(nodeModules, 'web-tree-sitter', 'tree-sitter.js');

const parserModule = [
    `import Parser from ${JSON.stringify(treeSitterEntry)};`,
    `const runtimeWasm = Uint8Array.from(atob(${JSON.stringify(treeSitterWasm.toString('base64'))}), (char) => char.charCodeAt(0));`,
    `const bashWasm = Uint8Array.from(atob(${JSON.stringify(bashWasm.toString('base64'))}), (char) => char.charCodeAt(0));`,
    'let parser = null;',
    'globalThis.__DEVELOPER_CURL_PARSER_READY__ = (async () => {',
    '    await Parser.init({ wasmBinary: runtimeWasm });',
    '    const Bash = await Parser.Language.load(bashWasm);',
    '    parser = new Parser();',
    '    parser.setLanguage(Bash);',
    '})();',
    'export default {',
    '    parse(...args) {',
    "        if (!parser) throw new Error('Bash parser is not ready.');",
    '        return parser.parse(...args);',
    '    }',
    '};'
].join('\n');

const embeddedParserPlugin = {
    name: 'embedded-curlconverter-parser',
    setup(build) {
        build.onResolve({ filter: /(?:Parser|webParser)\.js$/ }, (args) => {
            const resolved = path.resolve(args.resolveDir, args.path);
            const shellDirectory = path.join('curlconverter', 'dist', 'src', 'shell');
            if (!resolved.includes(shellDirectory)) return null;
            return { path: 'embedded-web-parser', namespace: 'developer-converter' };
        });
        build.onLoad({ filter: /.*/, namespace: 'developer-converter' }, () => ({
            contents: parserModule,
            loader: 'js',
            resolveDir: repositoryRoot
        }));
    }
};

const shared = {
    absWorkingDir: repositoryRoot,
    bundle: true,
    format: 'iife',
    legalComments: 'none',
    minify: true,
    nodePaths: [nodeModules],
    platform: 'browser',
    external: ['fs', 'path'],
    target: ['es2020']
};

await esbuildModule.build({
    ...shared,
    entryPoints: ['scripts/vendor_developer_converter_curl.mjs'],
    globalName: 'DeveloperCurlConverter',
    outfile: 'tool-apps/developer-converter/vendor/curlconverter.js',
    plugins: [embeddedParserPlugin]
});

await esbuildModule.build({
    ...shared,
    entryPoints: ['scripts/vendor_developer_converter_schema.mjs'],
    globalName: 'DeveloperSchemaLibrary',
    outfile: 'tool-apps/developer-converter/vendor/json-schema.js'
});

console.log('Built developer converter cURL and JSON Schema browser bundles.');
