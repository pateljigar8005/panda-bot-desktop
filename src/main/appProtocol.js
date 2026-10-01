const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const { protocol, net } = require('electron');

// The packaged UI is served from app://panda/… rather than file://, so absolute asset paths
// (base '/') and client-side routes (/accounts/123) work exactly as in the browser.
const SCHEME = 'app';
const ORIGIN = `${SCHEME}://panda`;
const RENDERER_DIR = path.join(__dirname, '../../dist/renderer');

// Nothing is loaded from the network: every script, style and image ships with the app.
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Radix/Sonner set inline styles
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
].join('; ');

/**
 * True when `url` belongs to our UI: app://panda, or the Vite dev server in development.
 * Compares protocol + host by hand: for custom schemes like app:, URL.origin is the string "null".
 */
function isAppUrl(url, devUrl = null) {
    try {
        const { protocol: scheme, host } = new URL(url);
        if (`${scheme}//${host}` === ORIGIN) return true;
        if (!devUrl) return false;
        const dev = new URL(devUrl);
        return scheme === dev.protocol && host === dev.host;
    } catch {
        return false;
    }
}

/** Must run before the app is ready. */
function registerScheme() {
    protocol.registerSchemesAsPrivileged([
        { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
    ]);
}

/**
 * Resolve a request path to a file inside dist/renderer. Page loads of unknown paths get
 * index.html (client-side routes); anything else (assets, fetch/XHR) gets a 404, never HTML.
 */
function resolveFile(pathname, { navigation = false } = {}) {
    const decoded = decodeURIComponent(pathname);
    const file = path.normalize(path.join(RENDERER_DIR, decoded));
    // Never serve anything outside the renderer build (e.g. app://panda/../../main/index.js)
    if (file !== RENDERER_DIR && !file.startsWith(RENDERER_DIR + path.sep)) return null;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    return navigation && !path.extname(decoded) ? path.join(RENDERER_DIR, 'index.html') : null;
}

/** Must run after the app is ready. */
function registerAppProtocol() {
    protocol.handle(SCHEME, async (request) => {
        const url = new URL(request.url);
        // Page loads ask for HTML; fetch/XHR (e.g. leftover HTTP API calls) don't
        const navigation = (request.headers.get('accept') || '').includes('text/html');
        const file = url.host === 'panda' ? resolveFile(url.pathname, { navigation }) : null;
        if (!file) return new Response('Not found', { status: 404 });
        const response = await net.fetch(pathToFileURL(file).toString());
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', CSP);
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(response.body, { status: response.status, headers });
    });
}

module.exports = { registerScheme, registerAppProtocol, resolveFile, isAppUrl, ORIGIN, RENDERER_DIR };
