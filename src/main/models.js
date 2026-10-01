const { table } = require('./db');

const Accounts = table('accounts');
const Proxies = table('proxies');
const Master = table('master_account');
const HeartbeatLogs = table('heartbeat_logs', { json: ['requestPayload', 'responseBody'], bool: ['success'], timestamps: false });
const AuditLogs = table('audit_logs', { json: ['request', 'meta'], bool: ['success'], timestamps: false });

const MASK = '••••••••';
// null stays null, so missing credentials are visible in the UI
const mask = (value) => (value ? MASK : value);

/** True if the account may send heartbeats and place bets. */
const isOperational = (account) => account?.status === 'active';

/**
 * Account as the UI sees it: platform credentials masked (never sent in the clear to the
 * renderer), the token URL never included. Not encrypted at rest — see db.js migration 1.
 */
function accountJSON(account) {
    if (!account) return null;
    const { tokenUrl, ...rest } = account; // eslint-disable-line no-unused-vars
    return {
        ...rest,
        token: mask(rest.token),
        sessionId: mask(rest.sessionId),
        sid: mask(rest.sid),
        mc: mask(rest.mc)
    };
}

function masterJSON(master) {
    if (!master) return null;
    const { tokenUrl, ...rest } = master; // eslint-disable-line no-unused-vars
    return {
        ...rest,
        token: mask(rest.token),
        sessionId: mask(rest.sessionId),
        sid: mask(rest.sid)
    };
}

// Proxy/SMTP passwords are unrelated to platform credentials and stay encrypted at rest.
const proxyJSON = (proxy) => (proxy ? { ...proxy, passwordEncrypted: mask(proxy.passwordEncrypted) } : null);

module.exports = { Accounts, Proxies, Master, HeartbeatLogs, AuditLogs, isOperational, accountJSON, masterJSON, proxyJSON };
