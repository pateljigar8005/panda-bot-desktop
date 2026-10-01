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

/** Account as the UI sees it: credentials masked, the encrypted token URL never included. */
function accountJSON(account) {
    if (!account) return null;
    const { tokenUrlEncrypted, ...rest } = account; // eslint-disable-line no-unused-vars
    return {
        ...rest,
        tokenEncrypted: mask(rest.tokenEncrypted),
        sessionIdEncrypted: mask(rest.sessionIdEncrypted),
        sidEncrypted: mask(rest.sidEncrypted),
        mcEncrypted: mask(rest.mcEncrypted)
    };
}

function masterJSON(master) {
    if (!master) return null;
    const { tokenUrlEncrypted, ...rest } = master; // eslint-disable-line no-unused-vars
    return {
        ...rest,
        tokenEncrypted: mask(rest.tokenEncrypted),
        sessionIdEncrypted: mask(rest.sessionIdEncrypted),
        sidEncrypted: mask(rest.sidEncrypted)
    };
}

const proxyJSON = (proxy) => (proxy ? { ...proxy, passwordEncrypted: mask(proxy.passwordEncrypted) } : null);

module.exports = { Accounts, Proxies, Master, HeartbeatLogs, AuditLogs, isOperational, accountJSON, masterJSON, proxyJSON };
