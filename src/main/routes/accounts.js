/**
 * Ported from panda-bot/src/controllers/accountController.js: no userId (no auth), req/res
 * replaced by { params, query, body, audit } -> return data or throw AppError.
 */
const db = require('../db');
const { Accounts, Proxies, HeartbeatLogs, accountJSON } = require('../models');
const { AppError, badRequest, notFound } = require('../errors');
const { pick, parsePagination } = require('../validators');
const { parseTokenUrl } = require('../services/urlParserService');
const { readTokenUrl, toJSONWithTokenUrl } = require('../services/tokenUrlService');
const { assertUidAvailable } = require('../services/accountIdentityService');
const { fetchUserInfo, sendHeartbeat } = require('../services/platformClient');
const { generateSid } = require('../services/signatureService');
const heartbeatScheduler = require('../services/heartbeatScheduler');
const logger = require('../logger');

const UPDATABLE_FIELDS = ['name', 'deviceId', 'betMode', 'fixedAmount', 'multiplier', 'maxBetAmount', 'minBalanceThreshold', 'status', 'notes'];
const DEVICE_IDS = ['1', '2'];
const BET_MODES = ['fixed', 'proportional'];
const STATUSES = ['active', 'inactive', 'on_hold', 'expired', 'banned'];
const NO_CODE = 'none';
const LOG_SORTS = { newest: 'createdAt DESC', oldest: 'createdAt ASC', slowest: 'latencyMs DESC, createdAt DESC' };
const MAX_RANGE_MINUTES = 7 * 24 * 60; // logs are pruned after config.heartbeatLogRetentionDays

function validateCreate(body) {
    if (!body || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) throw badRequest('Name is required (1-100 chars)');
    if (!body.tokenUrl || typeof body.tokenUrl !== 'string') throw badRequest('Valid token URL is required');
    if (!DEVICE_IDS.includes(body.deviceId)) throw badRequest('deviceId must be 1 (iOS) or 2 (Android)');
    if (body.betMode !== undefined && !BET_MODES.includes(body.betMode)) throw badRequest('Invalid betMode');
    if (body.fixedAmount !== undefined && !(Number(body.fixedAmount) >= 1)) throw badRequest('fixedAmount must be >= 1');
    if (body.multiplier !== undefined && !(Number(body.multiplier) >= 0.1 && Number(body.multiplier) <= 10)) throw badRequest('multiplier must be 0.1-10');
    if (body.maxBetAmount !== undefined && !(Number(body.maxBetAmount) >= 1)) throw badRequest('maxBetAmount must be >= 1');
    if (body.minBalanceThreshold !== undefined && !(Number(body.minBalanceThreshold) >= 0)) throw badRequest('minBalanceThreshold must be >= 0');
    if (body.notes !== undefined && String(body.notes).length > 500) throw badRequest('notes must be 500 chars or fewer');
}

function validateUpdate(body) {
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100)) throw badRequest('Name must be 1-100 chars');
    if (body.tokenUrl !== undefined && typeof body.tokenUrl !== 'string') throw badRequest('Invalid tokenUrl');
    if (body.deviceId !== undefined && !DEVICE_IDS.includes(body.deviceId)) throw badRequest('deviceId must be 1 or 2');
    if (body.betMode !== undefined && !BET_MODES.includes(body.betMode)) throw badRequest('Invalid betMode');
    if (body.fixedAmount !== undefined && !(Number(body.fixedAmount) >= 1)) throw badRequest('fixedAmount must be >= 1');
    if (body.multiplier !== undefined && !(Number(body.multiplier) >= 0.1 && Number(body.multiplier) <= 10)) throw badRequest('multiplier must be 0.1-10');
    if (body.maxBetAmount !== undefined && !(Number(body.maxBetAmount) >= 1)) throw badRequest('maxBetAmount must be >= 1');
    if (body.minBalanceThreshold !== undefined && !(Number(body.minBalanceThreshold) >= 0)) throw badRequest('minBalanceThreshold must be >= 0');
    if (body.status !== undefined && !STATUSES.includes(body.status)) throw badRequest('Invalid status');
    if (body.notes !== undefined && String(body.notes).length > 500) throw badRequest('notes must be 500 chars or fewer');
}

function findProxyOrThrow(proxyId) {
    const proxy = Proxies.findById(proxyId);
    if (!proxy) throw badRequest('Invalid proxy');
    return proxy;
}

