document.addEventListener('DOMContentLoaded', function() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.getElementById('site-menu');
    const themeToggle = document.querySelector('.theme-toggle');
    const filterRoot = document.querySelector('[data-post-filter]');
    const postCards = Array.from(document.querySelectorAll('[data-post-categories]'));
    const fragmentFilterRoot = document.querySelector('[data-fragment-filter]');
    const fragmentItems = Array.from(document.querySelectorAll('[data-fragment-item]'));

    function toggleTheme() {
        const root = document.documentElement;
        const current = root.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            const isOpen = document.body.classList.toggle('nav-open');
            navToggle.setAttribute('aria-expanded', String(isOpen));
            navToggle.setAttribute('aria-label', isOpen ? '关闭导航' : '打开导航');
        });

        navMenu.addEventListener('click', function(event) {
            if (event.target.closest('a')) {
                document.body.classList.remove('nav-open');
                navToggle.setAttribute('aria-expanded', 'false');
                navToggle.setAttribute('aria-label', '打开导航');
            }
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach(function(link) {
        link.addEventListener('click', function(event) {
            const targetId = link.getAttribute('href');

            if (!targetId || targetId === '#') {
                return;
            }

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                event.preventDefault();
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    if (filterRoot && postCards.length) {
        const filterButtons = Array.from(filterRoot.querySelectorAll('[data-category]'));
        const categories = new Set(filterButtons.map(function(button) {
            return button.dataset.category;
        }));

        function applyPostFilter(category, updateUrl) {
            const activeCategory = categories.has(category) ? category : 'all';

            filterButtons.forEach(function(button) {
                const isActive = button.dataset.category === activeCategory;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', String(isActive));
            });

            postCards.forEach(function(card) {
                const cardCategories = card.dataset.postCategories.split('|').filter(Boolean);
                const isHidden = activeCategory !== 'all' && !cardCategories.includes(activeCategory);
                card.hidden = isHidden;
            });

            if (updateUrl) {
                const url = new URL(window.location.href);

                if (activeCategory === 'all') {
                    url.searchParams.delete('category');
                } else {
                    url.searchParams.set('category', activeCategory);
                }

                window.history.replaceState({}, '', url);
            }
        }

        filterButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                applyPostFilter(button.dataset.category, true);
            });
        });

        applyPostFilter(new URLSearchParams(window.location.search).get('category') || 'all', false);
    }

    if (fragmentFilterRoot && fragmentItems.length) {
        const fragmentButtons = Array.from(fragmentFilterRoot.querySelectorAll('[data-fragment-type]'));

        function applyFragmentFilter(type, updateUrl) {
            const activeType = fragmentButtons.some(function(button) {
                return button.dataset.fragmentType === type;
            }) ? type : 'all';

            fragmentButtons.forEach(function(button) {
                const isActive = button.dataset.fragmentType === activeType;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', String(isActive));
            });

            fragmentItems.forEach(function(item) {
                const isHidden = activeType !== 'all' && item.dataset.fragmentType !== activeType;
                item.hidden = isHidden;
            });

            if (updateUrl) {
                const url = new URL(window.location.href);

                if (activeType === 'all') {
                    url.searchParams.delete('type');
                } else {
                    url.searchParams.set('type', activeType);
                }

                window.history.replaceState({}, '', url);
            }
        }

        fragmentButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                applyFragmentFilter(button.dataset.fragmentType, true);
            });
        });

        const params = new URLSearchParams(window.location.search);
        applyFragmentFilter(params.get('type') || 'all', false);
    }

    // Timeline filter
    var timelineFilterRoot = document.querySelector('[data-timeline-filter]');
    var timeline = document.querySelector('[data-timeline]');

    if (timelineFilterRoot && timeline) {
        var timelineFilterButtons = Array.from(timelineFilterRoot.querySelectorAll('[data-filter]'));
        var timelineItems = Array.from(timeline.querySelectorAll('[data-timeline-kind]'));

        timelineItems.sort(function(a, b) {
            return b.dataset.timelineDate.localeCompare(a.dataset.timelineDate);
        });
        timelineItems.forEach(function(item) {
            timeline.appendChild(item);
        });

        function applyTimelineFilter(type) {
            var activeType = timelineFilterButtons.some(function(b) {
                return b.dataset.filter === type;
            }) ? type : 'all';

            timelineFilterButtons.forEach(function(button) {
                var isActive = button.dataset.filter === activeType;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', String(isActive));
            });

            var visibleCount = 0;
            timelineItems.forEach(function(item) {
                var isMatch = activeType === 'all' || item.dataset.timelineKind === activeType;
                var shouldShow = isMatch && visibleCount < 12;
                item.hidden = !shouldShow;
                if (isMatch) visibleCount++;
            });
        }

        timelineFilterButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                applyTimelineFilter(button.dataset.filter);
            });
        });

        applyTimelineFilter('all');
    }

    const catBotWrap = document.querySelector('[data-cat-bot]');
    const catBot = catBotWrap ? catBotWrap.querySelector('.cat-bot') : null;
    const catMenu = catBotWrap ? catBotWrap.querySelector('.cat-bot-menu') : null;
    const catExpression = catBotWrap ? catBotWrap.querySelector('.cat-bot-expression') : null;
    const catAiPanel = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-panel]') : null;
    const catAiForm = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-form]') : null;
    const catAiInput = catBotWrap ? catBotWrap.querySelector('.cat-ai-input') : null;
    const catAiOutput = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-output]') : null;
    const catAiClose = catBotWrap ? catBotWrap.querySelector('[data-cat-ai-close]') : null;

    if (catBotWrap && catBot && catMenu && catExpression) {
        let clickCount = 0;
        let clickTimer = null;
        let singleClickTimer = null;
        let resetExpressionTimer = null;
        let aiStreamId = 0;

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

        function appendAiText(role, lines) {
            const message = appendAiMessage(role);

            if (!message) {
                return;
            }

            lines.forEach(function(line) {
                const item = document.createElement('p');
                item.textContent = line;
                message.appendChild(item);
            });

            scrollCatAiOutput();
        }

        function streamAiLines(lines) {
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

                    item.textContent = line.slice(0, charIndex);
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

        function askCatAi(question) {
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
                return;
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

        if (catAiPanel) {
            catAiPanel.addEventListener('click', function(event) {
                const questionButton = event.target.closest('[data-cat-question]');

                if (!questionButton) {
                    return;
                }

                askCatAi(questionButton.dataset.catQuestion);
            });
        }

        if (catAiClose) {
            catAiClose.addEventListener('click', function() {
                setAiPanel(false);
            });
        }

        catMenu.addEventListener('click', function(event) {
            const questionButton = event.target.closest('[data-cat-question]');

            if (!questionButton) {
                return;
            }

            askCatAi(questionButton.dataset.catQuestion);
        });

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
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('bibtex-modal');
    const bibtexContent = document.getElementById('bibtex-content');
    const copyBtn = document.getElementById('copy-bibtex');
    const closeBtn = document.querySelector('.close-btn');

    if (!modal || !bibtexContent || !copyBtn || !closeBtn) {
        return;
    }

    function showModal(bibtexText) {
        bibtexContent.textContent = bibtexText;
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    function hideModal() {
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
        copyBtn.classList.remove('copied');
        copyBtn.textContent = '复制到剪贴板';
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(bibtexContent.textContent);
            copyBtn.classList.add('copied');
            copyBtn.textContent = '已复制';

            setTimeout(function() {
                copyBtn.classList.remove('copied');
                copyBtn.textContent = '复制到剪贴板';
            }, 2000);
        } catch (error) {
            copyBtn.textContent = '复制失败';
        }
    }

    document.querySelectorAll('a[href="#"]').forEach(function(link) {
        link.addEventListener('click', function(event) {
            const source = link.closest('[data-bibtex]');
            const bibtexData = source ? source.dataset.bibtex : '';

            if (bibtexData) {
                event.preventDefault();
                showModal(bibtexData);
            }
        });
    });

    closeBtn.addEventListener('click', hideModal);
    copyBtn.addEventListener('click', copyToClipboard);

    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            hideModal();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) {
            hideModal();
        }
    });
});
