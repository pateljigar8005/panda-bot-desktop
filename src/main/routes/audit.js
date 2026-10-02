/** Ported from panda-bot/src/controllers/auditLogController.js: no userId / visibility filter (no auth, single user). */
const db = require('../db');
const { AuditLogs } = require('../models');
const { badRequest } = require('../errors');
const { parsePagination } = require('../validators');

// Sortable columns (API name -> column); ties broken by newest first
const SORT_FIELDS = { createdAt: 'createdAt', action: 'action', resource: 'resourceName', status: 'statusCode', duration: 'durationMs' };
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function parseDate(value, name) {
    if (!value) return null;
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) throw badRequest(`${name} must be a date/time (ISO 8601)`);
    return d.toISOString();
}

function register(router) {
    // Filters: action=a,b  success=true|false  from/to (ISO)  resourceType  resourceName  method
    // statusCode  message  q (search across resourceName/message/path)
    // Sort: sort=createdAt|action|resource|status|duration, order=asc|desc (default: newest first)
    router.handle('GET /audit-logs', ({ query }) => {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 20, maxLimit: 100 });
        const where = [];
        const params = [];

        if (query.action) {
            const actions = String(query.action).split(',').map((a) => a.trim()).filter(Boolean).slice(0, 50);
            if (actions.length) { where.push(`action IN (${actions.map(() => '?').join(', ')})`); params.push(...actions); }
        }
        if (query.success === 'true' || query.success === 'false') { where.push('success = ?'); params.push(query.success === 'true' ? 1 : 0); }
        if (query.resourceType) { where.push('resourceType = ?'); params.push(String(query.resourceType)); }
        if (query.resourceName) { where.push("resourceName LIKE ? ESCAPE '\\'"); params.push(db.likeContains(query.resourceName)); }
        if (query.message) { where.push("message LIKE ? ESCAPE '\\'"); params.push(db.likeContains(query.message)); }
        if (query.method) {
            const method = String(query.method).toUpperCase();
            if (!METHODS.includes(method)) throw badRequest(`method must be one of ${METHODS.join(', ')}`);
            where.push('method = ?'); params.push(method);
        }
        if (query.statusCode) {
            const code = parseInt(query.statusCode, 10);
            if (!(code >= 100 && code <= 599)) throw badRequest('statusCode must be an HTTP status (100-599)');
            where.push('statusCode = ?'); params.push(code);
        }
        const from = parseDate(query.from, 'from');
        const to = parseDate(query.to, 'to');
        if (from) { where.push('createdAt >= ?'); params.push(from); }
        if (to) { where.push('createdAt <= ?'); params.push(to); }
        if (typeof query.q === 'string' && query.q.trim()) {
            const pattern = db.likeContains(query.q.trim().slice(0, 100));
            where.push("(resourceName LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\')");
            params.push(pattern, pattern, pattern);
        }

        const whereSql = where.length ? where.join(' AND ') : '1';
        const sortKey = SORT_FIELDS[query.sort] ? query.sort : 'createdAt';
        const direction = query.order === 'asc' ? 'ASC' : 'DESC';
        const orderBy = sortKey === 'createdAt' ? `createdAt ${direction}` : `${SORT_FIELDS[sortKey]} ${direction}, createdAt DESC`;

        const logs = AuditLogs.find({ where: whereSql, params, orderBy, limit, offset: skip });
        const total = AuditLogs.count(whereSql, params);
        return { logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, sort: sortKey, order: direction === 'ASC' ? 'asc' : 'desc' };
    });

    // Values for the filter dropdowns
    router.handle('GET /audit-logs/filters', () => {
        const actions = db.get().prepare('SELECT DISTINCT action FROM audit_logs').all().map((r) => r.action).filter(Boolean).sort();
        return { actions };
    });

    // Permanently deletes every audit log entry. This request's own entry (audit_log_cleared) is
    // written fresh afterward by the router's audit hook, so one row always survives a clear.
    router.handle('DELETE /audit-logs', () => {
        const deletedCount = AuditLogs.remove('1', []);
        return { success: true, deletedCount };
    });
}

module.exports = { register };
