(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.siteTerminalFS = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
    const textEncoder = new TextEncoder();

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

        return textEncoder.encode(text).length;
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
        const sections = Array.isArray(data.sections) ? data.sections : [];
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

            if (route.type === 'page' && route.name === 'home') {
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

        return { root: root, shortcuts: nextShortcuts };
    }

    function getNode(vfs, parts) {
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

    function resolveParts(path, cwd) {
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

    return Object.freeze({
        create: buildVfs,
        byteLength: byteLength,
        getNode: getNode,
        resolveParts: resolveParts
    });
});
