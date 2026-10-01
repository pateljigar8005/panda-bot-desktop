const { badRequest } = require('../errors');

/**
 * Parse a token URL from the WebView-based platform
 * 
 * Input:  https://app-h5.lzy21.com/?token=68f9563b...&api=DSTP...&sessionId=53709504541891629817907052445723&iscache=0
 * Output: { token, sessionId, uid, api, raw }
 * 
 * The uid is extracted from the first 18 characters of sessionId.
 * Throws 400 errors: the URL comes straight from the client.
 */
function parseTokenUrl(tokenUrl) {
    if (!tokenUrl || typeof tokenUrl !== 'string') {
        throw badRequest('tokenUrl is required and must be a string');
    }

    let url;
    try {
        url = new URL(tokenUrl);
    } catch (e) {
        throw badRequest('Invalid tokenUrl format');
    }

    const params = url.searchParams;
    const token = params.get('token');
    const sessionId = params.get('sessionId');
    const api = params.get('api');

    if (!token) throw badRequest('token param missing from URL');
    if (!sessionId) throw badRequest('sessionId param missing from URL');

    // Extract uid from sessionId (first 18 digits)
    const uid = sessionId.substring(0, 18);
    if (!/^\d{18}$/.test(uid)) {
        throw badRequest('Could not extract uid from sessionId');
    }

    return {
        token,
        sessionId,
        uid,
        api: api || null,
        raw: tokenUrl
    };
}

/**
 * Mask a token for safe display
 * "abcdefghijk123456789" → "abcde...56789"
 */
function maskToken(value) {
    if (!value || value.length < 10) return '••••••••';
    return `${value.substring(0, 5)}...${value.substring(value.length - 5)}`;
}

module.exports = { parseTokenUrl, maskToken };