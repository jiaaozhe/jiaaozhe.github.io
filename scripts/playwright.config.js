const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: __dirname,
    testMatch: 'browser.spec.js',
    workers: 1,
    use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
    webServer: {
        command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory _site',
        cwd: require('node:path').resolve(__dirname, '..'),
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI
    }
});
