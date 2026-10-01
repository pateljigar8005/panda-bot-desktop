/**
 * Cross-account heartbeat/setup log for the Live Monitor page — same shape as
 * GET /accounts/:id/heartbeat-logs (accounts.js) but across every account, with an optional
 * accountId filter instead of a required one.
 */
const db = require('../db');
const { HeartbeatLogs } = require('../models');
const { parsePagination } = require('../validators');

const NO_CODE = 'none';
const LOG_SORTS = { newest: 'createdAt DESC', oldest: 'createdAt ASC', slowest: 'latencyMs DESC, createdAt DESC' };
const MAX_RANGE_MINUTES = 7 * 24 * 60; // logs are pruned after config.heartbeatLogRetentionDays

function register(router) {
    router.handle('GET /heartbeat-logs', ({ query }) => {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50, maxLimit: 200 });
        const rangeMinutes = Math.min(Math.max(parseInt(query.rangeMinutes, 10) || 60, 1), MAX_RANGE_MINUTES);
        const since = new Date(Date.now() - rangeMinutes * 60000).toISOString();
        const sort = LOG_SORTS[query.sort] ? query.sort : 'newest';

        const where = ['createdAt >= ?'];
        const whereParams = [since];
        if (query.accountId) { where.push('accountId = ?'); whereParams.push(String(query.accountId)); }
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
            const pattern = db.likeContains(query.q.trim().slice(0, 100));
            where.push("(errorMessage LIKE ? ESCAPE '\\' OR accountName LIKE ? ESCAPE '\\')");
            whereParams.push(pattern, pattern);
        }

        const whereSql = where.join(' AND ');
        const logs = HeartbeatLogs.find({ where: whereSql, params: whereParams, orderBy: LOG_SORTS[sort], limit, offset: skip });
        const total = HeartbeatLogs.count(whereSql, whereParams);

        // Stats are lifetime (not scoped to rangeMinutes, which only filters the list below) — narrowed
        // by account if one is picked, but not by success/code/domain/search (those are for finding rows
        // in the list, not for redefining the health summary; same convention as the per-account dialog).
        const statsWhere = ["event != 'setup'"];
        const statsParams = [];
        if (query.accountId) { statsWhere.push('accountId = ?'); statsParams.push(String(query.accountId)); }
        const statsRow = db.get().prepare(`SELECT COUNT(*) AS total, SUM(success) AS success, AVG(latencyMs) AS avgLatency FROM heartbeat_logs WHERE ${statsWhere.join(' AND ')}`).get(...statsParams);
        const stats = {
            total: statsRow.total,
            success: statsRow.success || 0,
            failed: statsRow.total - (statsRow.success || 0),
            avgLatency: statsRow.avgLatency === null ? null : Math.round(statsRow.avgLatency)
        };
        const codes = db.get().prepare('SELECT DISTINCT responseCode FROM heartbeat_logs WHERE createdAt >= ?').all(since).map((r) => r.responseCode).filter(Boolean).sort();
        const hasNoCode = db.get().prepare("SELECT 1 FROM heartbeat_logs WHERE createdAt >= ? AND (responseCode IS NULL OR responseCode = '') LIMIT 1").get(since);
        const domains = db.get().prepare('SELECT DISTINCT apiBase FROM heartbeat_logs WHERE createdAt >= ?').all(since).map((r) => r.apiBase).filter(Boolean).sort();
        const accounts = db.get().prepare('SELECT DISTINCT accountId, accountName FROM heartbeat_logs WHERE createdAt >= ? ORDER BY accountName').all(since);

        return {
            logs,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            stats,
            codes: [...codes, ...(hasNoCode ? [NO_CODE] : [])],
            domains,
            accounts,
            rangeMinutes,
            sort
        };
    });

    // Permanently deletes every heartbeat/setup log for every account and resets their error
    // counters (derived from the log), so Accounts/Account Detail start clean too.
    router.handle('DELETE /heartbeat-logs', ({ audit }) => {
        const deletedCount = HeartbeatLogs.remove('1', []);
        db.get().prepare('UPDATE accounts SET heartbeatErrors = 0, consecutiveFailures = 0').run();
        audit({ meta: { deletedCount } });
        return { success: true, deletedCount };
    });
}

module.exports = { register };
