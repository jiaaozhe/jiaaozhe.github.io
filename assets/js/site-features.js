(function() {
    const root = document.documentElement;
    const baseUrl = String(root.dataset.siteBaseurl || '').replace(/\/+$/, '');
    const version = root.dataset.siteVersion || '';
    const scripts = new Map();
    let aiPromise = null;
    let terminalPromise = null;

    function loadScript(name) {
        if (!scripts.has(name)) {
            const promise = new Promise(function(resolve, reject) {
                const script = document.createElement('script');
                script.src = baseUrl + '/assets/js/' + name + '?v=' + encodeURIComponent(version);
                script.onload = resolve;
                script.onerror = function() {
                    script.remove();
                    reject(new Error('Cannot load ' + name + '. Please try again.'));
                };
                document.head.appendChild(script);
            }).catch(function(error) {
                scripts.delete(name);
                throw error;
            });
            scripts.set(name, promise);
        }
        return scripts.get(name);
    }

    function loadAI() {
        if (!aiPromise) {
            aiPromise = Promise.all([
                'site-ai-config.js', 'site-ai-client.js', 'site-ai-context.js', 'site-ai-demo.js'
            ].map(loadScript)).then(function() {
                return loadScript('site-ai.js');
            }).then(function() {
                if (!window.siteAI) throw new Error('AI module unavailable.');
                return window.siteAI;
            }).catch(function(error) {
                aiPromise = null;
                throw error;
            });
        }
        return aiPromise;
    }

    function loadTerminal() {
        if (!terminalPromise) {
            terminalPromise = loadScript('site-terminal-fs.js').then(function() {
                return loadScript('terminal.js');
            }).then(function() {
                if (!window.siteTerminal) throw new Error('Terminal module unavailable.');
                return window.siteTerminal;
            }).catch(function(error) {
                terminalPromise = null;
                throw error;
            });
        }
        return terminalPromise;
    }

    async function openTerminal() {
        try {
            const terminal = await loadTerminal();
            terminal.open();
        } catch (error) {
            const palette = document.getElementById('command-palette');
            palette.classList.add('is-open');
            palette.setAttribute('aria-hidden', 'false');
            document.getElementById('command-output').textContent = error.message;
        }
    }

    document.addEventListener('keydown', function(event) {
        const target = event.target;
        const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
        if (event.key === '/' && !typing && !window.siteTerminal) {
            event.preventDefault();
            openTerminal();
        }
        if (event.key === 'Escape' && !window.siteTerminal) {
            const palette = document.getElementById('command-palette');
            palette.classList.remove('is-open');
            palette.setAttribute('aria-hidden', 'true');
        }
    });

    window.siteFeatures = Object.freeze({ loadAI: loadAI, loadTerminal: loadTerminal, openTerminal: openTerminal });
})();
