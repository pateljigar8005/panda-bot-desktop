const encryptionService = require('./encryptionService');

/**
 * The token URL embeds the platform token + sessionId, so it is stored encrypted
 * (`tokenUrlEncrypted`) and only returned decrypted on the single-item GET that
 * the edit form uses — never in list responses.
 */
function readTokenUrl(doc) {
    if (!doc.tokenUrlEncrypted) return null;
    try {
        return encryptionService.decrypt(doc.tokenUrlEncrypted);
    } catch (err) {
        // Corrupt value or encryption key changed: treat as "no saved URL" rather than failing the request
        console.warn(`⚠️  Could not decrypt tokenUrl for ${doc._id}: ${err.message}`);
        return null;
    }
}

/**
 * JSON for the edit form: the normal masked JSON (toJSON) plus the decrypted token URL.
 */
function toJSONWithTokenUrl(doc, toJSON) {
    return { ...toJSON(doc), tokenUrl: readTokenUrl(doc) };
}

module.exports = { readTokenUrl, toJSONWithTokenUrl };
