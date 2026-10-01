/** Ported from panda-bot/src/controllers/systemController.js: no userId (no auth). */
const systemSettingsService = require('../services/systemSettingsService');
const killSwitch = require('../services/killSwitchService');
const heartbeatScheduler = require('../services/heartbeatScheduler');

function snapshot() {
    return { settings: systemSettingsService.get(), killSwitch: killSwitch.status(), runningHeartbeats: heartbeatScheduler.runningCount() };
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
}

module.exports = { register };
