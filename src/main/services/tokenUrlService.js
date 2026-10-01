/**
 * The token URL embeds the platform token + sessionId. Stored in plain (see db.js migration 1)
 * and only returned on the single-item GET that the edit form uses — never in list responses.
 */
function readTokenUrl(doc) {
    return doc.tokenUrl ?? null;
}

/**
 * JSON for the edit form: the normal masked JSON (toJSON) plus the decrypted token URL.
 */
function toJSONWithTokenUrl(doc, toJSON) {
    return { ...toJSON(doc), tokenUrl: readTokenUrl(doc) };
}

module.exports = { readTokenUrl, toJSONWithTokenUrl };
