const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const encryptionService = require('./services/encryptionService');
const logger = require('./logger');

/**
 * Local storage: one SQLite file in the user's data folder (node:sqlite, built into Electron's
 * Node — no native module to compile). Column names are the same camelCase field names the old
 * API returned, so a row is already the shape the UI expects.
 */

let db = null;

/**
 * Migration 1: platform credentials were AES-256-GCM encrypted at rest; on this single-user
 * desktop app that's not protecting against anything a local attacker couldn't already get from
 * the OS-keychain-protected key file sitting right next to it, so we stop. Rename the columns
 * and decrypt whatever's already in them — encryptionService.setKey() must already have run
 * (index.js loads the key before calling db.open()). A value that fails to decrypt is left as-is
 * (already plain, or corrupt) rather than losing it.
 */
function decryptColumn(conn, table, column) {
    const rows = conn.prepare(`SELECT _id, ${column} FROM ${table} WHERE ${column} IS NOT NULL`).all();
    if (!rows.length) return;
    const update = conn.prepare(`UPDATE ${table} SET ${column} = ? WHERE _id = ?`);
    for (const row of rows) {
        let plain;
        try {
            plain = encryptionService.decrypt(row[column]);
        } catch (err) {
            logger.warn(`Migration: could not decrypt ${table}.${column} for ${row._id}, leaving as-is`, err.message);
            continue;
        }
        update.run(plain, row._id);
    }
}

function migrateCredentialsToPlain(conn) {
    conn.exec(`
        ALTER TABLE accounts RENAME COLUMN tokenUrlEncrypted TO tokenUrl;
        ALTER TABLE accounts RENAME COLUMN tokenEncrypted TO token;
        ALTER TABLE accounts RENAME COLUMN sessionIdEncrypted TO sessionId;
        ALTER TABLE accounts RENAME COLUMN sidEncrypted TO sid;
        ALTER TABLE accounts RENAME COLUMN mcEncrypted TO mc;
        ALTER TABLE master_account RENAME COLUMN tokenUrlEncrypted TO tokenUrl;
        ALTER TABLE master_account RENAME COLUMN tokenEncrypted TO token;
        ALTER TABLE master_account RENAME COLUMN sessionIdEncrypted TO sessionId;
        ALTER TABLE master_account RENAME COLUMN sidEncrypted TO sid;
    `);
    for (const col of ['tokenUrl', 'token', 'sessionId', 'sid', 'mc']) decryptColumn(conn, 'accounts', col);
    for (const col of ['tokenUrl', 'token', 'sessionId', 'sid']) decryptColumn(conn, 'master_account', col);
}

