const { test, expect } = require('@playwright/test');
const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
    const errors = [];
    pageErrors.set(page, errors);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
});

test.afterEach(async ({ page }) => {
    expect(pageErrors.get(page)).toEqual([]);
});

async function openAI(page) {
    await page.locator('.cat-bot').click();
    await page.getByRole('menuitem', { name: /^Ask AI/ }).click();
    await expect(page.locator('[data-cat-ai-panel]')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.siteAI));
}

test('reading pages loads no terminal, AI modules, or content indexes', async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.siteFeatures));
    expect(requests.some(url => /site-(manifest|content)\.json|terminal\.js|site-ai[^/]*\.js/.test(url))).toBe(false);
    await expect(page.locator('head title')).toHaveCount(1);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://jiaaozhe.github.io/');
});

test('terminal supports keyboard opening, paths, content, and pager exit', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.keyboard.press('/');
    const palette = page.locator('#command-palette');
    await expect(palette).toHaveAttribute('aria-hidden', 'false');
    const input = page.locator('#command-input');
    await input.fill('cd /uses');
    await input.press('Enter');
    await expect(page.locator('#command-prompt')).toHaveText('~/uses %');
    await input.fill('cat ghostty');
    await input.press('Enter');
    await expect(page.locator('#command-output')).toContainText('CaskaydiaMono Nerd Font Mono');
    await input.fill('less ghostty');
    await input.press('Enter');
    await expect(page.locator('#command-prompt')).toHaveText(':');
    await input.press('q');
    await expect(page.locator('#command-prompt')).toHaveText('~/uses %');
    await page.keyboard.press('Escape');
    await expect(palette).toHaveAttribute('aria-hidden', 'true');
    expect(errors).toEqual([]);
});

test('failed terminal download can be retried', async ({ page }) => {
    let attempts = 0;
    await page.route('**/assets/js/terminal.js*', route => ++attempts === 1 ? route.abort() : route.continue());
    await page.goto('/');
    await page.keyboard.press('/');
    await expect(page.locator('#command-output')).toContainText('Cannot load terminal.js');
    await page.keyboard.press('Escape');
    await page.keyboard.press('/');
    await expect(page.locator('#command-palette')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#command-input')).toBeFocused();
    await page.locator('#command-input').fill('pwd');
    await page.locator('#command-input').press('Enter');
    await expect(page.locator('#command-output')).not.toContainText('Cannot load');
    expect(attempts).toBe(2);
});

test('AI demo opens on demand and answers from indexed content', async ({ page }) => {
    await page.goto('/');
    await openAI(page);
    await page.getByRole('button', { name: 'Ghostty?', exact: true }).click();
    await expect(page.locator('[data-cat-ai-output]')).toContainText('CaskaydiaMono Nerd Font Mono', { timeout: 10000 });
});

test('configured AI retrieves late evidence and preserves encrypted settings across reload', async ({ page }) => {
    let calls = 0;
    const article = '/posts/hermes-agent-source-analysis/';
    await page.route('**/site-content.json*', route => route.fulfill({ json: {
        schema: 1, pages: { [article]: { title: 'Article', url: article, content: 'background '.repeat(5000) + 'configuration lifetime: until shutdown' } }
    } }));
    await page.route('https://model.invalid/v1/chat/completions', async route => {
        calls += 1;
        const body = route.request().postDataJSON();
        expect(route.request().headers().authorization).toBe('Bearer browser-test-key');
        const content = calls === 1
            ? JSON.stringify({ action: 'read_pages', pages: [article] })
            : 'The lifetime is until shutdown.';
        if (calls === 2) expect(body.messages[1].content).toContain('until shutdown');
        await route.fulfill({ json: { choices: [{ message: { content } }] } });
    });
    await page.goto('/');
    await openAI(page);
    await page.locator('[data-cat-ai-settings] summary').click();
    await page.locator('[name=baseUrl]').fill('https://model.invalid/v1');
    await page.locator('[name=model]').fill('test-model');
    await page.locator('[name=apiKey]').fill('browser-test-key');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('[data-cat-ai-config-status]')).toHaveText('Saved in this browser.');
    const stored = await page.evaluate(() => localStorage.getItem('site-ai.config'));
    expect(stored).not.toContain('browser-test-key');
    expect(JSON.parse(stored).apiKeyEncrypted).toBeTruthy();

    await page.reload();
    await openAI(page);
    await expect(page.locator('[data-cat-ai-mode]')).toHaveText('test-model');
    await page.locator('#cat-ai-input').fill('configuration lifetime?');
    await page.locator('[data-cat-ai-form]').getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.locator('[data-cat-ai-output]')).toContainText('The lifetime is until shutdown.');
    expect(calls).toBe(2);
    await page.locator('[data-cat-ai-settings] summary').click();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.locator('[data-cat-ai-mode]')).toHaveText('demo mode');
    expect(await page.evaluate(() => localStorage.getItem('site-ai.config'))).toBeNull();
});
