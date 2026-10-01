const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const logger = require('../logger');

const FILE = 'encryption.key';

/**
 * The key that encrypts tokens, sid/mc and passwords in the database. Created randomly on first
 * launch and stored next to the database — itself encrypted by the OS keychain (Electron
 * safeStorage: macOS Keychain, Windows DPAPI), so a copied data folder is useless elsewhere.
 * Falls back to a plain key file (owner-only permissions) where no keychain is available.
 *
 * @param {string} dir          the app's data folder
 * @param {object} safeStorage  Electron's safeStorage (after the app is ready)
 * @returns {string} the key, hex
 */
function loadOrCreateKey(dir, safeStorage) {
    const file = path.join(dir, FILE);
    const keychain = safeStorage?.isEncryptionAvailable() === true;

    if (fs.existsSync(file)) {
        const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (stored.protected) {
            if (!keychain) throw new Error('The encryption key is protected by the OS keychain, which is unavailable');
            return safeStorage.decryptString(Buffer.from(stored.data, 'base64'));
        }
        return stored.data;
    }

    const key = crypto.randomBytes(32).toString('hex');
    const stored = keychain
        ? { version: 1, protected: true, data: safeStorage.encryptString(key).toString('base64') }
        : { version: 1, protected: false, data: key };
    if (!keychain) logger.warn('OS keychain unavailable: encryption key stored unprotected (owner-only file)');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(stored), { mode: 0o600, flag: 'wx' });
    return key;
}

module.exports = { loadOrCreateKey };