// Each entry runs once, in order; the applied count is kept in PRAGMA user_version.
// A function entry (vs. a plain SQL string) gets the open DatabaseSync passed to it.
const MIGRATIONS = [
    `
    CREATE TABLE proxies (
        _id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT,
        passwordEncrypted TEXT,
        protocol TEXT NOT NULL DEFAULT 'http',
        country TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        lastCheck TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
    );

    CREATE TABLE accounts (
        _id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        uid TEXT NOT NULL UNIQUE,
        deviceId TEXT NOT NULL DEFAULT '2',
        -- Credentials, encrypted (AES-256-GCM). The token URL embeds token + sessionId.
        tokenUrlEncrypted TEXT,
        tokenEncrypted TEXT NOT NULL,
        sessionIdEncrypted TEXT NOT NULL,
        sidEncrypted TEXT,
        mcEncrypted TEXT,
        setupError TEXT,
        mId TEXT,
        betMode TEXT NOT NULL DEFAULT 'fixed',
        fixedAmount REAL NOT NULL DEFAULT 10,
        multiplier REAL NOT NULL DEFAULT 1,
        maxBetAmount REAL NOT NULL DEFAULT 100,
        minBalanceThreshold REAL NOT NULL DEFAULT 50,
        -- A proxy in use can't be deleted (no ON DELETE action)
        proxyId TEXT REFERENCES proxies(_id),
        proxyLastUsedAt TEXT,
        -- Only 'active' accounts send heartbeats / place bets
        status TEXT NOT NULL DEFAULT 'active',
        holdReason TEXT,
        heldAt TEXT,
        lastHeartbeatAt TEXT,
        lastBalance REAL NOT NULL DEFAULT 0,
        -- Every failed heartbeat since the log was last cleared; reset only by Clear log
        heartbeatErrors INTEGER NOT NULL DEFAULT 0,
        -- Current failure streak; reset by a successful heartbeat (and Clear log)
        consecutiveFailures INTEGER NOT NULL DEFAULT 0,
        totalBetsPlaced INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
    );
    CREATE INDEX accounts_proxy ON accounts (proxyId);

    -- At most one row
    CREATE TABLE master_account (
        _id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        uid TEXT NOT NULL,
        tokenUrlEncrypted TEXT,
        tokenEncrypted TEXT NOT NULL,
        sessionIdEncrypted TEXT NOT NULL,
        sidEncrypted TEXT,
        deviceId TEXT NOT NULL DEFAULT '2',
        status TEXT NOT NULL DEFAULT 'active',
        lastBetAt TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
    );

    -- Heartbeats and setup (getUserInfoPB) attempts. Pruned after config.heartbeatLogRetentionDays.
    CREATE TABLE heartbeat_logs (
        _id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL REFERENCES accounts(_id) ON DELETE CASCADE,
        accountName TEXT,
        accountType TEXT NOT NULL DEFAULT 'sub',
        event TEXT NOT NULL DEFAULT 'heartbeat',
        success INTEGER NOT NULL,
        apiBase TEXT,
        endpoint TEXT,
        statusCode INTEGER,
        responseCode TEXT,
        latencyMs INTEGER,
        errorMessage TEXT,
        requestPayload TEXT,
        responseBody TEXT,
        createdAt TEXT NOT NULL
    );
    CREATE INDEX heartbeat_logs_account_time ON heartbeat_logs (accountId, createdAt);
    CREATE INDEX heartbeat_logs_time ON heartbeat_logs (createdAt);

    -- Every change made in the app, by the owner or automatically. Append-only.
    CREATE TABLE audit_logs (
        _id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        method TEXT,
        path TEXT,
        statusCode INTEGER,
        success INTEGER NOT NULL DEFAULT 1,
        message TEXT,
        resourceType TEXT,
        resourceId TEXT,
        resourceName TEXT,
        durationMs INTEGER,
        request TEXT,
        meta TEXT,
        createdAt TEXT NOT NULL
    );
    CREATE INDEX audit_logs_time ON audit_logs (createdAt);

    -- Singletons as JSON: 'system' (automation + kill switch)
    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL
    );
    `,
    // Desktop app, single local user, OS-keychain-protected data folder is out of scope for this
    // threat model: stop encrypting platform credentials at rest. (Proxy passwords are
    // unrelated and stay encrypted — see encryptionService.)
    migrateCredentialsToPlain,
    // Raw yewu* traffic captured from the master account's embedded browser session (see
    // browserAutomation.js). No accountId/FK: the master lives in its own master_account table
    // with no shared id space, and this is a single-purpose, single-stream table.
    `
    CREATE TABLE browser_traffic_logs (
        _id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        method TEXT NOT NULL,
        endpoint TEXT,
        statusCode INTEGER,
        requestPayload TEXT,
        responseBody TEXT,
        isBetOrder INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
    );
    CREATE INDEX browser_traffic_logs_time ON browser_traffic_logs (createdAt);
    CREATE INDEX browser_traffic_logs_endpoint ON browser_traffic_logs (endpoint);
    `,
    // One row per leg of a copy-bet: the master's own detected bet (accountType 'master',
    // accountId null) plus one row per sub-account it was (or wasn't) replicated to, all sharing
    // masterBetId so they can be grouped. accountId has no ON DELETE CASCADE on purpose — a bet's
    // history should outlive the account being deleted later, same reasoning as audit_logs.
    `
    CREATE TABLE bet_logs (
        _id TEXT PRIMARY KEY,
        masterBetId TEXT NOT NULL,
        accountType TEXT NOT NULL,
        accountId TEXT REFERENCES accounts(_id),
        accountName TEXT,
        status TEXT NOT NULL,
        skipReason TEXT,
        matchName TEXT,
        marketValue TEXT,
        selection TEXT,
        odds REAL,
        stake REAL,
        responseCode TEXT,
        errorMessage TEXT,
        requestPayload TEXT,
        responseBody TEXT,
        createdAt TEXT NOT NULL
    );
    CREATE INDEX bet_logs_master ON bet_logs (masterBetId);
    CREATE INDEX bet_logs_account_time ON bet_logs (accountId, createdAt);
    CREATE INDEX bet_logs_time ON bet_logs (createdAt);
    `,
    // When lastBalance was last fetched live (manual refresh from the Accounts page) — null for
    // every pre-existing account/row until the first refresh.
    `ALTER TABLE accounts ADD COLUMN lastBalanceAt TEXT;`
];

