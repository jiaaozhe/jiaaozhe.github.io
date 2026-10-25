(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.siteAIClient = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
    async function chatCompletion(config, messages, options) {
        const settings = options || {};
        const controller = new AbortController();
        const signal = settings.signal;
        const timeoutMs = settings.timeoutMs || 30000;
        let timedOut = false;
        const abort = function() { controller.abort(); };
        if (signal) {
            if (signal.aborted) abort();
            else signal.addEventListener('abort', abort, { once: true });
        }
        const timer = setTimeout(function() {
            timedOut = true;
            controller.abort();
        }, timeoutMs);

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (config.apiKey) headers.Authorization = 'Bearer ' + config.apiKey;
            const response = await fetch(config.baseUrl + '/chat/completions', {
                method: 'POST',
                headers: headers,
                signal: controller.signal,
                body: JSON.stringify({
                    model: config.model,
                    messages: messages,
                    temperature: typeof settings.temperature === 'number' ? settings.temperature : 0.2
                })
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error('Model request failed: HTTP ' + response.status + (text ? ' ' + text.slice(0, 180) : ''));
            }
            const data = await response.json();
            const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!content || !String(content).trim()) throw new Error('Model returned an empty response.');
            return String(content).trim();
        } catch (error) {
            if (timedOut) throw new Error('Model request timed out. Please try again.');
            throw error;
        } finally {
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', abort);
        }
    }

    return Object.freeze({ chatCompletion: chatCompletion });
});
