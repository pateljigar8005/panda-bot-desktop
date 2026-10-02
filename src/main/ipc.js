const { app, ipcMain } = require('electron');
const { createRouter } = require('./router');
const { isAppUrl } = require('./appProtocol');
const auditTrail = require('./services/auditTrail');
const browserAutomation = require('./services/browserAutomation');
const routes = require('./routes');

const CHANNEL = 'panda:request';
// Fire-and-forget, high-frequency (every resize/scroll while the embedded master browser is
// visible) — a real route through the router would audit-log every single bounds update.
const BOUNDS_CHANNEL = 'panda:browser-bounds';

function registerIpc({ devUrl } = {}) {
    const router = createRouter({ onFinish: auditTrail.recordRequest });

    router.handle('GET /app/info', () => ({
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        dataDir: app.getPath('userData')
    }));

    routes.register(router);

    ipcMain.handle(CHANNEL, (event, request) => {
        // Only our own UI may call in, never another page that somehow got into a window
        if (!event.senderFrame || !isAppUrl(event.senderFrame.url, devUrl)) return { ok: false, status: 403, message: 'Forbidden' };
        return router.dispatch(request);
    });

    ipcMain.on(BOUNDS_CHANNEL, (event, bounds) => {
        if (!event.senderFrame || !isAppUrl(event.senderFrame.url, devUrl)) return;
        browserAutomation.setBounds(bounds);
    });

    return router;
}

module.exports = { registerIpc, CHANNEL };
