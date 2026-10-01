const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;      // 96 bits for GCM
const TAG_LENGTH = 16;     // 128 bits

// 32-byte key, set once at startup (kept in the OS keychain — see keyStore.js)
let key = null;

function setKey(hexKey) {
    const buf = Buffer.from(String(hexKey || ''), 'hex');
    if (buf.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex characters)');
    key = buf;
}

function getKey() {
    if (!key) throw new Error('Encryption key not loaded');
    return key;
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * Returns: iv:authTag:encrypted (all base64)
 */
function encrypt(plaintext) {
    if (!plaintext) return null;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_LENGTH });

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 */
function decrypt(encryptedData) {
    if (!encryptedData) return null;

    const [ivBase64, tagBase64, encrypted] = encryptedData.split(':');
    // Ciphertext may legitimately be empty only for empty plaintext, which encrypt() rejects.
    if (!ivBase64 || !tagBase64 || !encrypted) {
        throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(tagBase64, 'base64');
    // A truncated tag would make forging ciphertext far easier — require the full 128 bits.
    if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) {
        throw new Error('Invalid encrypted data format');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Generate cryptographically secure random hex (tokens, ids, secrets)
 */
function generateRandomHex(bytes = 16) {
    return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
    setKey,
    encrypt,
    decrypt,
    generateRandomHex
};
