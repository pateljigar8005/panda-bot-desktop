const systemSettings = require('./systemSettingsService');
const events = require('./events');
const logger = require('../logger');

/**
 * Global emergency stop. While active nothing runs: no heartbeats, and anything that acts on the
 * platform (the bet executor included) must check isActive() first. Kept in the database, so it
 * stays on across restarts until the owner resumes.
 */
let active = false;

const scheduler = () => require('./heartbeatScheduler'); // lazy: the scheduler also requires this module

/** True while everything must stay stopped. Synchronous; safe to call on every heartbeat. */
const isActive = () => active;

/** Load the saved state at startup. */
function load() {
    active = Boolean(systemSettings.getKillSwitch().active);
    return active;
}

const status = () => ({ ...systemSettings.getKillSwitch(), active });

/** Stop everything: heartbeats first (cannot fail), then record it. */
function activate({ reason } = {}) {
    active = true;
    const stoppedHeartbeats = scheduler().stopAll();
    const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
    systemSettings.setKillSwitch({ active: true, reason: cleanReason, activatedAt: new Date().toISOString() });
    events.emit('kill-switch:activated', { reason: cleanReason, stoppedHeartbeats });
    logger.warn(`Kill switch activated: stopped ${stoppedHeartbeats} heartbeat loop(s)`, cleanReason ? { reason: cleanReason } : undefined);
    // No job queues in the desktop app (bets run in-process), so nothing else to clear
    return { stoppedHeartbeats, clearedQueues: [], warnings: [] };
}

/** Resume: clear the flag and restart heartbeats for active accounts. */
async function release() {
    systemSettings.setKillSwitch({ active: false, releasedAt: new Date().toISOString() });
    active = false;
    const restartedHeartbeats = await scheduler().startAll();
    logger.warn(`Kill switch released: restarted ${restartedHeartbeats} heartbeat loop(s)`);
    return { restartedHeartbeats, warnings: [] };
}

/** Test helper */
const resetForTests = () => { active = false; };

module.exports = { isActive, load, status, activate, release, resetForTests };
