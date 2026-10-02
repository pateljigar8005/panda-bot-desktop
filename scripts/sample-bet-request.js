#!/usr/bin/env node
/**
 * One-off test script — NOT part of the app, NOT wired into anything.
 *
 * Replays a captured queryLatestMarketInfoPB -> betPB pair (see the exact sequence documented
 * in the conversation this came from) against the platform, using one of OUR saved accounts'
 * credentials instead of whoever the capture was taken from. This is exactly what copy-betting
 * will eventually do automatically, done by hand once to verify the request shape still works.
 *
 * SAFETY: by default this is a dry run. It always makes the read-only queryLatestMarketInfoPB
 * call for real (harmless — it's just an odds lookup), but only sends betPB — which places a
 * REAL bet with REAL money on the account you point it at — if you pass --confirm.
 *
 * Usage:
 *   node scripts/sample-bet-request.js --account="Sub Acc 1" --payload=./bet-payload.json [--stake=2] [--confirm]
 *
 * --payload must be a JSON file shaped like:
 *   {
 *     "queryBody": { ... the exact --data-raw body of a queryLatestMarketInfoPB call ... },
 *     "betBody":   { ... the exact --data-raw body of the matching betPB call ... }
 *   }
 * Grab both from a FRESH full_session_log.txt capture (they're seconds apart) — betPB's
 * front_bet_ids / ol_bet_only_ids / market+odds ids must match what queryBody just checked,
 * or the platform will reject it as stale. See the `api-spec` and `log-parser` skills.
 *
 * --stake overrides betBody.seriesOrders[].orderDetailList[].betAmount for every leg (so you
 * can test with a small amount instead of whatever the captured bet staked).
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const db = require('../src/main/db');
const { Accounts } = require('../src/main/models');
const { http, decodeGzip, buildHeaders } = require('../src/main/services/platformClient');
const { getApiBase } = require('../src/main/services/apiDomainService');
const { axiosProxyOptions, getAccountProxy } = require('../src/main/services/proxyService');
const { maskToken } = require('../src/main/services/urlParserService');

const QUERY_ENDPOINT = '/yewu13/v1/betOrder/queryLatestMarketInfoPB';
const BET_ENDPOINT = '/yewu13/v1/betOrder/betPB';

function parseArgs() {
    const out = { confirm: false };
    for (const arg of process.argv.slice(2)) {
        if (arg === '--confirm') out.confirm = true;
        else {
            const m = arg.match(/^--([\w-]+)=(.*)$/);
            if (m) out[m[1]] = m[2];
        }
    }
    return out;
}

/**
 * pc-<32 hex>-<uid>-<timestamp_ms> — note this is NOT what signatureService.generateCheckId()
 * currently builds (it puts sid in the middle segment). Checking full_session_log.txt directly
 * shows the real client's middle segment is the account's uid, an 18-digit number, not a sid
 * (32 hex chars) — e.g. "checkid: pc-60fdd8900f0c4aae87f1bba52e664418-537095045418916298-...".
 * Built correctly here so this script's traffic actually matches the real client; the existing
 * bug in signatureService.js is worth fixing separately since every live request uses it today.
 */
function checkId(uid) {
    return `pc-${crypto.randomBytes(16).toString('hex')}-${uid}-${Date.now()}`;
}

function headersFor(account, method) {
    const headers = buildHeaders(account.token, account.sid, account.deviceId, method);
    headers.checkid = checkId(account.uid); // override the sid-based one buildHeaders set
    return headers;
}

function openRealDb() {
    // Same file the packaged/dev app uses. Adjust for your platform if this doesn't exist —
    // Windows: %APPDATA%\Panda Bot\panda.db
    const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'Panda Bot', 'panda.db');
    if (!fs.existsSync(dbPath)) throw new Error(`Database not found at ${dbPath} — edit openRealDb() for your platform`);
    db.open(dbPath);
}

function applyStakeOverride(betBody, stake) {
    if (stake === undefined) return betBody;
    const amount = Number(stake);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`--stake must be a positive number, got ${stake}`);
    for (const series of betBody.seriesOrders ?? []) {
        for (const leg of series.orderDetailList ?? []) leg.betAmount = amount;
    }
    return betBody;
}

async function queryLatestMarketInfo(account, apiBase, proxy, body) {
    const t = Date.now();
    const response = await http.post(`${apiBase}${QUERY_ENDPOINT}?t=${t}`, body, {
        headers: headersFor(account, 'POST'),
        timeout: 10000,
        ...axiosProxyOptions(proxy)
    });
    if (response.data?.code !== '0000000') {
        throw new Error(`queryLatestMarketInfoPB → code ${response.data?.code}: ${response.data?.msg}`);
    }
    return decodeGzip(response.data.data) ?? response.data.data;
}

async function placeBet(account, apiBase, proxy, body) {
    const t = Date.now();
    const response = await http.post(`${apiBase}${BET_ENDPOINT}?t=${t}`, body, {
        headers: headersFor(account, 'POST'),
        timeout: 10000,
        ...axiosProxyOptions(proxy)
    });
    const decoded = decodeGzip(response.data?.data);
    return { code: response.data?.code, msg: response.data?.msg, decoded };
}

async function main() {
    const args = parseArgs();
    if (!args.account || !args.payload) {
        console.error('Usage: node scripts/sample-bet-request.js --account="Name" --payload=./bet-payload.json [--stake=2] [--confirm]');
        process.exit(1);
    }

    openRealDb();
    const account = Accounts.findOne('name = ?', [args.account]);
    if (!account) throw new Error(`No saved account named "${args.account}"`);
    if (!account.sid || !account.mc) throw new Error(`"${account.name}" has no sid/mc — setup hasn't succeeded for it yet`);
    console.log(`Account: ${account.name} (uid ${account.uid}, device ${account.deviceId === '1' ? 'iOS' : 'Android'}, token ${maskToken(account.token)})`);

    const { queryBody, betBody } = JSON.parse(fs.readFileSync(path.resolve(args.payload), 'utf8'));
    applyStakeOverride(betBody, args.stake);

    const apiBase = await getApiBase();
    const proxy = await getAccountProxy(account);
    console.log(`API base: ${apiBase}${proxy ? ` (via proxy ${proxy.name})` : ' (direct connection)'}`);

    console.log('\n--- 1. queryLatestMarketInfoPB (always sent — read-only) ---');
    const marketInfo = await queryLatestMarketInfo(account, apiBase, proxy, queryBody);
    console.log(JSON.stringify(marketInfo, null, 2));

    console.log(`\n--- 2. betPB ${args.confirm ? '(SENDING FOR REAL)' : '(dry run — pass --confirm to actually send)'} ---`);
    console.log(JSON.stringify(betBody, null, 2));
    if (!args.confirm) {
        console.log('\nNot sent. Re-run with --confirm to place this bet for real.');
        return;
    }

    const result = await placeBet(account, apiBase, proxy, betBody);
    console.log(`\nResult: code=${result.code} msg=${result.msg}`);
    console.log(JSON.stringify(result.decoded, null, 2));
}

main()
    .catch((err) => {
        console.error('\nFailed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => db.close());
