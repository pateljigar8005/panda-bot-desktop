const path = require('node:path');
const { app, BrowserWindow, dialog, session, shell, safeStorage } = require('electron');
const { registerScheme, registerAppProtocol, isAppUrl, ORIGIN } = require('./appProtocol');
const { registerIpc } = require('./ipc');
const db = require('./db');
const { loadOrCreateKey } = require('./services/keyStore');
const encryptionService = require('./services/encryptionService');
const systemSettings = require('./services/systemSettingsService');
const killSwitch = require('./services/killSwitchService');
const heartbeatScheduler = require('./services/heartbeatScheduler');
const browserAutomation = require('./services/browserAutomation');
const events = require('./services/events');
const { recordSystemAction } = require('./services/auditTrail');
const logger = require('./logger');

const DB_FILE = 'panda.db';

/** Open storage and load everything that must be ready before any IPC request or heartbeat runs. */
function initStorage() {
    const dataDir = app.getPath('userData');
    // Key first: db.open() runs migrations, and the credentials-to-plain migration decrypts
    // existing rows with it (see db.js migrateCredentialsToPlain).
    encryptionService.setKey(loadOrCreateKey(dataDir, safeStorage));
    db.open(path.join(dataDir, DB_FILE));
    systemSettings.load();
    killSwitch.load();
}

// Dev only: `npm run dev` passes the Vite server URL. A packaged app always loads its own files.
const devUrlArg = process.argv.find((a) => a.startsWith('--dev-url='));
const DEV_URL = !app.isPackaged && devUrlArg ? devUrlArg.slice('--dev-url='.length) : null;
const START_URL = DEV_URL || `${ORIGIN}/`;

registerScheme();

let mainWindow = null;
// Set once the quit is actually going ahead (nothing running, or the user confirmed) — lets the
// window and app close for real on the next pass, instead of looping back through confirmation.
let quitConfirmed = false;

// How long to let a heartbeat that's already mid-request finish and log its result before we pull
// the database out from under it. stopAll()/the kill switch only cancel *future* ticks.
const SHUTDOWN_GRACE_MS = 3000;

/**
 * Arm the kill switch (persists, so nothing silently resumes on the next launch) and give any
 * heartbeat already talking to the platform a moment to land. Does NOT close the database — the
 * caller decides when that's actually safe (see 'will-quit' below and the signal handler).
 * Shared by the confirmed-quit dialog and the SIGTERM/SIGINT handlers so both stop things the same way.
 */
async function stopEverything(reason, meta) {
    const result = killSwitch.activate({ reason });
    recordSystemAction('kill_switch_activated', { meta: { automatic: true, stoppedHeartbeats: result.stoppedHeartbeats, ...meta } });
    await heartbeatScheduler.waitForIdle(SHUTDOWN_GRACE_MS);
    // Best-effort: an orphaned Chromium process left running after we quit is a worse outcome
    // than a browser-close error we just log and move past.
    await browserAutomation.close().catch((err) => logger.warn('Could not close the master browser on quit', err.message));
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 680,
        title: 'Panda Bot',
        show: false,
        icon: path.join(__dirname, '../../build/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            spellcheck: false
        }
    });
    browserAutomation.setWindow(mainWindow);

    // Open filling the screen (taskbar / menu bar stay visible); width/height above are the
    // size it returns to when the user un-maximizes
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });
    // The close (titlebar) button always goes through the same quit confirmation as Cmd+Q / Alt+F4 —
    // this app has no system tray yet to keep running quietly in, so "close the window" means "quit".
    mainWindow.on('close', (event) => {
        if (quitConfirmed) return; // already decided for real — let it close
        event.preventDefault();
        app.quit();
    });
    mainWindow.on('closed', () => { mainWindow = null; });

    // Links to other sites open in the user's browser; the app window never leaves the app
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAppUrl(url, DEV_URL)) event.preventDefault();
    });

    mainWindow.loadURL(START_URL);
}

