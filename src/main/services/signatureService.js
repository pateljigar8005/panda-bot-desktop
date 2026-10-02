const crypto = require('crypto');
const config = require('../config');

/**
 * Generate a checkId for API requests
 * Format: pc-<32 hex random>-<uid>-<timestamp_ms>
 * Of 336 checkid headers in full_session_log.txt, only the first 3 (fired before the client's
 * own uid is known yet, i.e. before getUserInfoPB resolves) use sid in this slot — every other
 * request, including the real captured betPB, uses the account's uid.
 */
function generateCheckId(uid) {
    const uuid = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `pc-${uuid}-${uid}-${timestamp}`;
}

/**
 * Generate a sid: the real client never gets this from the server — it's a UUIDv4 (dashes
 * stripped) generated once client-side and persisted in localStorage.unique_uuid for the life
 * of the browser profile (request_file.js:40512 init_uid). We generate one once per account.
 */
function generateSid() {
    const buf = crypto.randomBytes(16);
    buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
    buf[8] = (buf[8] & 0x3f) | 0x80; // variant
    return buf.toString('hex');
}

/**
 * Generate the heartbeat sign
 * Formula: MD5(sid + "|" + mc + "|" + uid)
 */
function generateHeartbeatSign(sid, mc, uid) {
    const raw = `${sid}|${mc}|${uid}`;
    return crypto.createHash('md5').update(raw).digest('hex');
}

/**
 * Generate the dataCollect sign
 * Formula: MD5(sessionId + deviceId + salt)
 */
function generateDataCollectSign(sessionId, deviceId) {
    const raw = `${sessionId}${deviceId}${config.panda.dataCollectSalt}`;
    return crypto.createHash('md5').update(raw).digest('hex');
}

module.exports = {
    generateCheckId,
    generateSid,
    generateHeartbeatSign,
    generateDataCollectSign
};