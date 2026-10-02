/** Ported from panda-bot/src/controllers/systemController.js: no userId (no auth). */
const systemSettingsService = require('../services/systemSettingsService');
const killSwitch = require('../services/killSwitchService');
const heartbeatScheduler = require('../services/heartbeatScheduler');

function snapshot() {
    return {
        settings: systemSettingsService.get(),
        killSwitch: killSwitch.status(),
        copyBetting: systemSettingsService.getCopyBetting(),
        runningHeartbeats: heartbeatScheduler.runningCount()
    };
}

function register(router) {
    router.handle('GET /system/status', () => snapshot());

    router.handle('PUT /system/settings', ({ body }) => {
        systemSettingsService.update(body);
        return snapshot();
    });

    router.handle('POST /system/kill-switch', async ({ body, audit }) => {
        const result = await killSwitch.activate({ reason: body?.reason });
        audit({ meta: { stoppedHeartbeats: result.stoppedHeartbeats, clearedQueues: result.clearedQueues, warnings: result.warnings } });
        return { ...snapshot(), ...result };
    });

    router.handle('POST /system/kill-switch/release', async ({ audit }) => {
        const result = await killSwitch.release();
        audit({ meta: { restartedHeartbeats: result.restartedHeartbeats } });
        return { ...snapshot(), ...result };
    });

    // Independent of the kill switch — gates whether a detected master bet actually gets
    // replicated to sub-accounts. Opening the master browser never implies this is on.
    router.handle('POST /system/copy-betting/arm', ({ audit }) => {
        systemSettingsService.setCopyBetting({ armed: true, armedAt: new Date().toISOString() });
        audit({});
        return snapshot();
    });

    router.handle('POST /system/copy-betting/disarm', ({ audit }) => {
        systemSettingsService.setCopyBetting({ armed: false, disarmedAt: new Date().toISOString() });
        audit({});
        return snapshot();
    });
}

module.exports = { register };
