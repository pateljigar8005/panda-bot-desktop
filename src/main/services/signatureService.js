const crypto = require('crypto');
const config = require('../config');

/**
 * Generate a checkId for API requests
 * Format: pc-<32 hex uuid>-<uid>-<timestamp_ms>
 */
function generateCheckId(uid) {
    const uuid = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `pc-${uuid}-${uid}-${timestamp}`;
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
    generateHeartbeatSign,
    generateDataCollectSign
};