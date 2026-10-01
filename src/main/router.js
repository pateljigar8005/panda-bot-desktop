/**
 * Replaces the HTTP API. The UI calls window.panda.request('PUT /accounts/:id'-style routes)
 * and the matching handler runs here, in the main process. Same route names as the old
 * Express API, so the UI's services/hooks barely change.
 *
 * Handlers receive { params, query, body, audit } and return plain data, or throw an AppError.
 * audit(info) adds to this request's audit entry (action, resourceName, meta, …).
 */

const { AppError } = require('./errors');
const logger = require('./logger');

/** onFinish({ method, route, params, body, response, audit, durationMs }) runs after every request. */
function createRouter({ onFinish } = {}) {
    const routes = [];

    /** route: "METHOD /path/:param", e.g. "GET /accounts/:id" */
    function handle(route, handler) {
        const [method, pattern] = route.split(' ');
        const names = [];
        const regex = new RegExp(`^${pattern.replace(/:([A-Za-z_]\w*)/g, (_, name) => { names.push(name); return '([^/]+)'; })}$`);
        routes.push({ method, pattern, regex, names, handler });
    }

    /**
     * Run one request. Always resolves with an envelope: errors are returned, not thrown,
     * because Electron would rewrap a thrown error and lose its status.
     */
    async function dispatch(request) {
        if (!request || typeof request.method !== 'string' || typeof request.path !== 'string') {
            return { ok: false, status: 400, message: 'Invalid request' };
        }
        const [pathname, search = ''] = request.path.split('?');
        const method = request.method.toUpperCase();
        for (const route of routes) {
            if (route.method !== method) continue;
            const match = route.regex.exec(pathname);
            if (!match) continue;
            const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])]));
            const query = { ...Object.fromEntries(new URLSearchParams(search)), ...(request.query || {}) };
            const body = request.body ?? null;

            const started = Date.now();
            let audit = {};
            const addAudit = (info) => { audit = { ...audit, ...info, meta: { ...(audit.meta || {}), ...(info.meta || {}) } }; };

            let response;
            try {
                response = { ok: true, status: 200, data: await route.handler({ params, query, body, audit: addAudit }) };
            } catch (err) {
                if (err instanceof AppError) response = { ok: false, status: err.status, message: err.message, details: err.details };
                else {
                    logger.error(`${method} ${pathname} failed`, err);
                    response = { ok: false, status: 500, message: 'Something went wrong' };
                }
            }

            if (onFinish) {
                try {
                    onFinish({ method, route: `${method} ${route.pattern}`, params, body, response, audit, durationMs: Date.now() - started });
                } catch (err) {
                    logger.error('Request hook failed', err.message);
                }
            }
            return response;
        }
        return { ok: false, status: 404, message: `No route for ${method} ${pathname}` };
    }

    return { handle, dispatch };
}

module.exports = { createRouter, AppError };