// One copy of the app at a time: a second launch focuses the existing window
// (two copies would both send heartbeats for the same accounts)
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return createMainWindow();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    app.on('web-contents-created', (_event, contents) => {
        contents.on('will-attach-webview', (event) => event.preventDefault());
    });

    app.whenReady().then(() => {
        // The UI needs no camera, microphone, notifications-from-web, etc.
        session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

        initStorage();
        registerAppProtocol();
        registerIpc({ devUrl: DEV_URL });
        createMainWindow();

        // Live events (heartbeats, kill switch, …) pushed straight to the window — no polling needed
        events.bus.on('event', (envelope) => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('panda:event', envelope);
        });

        heartbeatScheduler.startAll().catch((err) => logger.error('Failed to start heartbeat loops', err.message));

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });

    // Confirm before quitting while heartbeats are running, so closing the window or Cmd+Q / Alt+F4
    // doesn't silently stop every account's heartbeat loop. Nothing to confirm if nothing is running.
    // This is the single place that decides a quit is really happening (quitConfirmed) — the window's
    // own 'close' handler above always routes here instead of closing on its own.
    //
    // Deliberately does NOT close the database here: before-quit only means a quit was *requested* —
    // if anything downstream cancels or stalls it (another before-quit listener, a window refusing to
    // close, a stray OS-level quit reaching the wrong unsigned-dev-build process, …) the app would be
    // left running with no database, erroring on every request until force-quit. db.close() happens in
    // 'will-quit' instead, which only fires once Electron has actually committed to exiting.
    app.on('before-quit', (event) => {
        if (quitConfirmed) return; // already decided — let every operation finish stopping and exit

        const running = heartbeatScheduler.runningCount();
        const browserRunning = browserAutomation.status().running;
        if (running === 0) {
            quitConfirmed = true;
            heartbeatScheduler.stopAll();
            // Fire-and-forget: this path doesn't block quit on anything else either, and
            // 'will-quit' gives the close a brief window to actually finish before the process exits.
            if (browserRunning) browserAutomation.close().catch((err) => logger.warn('Could not close the master browser on quit', err.message));
            return;
        }

        event.preventDefault();
        const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
        dialog
            .showMessageBox(parent, {
                type: 'warning',
                buttons: ['Cancel', 'Quit anyway'],
                defaultId: 0,
                cancelId: 0,
                title: 'Quit Panda Bot?',
                message: `This will stop heartbeats for ${running} active account${running === 1 ? '' : 's'}${browserRunning ? ', close the master browser,' : ''} and arm the kill switch.`,
                detail: 'Bets won’t be mirrored and sessions may expire while the app is closed. ' +
                    'Nothing resumes on the next launch until you release the kill switch in Settings.'
            })
            .then(async ({ response }) => {
                if (response !== 1) return;
                quitConfirmed = true;
                await stopEverything('App closed while heartbeats were running', { trigger: 'app_quit' });
                app.quit();
            });
    });

    // Only fires once Electron has actually decided the quit is going through (windows closed,
    // nothing cancelled it) — the one safe place to close the database for the normal quit paths.
    app.on('will-quit', () => db.close());

    // No window to show a dialog to, and no guarantee the OS gives us more than a moment before
    // escalating to SIGKILL — so skip confirmation and go straight to the same shutdown the dialog's
    // "Quit anyway" uses: arm the kill switch, let any in-flight heartbeat land, close the database.
    // Covers `kill <pid>`, a process manager, logout/shutdown — anything that doesn't go through
    // Electron's own quit flow and would otherwise just vanish the process mid-operation. Uses
    // app.exit() (immediate, skips before-quit/will-quit/window-all-closed), so it closes the
    // database itself instead of relying on 'will-quit'.
    let shuttingDownViaSignal = false;
    function handleTerminationSignal(signal) {
        if (shuttingDownViaSignal || quitConfirmed) return;
        shuttingDownViaSignal = true;
        quitConfirmed = true;
        logger.warn(`Received ${signal} — stopping heartbeats and shutting down`);
        stopEverything(`Process received ${signal}`, { trigger: 'signal', signal })
            .catch((err) => logger.error('Shutdown on signal failed', err.message))
            .finally(() => { db.close(); app.exit(0); });
    }
    process.on('SIGTERM', () => handleTerminationSignal('SIGTERM'));
    process.on('SIGINT', () => handleTerminationSignal('SIGINT'));
}