/** The sid/mc lookup, timed. Never throws: the caller still saves the account, with the reason. */
async function runSetupLookup(uid, token, deviceId, proxy) {
    const start = Date.now();
    try {
        const info = await fetchUserInfo(uid, token, deviceId, proxy);
        return {
            info, error: null, statusCode: info.statusCode ?? 200, responseCode: info.responseCode ?? null,
            responseBody: info.responseBody ?? null, requestPayload: info.requestPayload ?? null,
            apiBase: info.apiBase ?? null, endpoint: info.endpoint ?? null, latencyMs: Date.now() - start
        };
    } catch (err) {
        logger.warn('Could not fetch user info', err.message);
        return {
            info: null, error: err.message, statusCode: err.statusCode ?? null, responseCode: err.responseCode ?? null,
            responseBody: err.responseBody ?? null, requestPayload: err.requestPayload ?? null,
            apiBase: err.apiBase ?? null, endpoint: err.endpoint ?? null, latencyMs: Date.now() - start
        };
    }
}

/** Record a setup attempt in the account's log, next to its heartbeats. Never throws. */
function logSetupAttempt(account, attempt) {
    try {
        HeartbeatLogs.insert({
            accountId: account._id, accountName: account.name, accountType: 'sub', event: 'setup',
            success: !attempt.error, apiBase: attempt.apiBase ?? null, endpoint: attempt.endpoint ?? null,
            statusCode: attempt.statusCode, responseCode: attempt.responseCode, latencyMs: attempt.latencyMs,
            errorMessage: attempt.error, requestPayload: attempt.requestPayload ?? null, responseBody: attempt.responseBody ?? null
        });
    } catch (err) {
        logger.error('Could not write setup log', err.message);
    }
}

async function deriveCredentials(tokenUrl, deviceId, proxy) {
    const parsed = parseTokenUrl(tokenUrl);
    const setup = await runSetupLookup(parsed.uid, parsed.token, deviceId, proxy);
    const userInfo = setup.info || { mc: null, mId: null };
    return {
        _setupAttempt: setup, // not a schema field: the caller logs this attempt once the account is saved
        setupError: setup.error,
        uid: parsed.uid,
        tokenUrl: parsed.raw,
        token: parsed.token,
        sessionId: parsed.sessionId,
        // sid never comes from the server (see platformClient.fetchUserInfo) — generate it once
        // per account here, the same way the real client generates+persists it client-side.
        sid: generateSid(),
        mc: userInfo.mc || null,
        mId: userInfo.mId || null
    };
}