function migrate() {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    for (let i = version; i < MIGRATIONS.length; i++) {
        transaction(() => {
            const step = MIGRATIONS[i];
            if (typeof step === 'function') step(db); else db.exec(step);
            db.exec(`PRAGMA user_version = ${i + 1}`);
        });
    }
}

/** Open (and create/upgrade) the database. `file` = ':memory:' in tests. */
function open(file) {
    if (db) db.close();
    db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    migrate();
    return db;
}

function close() {
    if (db) db.close();
    db = null;
}

function get() {
    if (!db) throw new Error('Database is not open');
    return db;
}

function transaction(fn) {
    const conn = get();
    conn.exec('BEGIN');
    try {
        const result = fn();
        conn.exec('COMMIT');
        return result;
    } catch (err) {
        conn.exec('ROLLBACK');
        throw err;
    }
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/** SQLite can't bind booleans, Dates or undefined. */
function toSql(value, column, table) {
    if (value === undefined || value === null) return null;
    if (table.json.includes(column)) return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
}

/** `LIKE ?` pattern for "contains" searches, with the user's % and _ taken literally (use ESCAPE '\'). */
const likeContains = (text) => `%${String(text).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Table helper: rows in/out as plain objects. `where` fragments are always our own SQL with `?`
 * placeholders — user input only ever goes in `params`.
 */
function table(name, { json = [], bool = [], timestamps = true } = {}) {
    const meta = { json, bool };
    let columns = null;
    const columnSet = () => (columns ??= new Set(get().prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name)));

    function fromRow(row) {
        if (!row) return null;
        const out = { ...row };
        for (const col of json) if (typeof out[col] === 'string') out[col] = JSON.parse(out[col]);
        for (const col of bool) if (out[col] !== null && out[col] !== undefined) out[col] = Boolean(out[col]);
        return out;
    }

    function insert(doc) {
        const stamp = now();
        const row = { _id: newId(), ...(timestamps && { createdAt: stamp, updatedAt: stamp }), ...doc };
        if (!timestamps && !row.createdAt) row.createdAt = stamp;
        const cols = Object.keys(row).filter((c) => columnSet().has(c));
        get().prepare(`INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
            .run(...cols.map((c) => toSql(row[c], c, meta)));
        return findById(row._id);
    }

    /** Set fields on one row; returns the updated row (null if it doesn't exist). */
    function update(id, patch) {
        const values = { ...patch, ...(timestamps && { updatedAt: now() }) };
        const cols = Object.keys(values).filter((c) => columnSet().has(c) && c !== '_id' && values[c] !== undefined);
        if (cols.length) {
            get().prepare(`UPDATE ${name} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE _id = ?`)
                .run(...cols.map((c) => toSql(values[c], c, meta)), id);
        }
        return findById(id);
    }

    const findById = (id) => fromRow(get().prepare(`SELECT * FROM ${name} WHERE _id = ?`).get(String(id)));

    function findOne(where = '1', params = []) {
        return fromRow(get().prepare(`SELECT * FROM ${name} WHERE ${where} LIMIT 1`).get(...params));
    }

    function find({ where = '1', params = [], orderBy = 'createdAt DESC', limit, offset, select = '*' } = {}) {
        let sql = `SELECT ${select} FROM ${name} WHERE ${where} ORDER BY ${orderBy}`;
        const args = [...params];
        if (limit !== undefined) {
            sql += ' LIMIT ? OFFSET ?';
            args.push(limit, offset ?? 0);
        }
        return get().prepare(sql).all(...args).map(fromRow);
    }

    const count = (where = '1', params = []) => get().prepare(`SELECT COUNT(*) AS n FROM ${name} WHERE ${where}`).get(...params).n;

    const remove = (where, params = []) => Number(get().prepare(`DELETE FROM ${name} WHERE ${where}`).run(...params).changes);

    return { name, insert, update, findById, findOne, find, count, remove, fromRow };
}

module.exports = { open, close, get, transaction, table, now, newId, likeContains };
