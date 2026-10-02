/** Master browser (Playwright) lifecycle + its captured traffic, for the Master Account page. */
const db = require('../db');
const { BrowserTrafficLogs } = require('../models');
const { parsePagination } = require('../validators');
const browserAutomation = require('../services/browserAutomation');

const LOG_SORTS = { newest: 'createdAt DESC', oldest: 'createdAt ASC' };
const MAX_RANGE_MINUTES = 7 * 24 * 60;

function register(router) {
    router.handle('GET /browser/status', () => browserAutomation.status());

    router.handle('POST /browser/launch', async ({ audit }) => {
        const result = await browserAutomation.launch();
        audit({});
        return result;
    });

    router.handle('POST /browser/close', async ({ audit }) => {
        const result = await browserAutomation.close();
        audit({});
        return result;
    });

    router.handle('GET /browser/traffic', ({ query }) => {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50, maxLimit: 200 });
        const rangeMinutes = Math.min(Math.max(parseInt(query.rangeMinutes, 10) || 60, 1), MAX_RANGE_MINUTES);
        const since = new Date(Date.now() - rangeMinutes * 60000).toISOString();
        const sort = LOG_SORTS[query.sort] ? query.sort : 'newest';

        const where = ['createdAt >= ?'];
        const whereParams = [since];
        if (query.endpoint) { where.push('endpoint = ?'); whereParams.push(String(query.endpoint)); }
        if (query.isBetOrder === 'true') where.push('isBetOrder = 1');
        if (typeof query.q === 'string' && query.q.trim()) {
            where.push("(url LIKE ? ESCAPE '\\' OR endpoint LIKE ? ESCAPE '\\')");
            const pattern = db.likeContains(query.q.trim().slice(0, 100));
            whereParams.push(pattern, pattern);
        }

        const whereSql = where.join(' AND ');
        const traffic = BrowserTrafficLogs.find({ where: whereSql, params: whereParams, orderBy: LOG_SORTS[sort], limit, offset: skip });
        const total = BrowserTrafficLogs.count(whereSql, whereParams);
        const endpoints = db.get().prepare('SELECT DISTINCT endpoint FROM browser_traffic_logs WHERE createdAt >= ?').all(since).map((r) => r.endpoint).filter(Boolean).sort();

        return { traffic, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, endpoints, rangeMinutes, sort };
    });

    router.handle('DELETE /browser/traffic', ({ audit }) => {
        const deletedCount = BrowserTrafficLogs.remove('1', []);
        audit({ meta: { deletedCount } });
        return { success: true, deletedCount };
    });
}

module.exports = { register };
