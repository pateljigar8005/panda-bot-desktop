/** Copy-bet history — the master's own detected bets plus every sub-account replica, grouped by masterBetId. */
const db = require('../db');
const { BetLogs } = require('../models');
const { parsePagination } = require('../validators');
const { notFound } = require('../errors');
const copyBetExecutor = require('../services/copyBetExecutor');

const SORTS = { newest: 'createdAt DESC', oldest: 'createdAt ASC' };
const MAX_RANGE_MINUTES = 7 * 24 * 60;

function register(router) {
    router.handle('GET /bets', ({ query }) => {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50, maxLimit: 200 });
        const rangeMinutes = Math.min(Math.max(parseInt(query.rangeMinutes, 10) || MAX_RANGE_MINUTES, 1), MAX_RANGE_MINUTES);
        const since = new Date(Date.now() - rangeMinutes * 60000).toISOString();
        const sort = SORTS[query.sort] ? query.sort : 'newest';

        const where = ['createdAt >= ?'];
        const whereParams = [since];
        if (query.masterBetId) { where.push('masterBetId = ?'); whereParams.push(String(query.masterBetId)); }
        if (query.accountId) { where.push('accountId = ?'); whereParams.push(String(query.accountId)); }
        if (query.status) { where.push('status = ?'); whereParams.push(String(query.status)); }

        const whereSql = where.join(' AND ');
        const bets = BetLogs.find({ where: whereSql, params: whereParams, orderBy: SORTS[sort], limit, offset: skip });
        const total = BetLogs.count(whereSql, whereParams);

        const statsRow = db.get().prepare(`
            SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) AS executed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped
            FROM bet_logs WHERE createdAt >= ? AND accountType = 'sub'
        `).get(since);

        return {
            bets,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            stats: { total: statsRow.total, executed: statsRow.executed || 0, failed: statsRow.failed || 0, skipped: statsRow.skipped || 0 },
            rangeMinutes,
            sort
        };
    });

    // Sub-account copy-bet outcomes bucketed over time, for the Overview dashboard chart. Bucketed
    // in JS, not SQL: bet volume is nowhere near heartbeat scale, so there's no need for anything
    // fancier than loading the window and grouping it.
    router.handle('GET /bets/chart', ({ query }) => {
        const hours = Math.min(Math.max(parseInt(query.rangeHours, 10) || 24, 1), 24 * 7);
        const bucketCount = Math.min(hours, 24);
        const since = Date.now() - hours * 3600000;
        const bucketMs = (hours * 3600000) / bucketCount;

        const rows = db.get().prepare("SELECT status, createdAt FROM bet_logs WHERE createdAt >= ? AND accountType = 'sub'").all(new Date(since).toISOString());
        const buckets = Array.from({ length: bucketCount }, (_, i) => ({ time: new Date(since + i * bucketMs).toISOString(), executed: 0, failed: 0, skipped: 0 }));
        for (const row of rows) {
            const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((new Date(row.createdAt).getTime() - since) / bucketMs)));
            if (row.status in buckets[idx]) buckets[idx][row.status]++;
        }

        return { buckets, rangeHours: hours };
    });

    router.handle('POST /bets/:id/retry', async ({ params, audit }) => {
        const original = BetLogs.findById(params.id);
        if (!original) throw notFound('Bet log not found');

        const row = await copyBetExecutor.retryBet(original);
        audit({ meta: { masterBetId: original.masterBetId, accountId: original.accountId } });
        return { bet: row };
    });
}

module.exports = { register };
