const db = require('../db');

/** Singleton settings, stored as JSON under a key ('system', 'notifications'). */
function read(key) {
    const row = db.get().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
}

function write(key, value) {
    db.get().prepare(`
        INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `).run(key, JSON.stringify(value), db.now());
    return value;
}

module.exports = { read, write };
