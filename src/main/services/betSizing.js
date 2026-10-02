/**
 * How much a sub-account stakes when the master places `masterStake`. Must stay identical to
 * renderer/src/lib/betSizing.ts's computeStake (the account-edit form's live preview uses that
 * one) — same rules, same shape, ported to CommonJS so the copy-bet executor isn't duplicating
 * logic that could silently drift from what the UI already promises the owner it'll do:
 *  - fixed: always fixedAmount; proportional: masterStake × multiplier
 *  - never more than maxBetAmount
 *  - no bet while the account balance is below minBalanceThreshold
 *
 * @param {{betMode: 'fixed'|'proportional', fixedAmount?: number, multiplier?: number, maxBetAmount?: number, minBalanceThreshold?: number}} settings
 * @param {number} masterStake
 * @param {number} [balance]
 */
function computeStake(settings, masterStake, balance) {
    const base = settings.betMode === 'fixed' ? settings.fixedAmount : settings.multiplier !== undefined ? masterStake * settings.multiplier : undefined;
    if (base === undefined || !Number.isFinite(base) || base <= 0) return { kind: 'skip', reason: 'incomplete' };
    if (balance !== undefined && settings.minBalanceThreshold !== undefined && balance < settings.minBalanceThreshold) {
        return { kind: 'skip', reason: 'low-balance' };
    }
    const uncapped = Math.round(base * 100) / 100;
    const capped = settings.maxBetAmount !== undefined && settings.maxBetAmount > 0 && uncapped > settings.maxBetAmount;
    return { kind: 'bet', stake: capped ? settings.maxBetAmount : uncapped, capped, uncapped };
}

module.exports = { computeStake };
