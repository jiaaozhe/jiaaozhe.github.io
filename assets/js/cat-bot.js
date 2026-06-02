document.addEventListener('DOMContentLoaded', function() {
    const AI_MESSAGES_KEY = 'cat-ai.messages';
    const AI_MESSAGE_LIMIT = 30;
    const AI_PANEL_SIZE_KEY = 'cat-ai.panel-size';
    const AI_PANEL_DESKTOP_QUERY = '(min-width: 561px)';
    const AI_KEY_EMPTY_PLACEHOLDER = 'optional for local models';
    const AI_KEY_SAVED_PLACEHOLDER = 'saved key';
    const catBotWrap = document.querySelector('[data-cat-bot]');
    const catBot = catBotWrap ? catBotWrap.querySelector('.cat-bot') : null;
    const catMenu = catBotWrap ? catBotWrap.querySelector('.cat-bot-menu') : null;
    const catExpression = catBotWrap ? catBotWrap.querySelector('.cat-bot-expression') : null;
    const catAiPanel = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-panel]') : null;
    const catAiForm = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-form]') : null;
    const catAiInput = catBotWrap ? catBotWrap.querySelector('.cat-ai-input') : null;
    const catAiOutput = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-output]') : null;
    const catAiClose = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-close]') : null;
    const catAiMode = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-mode]') : null;
    const catAiConfigForm = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-config-form]') : null;
    const catAiConfigStatus = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-config-status]') : null;
    const catAiTest = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-test]') : null;
    const catAiClear = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-clear]') : null;
    const catAiClearChat = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-clear-chat]') : null;
    const catAiResize = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-resize]') : null;

    if (!catBotWrap || !catBot || !catMenu || !catExpression) {
        return;
    }

    let clickCount = 0;
    let clickTimer = null;
    let singleClickTimer = null;
    let resetExpressionTimer = null;
    let aiStreamId = 0;
    let aiMessages = [];
    let panelResizeTimer = null;

    function setCatMenu(open) {
        catBotWrap.classList.toggle('is-open', open);
        catBot.classList.toggle('is-menu-open', open);
        catBot.setAttribute('aria-expanded', String(open));
        catMenu.setAttribute('aria-hidden', String(!open));
    }

    function setAiPanel(open) {
        const askButton = catMenu.querySelector('[data-cat-action="ask-ai"]');

        if (!catAiPanel) {
            return;
        }

        if (!open) {
            aiStreamId += 1;
        }

        catAiPanel.hidden = !open;
        catAiPanel.setAttribute('aria-hidden', String(!open));
        catBotWrap.classList.toggle('is-asking', open);

        if (askButton) {
            askButton.setAttribute('aria-expanded', String(open));
        }

        if (open && catAiInput) {
            window.setTimeout(function() {
                catAiInput.focus();
            }, 0);
        }
    }

    function setExpression(value, duration) {
        window.clearTimeout(resetExpressionTimer);
        catExpression.textContent = value;
        catBot.classList.add('is-surprised');
        resetExpressionTimer = window.setTimeout(function() {
            catBot.classList.remove('is-surprised');
            catExpression.textContent = '^_^';
        }, duration || 900);
    }

    function triggerEasterEgg() {
        window.clearTimeout(resetExpressionTimer);
        catExpression.textContent = '!!!';
        catBot.classList.add('is-easter');
        window.setTimeout(function() {
            catBot.classList.remove('is-easter');
            catExpression.textContent = '^_^';
        }, 1200);
    }

    function scrollCatAiOutput() {
        if (catAiOutput) {
            catAiOutput.scrollTop = catAiOutput.scrollHeight;
        }
    }

    function panelSizeLimits() {
        return {
            minWidth: 320,
            minHeight: 360,
            maxWidth: Math.max(320, window.innerWidth - 48),
            maxHeight: Math.max(360, window.innerHeight - 116)
        };
    }

    function clampPanelSize(size) {
        const limits = panelSizeLimits();

        return {
            width: Math.min(limits.maxWidth, Math.max(limits.minWidth, Number(size.width) || 360)),
            height: Math.min(limits.maxHeight, Math.max(limits.minHeight, Number(size.height) || limits.maxHeight))
        };
    }

    function isDesktopPanel() {
        return window.matchMedia(AI_PANEL_DESKTOP_QUERY).matches;
    }

    function readPanelSize() {
        try {
            const parsed = JSON.parse(localStorage.getItem(AI_PANEL_SIZE_KEY) || '{}');

            if (!parsed.width || !parsed.height) {
                return null;
            }

            return clampPanelSize(parsed);
        } catch (error) {
            return null;
        }
    }

    function applyPanelSize(size) {
        if (!catAiPanel) {
            return;
        }

        if (!isDesktopPanel()) {
            catAiPanel.style.removeProperty('--cat-ai-panel-width');
            catAiPanel.style.removeProperty('--cat-ai-panel-height');
            return;
        }

        const next = clampPanelSize(size || readPanelSize() || {
            width: catAiPanel.offsetWidth || 360,
            height: catAiPanel.offsetHeight || panelSizeLimits().maxHeight
        });
        catAiPanel.style.setProperty('--cat-ai-panel-width', next.width + 'px');
        catAiPanel.style.setProperty('--cat-ai-panel-height', next.height + 'px');
    }

    function savePanelSize() {
        if (!catAiPanel || catAiPanel.hidden || !isDesktopPanel()) {
            return;
        }

        const rect = catAiPanel.getBoundingClientRect();
        const size = clampPanelSize({
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        });
        localStorage.setItem(AI_PANEL_SIZE_KEY, JSON.stringify(size));
    }

    function setupPanelResize() {
        if (!catAiPanel || typeof ResizeObserver === 'undefined') {
            return;
        }

        applyPanelSize(readPanelSize());

        const observer = new ResizeObserver(function() {
            window.clearTimeout(panelResizeTimer);
            panelResizeTimer = window.setTimeout(savePanelSize, 120);
        });
        observer.observe(catAiPanel);

        window.addEventListener('resize', function() {
            applyPanelSize(readPanelSize());
        });

        window.matchMedia(AI_PANEL_DESKTOP_QUERY).addEventListener('change', function() {
            applyPanelSize(readPanelSize());
        });
    }

    function startPanelResize(event) {
        if (!catAiPanel || !isDesktopPanel()) {
            return;
        }

        event.preventDefault();

        const rect = catAiPanel.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = rect.width;
        const startHeight = rect.height;
        const previousSelect = document.body.style.userSelect;

        document.body.style.userSelect = 'none';
        catAiResize.setPointerCapture(event.pointerId);

        function onPointerMove(moveEvent) {
            const next = clampPanelSize({
                width: startWidth + startX - moveEvent.clientX,
                height: startHeight + startY - moveEvent.clientY
            });
            applyPanelSize(next);
        }

        function onPointerUp(upEvent) {
            catAiResize.releasePointerCapture(upEvent.pointerId);
            catAiResize.removeEventListener('pointermove', onPointerMove);
            catAiResize.removeEventListener('pointerup', onPointerUp);
            catAiResize.removeEventListener('pointercancel', onPointerUp);
            document.body.style.userSelect = previousSelect;
            savePanelSize();
        }

        catAiResize.addEventListener('pointermove', onPointerMove);
        catAiResize.addEventListener('pointerup', onPointerUp);
        catAiResize.addEventListener('pointercancel', onPointerUp);
    }

    function readStoredAiMessages() {
        try {
            const parsed = JSON.parse(localStorage.getItem(AI_MESSAGES_KEY) || '[]');

            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.filter(function(message) {
                return message && (message.role === 'user' || message.role === 'assistant') && Array.isArray(message.lines);
            }).map(function(message) {
                return {
                    role: message.role,
                    lines: message.lines.map(function(line) {
                        return String(line);
                    }).filter(function(line) {
                        return line.trim();
                    })
                };
            }).filter(function(message) {
                return message.lines.length;
            }).slice(-AI_MESSAGE_LIMIT);
        } catch (error) {
            return [];
        }
    }

    function saveAiMessages() {
        localStorage.setItem(AI_MESSAGES_KEY, JSON.stringify(aiMessages.slice(-AI_MESSAGE_LIMIT)));
    }

    function rememberAiMessage(role, lines) {
        const cleanLines = (lines || []).map(function(line) {
            return String(line);
        }).filter(function(line) {
            return line.trim();
        });

        if (!cleanLines.length || (role !== 'user' && role !== 'assistant')) {
            return;
        }

        aiMessages.push({ role: role, lines: cleanLines });
        aiMessages = aiMessages.slice(-AI_MESSAGE_LIMIT);
        saveAiMessages();
    }

    function resetAiOutput() {
        if (!catAiOutput) {
            return;
        }

        catAiOutput.textContent = '';
        appendAiText('assistant', ['可以问我文章、研究、工具配置和这个站点。'], { skipCache: true });
    }

    function clearAiMessages() {
        aiStreamId += 1;
        aiMessages = [];
        localStorage.removeItem(AI_MESSAGES_KEY);
        resetAiOutput();
        setExpression('CLR', 900);
    }

    async function updateAiMode(config) {
        if (!catAiMode || !window.siteAI || typeof window.siteAI.readConfig !== 'function') {
            return;
        }

        const value = config || await window.siteAI.readConfig();
        const configured = window.siteAI.hasConfig && window.siteAI.hasConfig(value);
        catAiMode.textContent = configured ? value.model : 'demo mode';
    }

    function setConfigStatus(text) {
        if (catAiConfigStatus) {
            catAiConfigStatus.textContent = text;
        }
    }

    async function loadConfigForm() {
        if (!catAiConfigForm || !window.siteAI || typeof window.siteAI.readConfig !== 'function') {
            return;
        }

        const config = await window.siteAI.readConfig();
        catAiConfigForm.elements.baseUrl.value = config.baseUrl || '';
        catAiConfigForm.elements.apiKey.value = '';
        catAiConfigForm.elements.apiKey.placeholder = config.hasSavedApiKey ? AI_KEY_SAVED_PLACEHOLDER : AI_KEY_EMPTY_PLACEHOLDER;
        catAiConfigForm.elements.model.value = config.model || '';
        await updateAiMode(config);
    }

    function appendAiMessage(role) {
        if (!catAiOutput) {
            return null;
        }

        const message = document.createElement('div');
        message.className = 'cat-ai-message cat-ai-message-' + role;
        catAiOutput.appendChild(message);
        scrollCatAiOutput();
        return message;
    }

    function isSafeSiteUrl(url) {
        return /^\/[A-Za-z0-9/_#.-]*(?:\?[A-Za-z0-9_=&%+.-]*)?$/.test(url || '');
    }

    function appendTextWithLinks(container, text) {
        const pattern = /\[([^\]]+)\]\((\/[A-Za-z0-9/_#.?=&%+.-]+)\)|([^\n（]{1,80}?)（(\/[A-Za-z0-9/_#.?=&%+.-]+)）|(?<!\]\()((?:\/(?:posts|photos|fragments|research|publications|uses|status|introduction)[A-Za-z0-9/_#.?=&%+.-]*))/g;
        let cursor = 0;
        let match = null;

        while ((match = pattern.exec(text)) !== null) {
            const rawLabel = match[1] || match[3] || match[5];
            const url = match[2] || match[4] || match[5];
            const bullet = rawLabel.match(/^(\s*[-*]\s+)(.+)$/);
            const prefix = bullet ? bullet[1] : '';
            const label = bullet ? bullet[2] : rawLabel;

            if (!isSafeSiteUrl(url)) {
                continue;
            }

            if (match.index > cursor) {
                container.appendChild(document.createTextNode(text.slice(cursor, match.index)));
            }

            if (prefix) {
                container.appendChild(document.createTextNode(prefix));
            }

            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = label;
            container.appendChild(link);
            cursor = match.index + match[0].length;
        }

        if (cursor < text.length) {
            container.appendChild(document.createTextNode(text.slice(cursor)));
        }
    }

    function renderAiLine(item, line, role) {
        item.textContent = '';

        if (role === 'assistant') {
            appendTextWithLinks(item, line);
            return;
        }

        item.textContent = line;
    }

    function appendAiText(role, lines, options) {
        const message = appendAiMessage(role);

        if (!message) {
            return;
        }

        lines.forEach(function(line) {
            const item = document.createElement('p');
            renderAiLine(item, line, role);
            message.appendChild(item);
        });

        scrollCatAiOutput();

        if (!options || !options.skipCache) {
            rememberAiMessage(role, lines);
        }
    }

    function streamAiLines(lines, options) {
        const message = appendAiMessage('assistant');
        const streamId = aiStreamId + 1;
        let lineIndex = 0;

        aiStreamId = streamId;

        if (!message) {
            return;
        }

        function streamNextLine() {
            if (streamId !== aiStreamId) {
                return;
            }

            if (lineIndex >= lines.length) {
                setExpression('OK', 700);
                if (!options || !options.skipCache) {
                    rememberAiMessage('assistant', lines);
                }
                return;
            }

            const item = document.createElement('p');
            const line = lines[lineIndex];
            let charIndex = 0;
            lineIndex += 1;
            message.appendChild(item);

            function streamNextChar() {
                if (streamId !== aiStreamId) {
                    return;
                }

                renderAiLine(item, line.slice(0, charIndex), 'assistant');
                scrollCatAiOutput();

                if (charIndex <= line.length) {
                    charIndex += 1;
                    window.setTimeout(streamNextChar, 9);
                    return;
                }

                window.setTimeout(streamNextLine, 80);
            }

            streamNextChar();
        }

        streamNextLine();
    }

    function restoreAiMessages() {
        aiMessages = readStoredAiMessages();

        if (!catAiOutput || !aiMessages.length) {
            return;
        }

        catAiOutput.textContent = '';
        aiMessages.forEach(function(message) {
            appendAiText(message.role, message.lines, { skipCache: true });
        });
        scrollCatAiOutput();
    }

    async function askCatAi(question) {
        const normalized = String(question || '').trim();

        if (!normalized) {
            setExpression('ASK', 900);
            if (catAiInput) {
                catAiInput.focus();
            }
            return;
        }

        setCatMenu(false);
        setAiPanel(true);
        appendAiText('user', [normalized]);

        if (window.siteAI && typeof window.siteAI.answerAsync === 'function') {
            setExpression('AI', 900);
            const streamId = aiStreamId + 1;
            let statusMessage = null;

            aiStreamId = streamId;

            try {
                const lines = await window.siteAI.answerAsync(normalized, {
                    onStatus: function(status) {
                        if (streamId !== aiStreamId) {
                            return;
                        }

                        if (!statusMessage) {
                            statusMessage = appendAiMessage('assistant');
                            if (!statusMessage) {
                                return;
                            }
                            statusMessage.classList.add('cat-ai-message-status');
                            statusMessage.appendChild(document.createElement('p'));
                        }

                        statusMessage.querySelector('p').textContent = status + '...';
                        scrollCatAiOutput();
                    }
                });

                if (streamId !== aiStreamId) {
                    return;
                }

                if (statusMessage) {
                    statusMessage.remove();
                }

                streamAiLines(lines);
                await updateAiMode();
            } catch (error) {
                if (statusMessage) {
                    statusMessage.remove();
                }
                appendAiText('assistant', [
                    'AI request failed:',
                    error && error.message ? error.message : String(error)
                ]);
                setExpression('ERR', 1100);
            }
            return;
        }

        if (window.siteAI && typeof window.siteAI.answer === 'function') {
            setExpression('AI', 900);
            streamAiLines(window.siteAI.answer(normalized));
            return;
        }

        appendAiText('assistant', ['AI module unavailable']);
        setExpression('404', 900);
    }

    async function copyUseConfig() {
        const configBlock = document.querySelector('.use-content pre code') || document.querySelector('.use-content pre');
        const configText = configBlock ? configBlock.textContent.trim() : '';

        if (!configText) {
            setExpression('404', 900);
            return;
        }

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(configText);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = configText;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.top = '-999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            }
            setExpression('COPY', 1100);
        } catch (error) {
            setExpression('ERR', 1100);
        }
    }

    function handleCatClick() {
        clickCount += 1;
        window.clearTimeout(clickTimer);

        if (clickCount >= 5) {
            clickCount = 0;
            window.clearTimeout(singleClickTimer);
            triggerEasterEgg();
            return;
        }

        clickTimer = window.setTimeout(function() {
            clickCount = 0;
        }, 1200);

        window.clearTimeout(singleClickTimer);
        singleClickTimer = window.setTimeout(function() {
            setCatMenu(!catBotWrap.classList.contains('is-open'));
        }, 220);
    }

    catBot.addEventListener('click', handleCatClick);

    catBot.addEventListener('dblclick', function(event) {
        event.preventDefault();
        window.clearTimeout(singleClickTimer);
        setCatMenu(false);
        setAiPanel(false);
        setExpression('TOP', 700);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    catBot.addEventListener('mousemove', function(event) {
        const rect = catBot.getBoundingClientRect();
        const offsetX = Math.max(-3, Math.min(3, (event.clientX - (rect.left + rect.width / 2)) / 10));
        const offsetY = Math.max(-2, Math.min(2, (event.clientY - (rect.top + rect.height / 2)) / 12));
        catBot.style.setProperty('--eye-x', offsetX.toFixed(1) + 'px');
        catBot.style.setProperty('--eye-y', offsetY.toFixed(1) + 'px');
    });

    catBot.addEventListener('mouseleave', function() {
        catBot.style.removeProperty('--eye-x');
        catBot.style.removeProperty('--eye-y');
    });

    catMenu.addEventListener('click', function(event) {
        const actionButton = event.target.closest('[data-cat-action]');

        if (!actionButton) {
            if (event.target.closest('a')) {
                setCatMenu(false);
            }
            return;
        }

        const action = actionButton.dataset.catAction;

        if (action === 'ask-ai') {
            setCatMenu(false);
            setAiPanel(true);
            return;
        }

        setCatMenu(false);
        setAiPanel(false);

        if (action === 'terminal') {
            if (window.siteTerminal && typeof window.siteTerminal.open === 'function') {
                window.siteTerminal.open();
                return;
            }

            setExpression('>_', 900);
            return;
        }

        if (action === 'copy-use') {
            copyUseConfig();
            return;
        }

        if (action === 'random') {
            if (!window.siteTerminal || typeof window.siteTerminal.randomPost !== 'function' || !window.siteTerminal.randomPost()) {
                setExpression('404', 900);
            }
        }
    });

    if (catAiForm) {
        catAiForm.addEventListener('submit', function(event) {
            event.preventDefault();
            askCatAi(catAiInput ? catAiInput.value : '');

            if (catAiInput) {
                catAiInput.value = '';
            }
        });
    }

    if (catAiConfigForm) {
        catAiConfigForm.addEventListener('submit', async function(event) {
            event.preventDefault();

            if (!window.siteAI || typeof window.siteAI.writeConfig !== 'function') {
                setConfigStatus('AI config module unavailable.');
                return;
            }

            setConfigStatus('Saving...');
            try {
                await window.siteAI.writeConfig({
                    baseUrl: catAiConfigForm.elements.baseUrl.value,
                    apiKey: catAiConfigForm.elements.apiKey.value,
                    model: catAiConfigForm.elements.model.value
                });
                catAiConfigForm.elements.apiKey.value = '';
                await loadConfigForm();
                setConfigStatus('Saved in this browser.');
                setExpression('SAVE', 900);
            } catch (error) {
                setConfigStatus(error && error.message ? error.message : String(error));
                setExpression('ERR', 1100);
            }
        });
    }

    if (catAiTest) {
        catAiTest.addEventListener('click', async function() {
            if (!window.siteAI || typeof window.siteAI.testConnection !== 'function') {
                setConfigStatus('AI config module unavailable.');
                return;
            }

            if (catAiConfigForm && typeof window.siteAI.writeConfig === 'function') {
                await window.siteAI.writeConfig({
                    baseUrl: catAiConfigForm.elements.baseUrl.value,
                    apiKey: catAiConfigForm.elements.apiKey.value,
                    model: catAiConfigForm.elements.model.value
                });
                catAiConfigForm.elements.apiKey.value = '';
            }

            setConfigStatus('Testing connection...');
            try {
                await window.siteAI.testConnection();
                await loadConfigForm();
                setConfigStatus('Connection OK.');
                setExpression('OK', 900);
            } catch (error) {
                setConfigStatus(error && error.message ? error.message : String(error));
                setExpression('ERR', 1100);
            }
        });
    }

    if (catAiClear) {
        catAiClear.addEventListener('click', async function() {
            if (window.siteAI && typeof window.siteAI.clearConfig === 'function') {
                await window.siteAI.clearConfig();
            }

            if (catAiConfigForm) {
                catAiConfigForm.reset();
                catAiConfigForm.elements.apiKey.placeholder = AI_KEY_EMPTY_PLACEHOLDER;
            }

            setConfigStatus('Cleared. Demo mode is active.');
            await updateAiMode({ baseUrl: '', model: '' });
            setExpression('CLR', 900);
        });
    }

    if (catAiClearChat) {
        catAiClearChat.addEventListener('click', clearAiMessages);
    }

    if (catAiResize) {
        catAiResize.addEventListener('pointerdown', startPanelResize);
    }

    if (catAiPanel) {
        catAiPanel.addEventListener('click', function(event) {
            const questionButton = event.target.closest('[data-cat-question]');

            if (questionButton) {
                askCatAi(questionButton.dataset.catQuestion);
            }
        });
    }

    if (catAiClose) {
        catAiClose.addEventListener('click', function() {
            setAiPanel(false);
        });
    }

    document.addEventListener('command-palette:open', function() {
        window.clearTimeout(resetExpressionTimer);
        catExpression.textContent = '>_';
        catBot.classList.add('is-surprised', 'is-listening');
    });

    document.addEventListener('command-palette:close', function() {
        catBot.classList.remove('is-listening', 'is-surprised');
        catExpression.textContent = '^_^';
    });

    document.addEventListener('click', function(event) {
        if (!catBotWrap.contains(event.target)) {
            setCatMenu(false);
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            if (catAiPanel && !catAiPanel.hidden) {
                setAiPanel(false);
                return;
            }

            setCatMenu(false);
        }
    });

    loadConfigForm();
    restoreAiMessages();
    setupPanelResize();
});
