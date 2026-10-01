const db = require('../db');
const { Accounts, HeartbeatLogs, isOperational } = require('../models');
const { sendHeartbeat } = require('./platformClient');
const notificationService = require('./notificationService');
const { recordSystemAction } = require('./auditTrail');
const systemSettings = require('./systemSettingsService');
const killSwitch = require('./killSwitchService');
const events = require('./events');
const logger = require('../logger');

// accountId -> run. Each startAccount() creates a new run object; a loop keeps going only while
// its run is still the registered one. That way stopAccount() also stops a heartbeat that is
// already in flight (its timer has fired, so clearTimeout alone can't), and a restart never
// leaves two loops running.
const activeTimers = new Map();

const isCurrent = (id, run) => activeTimers.get(id) === run;

function logHeartbeat(account, entry) {
    try {
        HeartbeatLogs.insert({ accountId: account._id, accountName: account.name, accountType: 'sub', ...entry });
    } catch (err) {
        logger.error(`Could not write heartbeat log for ${account.name}`, err.message); // never stop the loop for it
    }
}

/** Success: the failure streak ends (the total, heartbeatErrors, is kept). */
function recordSuccess(account, usedProxy) {
    const at = db.now();
    db.get().prepare(`
        UPDATE accounts SET lastHeartbeatAt = ?, consecutiveFailures = 0,
            proxyLastUsedAt = CASE WHEN ? THEN ? ELSE proxyLastUsedAt END, updatedAt = ?
        WHERE _id = ?
    `).run(at, usedProxy ? 1 : 0, at, at, account._id);
}

/** Failure: count it (total + streak); mark expired if the platform rejected the token. */
function recordFailure(account, usedProxy, expired) {
    const at = db.now();
    return db.get().prepare(`
        UPDATE accounts SET heartbeatErrors = heartbeatErrors + 1, consecutiveFailures = consecutiveFailures + 1,
            proxyLastUsedAt = CASE WHEN ? THEN ? ELSE proxyLastUsedAt END,
            status = CASE WHEN ? THEN 'expired' ELSE status END, updatedAt = ?
        WHERE _id = ?
        RETURNING heartbeatErrors, consecutiveFailures
    `).get(usedProxy ? 1 : 0, at, expired ? 1 : 0, at, account._id);
}

/** Put on hold, only if nobody changed the status meanwhile. Returns true if it did. */
function putOnHold(account, holdReason) {
    const at = db.now();
    const changed = db.get().prepare(`
        UPDATE accounts SET status = 'on_hold', holdReason = ?, heldAt = ?, updatedAt = ? WHERE _id = ? AND status = 'active'
    `).run(holdReason, at, at, account._id).changes;
    return Number(changed) > 0;
}

async function beat(id, run) {
    const fresh = Accounts.findById(id);
    if (!isCurrent(id, run)) return;
    if (!fresh || !isOperational(fresh) || killSwitch.isActive()) {
        activeTimers.delete(id);
        return;
    }

    const startTime = Date.now();
    const result = await sendHeartbeat(fresh);
    const latencyMs = Date.now() - startTime;

    logHeartbeat(fresh, {
        success: result.success,
        apiBase: result.apiBase ?? null,
        endpoint: result.endpoint ?? null,
        statusCode: result.statusCode ?? null, // null = no HTTP response (DNS, timeout, proxy, decrypt)
        responseCode: result.code || result.responseCode || null,
        latencyMs,
        errorMessage: result.error || null,
        requestPayload: result.requestPayload || null,
        responseBody: result.response || null
    });
    events.emit('heartbeat:update', {
        accountId: fresh._id, name: fresh.name, success: result.success,
        code: result.code || result.responseCode || null, latencyMs, apiBase: result.apiBase ?? null
    });

    // Went