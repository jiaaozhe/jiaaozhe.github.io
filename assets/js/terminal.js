document.addEventListener('DOMContentLoaded', function() {
    const palette = document.getElementById('command-palette');
    const form = document.getElementById('command-form');
    const input = document.getElementById('command-input');
    const output = document.getElementById('command-output');
    const prompt = document.getElementById('command-prompt');
    const dataElement = document.getElementById('site-data');

    if (!palette || !form || !input || !output || !prompt || !dataElement) {
        return;
    }

    const terminalData = JSON.parse(dataElement.textContent || '{}');
    const storageKey = 'terminal.cwd';
    const historyLimit = 80;
    let commandHistory = [];
    let historyIndex = 0;

    function slugFromUrl(url) {
        return url.split('/').filter(Boolean).pop() || 'home';
    }

    function createDir(name, route, title) {
        return {
            type: 'dir',
            name: name,
            route: route || '',
            title: title || name,
            children: {}
        };
    }

    function createFile(name, route, title, content) {
        return {
            type: 'file',
            name: name,
            route: route || '',
            title: title || name,
            content: content || ''
        };
    }

    function buildVfs(data) {
        const root = createDir('', '/', '/');
        const posts = createDir('posts', '/posts/', '文章');
        const uses = createDir('uses', '/status/', '工具');
        const research = createDir('research', '/research/', '学术研究');

        (data.posts || []).forEach(function(post) {
            const slug = slugFromUrl(post.url);
            posts.children[slug] = createFile(slug, post.url, post.title, post.content);
        });

        (data.uses || []).forEach(function(use) {
            const slug = slugFromUrl(use.url);
            uses.children[slug] = createFile(slug, use.url, use.title, use.content);
        });

        (data.publications || []).forEach(function(publication) {
            const slug = slugFromUrl(publication.url);
            research.children[slug] = createFile(slug, publication.url, publication.title, publication.content);
        });

        root.children.posts = posts;
        root.children.uses = uses;
        root.children.research = research;

        (data.pages || []).forEach(function(page) {
            if (page.name === 'home') {
                root.children.home = createFile('home', page.url, page.title, page.title);
                return;
            }

            if (page.name === 'research') {
                research.route = page.url;
                research.title = page.title;
                return;
            }

            if (page.name === 'fragments') {
                root.children[page.name] = createDir(page.name, page.url, page.title);
                return;
            }

            root.children[page.name] = createFile(page.name, page.url, page.title, page.title);
        });

        return root;
    }

    const vfs = buildVfs(terminalData);

    function normalizePathParts(parts) {
        return parts.filter(function(part) {
            return part && part !== '/';
        });
    }

    function readCwd() {
        try {
            const stored = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
            return Array.isArray(stored) ? normalizePathParts(stored) : [];
        } catch (error) {
            return [];
        }
    }

    function inferCwdFromLocation() {
        const parts = window.location.pathname.split('/').filter(Boolean);

        if (!parts.length) {
            return [];
        }

        if (parts[0] === 'posts') {
            return ['posts'];
        }

        if (parts[0] === 'uses') {
            return ['uses'];
        }

        if (parts[0] === 'research' || parts[0] === 'publications') {
            return ['research'];
        }

        if (parts[0] === 'fragments') {
            return ['fragments'];
        }

        return [];
    }

    let cwd = inferCwdFromLocation() || readCwd();

    function writeCwd() {
        sessionStorage.setItem(storageKey, JSON.stringify(cwd));
    }

    writeCwd();

    function formatPath(parts) {
        return parts.length ? '/' + parts.join('/') : '/';
    }

    function updatePrompt() {
        prompt.textContent = formatPath(cwd) + ' >';
        prompt.setAttribute('title', formatPath(cwd));
    }

    function getNode(parts) {
        let node = vfs;

        for (let index = 0; index < parts.length; index += 1) {
            if (!node.children || !node.children[parts[index]]) {
                return null;
            }

            node = node.children[parts[index]];
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

    function listDir(node, detailed) {
        const names = Object.keys(node.children || {}).sort();

        if (!names.length) {
            return ['(empty)'];
        }

        return names.map(function(name) {
            const child = node.children[name];
            const label = child.type === 'dir' ? name + '/' : name;
            const title = child.title && child.title !== name ? '  ' + child.title : '';

            if (detailed) {
                const mode = child.type === 'dir' ? 'drwx' : '-rw-';
                const size = child.type === 'dir' ? Object.keys(child.children || {}).length + ' items' : (child.content || '').length + ' chars';
                return mode + '  ' + label.padEnd(18, ' ') + size.padEnd(12, ' ') + title.trim();
            }

            return label.padEnd(18, ' ') + title;
        });
    }

    function scrollOutput() {
        output.scrollTop = output.scrollHeight;
    }

    function setLines(lines) {
        output.innerHTML = '';
        lines.forEach(function(line) {
            const item = document.createElement('p');
            item.textContent = line;
            output.appendChild(item);
        });
        scrollOutput();
    }

    function writeLines(lines) {
        lines.forEach(function(line) {
            const item = document.createElement('p');
            item.textContent = line;
            output.appendChild(item);
        });
        scrollOutput();
    }

    function appendLine(line) {
        const item = document.createElement('p');
        item.textContent = line || '';
        output.appendChild(item);
        scrollOutput();
        return item;
    }

    function writePromptLine(commandLine) {
        writeLines([formatPath(cwd) + ' > ' + commandLine]);
    }

    function helpLines() {
        return [
            'NAVIGATION',
            '  pwd                  show current directory',
            '  ls [path]            list directory contents',
            '  ls -l [path]         list details',
            '  tree [path]          print directory tree',
            '  cd <path>            enter a directory or open a file',
            '  open <path>          open a page or file',
            '  cat <file>           print file content',
            '  grep <term> [path]   search file content',
            '  find <term> [path]   search files and titles',
            '  ask <question>       ask the site AI demo',
            '',
            'SHORTCUTS',
            '  posts fragments research status about ghostty',
            '  ll la .. home cls',
            '',
            'TOOLS',
            '  random               open a random post',
            '  whoami date uname    show environment info',
            '  clear                clear output'
        ];
    }

    const commandHelp = {
        pwd: ['pwd', '  show current virtual directory'],
        ls: ['ls [path]', 'ls -l [path]', '  list directory contents', '  example: ls posts'],
        tree: ['tree [path]', '  print a compact virtual file tree', '  example: tree', '  example: tree posts'],
        cd: ['cd <path>', '  enter a directory; files open directly', '  example: cd posts', '  example: cd first-post'],
        open: ['open <path>', '  open a directory or file route', '  example: open .', '  example: open /uses/ghostty'],
        cat: ['cat <file>', '  print file content in the terminal', '  example: cat posts/first-post'],
        grep: ['grep <term> [path]', '  search file content under a file or directory', '  example: grep theme uses/ghostty', '  example: grep attention research'],
        find: ['find <term> [path]', '  search names, titles, and content', '  example: find ghost', '  example: find attention research'],
        ask: ['ask <question>', '  ask the site AI demo about this blog', '  example: ask 你有哪些文章？', '  example: ask ghostty 配置是什么？'],
        clear: ['clear', '  clear terminal output'],
        random: ['random', '  open a random post'],
        whoami: ['whoami', '  print the site identity'],
        date: ['date', '  print the current local date and time'],
        uname: ['uname', '  print the terminal environment'],
        help: ['help [command]', '  show all commands or one command']
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

    function runLs(path) {
        const tokens = (path || '').split(/\s+/).filter(Boolean);
        const detailed = tokens.includes('-l');
        const target = tokens.filter(function(token) {
            return token !== '-l';
        }).join(' ');
        const resolved = target ? resolvePath(target) : { node: getNode(cwd), path: formatPath(cwd) };

        if (!resolved.node) {
            writeLines(['ls: cannot access ' + target]);
            return;
        }

        if (resolved.node.type !== 'dir') {
            writeLines([resolved.node.name]);
            return;
        }

        writeLines(listDir(resolved.node, detailed));
    }

    function treeLines(node, label, prefix) {
        const lines = [label];
        const names = Object.keys(node.children || {}).sort();

        names.forEach(function(name, index) {
            const child = node.children[name];
            const isLast = index === names.length - 1;
            const branch = isLast ? '`-- ' : '|-- ';
            const nextPrefix = prefix + (isLast ? '    ' : '|   ');
            const childLabel = child.type === 'dir' ? name + '/' : name;

            if (child.type === 'dir') {
                const childLines = treeLines(child, prefix + branch + childLabel, nextPrefix);
                lines.push.apply(lines, childLines);
                return;
            }

            lines.push(prefix + branch + childLabel);
        });

        return lines;
    }

    function runTree(path) {
        const target = path || '.';
        const resolved = resolvePath(target);

        if (!resolved.node) {
            writeLines(['tree: no such file or directory: ' + target]);
            return;
        }

        if (resolved.node.type !== 'dir') {
            writeLines([resolved.node.name]);
            return;
        }

        const label = resolved.path === '/' ? '/' : resolved.path.split('/').filter(Boolean).pop() + '/';
        writeLines(treeLines(resolved.node, label, ''));
    }

    function runCd(path) {
        if (!path) {
            cwd = [];
            writeCwd();
            updatePrompt();
            writeLines([formatPath(cwd)]);
            return;
        }

        const resolved = resolvePath(path);

        if (!resolved.node) {
            const hints = ['cd: no such file or directory: ' + path];

            if (!path.startsWith('/') && cwd.length && getNode([path])) {
                hints.push('hint: try cd /' + path);
            }

            writeLines(hints);
            return;
        }

        if (resolved.node.type === 'dir') {
            cwd = resolved.parts;
            writeCwd();
            updatePrompt();
            writeLines([formatPath(cwd)]);
            return;
        }

        openRoute(resolved.node);
    }

    function runOpen(path) {
        const target = path || '.';
        const resolved = resolvePath(target);

        if (!resolved.node) {
            writeLines(['open: no such file or directory: ' + target]);
            return;
        }

        if (!openRoute(resolved.node)) {
            writeLines(['open: no route for ' + target]);
        }
    }

    function runCat(path) {
        if (!path) {
            writeLines(['cat: missing operand']);
            return;
        }

        const resolved = resolvePath(path);

        if (!resolved.node) {
            writeLines(['cat: no such file or directory: ' + path]);
            return;
        }

        if (resolved.node.type === 'dir') {
            writeLines(['cat: ' + path + ' is a directory']);
            return;
        }

        const lines = (resolved.node.content || '').split(/\r?\n/);
        writeLines(lines.length && lines[0] ? lines : ['cat: ' + path + ' is empty']);
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

        return {
            term: tokens[0] || '',
            path: tokens.slice(1).join(' ')
        };
    }

    function runGrep(argument) {
        const args = parseSearchArgs(argument);

        if (!args.term) {
            writeLines(['grep: missing pattern']);
            return;
        }

        const resolved = args.path ? resolvePath(args.path) : { node: getNode(cwd), parts: cwd.slice(), path: formatPath(cwd) };

        if (!resolved.node) {
            writeLines(['grep: no such file or directory: ' + args.path]);
            return;
        }

        const term = args.term.toLowerCase();
        const matches = [];

        walkFiles(resolved.node, resolved.parts, function(node, parts) {
            const contentLines = (node.content || '').split(/\r?\n/);

            contentLines.forEach(function(line, index) {
                if (line.toLowerCase().includes(term)) {
                    matches.push(formatPath(parts) + ':' + (index + 1) + ': ' + line);
                }
            });
        });

        writeLines(matches.length ? matches : ['grep: no matches']);
    }

    function runFind(argument) {
        const args = parseSearchArgs(argument);

        if (!args.term) {
            writeLines(['find: missing query']);
            return;
        }

        const resolved = args.path ? resolvePath(args.path) : { node: vfs, parts: [], path: '/' };

        if (!resolved.node) {
            writeLines(['find: no such file or directory: ' + args.path]);
            return;
        }

        const term = args.term.toLowerCase();
        const matches = [];

        walkFiles(resolved.node, resolved.parts, function(node, parts) {
            const haystack = [formatPath(parts), node.title || '', node.content || ''].join('\n').toLowerCase();

            if (haystack.includes(term)) {
                matches.push(formatPath(parts).padEnd(24, ' ') + node.title);
            }
        });

        writeLines(matches.length ? matches : ['find: no matches']);
    }

    function runAsk(question) {
        if (!question) {
            writeLines(['ask: missing question', 'try: ask 你有哪些文章？']);
            return;
        }

        if (!window.siteAI || typeof window.siteAI.answer !== 'function') {
            writeLines(['ask: AI module unavailable']);
            return;
        }

        const context = {
            vfs: vfs,
            cwd: cwd.slice(),
            formatPath: formatPath,
            listDir: listDir
        };
        const response = window.siteAI.answer(question, context);
        const lines = Array.isArray(response) ? response : [String(response)];
        let lineIndex = 0;

        function streamNextLine() {
            if (lineIndex >= lines.length) {
                return;
            }

            const line = lines[lineIndex];
            const item = appendLine('');
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
    }

    function runShortcut(command) {
        const shortcuts = {
            posts: '/posts/',
            fragments: '/fragments/',
            research: '/research/',
            status: '/status/',
            about: '/introduction/',
            ghostty: '/uses/ghostty/'
        };

        if (!shortcuts[command]) {
            return false;
        }

        window.location.href = shortcuts[command];
        return true;
    }

    function runCommand(value) {
        const commandLine = value.trim();

        if (!commandLine) {
            return;
        }

        const expandedLine = aliases[commandLine] || commandLine;
        const parts = expandedLine.split(/\s+/);
        const command = parts[0].toLowerCase();
        const argument = expandedLine.slice(command.length).trim();

        if (command === 'help' || command === '?') {
            if (argument) {
                writeLines(commandHelp[argument] || ['help: no entry for ' + argument]);
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
            writeLines([formatPath(cwd)]);
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
                writeLines(['random: no posts found']);
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

        writeLines(['unknown command: ' + commandLine, 'type "help"']);
    }

    function runExternalCommand(commandLine) {
        const trimmed = String(commandLine || '').trim();

        if (!trimmed) {
            return;
        }

        open();

        if (commandHistory[commandHistory.length - 1] !== trimmed) {
            commandHistory.push(trimmed);
            if (commandHistory.length > historyLimit) {
                commandHistory.shift();
            }
        }

        historyIndex = commandHistory.length;
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
        const commandNames = ['help', 'pwd', 'ls', 'tree', 'cd', 'open', 'cat', 'grep', 'find', 'ask', 'clear', 'random', 'whoami', 'date', 'uname', 'll', 'la', '..', 'home', 'cls', 'posts', 'fragments', 'research', 'status', 'about', 'ghostty'];
        const parts = value.trimStart().split(/\s+/);
        const command = parts[0] || '';

        if (!value.trim()) {
            writeLines(['available commands:'].concat(commandNames));
            return;
        }

        if ((command === 'cd' || command === 'ls' || command === 'tree' || command === 'open' || command === 'cat') && value.includes(' ')) {
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
        input.value = initialValue || '';
        updatePrompt();
        setLines(welcomeLines());
        document.dispatchEvent(new CustomEvent('command-palette:open'));
        window.setTimeout(function() {
            input.focus();
        }, 0);
    }

    function close() {
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
        const commandLine = input.value.trim();

        if (!commandLine) {
            return;
        }

        if (commandHistory[commandHistory.length - 1] !== commandLine) {
            commandHistory.push(commandLine);
            if (commandHistory.length > historyLimit) {
                commandHistory.shift();
            }
        }

        historyIndex = commandHistory.length;
        writePromptLine(commandLine);
        runCommand(commandLine);
        input.value = '';
    });

    input.addEventListener('keydown', function(event) {
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
