(function() {
    const { readConfig, writeConfig, clearConfig, hasConfig } = window.siteAIConfig;
    const { chatCompletion } = window.siteAIClient;
    const { parseJsonObject, compactCatalog, cleanPlan, buildContext } = window.siteAIContext;
    const demoAnswer = window.siteAIDemo.answer;

    function getSiteData() {
        return window.siteData;
    }

    function splitAnswer(text) {
        return String(text || '').split(/\r?\n/).filter(function(line) {
            return line.trim();
        });
    }

    async function planAnswer(config, question, manifest, options) {
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
        ], { temperature: 0, signal: options && options.signal });
        return cleanPlan(parseJsonObject(response), manifest);
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
        const plan = await planAnswer(config, question, manifest, options);

        if (plan.action === 'answer') {
            return splitAnswer(plan.answer);
        }

        if (!plan.pages.length) {
            return ['我没有在站点目录中找到需要读取的具体页面。'];
        }

        onStatus('读取页面内容');
        const content = await siteData.loadContent();
        const contextBlocks = buildContext(plan.pages, content, manifest, question);

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
        ], { temperature: 0.2, signal: options && options.signal });

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

    window.siteAI = Object.freeze({
        answer: answer,
        answerAsync: answerWithModel,
        clearConfig: clearConfig,
        hasConfig: hasConfig,
        readConfig: readConfig,
        testConnection: testConnection,
        writeConfig: writeConfig
    });
})();
