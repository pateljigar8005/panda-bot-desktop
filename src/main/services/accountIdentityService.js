const { Accounts, Master } = require('../models');
const { conflict } = require('../errors');

/**
 * A platform account (its uid) may appear once: as the master or as one sub-account. Mirroring the
 * master onto itself, or onto the same sub-account twice, would place every bet twice.
 * Throws a 409 describing the conflict; returns if the uid is free.
 *
 * @param {'sub'|'master'} as  what the uid is about to be saved as
 * @param {string} [excludeId] the sub-account being edited (so it doesn't clash with itself)
 */
function assertUidAvailable(uid, as, excludeId = null) {
    const master = Master.findOne('uid = ?', [uid]);
    if (as === 'sub' && master) {
        throw conflict(`This is your master account (“${master.name}”). The master account can't also be added as a sub-account.`);
    }

    const sub = excludeId ? Accounts.findOne('uid = ? AND _id != ?', [uid, excludeId]) : Accounts.findOne('uid = ?', [uid]);
    if (sub) {
        throw conflict(as === 'master'
            ? `This platform account is already a sub-account (“${sub.name}”). Remove it from sub-accounts before using it as the master.`
            : `This platform account is already added as “${sub.name}”.`);
    }
}

module.exports = { assertUidAvailable };
