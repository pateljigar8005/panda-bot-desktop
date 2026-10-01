/** Ported from panda-bot/src/controllers/masterAccountController.js: no userId (no auth), at most one row. */
const { Master, masterJSON } = require('../models');
const { badRequest, notFound, conflict } = require('../errors');
const { pick } = require('../validators');
const { parseTokenUrl } = require('../services/urlParserService');
const { readTokenUrl, toJSONWithTokenUrl } = require('../services/tokenUrlService');
const { assertUidAvailable } = require('../services/accountIdentityService');

const UPDATABLE_FIELDS = ['name', 'deviceId', 'status', 'notes'];
const DEVICE_IDS = ['1', '2'];
const STATUSES = ['active', 'paused', 'expired'];

function validateCreate(body) {
    if (!body || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) throw badRequest('Name is required (1-100 chars)');
    if (!body.tokenUrl || typeof body.tokenUrl !== 'string') throw badRequest('Valid token URL is required');
    if (!DEVICE_IDS.includes(body.deviceId)) throw badRequest('deviceId must be 1 or 2');
    if (body.notes !== undefined && String(body.notes).length > 500) throw badRequest('notes must be 500 chars or fewer');
}

function validateUpdate(body) {
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100)) throw badRequest('Name must be 1-100 chars');
    if (body.tokenUrl !== undefined && typeof body.tokenUrl !== 'string') throw badRequest('Invalid tokenUrl');
    if (body.deviceId !== undefined && !DEVICE_IDS.includes(body.deviceId)) throw badRequest('deviceId must be 1 or 2');
    if (body.status !== undefined && !STATUSES.includes(body.status)) throw badRequest('Invalid status');
    if (body.notes !== undefined && String(body.notes).length > 500) throw badRequest('notes must be 500 chars or fewer');
}

function credentialsFromTokenUrl(tokenUrl) {
    const parsed = parseTokenUrl(tokenUrl);
    return {
        uid: parsed.uid,
        tokenUrl: parsed.raw,
        token: parsed.token,
        sessionId: parsed.sessionId
    };
}

function register(router) {
    router.handle('GET /master', () => {
        const master = Master.findOne();
        return { master: master ? toJSONWithTokenUrl(master, masterJSON) : null };
    });

    router.handle('GET /master/status', () => {
        const master = Master.findOne();
        if (!master) return { running: false };
        return { running: master.status === 'active', lastBetAt: master.lastBetAt, status: master.status };
    });

    router.handle('POST /master', ({ body, audit }) => {
        if (Master.findOne()) throw conflict('Master account already exists. Use PUT to update.');
        validateCreate(body);
        assertUidAvailable(parseTokenUrl(body.tokenUrl).uid, 'master');

        const master = Master.insert({ ...pick(body, UPDATABLE_FIELDS), ...credentialsFromTokenUrl(body.tokenUrl), status: 'active' });
        audit({ resourceName: master.name });
        return { master: masterJSON(master) };
    });

    router.handle('PUT /master', ({ body, audit }) => {
        const master = Master.findOne();
        if (!master) throw notFound('Master account not found');
        validateUpdate(body);

        const updates = pick(body, UPDATABLE_FIELDS);
        if (body.tokenUrl && body.tokenUrl !== readTokenUrl(master)) {
            assertUidAvailable(parseTokenUrl(body.tokenUrl).uid, 'master');
            Object.assign(updates, credentialsFromTokenUrl(body.tokenUrl));
        }

        const updated = Master.update(master._id, updates);
        audit({ resourceName: updated.name });
        return { master: masterJSON(updated) };
    });

    router.handle('DELETE /master', ({ audit }) => {
        const master = Master.findOne();
        if (!master) throw notFound('Master account not found');
        audit({ resourceName: master.name });
        Master.remove('_id = ?', [master._id]);
        return { success: true };
    });
}

module.exports = { register };
