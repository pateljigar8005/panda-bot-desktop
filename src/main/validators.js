/**
 * Copy only whitelisted keys that are present on the source.
 * Stops clients from mass-assigning internal fields (encrypted creds, counters).
 */
function pick(source, keys) {
    const out = {};
    for (const key of keys) {
        if (source[key] !== undefined) out[key] = source[key];
    }
    return out;
}

/** Parse ?page & ?limit into safe integers (limit capped). */
function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
    return { page, limit, skip: (page - 1) * limit };
}

module.exports = { pick, parsePagination };
