(function() {
    const CONFIG_KEY = 'site-ai.config';
    const INDEX_URL = '/site-page-index.json';
    const CONTENT_URL = '/site-page-content.json';
    const MAX_PAGES = 5;
    const MAX_CHARS_PER_PAGE = 8000;
    const MAX_TOTAL_CHARS = 24000;
    let indexCache = null;
    let contentCache = null;

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

    function answerPhotos(context) {
        const photos = getChildren(context, 'photos');

        if (!photos.length) {
            return ['AI demo:', '目前还没有可列出的摄影文章。'];
        }

        return ['AI demo:', '当前摄影文章：'].concat(photos.map(function(photo) {
            return '- ' + photo.title + ' (' + itemPath(context, 'photos', photo) + ')';
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
            '- /photos：摄影',
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

    function demoAnswer(question, context) {
        const q = String(question || '').toLowerCase();

        if (includesAny(q, ['demo', '示例', '问题', '怎么问'])) {
            return answerDemoQuestions();
        }

        if (includesAny(q, ['你是谁', 'about', '介绍', '个人', 'jiaaozhe'])) {
            return answerAbout(context);
        }

        if (includesAny(q, ['照片', '摄影', 'photo', 'photos', '相机'])) {
            return answerPhotos(context);
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

    function readConfig() {
        try {
            const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
            return {
                baseUrl: String(config.baseUrl || '').trim().replace(/\/+$/, ''),
                apiKey: String(config.apiKey || ''),
                model: String(config.model || '').trim()
            };
        } catch (error) {
            return { baseUrl: '', apiKey: '', model: '' };
        }
    }

    function writeConfig(config) {
        const next = {
            baseUrl: String(config.baseUrl || '').trim().replace(/\/+$/, ''),
            apiKey: String(config.apiKey || ''),
            model: String(config.model || '').trim()
        };
        localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
        return next;
    }

    function clearConfig() {
        localStorage.removeItem(CONFIG_KEY);
    }

    function hasConfig(config) {
        const value = config || readConfig();
        return Boolean(value.baseUrl && value.model);
    }

    async function fetchJson(url) {
        const response = await fetch(url + '?v=' + encodeURIComponent(Date.now()), {
            cache: 'no-cache'
        });

        if (!response.ok) {
            throw new Error('Cannot load ' + url + ': HTTP ' + response.status);
        }

        return response.json();
    }

    async function loadIndex() {
        if (!indexCache) {
            indexCache = await fetchJson(INDEX_URL);
        }

        return indexCache;
    }

    async function loadContent() {
        if (!contentCache) {
            contentCache = await fetchJson(CONTENT_URL);
        }

        return contentCache;
    }

    async function chatCompletion(config, messages, options) {
        const body = {
            model: config.model,
            messages: messages,
            temperature: options && typeof options.temperature === 'number' ? options.temperature : 0.2
        };
        const headers = {
            'Content-Type': 'application/json'
        };

        if (config.apiKey) {
            headers.Authorization = 'Bearer ' + config.apiKey;
        }

        const response = await fetch(config.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text().catch(function() {
                return '';
            });
            throw new Error('Model request failed: HTTP ' + response.status + (text ? ' ' + text.slice(0, 180) : ''));
        }

        const data = await response.json();
        const content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';

        if (!content) {
            throw new Error('Model returned an empty response.');
        }

        return String(content).trim();
    }

    function parseJsonObject(text) {
        const clean = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

        try {
            return JSON.parse(clean);
        } catch (error) {
            const start = clean.indexOf('{');
            const end = clean.lastIndexOf('}');

            if (start >= 0 && end > start) {
                return JSON.parse(clean.slice(start, end + 1));
            }

            throw error;
        }
    }

    function compactCatalog(index) {
        const pages = Array.isArray(index.pages) ? index.pages : [];
        return pages.map(function(page) {
            return {
                id: page.id,
                type: page.type,
                title: page.title,
                url: page.url,
                date: page.date,
                summary: page.summary,
                tags: page.tags || [],
                headings: page.headings || []
            };
        });
    }

    function cleanPlan(plan, index) {
        const pages = Array.isArray(index.pages) ? index.pages : [];
        const action = plan.action === 'read_pages' ? 'read_pages' : 'answer';
        const allowed = new Set(pages.map(function(page) {
            return page.id;
        }));
        const deduped = [];

        (Array.isArray(plan.pages) ? plan.pages : []).forEach(function(item) {
            const id = typeof item === 'string' ? item : item && item.id;

            if (id && allowed.has(id) && !deduped.includes(id)) {
                deduped.push(id);
            }
        });

        return {
            action: action,
            pages: deduped.slice(0, MAX_PAGES),
            answer: String(plan.answer || '').trim()
        };
    }

    function splitAnswer(text) {
        return String(text || '').split(/\r?\n/).filter(function(line) {
            return line.trim();
        });
    }

    async function planAnswer(config, question, index) {
        const prompt = [
            '你会收到用户问题、站点简介和页面目录。',
            '先判断是否必须读取具体页面正文才能可靠回答。',
            '',
            '如果根据用户问题、站点简介、页面目录或通用知识已经可以回答，返回：',
            '{"action":"answer","pages":[],"answer":"最终回答"}',
            '',
            '如果必须查看某些具体页面正文，返回：',
            '{"action":"read_pages","pages":["/page/"],"answer":""}',
            '',
            '规则：',
            '- pages 只能使用页面目录中存在的 id，最多 5 个。',
            '- 如果用户问本站是否有某类内容而目录里没有，直接 action=answer，并说明目前没看到相关页面。',
            '- 如果用户问通用知识、解释、建议或代码问题，直接 action=answer。',
            '- 如果用户问站点是谁、网站有什么、有哪些文章/摄影/研究，优先根据站点简介和页面目录直接回答。',
            '- 回答要简洁自然。引用站内页面时使用“标题（URL）”，不要输出 [1] 这类内部编号。',
            '- 只返回 JSON，不要输出额外解释。',
            '',
            '用户问题：',
            question,
            '',
            '站点简介：',
            JSON.stringify(index.profile || {}),
            '',
            '页面目录：',
            JSON.stringify(compactCatalog(index))
        ].join('\n');
        const response = await chatCompletion(config, [
            { role: 'system', content: '你是一个严谨的站点问答规划器，只返回符合要求的 JSON。' },
            { role: 'user', content: prompt }
        ], { temperature: 0 });
        return cleanPlan(parseJsonObject(response), index);
    }

    function buildContext(ids, contentData, indexData) {
        const contentPages = contentData.pages || {};
        const indexById = {};
        let total = 0;

        (indexData.pages || []).forEach(function(page) {
            indexById[page.id] = page;
        });

        return ids.map(function(id, index) {
            const page = contentPages[id] || indexById[id] || {};
            const title = page.title || (indexById[id] && indexById[id].title) || id;
            const url = page.url || (indexById[id] && indexById[id].url) || id;
            const rawContent = String(page.content || indexById[id].summary || '').trim();
            const remaining = Math.max(0, MAX_TOTAL_CHARS - total);
            const content = rawContent.slice(0, Math.min(MAX_CHARS_PER_PAGE, remaining));

            total += content.length;

            return [
                'PAGE ' + (index + 1),
                'TITLE: ' + title,
                'URL: ' + url,
                'CONTENT:',
                content
            ].join('\n');
        }).filter(function(block) {
            return block.includes('CONTENT:\n') && !block.endsWith('CONTENT:\n');
        });
    }

    async function answerWithModel(question, options) {
        const config = readConfig();
        const onStatus = options && typeof options.onStatus === 'function' ? options.onStatus : function() {};

        if (!hasConfig(config)) {
            return demoAnswer(question, options && options.context);
        }

        onStatus('读取站点目录');
        const index = await loadIndex();

        onStatus('分析问题');
        const plan = await planAnswer(config, question, index);

        if (plan.action === 'answer') {
            return splitAnswer(plan.answer);
        }

        if (!plan.pages.length) {
            return ['我没有在站点目录中找到需要读取的具体页面。'];
        }

        onStatus('读取页面内容');
        const content = await loadContent();
        const contextBlocks = buildContext(plan.pages, content, index);

        if (!contextBlocks.length) {
            return ['找到了相关页面，但没有可用正文内容。'];
        }

        onStatus('生成回答');
        const answer = await chatCompletion(config, [
            {
                role: 'system',
                content: [
                    '你是这个个人网站的问答助手。',
                    '只能根据用户提供的站点页面内容回答。',
                    '如果内容不足，就明确说不知道。',
                    '回答要简洁。',
                    '如果使用了站内页面内容，最后列出“参考：”，每条使用“- 标题（URL）”。',
                    '不要输出 [1]、PAGE 1 这类内部编号。'
                ].join('\n')
            },
            {
                role: 'user',
                content: [
                    '用户问题：',
                    question,
                    '',
                    '相关页面内容：',
                    contextBlocks.join('\n\n---\n\n')
                ].join('\n')
            }
        ], { temperature: 0.2 });

        return splitAnswer(answer);
    }

    async function testConnection() {
        const config = readConfig();

        if (!hasConfig(config)) {
            throw new Error('Base URL and model are required.');
        }

        await chatCompletion(config, [
            { role: 'user', content: 'Reply with OK.' }
        ], { temperature: 0 });

        return true;
    }

    window.siteAI = {
        answer: demoAnswer,
        answerAsync: answerWithModel,
        clearConfig: clearConfig,
        hasConfig: hasConfig,
        readConfig: readConfig,
        testConnection: testConnection,
        writeConfig: writeConfig
    };
})();
