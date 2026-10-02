const { WebContentsView } = require('electron');
const { Master, BrowserTrafficLogs } = require('../models');
const { readTokenUrl } = require('./tokenUrlService');
const { USER_AGENTS } = require('./platformClient');
const { badRequest, conflict } = require('../errors');
const killSwitch = require('./killSwitchService');
const events = require('./events');
const logger = require('../logger');

/**
 * The master account's own browser, embedded directly in the app window (a WebContentsView,
 * not a separate OS window) — the owner logs in and browses/bets normally, like a human. We only
 * observe its traffic via the Chrome DevTools Protocol (see wireCapture); we never make a signed
 * API call as the master ourselves.
 *
 * Genuinely emulated as the real device, the same way Playwright's `devices[...]` presets do it
 * (confirmed against Playwright's own Chromium driver source — resizing the view alone is not
 * mobile emulation): CDP `Emulation.setDeviceMetricsOverride` with `mobile: true` so Chromium's
 * own layout/touch/media-query engine actually treats this as a phone, not a narrow desktop
 * window, and `Emulation.setUserAgentOverride` so the Client Hints headers this app's own
 * anti-detection work cares about (sec-ch-ua-mobile, sec-ch-ua-platform) come out consistent with
 * the User-Agent string instead of leaking the host machine's real platform.
 */
const DEVICES = {
    // viewport/screen/deviceScaleFactor from Playwright's own device descriptors (iPhone 13 Pro /
    // Pixel 9 — the closest match to USER_AGENTS.android's real captured Android 15/Pixel 9 UA).
    // userAgent stays exactly what platformClient.js already uses for real signed requests —
    // verified against full_session_log.txt — never Playwright's own (slightly different) UA string.
    '1': { // iOS
        userAgent: USER_AGENTS.ios,
        viewport: { width: 390, height: 664 },
        screen: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        uaMetadata: { platform: 'iOS', platformVersion: '15_0', architecture: 'arm' }
    },
    '2': { // Android
        userAgent: USER_AGENTS.android,
        viewport: { width: 360, height: 732 },
        screen: { width: 360, height: 808 },
        deviceScaleFactor: 3,
        uaMetadata: { platform: 'Android', platformVersion: '15', architecture: 'arm' }
    }
};

let hostWindow = null;
/** Called once from index.js after the main window exists. */
function setWindow(win) { hostWindow = win; }

// Singleton: only one master browser view at a time.
let state = null; // { view, startedAt }

const isOpen = () => state !== null;

/**
 * Device emulation, matching exactly what Playwright's Chromium driver itself sends for a
 * `devices[...]` preset (read from its own source rather than guessed) — device metrics with
 * `mobile: true`, touch emulation, and a Client-Hints-aware user-agent override. Chromium derives
 * sec-ch-ua (the "Chromium";v="..." brand list) from its own build on its own; it's never
 * something to override by hand, so only platform/platformVersion/architecture are set here.
 */
async function emulateDevice(dbg, device) {
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
        mobile: true,
        width: device.viewport.width,
        height: device.viewport.height,
        screenWidth: device.screen.width,
        screenHeight: device.screen.height,
        deviceScaleFactor: device.deviceScaleFactor,
        screenOrientation: { angle: 0, type: 'portraitPrimary' }
    });
    await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true });
    await dbg.sendCommand('Emulation.setUserAgentOverride', {
        userAgent: device.userAgent,
        userAgentMetadata: { mobile: true, model: '', ...device.uaMetadata }
    });
}

/**
 * yewu* traffic only, via CDP (Network domain) — the same mechanism Playwright itself uses
 * under the hood, but through Electron's own debugger API so the view's Chromium (the app's own,
 * already-bundled one) needs nothing extra installed. webContents.session.webRequest can't read
 * response bodies at all, which is why this goes through the debugger instead.
 */
