(function() {
    const CONFIG_KEY = 'site-ai.config';
    const CRYPTO_DB_NAME = 'site-ai-crypto';
    const CRYPTO_DB_VERSION = 1;
    const CRYPTO_STORE = 'keys';
    const API_KEY_ID = 'api-key';
    const MAX_PAGES = 5;
    const MAX_CHARS_PER_PAGE = 8000;
    const MAX_TOTAL_CHARS = 24000;
    let cryptoDbPromise = null;

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

    function answerTools(manifest) {
        const tools = getRoutes(manifest, 'tool');

        if (!tools.length) {
            return ['AI demo:', '目前还没有可运行的站内工具。'];
        }

        return ['AI demo:', '当前工具：'].concat(tools.map(function(tool) {
            return '- ' + tool.title + ' (' + itemPath(tool) + ')';
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

        if (includesAny(q, ['工具', '小工具', '在线工具', 'tools', 'tool'])) {
            return answerTools(manifest);
        }

        if (includesAny(q, ['网站', '站点', 'site', '目录', '有什么', '导航', '内容'])) {
            return answerSite(manifest);
        }

        return fallback();
    }

    function readStoredConfig() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') || {};
        } catch (error) {
            return {};
        }
    }

    function normalizeConfig(config) {
        return {
            baseUrl: String(config.baseUrl || '').trim().replace(/\/+$/, ''),
            model: String(config.model || '').trim()
        };
    }

    function bytesToBase64(bytes) {
        let binary = '';

        bytes.forEach(function(byte) {
            binary += String.fromCharCode(byte);
        });

        return btoa(binary);
    }

    function base64ToBytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }

        return bytes;
    }

    function assertCryptoSupport() {
        if (!window.crypto || !window.crypto.subtle || !window.indexedDB) {
            throw new Error('This browser cannot save encrypted API keys.');
        }
    }

    function openCryptoDb() {
        assertCryptoSupport();

        if (!cryptoDbPromise) {
            cryptoDbPromise = new Promise(function(resolve, reject) {
                const request = indexedDB.open(CRYPTO_DB_NAME, CRYPTO_DB_VERSION);

                request.onupgradeneeded = function() {
                    const db = request.result;

                    if (!db.objectStoreNames.contains(CRYPTO_STORE)) {
                        db.createObjectStore(CRYPTO_STORE);
                    }
                };
                request.onsuccess = function() {
                    resolve(request.result);
                };
                request.onerror = function() {
                    reject(request.error);
                };
            });
        }

        return cryptoDbPromise;
    }

    async function readCryptoKey() {
        const db = await openCryptoDb();

        return new Promise(function(resolve, reject) {
            const transaction = db.transaction(CRYPTO_STORE, 'readonly');
            const request = transaction.objectStore(CRYPTO_STORE).get(API_KEY_ID);

            request.onsuccess = function() {
                resolve(request.result || null);
            };
            request.onerror = function() {
                reject(request.error);
            };
        });
    }

    async function writeCryptoKey(key) {
        const db = await openCryptoDb();

        return new Promise(function(resolve, reject) {
            const transaction = db.transaction(CRYPTO_STORE, 'readwrite');
            const request = transaction.objectStore(CRYPTO_STORE).put(key, API_KEY_ID);

            request.onsuccess = function() {
                resolve();
            };
            request.onerror = function() {
                reject(request.error);
            };
        });
    }

    async function deleteCryptoKey() {
        if (!window.indexedDB) {
            return;
        }

        const db = await openCryptoDb();

        return new Promise(function(resolve, reject) {
            const transaction = db.transaction(CRYPTO_STORE, 'readwrite');
            const request = transaction.objectStore(CRYPTO_STORE).delete(API_KEY_ID);

            request.onsuccess = function() {
                resolve();
            };
            request.onerror = function() {
                reject(request.error);
            };
        });
    }

    async function getOrCreateCryptoKey() {
        const existing = await readCryptoKey();

        if (existing) {
            return existing;
        }

        const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        await writeCryptoKey(key);
        return key;
    }

    async function encryptApiKey(apiKey) {
        const key = await getOrCreateCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(apiKey);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoded);

        return {
            apiKeyEncrypted: bytesToBase64(new Uint8Array(encrypted)),
            apiKeyIv: bytesToBase64(iv)
        };
    }

    async function decryptApiKey(config) {
        if (!config.apiKeyEncrypted || !config.apiKeyIv) {
            return '';
        }

        const key = await readCryptoKey();

        if (!key) {
            return '';
        }

        const encrypted = base64ToBytes(String(config.apiKeyEncrypted));
        const iv = base64ToBytes(String(config.apiKeyIv));
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encrypted);

        return new TextDecoder().decode(decrypted);
    }

    async function readConfig() {
        const stored = readStoredConfig();
        const next = normalizeConfig(stored);
        const oldPlainApiKey = String(stored.apiKey || '');
        let apiKey = '';

        if (stored.apiKeyEncrypted && stored.apiKeyIv) {
            apiKey = await decryptApiKey(stored).catch(function() {
                return '';
            });
        } else if (oldPlainApiKey) {
            await writeConfig({
                baseUrl: next.baseUrl,
                apiKey: oldPlainApiKey,
                model: next.model
            });
            apiKey = oldPlainApiKey;
        }

        return {
            baseUrl: next.baseUrl,
            apiKey: apiKey,
            hasSavedApiKey: Boolean(apiKey),
            model: next.model
        };
    }

    async function writeConfig(config) {
        const previous = readStoredConfig();
        const next = normalizeConfig(config);
        const plainApiKey = String(config.apiKey || '');

        if (plainApiKey) {
            Object.assign(next, await encryptApiKey(plainApiKey));
        } else if (previous.apiKeyEncrypted && previous.apiKeyIv) {
            next.apiKeyEncrypted = previous.apiKeyEncrypted;
            next.apiKeyIv = previous.apiKeyIv;
        } else if (previous.apiKey) {
            Object.assign(next, await encryptApiKey(String(previous.apiKey)));
        }

        localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
        return next;
    }

    async function clearConfig() {
        localStorage.removeItem(CONFIG_KEY);
        await deleteCryptoKey().catch(function() {});
    }

    function hasConfig(config) {
        const value = config || readStoredConfig();
        return Boolean(value.baseUrl && value.model);
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

    function compactCatalog(manifest) {
        const routes = Array.isArray(manifest.routes) ? manifest.routes : [];
        return routes.map(function(page) {
            return {
                id: page.id,
                type: page.type,
                title: page.title,
                url: page.url,
                date: page.date,
                summary: page.summary,
                tags: page.tags || []
            };
        });
    }

    function cleanPlan(plan, manifest) {
        const pages = Array.isArray(manifest.routes) ? manifest.routes : [];
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

    async function planAnswer(config, question, manifest) {
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
            JSON.stringify(manifest.profile || {}),
            '',
            '页面目录：',
            JSON.stringify(compactCatalog(manifest))
        ].join('\n');
        const response = await chatCompletion(config, [
            { role: 'system', content: '你是一个严谨的站点问答规划器，只返回符合要求的 JSON。' },
            { role: 'user', content: prompt }
        ], { temperature: 0 });
        return cleanPlan(parseJsonObject(response), manifest);
    }

    function buildContext(ids, contentData, manifest) {
        const contentPages = contentData.pages || {};
        const indexById = {};
        let total = 0;

        (manifest.routes || []).forEach(function(page) {
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
        const config = await readConfig();
        const onStatus = options && typeof options.onStatus === 'function' ? options.onStatus : function() {};
        const siteData = getSiteData();

        onStatus('读取站点目录');
        const manifest = await siteData.loadManifest();

        if (!hasConfig(config)) {
            return demoAnswer(question, manifest);
        }

        onStatus('分析问题');
        const plan = await planAnswer(config, question, manifest);

        if (plan.action === 'answer') {
            return splitAnswer(plan.answer);
        }

        if (!plan.pages.length) {
            return ['我没有在站点目录中找到需要读取的具体页面。'];
        }

        onStatus('读取页面内容');
        const content = await siteData.loadContent();
        const contextBlocks = buildContext(plan.pages, content, manifest);

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
        const config = await readConfig();

        if (!hasConfig(config)) {
            throw new Error('Base URL and model are required.');
        }

        await chatCompletion(config, [
            { role: 'user', content: 'Reply with OK.' }
        ], { temperature: 0 });

        return true;
    }

    function answer(question) {
        return getSiteData().loadManifest().then(function(manifest) {
            return demoAnswer(question, manifest);
        });
    }

    window.siteAI = {
        answer: answer,
        answerAsync: answerWithModel,
        clearConfig: clearConfig,
        hasConfig: hasConfig,
        readConfig: readConfig,
        testConnection: testConnection,
        writeConfig: writeConfig
    };
})();
