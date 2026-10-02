const crypto = require('node:crypto');
const { Accounts, BetLogs, isReadyForBetting } = require('../models');
const { http, decodeGzip, buildHeaders, fetchBalance } = require('./platformClient');
const { getApiBase } = require('./apiDomainService');
const { axiosProxyOptions, getAccountProxy } = require('./proxyService');
const { computeStake } = require('./betSizing');
const killSwitch = require('./killSwitchService');
const systemSettings = require('./systemSettingsService');
const { recordSystemAction } = require('./auditTrail');
const events = require('./events');
const logger = require('../logger');

const BET_ENDPOINT = '/yewu13/v1/betOrder/betPB';
const freshId = () => crypto.randomBytes(16).toString('hex');
/** 500–750ms, per the anti-detection skill's rule on staggering bets across sub-accounts. */
const stagger = () => new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 250));

/** Pull the one leg this app's bet_mode_type: "is_single" flow always sends. */
function extractLeg(requestPayload) {
    const order = requestPayload?.seriesOrders?.[0]?.orderDetailList?.[0];
    if (!order) return null;
    return {
        matchName: order.matchName ?? null,
        marketValue: order.marketValue ?? null,
        selection: order.playOptionName ?? null,
        odds: order.oddFinally !== undefined ? Number(order.oddFinally) : null,
        masterStake: order.betAmount !== undefined ? Number(order.betAmount) : null
    };
}

/**
 * Same selection/market/odds as the master's own bet, a fresh stake, and fresh bet-slip ids —
 * front_bet_id/ol_bet_only_id are meant to be unique per bet-slip session, never reused across
 * accounts (see the sequence captured in full_session_log.txt).
 */
function adaptPayload(masterPayload, stake) {
    const payload = JSON.parse(JSON.stringify(masterPayload));
    const order = payload.seriesOrders?.[0]?.orderDetailList?.[0];
    const frontBetId = freshId();
    const olBetOnlyId = freshId();
    if (order) {
        order.betAmount = stake;
        order.front_bet_id = frontBetId;
        order.ol_bet_only_id = olBetOnlyId;
    }
    payload.front_bet_ids = [frontBetId];
    payload.ol_bet_only_ids = [olBetOnlyId];
    return payload;
}

async function placeBetForAccount(account, payload) {
    const apiBase = await getApiBase();
    const proxy = await getAccountProxy(account);
    const response = await http.post(`${apiBase}${BET_ENDPOINT}?t=${Date.now()}`, payload, {
        headers: buildHeaders(account.token, account.uid, account.deviceId, 'POST'),
        timeout: 10000,
        ...axiosProxyOptions(proxy)
    });
    const code = response.data?.code;
    return { success: code === '0000000', responseCode: code ?? null, responseBody: decodeGzip(response.data?.data) ?? response.data };
}

function logLeg(masterBetId, { accountType, account = null, status, skipReason = null, leg, stake = null, responseCode = null, errorMessage = null, requestPayload = null, responseBody = null }) {
    const row = BetLogs.insert({
        masterBetId, accountType, accountId: account ? account._id : null, accountName: account ? account.name : (accountType === 'master' ? 'Master' : null),
        status, skipReason,
        matchName: leg?.matchName ?? null, marketValue: leg?.marketValue ?? null, selection: leg?.selection ?? null, odds: leg?.odds ?? null,
        stake, responseCode, errorMessage, requestPayload, responseBody
    });
    events.emit(accountType === 'master' ? 'bet:captured' : 'bet:executed', row);
    return row;
}

/**
 * Called by browserAutomation.js the instant it captures a betPB request/response pair from the
 * master's own browser session. Always logs the master's own leg first (idempotency: this row
 * exists before any sub-account is touched). Only replicates if the master's bet actually
 * succeeded, the kill switch is off, and copy-betting is armed — opening the browser alone never
 * implies replication.
 */
async function onMasterBetDetected({ requestPayload, responseBody }) {
    const masterBetId = freshId();
    const leg = extractLeg(requestPayload);
    const masterSucceeded = responseBody?.code === '0000000';

    logLeg(masterBetId, {
        accountType: 'master', status: masterSucceeded ? 'captured' : 'failed', leg,
        stake: leg?.masterStake ?? null, responseCode: responseBody?.code ?? null,
        errorMessage: masterSucceeded ? null : (responseBody?.msg || 'The master’s own bet did not succeed'),
        requestPayload, responseBody
    });

    if (!masterSucceeded || !leg) {
        logger.info('Master bet captured but not replicated (master bet failed, or payload unreadable)', { masterBetId });
        return;
    }

    const armed = systemSettings.getCopyBetting().armed;
    if (killSwitch.isActive() || !armed) {
        const reason = killSwitch.isActive() ? 'Kill switch is active' : 'Copy-betting is not armed';
        logLeg(masterBetId, { accountType: 'sub', status: 'skipped', skipReason: reason, leg });
        logger.info(`Master bet not replicated: ${reason}`, { masterBetId });
        return;
    }

    const accounts = Accounts.find({ where: 'status = ?', params: ['active'] }).filter(isReadyForBetting);
    let placed = 0, failed = 0, skipped = 0;

    for (const account of accounts) {
        if (killSwitch.isActive()) break; // flipped mid-run — stop anything not yet sent

        let balance;
        try {
            const result = await fetchBalance(account);
            if (!result.success) throw new Error(result.error || 'balance check failed');
            balance = result.balance;
        } catch (err) {
            skipped++;
            logLeg(masterBetId, { accountType: 'sub', account, status: 'skipped', skipReason: `Could not verify balance: ${err.message}`, leg });
            await stagger();
            continue;
        }

        const outcome = computeStake(
            { betMode: account.betMode, fixedAmount: account.fixedAmount, multiplier: account.multiplier, maxBetAmount: account.maxBetAmount, minBalanceThreshold: account.minBalanceThreshold },
            leg.masterStake, balance
        );

        if (outcome.kind === 'skip') {
            skipped++;
            logLeg(masterBetId, {
                accountType: 'sub', account, status: 'skipped',
                skipReason: outcome.reason === 'low-balance' ? 'Balance below minBalanceThreshold' : 'Bet sizing settings incomplete',
                leg
            });
            await stagger();
            continue;
        }

        const payload = adaptPayload(requestPayload, outcome.stake);
        try {
            const result = await placeBetForAccount(account, payload);
            if (result.success) {
                placed++;
                Accounts.update(account._id, { totalBetsPlaced: (account.totalBetsPlaced || 0) + 1 });
                logLeg(masterBetId, { accountType: 'sub', account, status: 'executed', leg, stake: outcome.stake, responseCode: result.responseCode, requestPayload: payload, responseBody: result.responseBody });
            } else {
                failed++;
                logLeg(masterBetId, { accountType: 'sub', account, status: 'failed', leg, stake: outcome.stake, responseCode: result.responseCode, errorMessage: `Platform returned ${result.responseCode}`, requestPayload: payload, responseBody: result.responseBody });
            }
        } catch (err) {
            failed++;
            logLeg(masterBetId, { accountType: 'sub', account, status: 'failed', leg, stake: outcome.stake, errorMessage: err.message, requestPayload: payload });
        }

        await stagger();
    }

    recordSystemAction('copy_bet_run', { success: failed === 0, meta: { masterBetId, placed, failed, skipped } });
    logger.info('Copy-bet run finished', { masterBetId, placed, failed, skipped });
}

module.exports = { onMasterBetDetected };
