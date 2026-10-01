const { AuditLogs } = require('../models');
const logger = require('../logger');

/**
 * Action names for every state-changing route, keyed by "METHOD /path".
 * Every POST/PUT/PATCH/DELETE route should appear here (a test enforces it).
 * A handler can override the name for a specific outcome with audit({ action }).
 */
const ACTIONS = {
    'POST /accounts': 'account_created',
    'PUT /accounts/:id': 'account_updated',
    'DELETE /accounts/:id': 'account_deleted',
    'POST /accounts/:id/assign-proxy': 'account_proxy_assigned',
    'POST /accounts/:id/deactivate': 'account_deactivated',
    'POST /accounts/:id/activate': 'account_activated',
    'POST /accounts/:id/test': 'account_connection_tested',
    'POST /accounts/:id/retry-setup': 'account_setup_retried',
    'DELETE /accounts/:id/heartbeat-logs': 'heartbeat_logs_cleared',

    'POST /proxies': 'proxy_created',
    'PUT /proxies/:id': 'proxy_updated',
    'DELETE /proxies/:id': 'proxy_deleted',
    'POST /proxies/:id/health-check': 'proxy_health_checked',

    'POST /master': 'master_created',
    'PUT /master': 'master_updated',
    'DELETE /master': 'master_deleted',

    'PUT /settings/notifications': 'notification_settings_updated',
    'POST /settings/notifications/test': 'notification_test_sent',
    'PUT /system/settings': 'system_settings_updated',
    'POST /system/kill-switch': 'kill_switch_activated',
    'POST /system/kill-switch/release': 'kill_switch_released',

    'DELETE /heartbeat-logs': 'activity_log_cleared'
};

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const RESOURCE_TYPES = { accounts: 'account', proxies: 'proxy', master: 'master', settings: 'settings', system: 'system' };

const MAX_STRING = 300;
const MAX_DEPTH = 4;

/** Copy of the request body safe to store: not redacted (local app, single user — see CLAUDE.md), long strings cut, depth limited. */
function sanitize(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    if (typeof value !== 'object') return value;
    if (depth >= MAX_DEPTH) return '[…]';
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
    const out = {};
    for (const [key, v] of Object.entries(value)) out[key] = sanitize(v, depth + 1);
    return out;
}

// The created record's id/name, from the response (e.g. { account: {...} })
function resourceFromResponse(data) {
    const doc = data && (data.account || data.proxy || data.master);
    return doc ? { id: doc._id, name: doc.name } : {};
}

function write(entry) {
    try {
        AuditLogs.insert(entry);
    } catch (err) {
        logger.error('Audit log write failed', { action: entry.action, error: err.message });
    }
}

/** Router hook: one entry per state-changing request, with outcome and a redacted copy of the input. */
function recordRequest({ method, route, params, body, response, audit, durationMs }) {
    if (!STATE_CHANGING.has(method)) return;
    const path = route.slice(method.length + 1);
    const mount = path.split('/')[1];
    const fromResponse = response.ok ? resourceFromResponse(response.data) : {};

    write({
        action: audit.action || ACTIONS[route] || `${method.toLowerCase()} ${path}`,
        method,
        path,
        statusCode: response.status,
        success: response.ok,
        message: response.ok ? null : String(response.message || '').slice(0, 500) || null,
        resourceType: RESOURCE_TYPES[mount] || mount || null,
        resourceId: params.id || audit.resourceId || fromResponse.id || null,
        resourceName: audit.resourceName || fromResponse.name || null,
        durationMs,
        request: sanitize(body),
        meta: audit.meta || {}
    });
}

/** Something the app did by itself (e.g. putting an account on hold). */
function recordSystemAction(action, { account, meta } = {}) {
    write({
        action,
        success: true,
        resourceType: account ? 'account' : null,
        resourceId: account ? String(account._id) : null,
        resourceName: account?.name || null,
        meta: { automatic: true, ...(meta || {}) }
    });
}

module.exports = { recordRequest, recordSystemAction, sanitize, ACTIONS };
