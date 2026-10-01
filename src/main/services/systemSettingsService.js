const store = require('./settingsStore');
const { badRequest } = require('../errors');

const DEFAULTS = {
    heartbeatIntervalMs: 5000,
    heartbeatJitterMs: 1500,
    // Put an account on hold after this many failed heartbeats in a row (0 = never)
    autoHoldAfterFailures: 5,
    // Enforced by the bet executor (not built yet)
    maxConcurrentBetsPerAccount: 1,
    dailyLossLimit: null // null = no limit
};

const KILL_SWITCH_DEFAULTS = { active: false, reason: null, activatedAt: null, releasedAt: null };

// Cached so hot paths (every heartbeat) read settings synchronously
let cached = { ...DEFAULTS };

function readDoc() {
    const saved = store.read('system') || {};
    return { ...DEFAULTS, ...saved, killSwitch: { ...KILL_SWITCH_DEFAULTS, ...(saved.killSwitch || {}) } };
}

const pick = (doc) => Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, doc[key] ?? DEFAULTS[key]]));

/** Load into the cache. Call at startup (refreshed on every update). */
function load() {
    cached = pick(readDoc());
    return cached;
}

/** Current settings (synchronous, from cache). */
const get = () => cached;

function update(patch) {
    const doc = readDoc();
    for (const key of Object.keys(DEFAULTS)) {
        if (patch[key] !== undefined) doc[key] = patch[key];
    }
    if (doc.heartbeatJitterMs >= doc.heartbeatIntervalMs) throw badRequest('Jitter must be smaller than the heartbeat interval');
    store.write('system', doc);
    cached = pick(doc);
    return cached;
}

const getKillSwitch = () => readDoc().killSwitch;

function setKillSwitch(changes) {
    const doc = readDoc();
    doc.killSwitch = { ...doc.killSwitch, ...changes };
    store.write('system', doc);
    return doc.killSwitch;
}

/** Test helper */
const reset = () => { cached = { ...DEFAULTS }; };

module.exports = { load, get, update, getKillSwitch, setKillSwitch, DEFAULTS, reset };
