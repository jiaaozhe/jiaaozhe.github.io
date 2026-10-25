(function() {
    const CONFIG_KEY = 'site-ai.config';
    const CRYPTO_DB_NAME = 'site-ai-crypto';
    const CRYPTO_DB_VERSION = 1;
    const CRYPTO_STORE = 'keys';
    const API_KEY_ID = 'api-key';
    let cryptoDbPromise = null;

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

    window.siteAIConfig = Object.freeze({
        readConfig: readConfig,
        writeConfig: writeConfig,
        clearConfig: clearConfig,
        hasConfig: hasConfig
    });
})();