function register(router) {
    router.handle('GET /accounts', ({ query }) => {
        const { page, limit, skip } = parsePagination(query);
        const where = [];
        const params = [];
        if (query.status) { where.push('status = ?'); params.push(String(query.status)); }
        if (query.search) {
            const pattern = db.likeContains(query.search);
            where.push("(name LIKE ? ESCAPE '\\' OR uid LIKE ? ESCAPE '\\')");
            params.push(pattern, pattern);
        }
        const whereSql = where.length ? where.join(' AND ') : '1';

        const accounts = Accounts.find({ where: whereSql, params, orderBy: 'createdAt DESC', limit, offset: skip });
        const total = Accounts.count(whereSql, params);
        return { accounts: accounts.map(accountJSON), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    });

    router.handle('GET /accounts/:id', ({ params }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');
        return { account: toJSONWithTokenUrl(account, accountJSON) };
    });

    router.handle('POST /accounts', async ({ body, audit }) => {
        validateCreate(body);
        const proxy = body.proxyId ? findProxyOrThrow(body.proxyId) : null;

        assertUidAvailable(parseTokenUrl(body.tokenUrl).uid, 'sub');

        const { _setupAttempt, ...credentials } = await deriveCredentials(body.tokenUrl, body.deviceId, proxy);
        const newAccount = Accounts.insert({
            ...pick(body, UPDATABLE_FIELDS),
            ...credentials,
            proxyId: proxy ? proxy._id : null,
            // New accounts start inactive — the owner reviews setup (sid/mc, proxy) and activates
            // it deliberately, instead of heartbeats starting the instant a token URL is pasted in.
            status: 'inactive'
        });
        logSetupAttempt(newAccount, _setupAttempt);
        if (newAccount.status === 'active') heartbeatScheduler.startAccount(newAccount);

        audit({ resourceName: newAccount.name });
        return { account: accountJSON(newAccount) };
    });

    router.handle('PUT /accounts/:id', async ({ params, body, audit }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');
        validateUpdate(body);

        const updates = pick(body, UPDATABLE_FIELDS);
        if (body.proxyId !== undefined) updates.proxyId = body.proxyId ? findProxyOrThrow(body.proxyId)._id : null;

        // Changed token URL -> re-parse, re-fetch mc/sid and re-encrypt everything. The edit form
        // sends the current URL back unchanged, which must not trigger a re-fetch.
        const tokenChanged = Boolean(body.tokenUrl) && body.tokenUrl !== readTokenUrl(account);
        let setupAttempt = null;
        if (tokenChanged) {
            assertUidAvailable(parseTokenUrl(body.tokenUrl).uid, 'sub', account._id);
            const proxyId = updates.proxyId !== undefined ? updates.proxyId : account.proxyId;
            const proxy = proxyId ? Proxies.findById(proxyId) : null;
            const deviceId = updates.deviceId || account.deviceId;
            const { _setupAttempt, ...credentials } = await deriveCredentials(body.tokenUrl, deviceId, proxy);
            Object.assign(updates, credentials);
            setupAttempt = _setupAttempt;

            // A fresh, working token is the fix for an expired (or held) account: bring it back,
            // unless the caller also set a status explicitly or the new token failed setup.
            // sid is always generated locally now (never from the server) — mc is what setup actually proves.
            const setupWorked = Boolean(credentials.mc);
            if (setupWorked && updates.status === undefined && ['expired', 'on_hold'].includes(account.status)) {
                updates.status = 'active';
                updates.holdReason = null;
                updates.heldAt = null;
            }
        }

        if (updates.proxyId !== undefined && String(updates.proxyId ?? '') !== String(account.proxyId ?? '')) {
            updates.proxyLastUsedAt = null; // "last used" is per proxy
        }

        const updated = Accounts.update(account._id, updates);
        if (setupAttempt) logSetupAttempt(updated, setupAttempt);

        // Restart the loop so it picks up new credentials; stop it if no longer active
        if (tokenChanged || updated.status !== 'active') heartbeatScheduler.stopAccount(updated._id);
        if (updated.status === 'active') heartbeatScheduler.startAccount(updated);

        audit({ resourceName: updated.name });
        return { account: accountJSON(updated) };
    });

    router.handle('DELETE /accounts/:id', ({ params, audit }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');
        heartbeatScheduler.stopAccount(account._id);
        Accounts.remove('_id = ?', [account._id]);
        audit({ resourceName: account.name });
        return { success: true };
    });

    router.handle('POST /accounts/:id/assign-proxy', ({ params, body }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');
        if (body?.proxyId) findProxyOrThrow(body.proxyId);

        const nextProxyId = body?.proxyId || null;
        const changed = String(account.proxyId ?? '') !== String(nextProxyId ?? '');
        const updated = changed ? Accounts.update(account._id, { proxyId: nextProxyId, proxyLastUsedAt: null }) : account;
        return { account: accountJSON(updated) };
    });

    router.handle('POST /accounts/:id/deactivate', ({ params, audit }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');
        const updated = Accounts.update(account._id, { status: 'inactive' });
        heartbeatScheduler.stopAccount(account._id);
        audit({ resourceName: account.name });
        return { account: accountJSON(updated) };
    });

    router.handle('POST /accounts/:id/activate', ({ params, audit }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');
        const wasOnHold = account.status === 'on_hold';
        // The failure streak only resets on a successful heartbeat or Clear log, not on resuming.
        const updated = Accounts.update(account._id, { status: 'active', holdReason: null, heldAt: null });
        heartbeatScheduler.startAccount(updated);
        audit({ resourceName: account.name, meta: { resumedFromHold: wasOnHold } });
        return { account: accountJSON(updated) };
    });

    router.handle('POST /accounts/:id/retry-setup', async ({ params }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');

        const proxy = account.proxyId ? Proxies.findById(account.proxyId) : null;
        const attempt = await runSetupLookup(account.uid, account.token, account.deviceId, proxy);
        logSetupAttempt(account, attempt);

        if (attempt.error) {
            Accounts.update(account._id, { setupError: attempt.error });
            throw new AppError(502, attempt.error);
        }

        const updated = Accounts.update(account._id, {
            // sid never comes from setup (see platformClient.fetchUserInfo) — only generate one
            // here if this account predates that fix and is still missing it.
            ...(!account.sid && { sid: generateSid() }),
            mc: attempt.info.mc,
            ...(attempt.info.mId && { mId: attempt.info.mId }),
            setupError: null
        });
        if (updated.status === 'active') heartbeatScheduler.startAccount(updated);
        return { account: accountJSON(updated) };
    });

    router.handle('POST /accounts/:id/test', async ({ params }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');
        if (!account.sid || !account.mc) {
            throw badRequest('Account is missing sid/mc. Please update the token URL or recreate the account.');
        }

        const start = Date.now();
        const result = await sendHeartbeat(account);
        return { success: result.success, latencyMs: Date.now() - start, message: result.success ? 'Heartbeat OK' : 'Heartbeat failed' };
    });

    // GET /accounts/:id/heartbeat-logs -- one page of logs, plus stats and seen codes for the
    // same time window, so the log dialog needs a single request.
    router.handle('GET /accounts/:id/heartbeat-logs', ({ params, query }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');

        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50, maxLimit: 200 });
        const rangeMinutes = Math.min(Math.max(parseInt(query.rangeMinutes, 10) || 24 * 60, 1), MAX_RANGE_MINUTES);
        const since = new Date(Date.now() - rangeMinutes * 60000).toISOString();
        const sort = LOG_SORTS[query.sort] ? query.sort : 'newest';

        const where = ['accountId = ?', 'createdAt >= ?'];
        const whereParams = [account._id, since];
        if (query.success === 'true' || query.success === 'false') { where.push('success = ?'); whereParams.push(query.success === 'true' ? 1 : 0); }
        if (typeof query.code === 'string' && query.code) {
            if (query.code === NO_CODE) where.push("(responseCode IS NULL OR responseCode = '')");
            else { where.push('responseCode = ?'); whereParams.push(query.code); }
        }
        if (typeof query.apiBase === 'string' && query.apiBase) {
            if (query.apiBase === 'none') where.push("(apiBase IS NULL OR apiBase = '')");
            else { where.push('apiBase = ?'); whereParams.push(query.apiBase); }
        }
        if (query.event === 'setup') where.push("event = 'setup'");
        else if (query.event === 'heartbeat') where.push("event != 'setup'");
        if (typeof query.q === 'string' && query.q.trim()) {
            where.push("errorMessage LIKE ? ESCAPE '\\'");
            whereParams.push(db.likeContains(query.q.trim().slice(0, 100)));
        }

        const whereSql = where.join(' AND ');
        const logs = HeartbeatLogs.find({ where: whereSql, params: whereParams, orderBy: LOG_SORTS[sort], limit, offset: skip });
        const total = HeartbeatLogs.count(whereSql, whereParams);

        // Stats + filter values are for the whole time window, not affected by the filters above
        const rangeWhere = "accountId = ? AND createdAt >= ? AND event != 'setup'";
        const statsRow = db.get().prepare(`SELECT COUNT(*) AS total, SUM(success) AS success, AVG(latencyMs) AS avgLatency FROM heartbeat_logs WHERE ${rangeWhere}`).get(account._id, since);
        const stats = {
            total: statsRow.total,
            success: statsRow.success || 0,
            failed: statsRow.total - (statsRow.success || 0),
            avgLatency: statsRow.avgLatency === null ? null : Math.round(statsRow.avgLatency)
        };
        const codes = db.get().prepare('SELECT DISTINCT responseCode FROM heartbeat_logs WHERE accountId = ? AND createdAt >= ?').all(account._id, since).map((r) => r.responseCode).filter(Boolean).sort();
        const hasNoCode = db.get().prepare("SELECT 1 FROM heartbeat_logs WHERE accountId = ? AND createdAt >= ? AND (responseCode IS NULL OR responseCode = '') LIMIT 1").get(account._id, since);
        const domains = db.get().prepare('SELECT DISTINCT apiBase FROM heartbeat_logs WHERE accountId = ? AND createdAt >= ?').all(account._id, since).map((r) => r.apiBase).filter(Boolean).sort();

        return {
            logs,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            stats,
            codes: [...codes, ...(hasNoCode ? [NO_CODE] : [])],
            domains,
            rangeMinutes,
            sort
        };
    });

    // Permanently deletes every heartbeat log for the account and resets the error counters
    // (they're derived from the log), so the UI starts clean.
    router.handle('DELETE /accounts/:id/heartbeat-logs', ({ params, audit }) => {
        const account = Accounts.findById(params.id);
        if (!account) throw notFound('Account not found');
        const deletedCount = HeartbeatLogs.remove('accountId = ?', [account._id]);
        Accounts.update(account._id, { heartbeatErrors: 0, consecutiveFailures: 0 });
        audit({ resourceName: account.name, meta: { deletedCount } });
        return { success: true, deletedCount };
    });
}

module.exports = { register };
