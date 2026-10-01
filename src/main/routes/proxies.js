/** Ported from panda-bot/src/controllers/proxyController.js: no userId (no auth). */
const axios = require('axios');
const db = require('../db');
const { Proxies, Accounts, proxyJSON } = require('../models');
const { badRequest, notFound, conflict } = require('../errors');
const { pick, parsePagination } = require('../validators');
const encryptionService = require('../services/encryptionService');
const { axiosProxyOptions } = require('../services/proxyService');

const UPDATABLE_FIELDS = ['name', 'provider', 'host', 'port', 'username', 'protocol', 'country', 'status', 'notes'];
const PROTOCOLS = ['http', 'https', 'socks5'];
const STATUSES = ['healthy', 'dead', 'unknown'];

function validateCreate(body) {
    if (!body || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) throw badRequest('Name is required (1-100 chars)');
    if (!body.host || typeof body.host !== 'string') throw badRequest('Host is required');
    if (!(Number.isInteger(Number(body.port)) && body.port >= 1 && body.port <= 65535)) throw badRequest('Port must be 1-65535');
    if (body.protocol !== undefined && !PROTOCOLS.includes(body.protocol)) throw badRequest('Invalid protocol');
    if (body.username !== undefined && String(body.username).length > 200) throw badRequest('username must be 200 chars or fewer');
    if (body.password !== undefined && String(body.password).length > 200) throw badRequest('password must be 200 chars or fewer');
    if (body.country !== undefined && String(body.country).length > 10) throw badRequest('country must be 10 chars or fewer');
    if (body.notes !== undefined && String(body.notes).length > 500) throw badRequest('notes must be 500 chars or fewer');
}

function validateUpdate(body) {
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100)) throw badRequest('Name must be 1-100 chars');
    if (body.host !== undefined && (typeof body.host !== 'string' || !body.host)) throw badRequest('Host is required');
    if (body.port !== undefined && !(Number.isInteger(Number(body.port)) && body.port >= 1 && body.port <= 65535)) throw badRequest('Port must be 1-65535');
    if (body.protocol !== undefined && !PROTOCOLS.includes(body.protocol)) throw badRequest('Invalid protocol');
    if (body.username !== undefined && String(body.username).length > 200) throw badRequest('username must be 200 chars or fewer');
    if (body.password !== undefined && body.password !== null && String(body.password).length > 200) throw badRequest('password must be 200 chars or fewer');
    if (body.country !== undefined && String(body.country).length > 10) throw badRequest('country must be 10 chars or fewer');
    if (body.status !== undefined && !STATUSES.includes(body.status)) throw badRequest('Invalid status');
    if (body.notes !== undefined && String(body.notes).length > 500) throw badRequest('notes must be 500 chars or fewer');
}

function register(router) {
    router.handle('GET /proxies', ({ query }) => {
        const { page, limit, skip } = parsePagination(query);
        const where = [];
        const params = [];
        if (query.status) { where.push('status = ?'); params.push(String(query.status)); }
        if (query.search) {
            const pattern = db.likeContains(query.search);
            where.push("(name LIKE ? ESCAPE '\\' OR host LIKE ? ESCAPE '\\')");
            params.push(pattern, pattern);
        }
        const whereSql = where.length ? where.join(' AND ') : '1';

        const proxies = Proxies.find({ where: whereSql, params, orderBy: 'createdAt DESC', limit, offset: skip });
        const total = Proxies.count(whereSql, params);
        const withCounts = proxies.map((p) => ({ ...proxyJSON(p), accountCount: Accounts.count('proxyId = ?', [p._id]) }));
        return { proxies: withCounts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    });

    router.handle('GET /proxies/:id', ({ params }) => {
        const proxy = Proxies.findById(params.id);
        if (!proxy) throw notFound('Proxy not found');
        return { proxy: proxyJSON(proxy) };
    });

    // The accounts using this proxy, with when each last used it
    router.handle('GET /proxies/:id/accounts', ({ params }) => {
        const proxy = Proxies.findById(params.id);
        if (!proxy) throw notFound('Proxy not found');
        const accounts = Accounts.find({
            where: 'proxyId = ?', params: [proxy._id], orderBy: 'name ASC',
            select: '_id, name, uid, status, deviceId, lastHeartbeatAt, heartbeatErrors, consecutiveFailures, proxyLastUsedAt'
        });
        return { accounts };
    });

    router.handle('POST /proxies', ({ body, audit }) => {
        validateCreate(body);
        const proxy = Proxies.insert({
            ...pick(body, UPDATABLE_FIELDS),
            passwordEncrypted: body.password ? encryptionService.encrypt(body.password) : null,
            status: 'unknown'
        });
        audit({ resourceName: proxy.name });
        return { proxy: proxyJSON(proxy) };
    });

    router.handle('PUT /proxies/:id', ({ params, body, audit }) => {
        const proxy = Proxies.findById(params.id);
        if (!proxy) throw notFound('Proxy not found');
        validateUpdate(body);

        const updates = pick(body, UPDATABLE_FIELDS);
        // "" or null clears the password; a non-empty string replaces it; omitted keeps the saved one
        if (body.password !== undefined) updates.passwordEncrypted = body.password ? encryptionService.encrypt(body.password) : null;

        const updated = Proxies.update(proxy._id, updates);
        audit({ resourceName: updated.name });
        return { proxy: proxyJSON(updated) };
    });

    router.handle('DELETE /proxies/:id', ({ params, audit }) => {
        const proxy = Proxies.findById(params.id);
        if (!proxy) throw notFound('Proxy not found');

        // A proxy in use can't be deleted: those accounts would silently switch to a direct connection
        const inUse = Accounts.find({ where: 'proxyId = ?', params: [proxy._id], select: '_id, name' });
        if (inUse.length) {
            throw conflict(`Proxy is used by ${inUse.length} account${inUse.length === 1 ? '' : 's'}. Remove it from them first.`, {
                accountCount: inUse.length,
                accounts: inUse.map((a) => ({ _id: a._id, name: a.name }))
            });
        }

        Proxies.remove('_id = ?', [proxy._id]);
        audit({ resourceName: proxy.name });
        return { success: true };
    });

    router.handle('POST /proxies/:id/health-check', async ({ params }) => {
        const proxy = Proxies.findById(params.id);
        if (!proxy) throw notFound('Proxy not found');

        const start = Date.now();
        try {
            // Goes through the proxy, so the reported ip is the proxy's exit IP
            const response = await axios.get('https://httpbin.org/ip', { timeout: 10000, ...axiosProxyOptions(proxy) });
            const latencyMs = Date.now() - start;
            Proxies.update(proxy._id, { status: 'healthy', lastCheck: db.now() });
            return { success: true, status: 'healthy', latencyMs, ip: response.data.origin };
        } catch (err) {
            Proxies.update(proxy._id, { status: 'dead', lastCheck: db.now() });
            return { success: false, status: 'dead', message: err.message };
        }
    });
}

module.exports = { register };
