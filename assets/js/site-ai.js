(function() {
    function readSiteData() {
        const dataElement = document.getElementById('site-data');

        if (!dataElement) {
            return {};
        }

        try {
            return JSON.parse(dataElement.textContent || '{}');
        } catch (error) {
            return {};
        }
    }

    function includesAny(text, terms) {
        return terms.some(function(term) {
            return text.includes(term);
        });
    }

    function nameFromUrl(url) {
        const clean = String(url || '').replace(/^\/|\/$/g, '');
        const parts = clean.split('/').filter(Boolean);
        return parts[parts.length - 1] || 'item';
    }

    function formatUrl(url, fallback) {
        const clean = String(url || '').replace(/\/$/g, '');
        return clean || fallback || '/';
    }

    function getChildren(context, name) {
        if (context && context.vfs && context.vfs.children) {
            const node = context.vfs.children[name];

            if (node && node.children) {
                return Object.keys(node.children).sort().map(function(key) {
                    return node.children[key];
                });
            }
        }

        const data = readSiteData();
        const collection = name === 'research' ? 'publications' : name;
        return (data[collection] || []).map(function(item) {
            return {
                name: nameFromUrl(item.url),
                title: item.title || nameFromUrl(item.url),
                url: item.url,
                content: item.content || ''
            };
        });
    }

    function itemPath(context, root, item) {
        if (context && typeof context.formatPath === 'function' && item.name) {
            return context.formatPath([root, item.name]);
        }

        return formatUrl(item.url, '/' + root + '/' + item.name);
    }

    function getLine(content, prefix) {
        return (content || '').split(/\r?\n/).find(function(line) {
            return line.toLowerCase().startsWith(prefix.toLowerCase());
        }) || '';
    }

    function answerAbout() {
        return [
            'AI demo:',
            '这里是 jiaaozhe 的个人站点。',
            'Focus: Multimodal Representation / Automation.',
            'Research: Unified multimodal understanding, contrastive learning, and applied automation.'
        ];
    }

    function answerPosts(context) {
        const posts = getChildren(context, 'posts');

        if (!posts.length) {
            return ['AI demo:', '目前还没有可列出的文章。'];
        }

        return ['AI demo:', '当前文章：'].concat(posts.map(function(post) {
            return '- ' + post.title + ' (' + itemPath(context, 'posts', post) + ')';
        }));
    }

    function answerResearch(context) {
        const publications = getChildren(context, 'research');

        if (!publications.length) {
            return ['AI demo:', '研究内容在 /research，目前没有注入论文条目。'];
        }

        return ['AI demo:', '研究内容在 /research。当前论文：'].concat(publications.map(function(publication) {
            return '- ' + publication.title + ' (' + itemPath(context, 'research', publication) + ')';
        }));
    }

    function answerUses(question, context) {
        const uses = getChildren(context, 'uses');
        const ghostty = uses.find(function(item) {
            return item.name === 'ghostty' || String(item.title || '').toLowerCase().includes('ghostty');
        });

        if (question.includes('ghostty') && ghostty) {
            return [
                'AI demo:',
                'Ghostty 是 uses 目录里的终端配置。',
                getLine(ghostty.content, 'font-family') || 'font-family: not found',
                getLine(ghostty.content, 'font-size') || 'font-size: not found',
                getLine(ghostty.content, 'theme') || 'theme: not found'
            ];
        }

        if (!uses.length) {
            return ['AI demo:', '目前没有 uses 条目。'];
        }

        return ['AI demo:', 'uses 目录记录常用工具：'].concat(uses.map(function(use) {
            return '- ' + use.title + ' (' + itemPath(context, 'uses', use) + ')';
        }));
    }

    function answerSite() {
        return [
            'AI demo:',
            '这个站点包含：',
            '- /posts：文章',
            '- /fragments：碎片流',
            '- /research：学术研究',
            '- /uses：工具配置',
            '- /status：状态页'
        ];
    }

    function answerDemoQuestions() {
        return [
            'AI demo questions:',
            '你是谁？',
            '你有哪些文章？',
            'ghostty 配置是什么？',
            '你的研究方向是什么？',
            '这个网站有什么内容？'
        ];
    }

    function fallback() {
        return [
            'AI demo:',
            '我现在是本地规则 demo，还没有接入大模型。',
            '可以试试：',
            '你有哪些文章？',
            'ghostty 配置是什么？',
            '你的研究方向是什么？'
        ];
    }

    function answer(question, context) {
        const q = String(question || '').toLowerCase();

        if (includesAny(q, ['demo', '示例', '问题', '怎么问'])) {
            return answerDemoQuestions();
        }

        if (includesAny(q, ['你是谁', 'about', '介绍', '个人', 'jiaaozhe'])) {
            return answerAbout(context);
        }

        if (includesAny(q, ['文章', '博客', 'posts', '有哪些文章', '写了什么'])) {
            return answerPosts(context);
        }

        if (includesAny(q, ['研究', '论文', 'research', 'publication', 'attention', 'iioa'])) {
            return answerResearch(context);
        }

        if (includesAny(q, ['ghostty', '终端', 'terminal', '配置', 'uses', '工具', 'vscode'])) {
            return answerUses(q, context);
        }

        if (includesAny(q, ['网站', '站点', 'site', '目录', '有什么', '导航', '内容'])) {
            return answerSite(context);
        }

        return fallback();
    }

    window.siteAI = {
        answer: answer
    };
})();
