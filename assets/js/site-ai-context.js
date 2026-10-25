(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.siteAIContext = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
    const MAX_PAGES = 5;
    const MAX_CHARS_PER_PAGE = 8000;
    const MAX_TOTAL_CHARS = 24000;

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

    function relevantText(text, question, limit) {
        if (text.length <= limit) return text;
        const words = String(question || '').toLowerCase().match(/[a-z0-9_]{2,}|\p{Script=Han}{2,}/gu) || [];
        const terms = new Set();
        words.forEach(function(word) {
            if (/\p{Script=Han}/u.test(word)) {
                for (let i = 0; i < word.length - 1; i += 1) terms.add(word.slice(i, i + 2));
            } else {
                terms.add(word);
            }
        });
        const chunks = [];
        // Overlap keeps a sentence or config entry at a boundary searchable.
        for (let offset = 0; offset < text.length; offset += 1200) {
            const value = text.slice(offset, offset + 1400);
            const lower = value.toLowerCase();
            const score = Array.from(terms).reduce(function(total, term) {
                return total + (lower.includes(term) ? 1 : 0);
            }, 0);
            chunks.push({ offset: offset, text: value, score: score });
        }
        chunks.sort(function(a, b) { return b.score - a.score || a.offset - b.offset; });
        if (!chunks[0].score) return text.slice(0, limit);
        const selected = [];
        let remaining = limit;
        chunks.forEach(function(chunk) {
            if (!chunk.score || remaining < 100) return;
            const value = chunk.text.slice(0, remaining);
            selected.push({ offset: chunk.offset, text: value });
            remaining -= value.length + 2;
        });
        return selected.sort(function(a, b) { return a.offset - b.offset; }).map(function(chunk) {
            return chunk.text;
        }).join('\n\n').slice(0, limit);
    }

    function buildContext(ids, contentData, manifest, question) {
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
            const content = relevantText(rawContent, question, Math.min(MAX_CHARS_PER_PAGE, remaining));

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

    return Object.freeze({
        parseJsonObject: parseJsonObject,
        compactCatalog: compactCatalog,
        cleanPlan: cleanPlan,
        relevantText: relevantText,
        buildContext: buildContext
    });
});
