(function() {
    const root = document.documentElement;
    const baseUrl = String(root.dataset.siteBaseurl || '').replace(/\/+$/, '');
    const buildVersion = String(root.dataset.siteVersion || '');
    let manifestPromise = null;
    let contentPromise = null;

    function endpoint(path) {
        const url = baseUrl + path;
        return buildVersion ? url + '?v=' + encodeURIComponent(buildVersion) : url;
    }

    async function fetchJson(path) {
        const response = await fetch(endpoint(path), { cache: 'no-cache' });

        if (!response.ok) {
            throw new Error('Cannot load ' + path + ': HTTP ' + response.status);
        }

        return response.json();
    }

    function loadManifest() {
        if (!manifestPromise) {
            manifestPromise = fetchJson('/site-manifest.json').catch(function(error) {
                manifestPromise = null;
                throw error;
            });
        }

        return manifestPromise;
    }

    function loadContent() {
        if (!contentPromise) {
            contentPromise = fetchJson('/site-content.json').catch(function(error) {
                contentPromise = null;
                throw error;
            });
        }

        return contentPromise;
    }

    async function getContent(id) {
        const data = await loadContent();
        return data.pages && data.pages[id] ? data.pages[id] : null;
    }

    window.siteData = Object.freeze({
        getContent: getContent,
        loadContent: loadContent,
        loadManifest: loadManifest
    });

    loadManifest().catch(function() {});
})();
