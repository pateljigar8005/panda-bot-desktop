const { app, ipcMain } = require('electron');
const { createRouter } = require('./router');
const { isAppUrl } = require('./appProtocol');
const auditTrail = require('./services/auditTrail');
const routes = require('./routes');

const CHANNEL = 'panda:request';

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

    return router;
}

module.exports = { registerIpc, CHANNEL };
