const path = require('node:path');
const { app, BrowserWindow, session, shell } = require('electron');
const { registerScheme, registerAppProtocol, isAppUrl, ORIGIN } = require('./appProtocol');
const { registerIpc } = require('./ipc');

// Dev only: `npm run dev` passes the Vite server URL. A packaged app always loads its own files.
const devUrlArg = process.argv.find((a) => a.startsWith('--dev-url='));
const DEV_URL = !app.isPackaged && devUrlArg ? devUrlArg.slice('--dev-url='.length) : null;
const START_URL = DEV_URL || `${ORIGIN}/`;

registerScheme();

let mainWindow = null;

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

    // Open filling the screen (taskbar / menu bar stay visible); width/height above are the
    // size it returns to when the user un-maximizes
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
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

        registerAppProtocol();
        registerIpc({ devUrl: DEV_URL });
        createMainWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}
