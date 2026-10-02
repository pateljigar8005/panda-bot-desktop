const db = require('../db');
const { Accounts, HeartbeatLogs, isOperational } = require('../models');
const { sendHeartbeat } = require('./platformClient');
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

// Every beat() currently awaiting the platform (request sent, no response yet). Tracked so a
// signal/quit shutdown can give these a moment to finish and log their result instead of cutting
// the socket mid-request — see waitForIdle().
const inFlight = new Set();

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

    // Went out through the proxy? (requestPayload is null only if we never got as far as sending)
    const usedProxy = Boolean(fresh.proxyId && result.requestPayload);

    if (result.success) {
        recordSuccess(fresh, usedProxy);
        scheduleNext(id, run);
        return;
    }

    // The platform reports an expired token either as HTTP 401 or as code 0401013 inside a normal
    // HTTP 200 reply (result.code). Missing the latter kept expired accounts heartbeating.
    const code = result.code || result.responseCode || null;
    const expired = result.statusCode === 401 || code === '0401013' || code === '401';
    const counts = recordFailure(fresh, usedProxy, expired);
    const reason = result.error || [code, result.response?.msg].filter(Boolean).join(' · ') || `HTTP ${result.statusCode ?? '—'}`;

    if (expired) {
        activeTimers.delete(id);
        return;
    }

    // Too many failures in a row: stop hitting the platform before it looks like unusual activity
    // or trips its rate limits. The owner resumes it with Activate.
    const holdAfter = systemSettings.get().autoHoldAfterFailures;
    if (holdAfter > 0 && counts.consecutiveFailures >= holdAfter) {
        const holdReason = `On hold after ${counts.consecutiveFailures} failed heartbeats in a row. Last error: ${reason}`;
        if (putOnHold(fresh, holdReason)) {
            activeTimers.delete(id);
            recordSystemAction('account_auto_held', { account: fresh, meta: { consecutiveFailures: counts.consecutiveFailures, lastError: reason } });
            return;
        }
    }

    scheduleNext(id, run);
}

/** Interval ± jitter from Settings → Automation, read fresh on every beat so changes apply next tick. */
function nextDelay() {
    const { heartbeatIntervalMs, heartbeatJitterMs } = systemSettings.get();
    return heartbeatIntervalMs + (Math.random() - 0.5) * 2 * heartbeatJitterMs;
}

function scheduleNext(id, run) {
    run.timer = setTimeout(() => {
        const tick = beat(id, run).catch((err) => {
            logger.error(`Heartbeat loop crashed for account ${id}`, err.message);
            if (isCurrent(id, run)) scheduleNext(id, run); // never let one bad tick kill the loop
        });
        inFlight.add(tick);
        tick.finally(() => inFlight.delete(tick));
    }, nextDelay());
}

/**
 * Start the heartbeat loop for an account. Returns false if it can't run (missing sid/mc) —
 * sid is generated locally, mc comes from getUserInfoPB.
 */
function startAccount(account) {
    const id = account._id;
    if (activeTimers.has(id)) return true;
    if (killSwitch.isActive()) return false; // nothing runs while the kill switch is on
    if (!account.sid || !account.mc) {
        logger.warn(`Skipping ${account.name} — missing sid/mc`);
        return false;
    }
    const run = { timer: null };
    activeTimers.set(id, run);
    scheduleNext(id, run);
    return true;
}

function stopAccount(accountId) {
    const run = activeTimers.get(accountId);
    if (run) {
        clearTimeout(run.timer);
        activeTimers.delete(accountId);
    }
}

/** Start every active account (staggered). Returns how many loops were started. */
async function startAll() {
    if (killSwitch.isActive()) {
        logger.warn('Kill switch is ON — not starting heartbeats');
        return 0;
    }
    const accounts = Accounts.find({ where: 'status = ?', params: ['active'] });
    let started = 0;
    for (const account of accounts) {
        if (killSwitch.isActive()) break; // switched on while we were starting
        if (!startAccount(account)) continue;
        started++;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return started;
}

/** Stop every loop immediately (kill switch). In-flight heartbeats finish but never reschedule. Returns the count. */
function stopAll() {
    const count = activeTimers.size;
    for (const run of activeTimers.values()) clearTimeout(run.timer);
    activeTimers.clear();
    return count;
}

/** Number of running heartbeat loops. */
const runningCount = () => activeTimers.size;

/**
 * Resolve once every beat currently talking to the platform has finished (and logged its result),
 * or after timeoutMs, whichever comes first. For shutdown: stopAll()/the kill switch only cancel
 * *future* ticks — a request already in flight keeps running until it resolves or the process dies
 * out from under it, so give it a bounded window to land cleanly first.
 */
function waitForIdle(timeoutMs) {
    if (inFlight.size === 0) return Promise.resolve();
    const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
    return Promise.race([Promise.allSettled([...inFlight]), timeout]);
}

module.exports = { startAccount, stopAccount, startAll, stopAll, runningCount, waitForIdle };