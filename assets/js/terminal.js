document.addEventListener('DOMContentLoaded', function() {
    const palette = document.getElementById('command-palette');
    const form = document.getElementById('command-form');
    const input = document.getElementById('command-input');
    const output = document.getElementById('command-output');
    const prompt = document.getElementById('command-prompt');
    const siteData = window.siteData;

    if (!palette || !form || !input || !output || !prompt || !siteData) {
        return;
    }

    const cwdStorageKey = 'terminal.cwd';
    const historyStorageKey = 'terminal.history';
    const historyLimit = 80;
    const rawCache = {};
    const textEncoder = window.TextEncoder ? new TextEncoder() : null;
    let commandHistory = readHistory();
    let historyIndex = commandHistory.length;
    let lessState = null;
    let manifestReady = false;
    let manifestError = null;
    let shortcutRoutes = {};

    function slugFromUrl(url) {
        return url.split('/').filter(Boolean).pop() || 'home';
    }

    function createDir(name, route, title) {
        return {
            type: 'dir',
            name: name,
            route: route || '',
            title: title || name,
            children: {},
            aliases: {}
        };
    }

    function byteLength(value) {
        const text = String(value || '');

        if (textEncoder) {
            return textEncoder.encode(text).length;
        }

        return unescape(encodeURIComponent(text)).length;
    }

    function createFile(name, route, title, content, meta) {
        const details = meta || {};

        return {
            type: 'file',
            name: name,
            displayName: details.displayName || name,
            route: route || '',
            title: title || name,
            content: content || '',
            contentId: details.contentId || '',
            rawUrl: details.rawUrl || '',
            sourcePath: details.sourcePath || '',
            date: details.date || '',
            size: details.size || byteLength(content || '')
        };
    }

    function addChild(parent, node, aliases) {
        parent.children[node.name] = node;

        (aliases || []).forEach(function(alias) {
            if (alias && alias !== node.name) {
                parent.aliases[alias] = node.name;
            }
        });
    }

    function buildVfs(data) {
        const defaultSections = [
            { name: 'posts', title: '文章', url: '/posts/', types: ['post'] },
            { name: 'fragments', title: '碎片流', url: '/fragments/', types: ['fragment'] },
            { name: 'photos', title: '摄影', url: '/photos/', types: ['photo'] },
            { name: 'research', title: '学术研究', url: '/research/', types: ['publication'] },
            { name: 'tools', title: '工具', url: '/tools/', types: ['tool'] },
            { name: 'uses', title: '工具', url: '/status/', types: ['use'] }
        ];
        const sections = Array.isArray(data.sections) && data.sections.length ? data.sections : defaultSections;
        const root = createDir('', '/', '/');
        const directories = {};
        const sectionByType = {};
        const nextShortcuts = {};

        sections.forEach(function(section) {
            const dir = createDir(section.name, section.url, section.title);
            directories[section.name] = dir;
            nextShortcuts[section.name] = section.url;
            addChild(root, dir);

            (section.types || []).forEach(function(type) {
                sectionByType[type] = dir;
            });
        });

        (data.routes || []).forEach(function(route) {
            if (route.type === 'page' && directories[route.name]) {
                directories[route.name].route = route.url;
                directories[route.name].title = route.title;
                return;
            }

            const parent = sectionByType[route.type] || root;
            let name = route.name || slugFromUrl(route.url);

            if (route.type === 'page' && route.url === '/') {
                name = 'home';
            } else if (route.type === 'page' && route.name === 'introduction') {
                name = 'about.md';
            }

            const file = createFile(name, route.url, route.title, '', {
                contentId: route.id,
                rawUrl: route.raw_url,
                sourcePath: route.source_path,
                date: route.date,
                size: route.size
            });
            const aliases = [slugFromUrl(route.url)];

            if (route.source_path) {
                aliases.push(route.source_path.split('/').pop());
            }

            addChild(parent, file, aliases);

            if (route.type === 'page') {
                nextShortcuts[route.name] = route.url;
                if (route.name === 'introduction') {
                    nextShortcuts.about = route.url;
                }
            } else if (route.type === 'use' && route.name === 'ghostty') {
                nextShortcuts.ghostty = route.url;
            }
        });

        shortcutRoutes = nextShortcuts;
        return root;
    }

    let vfs = buildVfs({});
    const manifestPromise = siteData.loadManifest().then(function(manifest) {
        vfs = buildVfs(manifest);
        manifestReady = true;

        if (palette.classList.contains('is-open') && !output.querySelector('.command-history-line')) {
            setLines(welcomeLines());
        }

        return manifest;
    }).catch(function(error) {
        manifestError = error;
        return null;
    });

    function normalizePathParts(parts) {
        return parts.filter(function(part) {
            return part && part !== '/';
        });
    }

    function readCwd() {
        try {
            const stored = JSON.parse(sessionStorage.getItem(cwdStorageKey) || '[]');
            return Array.isArray(stored) ? normalizePathParts(stored) : [];
        } catch (error) {
            return [];
        }
    }

    function readHistory() {
        try {
            const stored = JSON.parse(localStorage.getItem(historyStorageKey) || '[]');
            return Array.isArray(stored) ? stored.slice(-historyLimit).map(String) : [];
        } catch (error) {
            return [];
        }
    }

    function writeHistory() {
        try {
            localStorage.setItem(historyStorageKey, JSON.stringify(commandHistory.slice(-historyLimit)));
        } catch (error) {
            return;
        }
    }

    function inferCwdFromLocation() {
        const baseUrl = String(document.documentElement.dataset.siteBaseurl || '').replace(/\/+$/, '');
        const pathname = baseUrl && window.location.pathname.startsWith(baseUrl)
            ? window.location.pathname.slice(baseUrl.length)
            : window.location.pathname;
        const parts = pathname.split('/').filter(Boolean);

        if (!parts.length) {
            return [];
        }

        if (parts[0] === 'posts') {
            return ['posts'];
        }

        if (parts[0] === 'uses') {
            return ['uses'];
        }

        if (parts[0] === 'photos') {
            return ['photos'];
        }

        if (parts[0] === 'research' || parts[0] === 'publications') {
            return ['research'];
        }

        if (parts[0] === 'fragments') {
            return ['fragments'];
        }

        return [];
    }

    const inferredCwd = inferCwdFromLocation();
    let cwd = inferredCwd.length ? inferredCwd : readCwd();

    function writeCwd() {
        sessionStorage.setItem(cwdStorageKey, JSON.stringify(cwd));
    }

    writeCwd();

    function formatPath(parts) {
        return parts.length ? '/' + parts.join('/') : '/';
    }

    function shellPath(parts) {
        return parts.length ? '~/' + parts.join('/') : '~';
    }

    function promptText() {
        return shellPath(cwd) + ' %';
    }

    function updatePrompt() {
        prompt.textContent = promptText();
        prompt.setAttribute('title', formatPath(cwd));
    }

    function getNode(parts) {
        let node = vfs;

        for (let index = 0; index < parts.length; index += 1) {
            const part = parts[index];
            const canonical = node.aliases && node.aliases[part] ? node.aliases[part] : part;

            if (!node.children || !node.children[canonical]) {
                return null;
            }

            node = node.children[canonical];
        }

        return node;
    }

    function resolveParts(path) {
        let raw = (path || '').trim();

        if (raw === '~') {
            raw = '/';
        } else if (raw.startsWith('~/')) {
            raw = '/' + raw.slice(2);
        }

        const base = raw.startsWith('/') ? [] : cwd.slice();
        const tokens = raw.split('/').filter(Boolean);

        tokens.forEach(function(token) {
            if (token === '.') {
                return;
            }

            if (token === '..') {
                base.pop();
                return;
            }

            base.push(token);
        });

        return base;
    }

    function resolvePath(path) {
        const parts = resolveParts(path);
        return {
            parts: parts,
            node: getNode(parts),
            path: formatPath(parts)
        };
    }

    function formatBytes(bytes) {
        const value = Number(bytes) || 0;
        const units = ['B', 'K', 'M'];
        let size = value;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }

        if (unitIndex === 0) {
            return String(Math.round(size)) + units[unitIndex];
        }

        return size >= 10 ? Math.round(size) + units[unitIndex] : size.toFixed(1) + units[unitIndex];
    }

    function formatDate(value) {
        if (!value) {
            return '--- --';
        }

        const date = new Date(value + 'T00:00:00');

        if (Number.isNaN(date.getTime())) {
            return '--- --';
        }

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit'
        });
    }

    function nodeKind(node) {
        if (!node) {
            return 'text';
        }

        if (node.type === 'dir') {
            return 'dir';
        }

        if (node.name && node.name.endsWith('.md')) {
            return 'md';
        }

        return 'file';
    }

    function token(text, type) {
        return {
            text: String(text || ''),
            type: type || 'text'
        };
    }

    function listDir(node, detailed) {
        const names = Object.keys(node.children || {}).sort();

        if (!names.length) {
            return [[token('(empty)', 'muted')]];
        }

        return names.map(function(name) {
            const child = node.children[name];
            const label = child.type === 'dir' ? name + '/' : name;
            const title = child.title && child.title !== name ? '  ' + child.title : '';

            if (detailed) {
                const mode = child.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--';
                const size = child.type === 'dir' ? Object.keys(child.children || {}).length * 32 : child.size;
                return [
                    token(mode + ' ', 'muted'),
                    token('1 site site ', 'meta'),
                    token(formatBytes(size).padStart(6, ' ') + ' ', 'meta'),
                    token(formatDate(child.date) + ' ', 'meta'),
                    token(label, nodeKind(child)),
                    token(title ? '  ' + title.trim() : '', 'muted')
                ];
            }

            return [
                token(label.padEnd(18, ' '), nodeKind(child)),
                token(title, 'muted')
            ];
        });
    }

    function scrollOutput() {
        output.scrollTop = output.scrollHeight;
    }

    function appendTokens(tokens, className) {
        const item = document.createElement('p');

        if (className) {
            item.className = className;
        }

        tokens.forEach(function(part) {
            const span = document.createElement('span');
            span.textContent = part.text || '';

            if (part.type && part.type !== 'text') {
                span.className = 'term-' + part.type;
            }

            item.appendChild(span);
        });

        output.appendChild(item);
        scrollOutput();
        return item;
    }

    function appendOutput(line, className) {
        if (Array.isArray(line)) {
            return appendTokens(line, className);
        }

        const item = document.createElement('p');
        item.textContent = line || '';

        if (className) {
            item.className = className;
        }

        output.appendChild(item);
        scrollOutput();
        return item;
    }

    function setLines(lines) {
        output.innerHTML = '';
        lines.forEach(function(line) {
            appendOutput(line);
        });
        scrollOutput();
    }

    function writeTypedLines(lines, type) {
        writeLines(lines.map(function(line) {
            return [token(line, type)];
        }));
    }

    function writeLines(lines) {
        lines.forEach(function(line) {
            appendOutput(line);
        });
        scrollOutput();
    }

    function appendLine(line, className) {
        return appendOutput(line, className);
    }

    function appendHighlightedLine(prefix, line, term, extraClass) {
        const item = document.createElement('p');
        const value = String(line || '');
        const query = String(term || '');
        const lowerValue = value.toLowerCase();
        const lowerQuery = query.toLowerCase();
        let cursor = 0;
        let index = lowerQuery ? lowerValue.indexOf(lowerQuery) : -1;

        if (extraClass) {
            item.className = extraClass;
        }

        if (prefix) {
            const prefixParts = Array.isArray(prefix) ? prefix : [token(prefix, 'prefix')];

            prefixParts.forEach(function(part) {
                const label = document.createElement('span');
                label.textContent = part.text || '';

                if (part.type) {
                    label.className = part.type === 'prefix' ? 'command-line-prefix' : 'term-' + part.type;
                }

                item.appendChild(label);
            });
        }

        while (index >= 0) {
            if (index > cursor) {
                item.appendChild(document.createTextNode(value.slice(cursor, index)));
            }

            const mark = document.createElement('mark');
            mark.className = 'command-hit';
            mark.textContent = value.slice(index, index + query.length);
            item.appendChild(mark);
            cursor = index + query.length;
            index = lowerValue.indexOf(lowerQuery, cursor);
        }

        item.appendChild(document.createTextNode(value.slice(cursor)));
        output.appendChild(item);
        scrollOutput();
        return item;
    }

    function loadIndexedContent(node) {
        if (node.content) {
            return Promise.resolve({ text: node.content, raw: false });
        }

        if (!node.contentId) {
            return Promise.resolve({ text: '', raw: false });
        }

        return siteData.getContent(node.contentId).then(function(page) {
            const text = page && page.content ? page.content : '';
            node.content = text;
            node.size = byteLength(text);
            return { text: text, raw: false };
        });
    }

    function loadFileContent(node) {
        if (!node.rawUrl || !window.fetch) {
            return loadIndexedContent(node);
        }

        if (rawCache[node.rawUrl]) {
            return Promise.resolve({
                text: rawCache[node.rawUrl],
                raw: true
            });
        }

        return fetch(node.rawUrl)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error(response.status + ' ' + response.statusText);
                }

                return response.text();
            })
            .then(function(text) {
                rawCache[node.rawUrl] = text;
                node.size = byteLength(text);
                return {
                    text: text,
                    raw: true
                };
            })
            .catch(function(error) {
                return loadIndexedContent(node).then(function(result) {
                    result.error = error.message;
                    return result;
                });
            });
    }

    function writePromptLine(commandLine) {
        appendTokens([
            token('% ', 'prompt'),
            token(commandLine, 'command')
        ], 'command-history-line');
    }

    function helpLines() {
        return [
            'NAVIGATION',
            '  pwd                  show current directory',
            '  ls [path]            list directory contents',
            '  ls -l [path]         list details',
            '  tree [path]          print directory tree',
            '  cd <dir>             enter a directory',
            '  open <path>          open a page or file',
            '  cat <file>           print raw Markdown when available',
            '  less <file>          read a file with paging',
            '  grep [-n] [-C n] <term> [path]',
            '  find <term> [path]   search files and titles',
            '  man <command>        show command manual',
            '  ask <question>       ask the site AI',
            '',
            'SHORTCUTS',
            '  posts photos fragments research tools status about ghostty',
            '  ll la .. home cls',
            '',
            'TOOLS',
            '  random               open a random post',
            '  whoami date uname    show environment info',
            '  clear                clear output'
        ];
    }

    const commandHelp = {
        pwd: ['NAME', '  pwd - show current virtual directory', '', 'SYNOPSIS', '  pwd'],
        ls: ['NAME', '  ls - list directory contents', '', 'SYNOPSIS', '  ls [-l] [path]', '', 'EXAMPLES', '  ls posts', '  ls -l posts'],
        tree: ['NAME', '  tree - print a compact virtual file tree', '', 'SYNOPSIS', '  tree [path]', '', 'EXAMPLES', '  tree', '  tree posts'],
        cd: ['NAME', '  cd - change virtual directory', '', 'SYNOPSIS', '  cd <dir>', '', 'NOTES', '  cd only accepts directories. Use open <file> to navigate to an article.'],
        open: ['NAME', '  open - open a route in the browser', '', 'SYNOPSIS', '  open <path>', '', 'EXAMPLES', '  open .', '  open posts/github-pages-guide.md'],
        cat: ['NAME', '  cat - print file contents', '', 'SYNOPSIS', '  cat <file>', '', 'NOTES', '  Posts are fetched from their GitHub raw Markdown source when available.'],
        less: ['NAME', '  less - read long files with paging', '', 'SYNOPSIS', '  less <file>', '', 'KEYS', '  j/down scroll down', '  k/up scroll up', '  / search', '  n next match', '  q quit'],
        grep: ['NAME', '  grep - search file contents', '', 'SYNOPSIS', '  grep [-n] [-C n] <term> [path]', '', 'EXAMPLES', '  grep -n agent posts/hermes-agent-source-analysis.md', '  grep -C 2 theme uses/ghostty'],
        find: ['NAME', '  find - search names, titles, and content', '', 'SYNOPSIS', '  find <term> [path]'],
        ask: ['NAME', '  ask - ask the site AI about this blog', '', 'SYNOPSIS', '  ask <question>', '', 'EXAMPLES', '  ask 你有哪些文章？', '  ask ghostty 配置是什么？'],
        clear: ['NAME', '  clear - clear terminal output'],
        random: ['NAME', '  random - open a random post'],
        whoami: ['NAME', '  whoami - print the site identity'],
        date: ['NAME', '  date - print the current local date and time'],
        uname: ['NAME', '  uname - print the terminal environment'],
        help: ['NAME', '  help - show all commands or one command', '', 'SYNOPSIS', '  help [command]'],
        man: ['NAME', '  man - show command manual', '', 'SYNOPSIS', '  man <command>']
    };

    const aliases = {
        ll: 'ls -l',
        la: 'ls -l',
        '..': 'cd ..',
        home: 'cd /',
        cls: 'clear'
    };

    function firstFileName(node) {
        return Object.keys(node.children || {}).sort().find(function(name) {
            return node.children[name].type === 'file';
        });
    }

    function welcomeLines() {
        const lines = ['commands: ls cd open cat pwd'];
        const currentNode = getNode(cwd);

        lines.push('try: ls');
        lines.push('try: ask 你有哪些文章？');

        if (!cwd.length) {
            lines.push('try: cd posts');

            const firstPost = firstFileName(vfs.children.posts);
            if (firstPost) {
                lines.push('try: cat posts/' + firstPost);
            }

            return lines;
        }

        if (currentNode && currentNode.type === 'dir') {
            const firstFile = firstFileName(currentNode);

            if (firstFile) {
                lines.push('try: cat ' + firstFile);
            }
        }

        lines.push('try: cd ..');
        return lines;
    }

    function openRoute(node) {
        if (!node || !node.route) {
            return false;
        }

        window.location.href = node.route;
        return true;
    }

    function randomPost() {
        const posts = Object.values(vfs.children.posts.children || {});

        if (!posts.length) {
            return false;
        }

        return openRoute(posts[Math.floor(Math.random() * posts.length)]);
    }

    function lessViewportSize() {
        return Math.max(8, Math.floor(output.clientHeight / 24) - 2);
    }

    function lessMatches(lines, query) {
        const term = String(query || '').toLowerCase();
        const matches = [];

        if (!term) {
            return matches;
        }

        lines.forEach(function(line, index) {
            if (String(line).toLowerCase().includes(term)) {
                matches.push(index);
            }
        });

        return matches;
    }

    function renderLess() {
        if (!lessState) {
            return;
        }

        const pageSize = lessViewportSize();
        const maxOffset = Math.max(0, lessState.lines.length - pageSize);
        lessState.offset = Math.max(0, Math.min(lessState.offset, maxOffset));
        const end = Math.min(lessState.lines.length, lessState.offset + pageSize);
        output.innerHTML = '';

        for (let index = lessState.offset; index < end; index += 1) {
            const line = lessState.lines[index];
            const prefix = [token(String(index + 1).padStart(4, ' ') + '  ', 'line-number')];
            appendHighlightedLine(prefix, line, lessState.query, 'less-line ' + markdownLineClass(line));
        }

        const percent = lessState.lines.length <= pageSize ? 100 : Math.round((end / lessState.lines.length) * 100);
        const status = document.createElement('p');
        status.className = 'less-status';
        status.textContent = lessState.name + '  lines ' + (lessState.offset + 1) + '-' + end + '/' + lessState.lines.length + '  ' + percent + '%  q:quit j/k:scroll /:search n:next';
        output.appendChild(status);
        scrollOutput();
    }

    function markdownLineClass(line) {
        const value = String(line || '');

        if (/^#{1,6}\s/.test(value)) {
            return 'term-md-heading';
        }

        if (/^---\s*$/.test(value) || /^[a-zA-Z0-9_-]+:\s/.test(value)) {
            return 'term-md-meta-line';
        }

        if (/^```/.test(value)) {
            return 'term-md-code-line';
        }

        return '';
    }

    function exitLess() {
        const previousOutput = lessState && lessState.previousOutput;
        lessState = null;
        input.value = '';
        updatePrompt();

        if (previousOutput) {
            output.innerHTML = previousOutput;
            scrollOutput();
            return;
        }

        setLines(welcomeLines());
    }

    function moveLess(delta) {
        if (!lessState) {
            return;
        }

        lessState.offset += delta;
        renderLess();
    }

    function searchLess(query) {
        if (!lessState) {
            return;
        }

        lessState.query = query;
        lessState.matches = lessMatches(lessState.lines, query);
        lessState.matchIndex = 0;

        if (lessState.matches.length) {
            lessState.offset = lessState.matches[0];
        }

        renderLess();
    }

    function nextLessMatch() {
        if (!lessState || !lessState.matches.length) {
            return;
        }

        lessState.matchIndex = (lessState.matchIndex + 1) % lessState.matches.length;
        lessState.offset = lessState.matches[lessState.matchIndex];
        renderLess();
    }

    function runLs(path) {
        const tokens = (path || '').split(/\s+/).filter(Boolean);
        const detailed = tokens.includes('-l');
        const target = tokens.filter(function(token) {
            return token !== '-l';
        }).join(' ');
        const resolved = target ? resolvePath(target) : { node: getNode(cwd), path: formatPath(cwd) };

        if (!resolved.node) {
            writeLines([[token("ls: cannot access '" + target + "': No such file or directory", 'error')]]);
            return;
        }

        if (resolved.node.type !== 'dir') {
            writeLines([[token(resolved.node.name, nodeKind(resolved.node))]]);
            return;
        }

        writeLines(listDir(resolved.node, detailed));
    }

    function treeLines(node, label, prefix, kind) {
        const lines = [[token(label, kind || 'dir')]];
        const names = Object.keys(node.children || {}).sort();

        names.forEach(function(name, index) {
            const child = node.children[name];
            const isLast = index === names.length - 1;
            const branch = isLast ? '`-- ' : '|-- ';
            const nextPrefix = prefix + (isLast ? '    ' : '|   ');
            const childLabel = child.type === 'dir' ? name + '/' : name;

            if (child.type === 'dir') {
                const childLines = treeLines(child, prefix + branch + childLabel, nextPrefix, 'dir');
                lines.push.apply(lines, childLines);
                return;
            }

            lines.push([
                token(prefix + branch, 'muted'),
                token(childLabel, nodeKind(child))
            ]);
        });

        return lines;
    }

    function runTree(path) {
        const target = path || '.';
        const resolved = resolvePath(target);

        if (!resolved.node) {
            writeLines([[token("tree: '" + target + "': No such file or directory", 'error')]]);
            return;
        }

        if (resolved.node.type !== 'dir') {
            writeLines([[token(resolved.node.name, nodeKind(resolved.node))]]);
            return;
        }

        const label = resolved.path === '/' ? '/' : resolved.path.split('/').filter(Boolean).pop() + '/';
        writeLines(treeLines(resolved.node, label, '', 'dir'));
    }

    function runCd(path) {
        if (!path) {
            cwd = [];
            writeCwd();
            updatePrompt();
            writeLines([[token(formatPath(cwd), 'muted')]]);
            return;
        }

        const resolved = resolvePath(path);

        if (!resolved.node) {
            const hints = [[token('cd: no such file or directory: ' + path, 'error')]];

            if (!path.startsWith('/') && cwd.length && getNode([path])) {
                hints.push([token('hint: try cd /' + path, 'hint')]);
            }

            writeLines(hints);
            return;
        }

        if (resolved.node.type === 'dir') {
            cwd = resolved.parts;
            writeCwd();
            updatePrompt();
            writeLines([[token(formatPath(cwd), 'muted')]]);
            return;
        }

        writeLines([
            [token('cd: not a directory: ' + path, 'error')],
            [token('hint: use open ' + path, 'hint')]
        ]);
    }

    function runOpen(path) {
        const target = path || '.';
        const resolved = resolvePath(target);

        if (!resolved.node) {
            writeLines([[token("open: '" + target + "': No such file or directory", 'error')]]);
            return;
        }

        if (!openRoute(resolved.node)) {
            writeLines([[token('open: no route for ' + target, 'error')]]);
        }
    }

    function runCat(path) {
        if (!path) {
            writeLines([[token('cat: missing operand', 'error')]]);
            return;
        }

        const resolved = resolvePath(path);

        if (!resolved.node) {
            writeLines([[token('cat: no such file or directory: ' + path, 'error')]]);
            return;
        }

        if (resolved.node.type === 'dir') {
            writeLines([[token('cat: ' + path + ': Is a directory', 'error')]]);
            return;
        }

        const loading = resolved.node.rawUrl ? appendLine([token('cat: fetching raw source...', 'muted')]) : null;

        loadFileContent(resolved.node).then(function(result) {
            if (loading) {
                loading.remove();
            }

            const warnings = result.error ? [[token('cat: warning: raw source unavailable, using indexed text (' + result.error + ')', 'warning')]] : [];
            const lines = (result.text || '').split(/\r?\n/);
            writeLines(warnings.concat(lines.length && lines[0] ? lines : [[token('cat: ' + path + ' is empty', 'muted')]]));
        });
    }

    function runLess(path) {
        if (!path) {
            writeLines([[token('less: missing filename', 'error')]]);
            return;
        }

        const resolved = resolvePath(path);

        if (!resolved.node) {
            writeLines([[token("less: '" + path + "': No such file or directory", 'error')]]);
            return;
        }

        if (resolved.node.type === 'dir') {
            writeLines([[token('less: ' + path + ': Is a directory', 'error')]]);
            return;
        }

        const loading = appendLine([token('less: loading ', 'muted'), token(resolved.node.name, nodeKind(resolved.node)), token('...', 'muted')]);

        loadFileContent(resolved.node).then(function(result) {
            loading.remove();
            lessState = {
                name: resolved.node.name,
                lines: (result.text || '').split(/\r?\n/),
                offset: 0,
                query: '',
                matches: [],
                matchIndex: 0,
                searching: false,
                previousOutput: output.innerHTML
            };
            input.value = '';
            prompt.textContent = ':';
            renderLess();
        });
    }

    function walkFiles(node, parts, callback) {
        if (!node) {
            return;
        }

        if (node.type === 'file') {
            callback(node, parts);
            return;
        }

        Object.keys(node.children || {}).sort().forEach(function(name) {
            walkFiles(node.children[name], parts.concat(name), callback);
        });
    }

    function parseSearchArgs(argument) {
        const tokens = argument.split(/\s+/).filter(Boolean);
        const result = {
            term: '',
            path: '',
            lineNumbers: false,
            context: 0
        };

        for (let index = 0; index < tokens.length; index += 1) {
            const token = tokens[index];

            if (token === '-n') {
                result.lineNumbers = true;
                continue;
            }

            if (token === '-C') {
                result.context = Math.max(0, Number.parseInt(tokens[index + 1] || '0', 10) || 0);
                index += 1;
                continue;
            }

            if (token.startsWith('-C') && token.length > 2) {
                result.context = Math.max(0, Number.parseInt(token.slice(2), 10) || 0);
                continue;
            }

            if (!result.term) {
                result.term = token;
                continue;
            }

            result.path = tokens.slice(index).join(' ');
            break;
        }

        return result;
    }

    function runGrep(argument) {
        const args = parseSearchArgs(argument);

        if (!args.term) {
            writeLines([[token('grep: missing pattern', 'error')]]);
            return;
        }

        const resolved = args.path ? resolvePath(args.path) : { node: getNode(cwd), parts: cwd.slice(), path: formatPath(cwd) };

        if (!resolved.node) {
            writeLines([[token('grep: ' + args.path + ': No such file or directory', 'error')]]);
            return;
        }

        const term = args.term.toLowerCase();
        const files = [];

        walkFiles(resolved.node, resolved.parts, function(node, parts) {
            files.push({
                node: node,
                parts: parts
            });
        });

        if (!files.length) {
            writeLines([[token('grep: no files to search', 'muted')]]);
            return;
        }

        Promise.all(files.map(function(file) {
            return loadFileContent(file.node).then(function(result) {
                return {
                    file: file,
                    text: result.text || ''
                };
            });
        })).then(function(results) {
            const rendered = [];
            const seen = {};

            results.forEach(function(result) {
                const contentLines = result.text.split(/\r?\n/);
                const filePath = formatPath(result.file.parts);

                contentLines.forEach(function(line, index) {
                    if (!line.toLowerCase().includes(term)) {
                        return;
                    }

                    const start = Math.max(0, index - args.context);
                    const end = Math.min(contentLines.length - 1, index + args.context);

                    for (let contextIndex = start; contextIndex <= end; contextIndex += 1) {
                        const key = filePath + ':' + contextIndex;

                        if (seen[key]) {
                            continue;
                        }

                        seen[key] = true;
                        rendered.push({
                            path: filePath,
                            lineNumber: contextIndex + 1,
                            line: contentLines[contextIndex],
                            hit: contextIndex === index
                        });
                    }
                });
            });

            if (!rendered.length) {
                writeLines([[token('grep: no matches', 'muted')]]);
                return;
            }

            rendered.forEach(function(match) {
                const separator = match.hit ? ':' : '-';
                const prefix = [
                    token(match.path, 'path'),
                    token(separator, 'muted')
                ];

                if (args.lineNumbers || args.context) {
                    prefix.push(token(match.lineNumber, 'line-number'));
                    prefix.push(token(separator + ' ', 'muted'));
                } else {
                    prefix.push(token(' ', 'muted'));
                }

                if (match.hit) {
                    appendHighlightedLine(prefix, match.line, args.term, 'grep-line');
                    return;
                }

                appendTokens(prefix.concat([token(match.line, 'context')]), 'grep-context-line');
            });
        }).catch(function(error) {
            writeLines([[token('grep: ' + error.message, 'error')]]);
        });
    }

    function runFind(argument) {
        const args = parseSearchArgs(argument);

        if (!args.term) {
            writeLines([[token('find: missing query', 'error')]]);
            return;
        }

        const resolved = args.path ? resolvePath(args.path) : { node: vfs, parts: [], path: '/' };

        if (!resolved.node) {
            writeLines([[token('find: no such file or directory: ' + args.path, 'error')]]);
            return;
        }

        const term = args.term.toLowerCase();
        const files = [];

        walkFiles(resolved.node, resolved.parts, function(node, parts) {
            files.push({ node: node, parts: parts });
        });

        const loading = appendLine([token('find: loading content index...', 'muted')]);

        Promise.all(files.map(function(file) {
            return loadIndexedContent(file.node).then(function(result) {
                return { file: file, text: result.text || '' };
            });
        })).then(function(results) {
            const matches = [];

            loading.remove();
            results.forEach(function(result) {
                const node = result.file.node;
                const parts = result.file.parts;
                const haystack = [formatPath(parts), node.title || '', result.text].join('\n').toLowerCase();

                if (haystack.includes(term)) {
                    matches.push([
                        token(formatPath(parts).padEnd(24, ' '), nodeKind(node) === 'md' ? 'md' : 'path'),
                        token(node.title, 'muted')
                    ]);
                }
            });

            writeLines(matches.length ? matches : [[token('find: no matches', 'muted')]]);
        }).catch(function(error) {
            loading.remove();
            writeLines([[token('find: ' + error.message, 'error')]]);
        });
    }

    function runAsk(question) {
        if (!question) {
            writeLines(['ask: missing question', 'try: ask 你有哪些文章？']);
            return;
        }

        if (!window.siteAI || typeof window.siteAI.answerAsync !== 'function') {
            writeLines([[token('ask: AI module unavailable', 'error')]]);
            return;
        }

        const status = appendLine([token('ask: loading site manifest...', 'muted')]);

        window.siteAI.answerAsync(question, {
            onStatus: function(message) {
                status.textContent = 'ask: ' + message + '...';
            }
        }).then(function(response) {
            const lines = Array.isArray(response) ? response : [String(response)];
            let lineIndex = 0;

            status.remove();

            function streamNextLine() {
                if (lineIndex >= lines.length) {
                    return;
                }

                const line = lines[lineIndex];
                const item = appendLine('');
                item.className = 'term-ai';
                let charIndex = 0;
                lineIndex += 1;

                function streamNextChar() {
                    item.textContent = line.slice(0, charIndex);
                    scrollOutput();

                    if (charIndex <= line.length) {
                        charIndex += 1;
                        window.setTimeout(streamNextChar, 8);
                        return;
                    }

                    window.setTimeout(streamNextLine, 80);
                }

                streamNextChar();
            }

            streamNextLine();
        }).catch(function(error) {
            status.remove();
            writeLines([[token('ask: ' + error.message, 'error')]]);
        });
    }

    function runShortcut(command) {
        if (!shortcutRoutes[command]) {
            return false;
        }

        window.location.href = shortcutRoutes[command];
        return true;
    }

    function runCommand(value) {
        const commandLine = value.trim();

        if (!commandLine) {
            return;
        }

        if (!manifestReady) {
            if (manifestError) {
                writeLines([[token('site data: ' + manifestError.message, 'error')]]);
                return;
            }

            const loading = appendLine([token('loading site manifest...', 'muted')]);
            manifestPromise.then(function() {
                loading.remove();
                if (manifestReady) {
                    runCommand(value);
                } else if (manifestError) {
                    writeLines([[token('site data: ' + manifestError.message, 'error')]]);
                }
            });
            return;
        }

        const expandedLine = aliases[commandLine] || commandLine;
        const parts = expandedLine.split(/\s+/);
        const command = parts[0].toLowerCase();
        const argument = expandedLine.slice(command.length).trim();

        if (command === 'help' || command === '?' || command === 'man') {
            if (argument) {
                writeLines(commandHelp[argument] || [[token(command + ': no entry for ' + argument, 'error')]]);
                return;
            }

            writeLines(helpLines());
            return;
        }

        if (command === 'clear') {
            setLines([]);
            return;
        }

        if (command === 'pwd') {
            writeLines([[token(formatPath(cwd), 'path')]]);
            return;
        }

        if (command === 'ls') {
            runLs(argument);
            return;
        }

        if (command === 'tree') {
            runTree(argument);
            return;
        }

        if (command === 'cd') {
            runCd(argument);
            return;
        }

        if (command === 'open') {
            runOpen(argument);
            return;
        }

        if (command === 'cat') {
            runCat(argument);
            return;
        }

        if (command === 'less') {
            runLess(argument);
            return;
        }

        if (command === 'grep') {
            runGrep(argument);
            return;
        }

        if (command === 'find') {
            runFind(argument);
            return;
        }

        if (command === 'ask') {
            runAsk(argument);
            return;
        }

        if (command === 'random') {
            if (!randomPost()) {
                writeLines([[token('random: no posts found', 'error')]]);
            }
            return;
        }

        if (command === 'whoami') {
            writeLines(['jiaaozhe.site']);
            return;
        }

        if (command === 'date') {
            writeLines([new Date().toString()]);
            return;
        }

        if (command === 'uname') {
            writeLines(['Jekyll VFS terminal on GitHub Pages']);
            return;
        }

        if (runShortcut(command)) {
            return;
        }

        writeLines([
            [token('unknown command: ' + commandLine, 'error')],
            [token('type "help"', 'hint')]
        ]);
    }

    function rememberCommand(commandLine) {
        if (commandHistory[commandHistory.length - 1] !== commandLine) {
            commandHistory.push(commandLine);
            if (commandHistory.length > historyLimit) {
                commandHistory.shift();
            }
            writeHistory();
        }

        historyIndex = commandHistory.length;
    }

    function runExternalCommand(commandLine) {
        const trimmed = String(commandLine || '').trim();

        if (!trimmed) {
            return;
        }

        open();

        rememberCommand(trimmed);
        writePromptLine(trimmed);
        runCommand(trimmed);
        input.value = '';
    }

    function ask(question) {
        const normalized = String(question || '').trim();

        if (!normalized) {
            open('ask ');
            return;
        }

        runExternalCommand('ask ' + normalized);
    }

    function getChildNames(parts) {
        const node = getNode(parts);

        if (!node || node.type !== 'dir') {
            return [];
        }

        return Object.keys(node.children || {}).sort().map(function(name) {
            const child = node.children[name];
            return child.type === 'dir' ? name + '/' : name;
        });
    }

    function commonPrefix(values) {
        if (!values.length) {
            return '';
        }

        return values.reduce(function(prefix, value) {
            let index = 0;

            while (index < prefix.length && prefix[index] === value[index]) {
                index += 1;
            }

            return prefix.slice(0, index);
        });
    }

    function completePath(command, fragment) {
        const raw = fragment || '';
        const separatorIndex = raw.lastIndexOf('/');
        const dirPart = separatorIndex >= 0 ? raw.slice(0, separatorIndex + 1) : '';
        const namePart = separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : raw;
        const baseParts = dirPart ? resolveParts(dirPart) : cwd.slice();
        const matches = getChildNames(baseParts).filter(function(name) {
            return name.startsWith(namePart);
        });

        if (!matches.length) {
            return;
        }

        if (matches.length === 1) {
            input.value = command + ' ' + dirPart + matches[0];
            input.setSelectionRange(input.value.length, input.value.length);
            return;
        }

        const prefix = commonPrefix(matches);

        if (prefix.length > namePart.length) {
            input.value = command + ' ' + dirPart + prefix;
            input.setSelectionRange(input.value.length, input.value.length);
            return;
        }

        writeLines(['matches:'].concat(matches));
    }

    function completeCommand() {
        const value = input.value;
        const commandNames = ['help', 'man', 'pwd', 'ls', 'tree', 'cd', 'open', 'cat', 'less', 'grep', 'find', 'ask', 'clear', 'random', 'whoami', 'date', 'uname', 'll', 'la', '..', 'home', 'cls', 'posts', 'photos', 'fragments', 'research', 'tools', 'status', 'about', 'ghostty'];
        const parts = value.trimStart().split(/\s+/);
        const command = parts[0] || '';

        if (!value.trim()) {
            writeLines(['available commands:'].concat(commandNames));
            return;
        }

        if ((command === 'cd' || command === 'ls' || command === 'tree' || command === 'open' || command === 'cat' || command === 'less') && value.includes(' ')) {
            completePath(command, value.slice(command.length).trimStart());
            return;
        }

        if ((command === 'grep' || command === 'find') && value.trim().split(/\s+/).length > 2) {
            const pathStart = value.indexOf(' ', value.indexOf(' ') + 1);
            completePath(command + ' ' + value.slice(command.length, pathStart).trim(), value.slice(pathStart + 1));
            return;
        }

        const matches = commandNames.filter(function(name) {
            return name.startsWith(command);
        });

        if (!matches.length) {
            return;
        }

        if (matches.length === 1) {
            input.value = matches[0];
            input.setSelectionRange(input.value.length, input.value.length);
            return;
        }

        const prefix = commonPrefix(matches);

        if (prefix.length > command.length) {
            input.value = prefix;
            input.setSelectionRange(input.value.length, input.value.length);
            return;
        }

        writeLines(['matches:'].concat(matches));
    }

    function open(initialValue) {
        palette.classList.add('is-open');
        palette.setAttribute('aria-hidden', 'false');
        lessState = null;
        input.value = initialValue || '';
        updatePrompt();
        setLines(welcomeLines());
        document.dispatchEvent(new CustomEvent('command-palette:open'));
        window.setTimeout(function() {
            input.focus();
        }, 0);
    }

    function close() {
        lessState = null;
        palette.classList.remove('is-open');
        palette.setAttribute('aria-hidden', 'true');
        document.dispatchEvent(new CustomEvent('command-palette:close'));
    }

    function toggle() {
        if (palette.classList.contains('is-open')) {
            close();
            return;
        }

        open();
    }

    document.addEventListener('keydown', function(event) {
        const target = event.target;
        const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;

        if (event.key === '/' && !isTyping && !palette.classList.contains('is-open')) {
            event.preventDefault();
            open();
        }

        if (event.key === 'Escape' && palette.classList.contains('is-open')) {
            close();
        }
    });

    palette.addEventListener('click', function(event) {
        if (event.target === palette) {
            close();
        }
    });

    form.addEventListener('submit', function(event) {
        event.preventDefault();

        if (lessState && lessState.searching) {
            searchLess(input.value.trim());
            lessState.searching = false;
            input.value = '';
            prompt.textContent = ':';
            return;
        }

        const commandLine = input.value.trim();

        if (!commandLine) {
            return;
        }

        rememberCommand(commandLine);
        writePromptLine(commandLine);
        runCommand(commandLine);
        input.value = '';
    });

    function handleLessKey(event) {
        if (!lessState) {
            return false;
        }

        if (lessState.searching) {
            if (event.key === 'Escape') {
                event.preventDefault();
                lessState.searching = false;
                input.value = '';
                prompt.textContent = ':';
                return true;
            }

            return false;
        }

        const pageSize = lessViewportSize();

        if (event.key === 'q' || event.key === 'Escape') {
            event.preventDefault();
            exitLess();
            return true;
        }

        if (event.key === 'j' || event.key === 'ArrowDown') {
            event.preventDefault();
            moveLess(1);
            return true;
        }

        if (event.key === 'k' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveLess(-1);
            return true;
        }

        if (event.key === 'PageDown' || event.key === ' ') {
            event.preventDefault();
            moveLess(pageSize);
            return true;
        }

        if (event.key === 'PageUp') {
            event.preventDefault();
            moveLess(-pageSize);
            return true;
        }

        if (event.key === 'n') {
            event.preventDefault();
            nextLessMatch();
            return true;
        }

        if (event.key === '/') {
            event.preventDefault();
            lessState.searching = true;
            input.value = '';
            prompt.textContent = '/';
            return true;
        }

        if (event.key.length === 1) {
            event.preventDefault();
            return true;
        }

        return false;
    }

    input.addEventListener('keydown', function(event) {
        if (handleLessKey(event)) {
            event.stopPropagation();
            return;
        }

        if (event.key === 'Tab') {
            event.preventDefault();
            completeCommand();
            return;
        }

        if (event.key === 'ArrowUp') {
            if (!commandHistory.length) {
                return;
            }

            event.preventDefault();
            historyIndex = Math.max(0, historyIndex - 1);
            input.value = commandHistory[historyIndex] || '';
            input.setSelectionRange(input.value.length, input.value.length);
            return;
        }

        if (event.key === 'ArrowDown') {
            if (!commandHistory.length) {
                return;
            }

            event.preventDefault();
            historyIndex = Math.min(commandHistory.length, historyIndex + 1);
            input.value = commandHistory[historyIndex] || '';
            input.setSelectionRange(input.value.length, input.value.length);
        }
    });

    window.siteTerminal = {
        open: open,
        close: close,
        toggle: toggle,
        run: runCommand,
        execute: runExternalCommand,
        ask: ask,
        randomPost: randomPost
    };

    updatePrompt();
});