function wireCapture(webContents, device) {
    const dbg = webContents.debugger;
    const pending = new Map(); // requestId -> { url, method, postData, hasPostData, statusCode }

    async function save(entry, responseBody) {
        const endpoint = entry.url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
        const isBetOrder = entry.method === 'POST' && endpoint.endsWith('/betOrder/betPB');
        let requestPayload = null;
        if (entry.postData) {
            try { requestPayload = JSON.parse(entry.postData); } catch { requestPayload = entry.postData; }
        }

        let row;
        try {
            row = BrowserTrafficLogs.insert({
                url: entry.url, method: entry.method, endpoint,
                statusCode: entry.statusCode ?? null, requestPayload, responseBody, isBetOrder
            });
        } catch (err) {
            logger.error('Could not write browser traffic log', err.message); // never let logging break capture
            return;
        }
        events.emit('browser:traffic', row);

        // Lazy require: copyBetExecutor doesn't need to be loaded at all for accounts that never
        // place a bet, and keeps this module's own require graph independent of the executor's.
        if (isBetOrder) {
            require('./copyBetExecutor').onMasterBetDetected({ requestPayload, responseBody })
                .catch((err) => logger.error('Copy-bet execution failed', err.message));
        }
    }

    async function finish(requestId) {
        const entry = pending.get(requestId);
        if (!entry) return;
        pending.delete(requestId);

        if (entry.hasPostData && !entry.postData) {
            try {
                const { postData } = await dbg.sendCommand('Network.getRequestPostData', { requestId });
                entry.postData = postData;
            } catch { /* request body already gone — not fatal */ }
        }

        let responseBody = null;
        try {
            const { body, base64Encoded } = await dbg.sendCommand('Network.getResponseBody', { requestId });
            const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf-8') : body;
            try { responseBody = JSON.parse(text); } catch { responseBody = text; }
        } catch { /* binary, or the page navigated away before we could read it */ }

        await save(entry, responseBody);
    }

    dbg.on('message', (_event, method, params) => {
        if (method === 'Network.requestWillBeSent') {
            const { requestId, request } = params;
            if (!request.url.includes('yewu') || request.method === 'OPTIONS') return;
            pending.set(requestId, { url: request.url, method: request.method, postData: request.postData ?? null, hasPostData: Boolean(request.hasPostData) });
        } else if (method === 'Network.responseReceived') {
            const entry = pending.get(params.requestId);
            if (entry) entry.statusCode = params.response.status;
        } else if (method === 'Network.loadingFinished') {
            void finish(params.requestId);
        } else if (method === 'Network.loadingFailed') {
            const entry = pending.get(params.requestId);
            if (entry) { pending.delete(params.requestId); void save(entry, null); }
        }
    });

    dbg.attach('1.3');
    return Promise.all([
        dbg.sendCommand('Network.enable'),
        emulateDevice(dbg, device)
    ]);
}

async function launch() {
    if (isOpen()) throw conflict('The master browser is already open.');
    if (!hostWindow || hostWindow.isDestroyed()) throw badRequest('The app window is not ready yet.');
    if (killSwitch.isActive()) throw badRequest('Kill switch is active — nothing runs until it’s released.');

    const master = Master.findOne();
    const tokenUrl = master && readTokenUrl(master);
    if (!tokenUrl) throw badRequest('Set up the master account (with a token URL) before opening its browser.');

    const device = DEVICES[master.deviceId] ?? DEVICES['2'];
    const view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true } });
    // Plain, non-CDP UA override — safe to set before any navigation, so even the very first
    // request carries the right User-Agent. The fuller CDP-based emulation (device metrics, touch,
    // Client Hints) has to wait until after the first navigation — see the comment below.
    view.webContents.setUserAgent(device.userAgent);
    hostWindow.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: device.viewport.width, height: device.viewport.height }); // the renderer reports the real placement right after mount

    state = { view, startedAt: Date.now() };

    // Covers the user closing/reloading in a way that destroys the view's webContents directly.
    view.webContents.once('destroyed', () => {
        if (state && state.view === view) { state = null; events.emit('browser:status', status()); }
    });

    try {
        await view.webContents.loadURL(tokenUrl);
    } catch (err) {
        logger.warn('Master browser navigation failed (continuing — the view is still open)', err.message);
    }

    // Attaching the debugger (for traffic capture + full device emulation) only after the first
    // navigation has committed — attaching to a WebContentsView that has never navigated is
    // unreliable (reproduced directly: it either errors "target closed" or crashes the whole app).
    // The one-time cost is that this first document request goes out without the CDP-level
    // Emulation override (plain UA above still applies); every request after this point is covered.
    try {
        await wireCapture(view.webContents, device);
    } catch (err) {
        logger.warn('Master browser opened, but traffic capture/device emulation could not start', err.message);
    }

    events.emit('browser:status', status());
    return status();
}

async function close() {
    if (!state) return status();
    const { view } = state;
    state = null; // clear first: the 'destroyed' handler above would otherwise race this
    try {
        hostWindow?.contentView.removeChildView(view);
        view.webContents.close();
    } catch (err) {
        logger.warn('Error closing master browser (ignoring)', err.message);
    }
    events.emit('browser:status', status());
    return status();
}

/** Where the renderer's placeholder element currently is, in window-content pixels. 0×0 is a
 *  valid bounds (the renderer uses it to hide the view without closing the browser). */
function setBounds(bounds) {
    if (!state || !bounds) return;
    const { x, y, width, height } = bounds;
    if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) return;
    state.view.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
}

function status() {
    return { running: isOpen(), startedAt: state?.startedAt ?? null };
}

module.exports = { setWindow, launch, close, setBounds, status };
