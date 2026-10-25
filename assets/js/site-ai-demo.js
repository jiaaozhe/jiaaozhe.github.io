(function() {
    function getSiteData() {
        if (!window.siteData) {
            throw new Error('Site data module unavailable.');
        }

        return window.siteData;
    }

    function includesAny(text, terms) {
        return terms.some(function(term) {
            return text.includes(term);
        });
    }

    function getRoutes(manifest, type) {
        return (manifest.routes || []).filter(function(route) {
            return route.type === type;
        });
    }

    function itemPath(item) {
        return item.url || item.id || '/';
    }

    function getLine(content, prefix) {
        return (content || '').split(/\r?\n/).find(function(line) {
            return line.toLowerCase().startsWith(prefix.toLowerCase());
        }) || '';
    }

    function answerAbout(manifest) {
        const profile = manifest.profile || {};

        return [
            'AI demo:',
            '这里是 ' + (profile.name || 'jiaaozhe') + ' 的个人站点。',
            'Focus: ' + (profile.focus || 'Multimodal Representation / Automation') + '.',
            'Research: ' + (profile.research || '暂无研究简介')
        ];
    }

    function answerPosts(manifest) {
        const posts = getRoutes(manifest, 'post');

        if (!posts.length) {
            return ['AI demo:', '目前还没有可列出的文章。'];
        }

        return ['AI demo:', '当前文章：'].concat(posts.map(function(post) {
            return '- ' + post.title + ' (' + itemPath(post) + ')';
        }));
    }

    function answerReads(manifest) {
        const reads = getRoutes(manifest, 'read');

        if (!reads.length) {
            return ['AI demo:', '目前还没有可列出的分享。'];
        }

        return ['AI demo:', '分享过的好文章：'].concat(reads.map(function(read) {
            return '- ' + read.title + ' (' + itemPath(read) + ')';
        }));
    }

    function answerResearch(manifest) {
        const publications = getRoutes(manifest, 'publication');

        if (!publications.length) {
            return ['AI demo:', '研究内容在 /research，目前没有注入论文条目。'];
        }

        return ['AI demo:', '研究内容在 /research。当前论文：'].concat(publications.map(function(publication) {
            return '- ' + publication.title + ' (' + itemPath(publication) + ')';
        }));
    }

    function answerPhotos(manifest) {
        const photos = getRoutes(manifest, 'photo');

        if (!photos.length) {
            return ['AI demo:', '目前还没有可列出的摄影文章。'];
        }

        return ['AI demo:', '当前摄影文章：'].concat(photos.map(function(photo) {
            return '- ' + photo.title + ' (' + itemPath(photo) + ')';
        }));
    }

    async function answerUses(question, manifest) {
        const uses = getRoutes(manifest, 'use');
        const ghostty = uses.find(function(item) {
            return item.name === 'ghostty' || String(item.title || '').toLowerCase().includes('ghostty');
        });

        if (question.includes('ghostty') && ghostty) {
            const page = await getSiteData().getContent(ghostty.id);
            const content = page ? page.content : '';

            return [
                'AI demo:',
                'Ghostty 是 uses 目录里的终端配置。',
                getLine(content, 'font-family') || 'font-family: not found',
                getLine(content, 'font-size') || 'font-size: not found',
                getLine(content, 'theme') || 'theme: not found'
            ];
        }

        if (!uses.length) {
            return ['AI demo:', '目前没有 uses 条目。'];
        }

        return ['AI demo:', 'uses 目录记录常用工具：'].concat(uses.map(function(use) {
            return '- ' + use.title + ' (' + itemPath(use) + ')';
        }));
    }

    function answerSite(manifest) {
        const sections = (manifest.sections || []).map(function(section) {
            return '- ' + section.url + '：' + section.title;
        });

        return [
            'AI demo:',
            '这个站点包含：'
        ].concat(sections);
    }

    function answerDemoQuestions() {
        return [
            'AI demo questions:',
            '你是谁？',
            '你有哪些文章？',
            '你分享了哪些好文章？',
            '你有哪些照片？',
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

    async function demoAnswer(question, manifest) {
        const q = String(question || '').toLowerCase();

        if (includesAny(q, ['demo', '示例', '问题', '怎么问'])) {
            return answerDemoQuestions();
        }

        if (includesAny(q, ['你是谁', 'about', '介绍', '个人', 'jiaaozhe'])) {
            return answerAbout(manifest);
        }

        if (includesAny(q, ['分享', '好文', '推荐阅读', '阅读', 'reads', 'reading'])) {
            return answerReads(manifest);
        }

        if (includesAny(q, ['照片', '摄影', 'photo', 'photos', '相机'])) {
            return answerPhotos(manifest);
        }

        if (includesAny(q, ['文章', '博客', 'posts', '有哪些文章', '写了什么'])) {
            return answerPosts(manifest);
        }

        if (includesAny(q, ['研究', '论文', 'research', 'publication', 'attention', 'iioa'])) {
            return answerResearch(manifest);
        }

        if (includesAny(q, ['ghostty', '终端配置', 'terminal config', '配置', 'uses', 'vscode'])) {
            return answerUses(q, manifest);
        }

        if (includesAny(q, ['网站', '站点', 'site', '目录', '有什么', '导航', '内容'])) {
            return answerSite(manifest);
        }

        return fallback();
    }

    window.siteAIDemo = Object.freeze({ answer: demoAnswer });
})();
