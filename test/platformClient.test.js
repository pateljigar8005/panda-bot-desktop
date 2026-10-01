// Run: npm test   (no database or network: the platform and domain discovery are stubbed)
const { test } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

// Domain discovery stubbed before platformClient loads (it imports getApiBase at require time)
const apiDomainService = require('../src/main/services/apiDomainService');
let domain = 'https://api.first.com';
apiDomainService.getApiBase = async () => domain;

const { http: axios, sendHeartbeat, fetchUserInfo, fetchBalance } = require('../src/main/services/platformClient');

const SID = '3e25f2c24b9543c8b1f298a829e84a6d'; // shape of a real sid: UUIDv4, dashes stripped
const account = {
    _id: 'a1', uid: '537206819374508284', deviceId: '2', proxyId: null,
    token: 'tok', sessionId: 'sess', sid: SID, mc: 'mc'
};

test('heartbeat result records the exact domain + endpoint the request went to', async (t) => {
    const urls = [];
    t.mock.method(axios, 'post', async (url) => { urls.push(url); return { status: 200, data: { code: '0000000' } }; });

    const first = await sendHeartbeat(account);
    domain = 'https://api.second.com:17025'; // discovery rotates to another domain
    const second = await sendHeartbeat(account);

    assert.equal(first.apiBase, 'https://api.first.com');
    assert.equal(first.endpoint, '/yewu40/req/request');
    assert.ok(urls[0].startsWith('https://api.first.com/yewu40/req/request?t='));
    assert.equal(second.apiBase, 'https://api.second.com:17025');
    assert.ok(urls[1].startsWith('https://api.second.com:17025/yewu40/req/request?t='), 'logged domain = the one actually called');
    domain = 'https://api.first.com';
});

test('failed requests record the domain too (network error, HTTP error, platform code)', async (t) => {
    const post = t.mock.method(axios, 'post', async () => { const e = new Error('connect ECONNREFUSED'); e.code = 'ECONNREFUSED'; throw e; });
    const down = await sendHeartbeat(account);
    assert.equal(down.success, false);
    assert.equal(down.apiBase, 'https://api.first.com');

    // One mock, implementation swapped (mocking the same method again wouldn't restore cleanly)
    const get = t.mock.method(axios, 'get', async () => { const e = new Error('Request failed with status code 404'); e.response = { status: 404, data: { error: 'Not Found' } }; throw e; });
    await assert.rejects(fetchUserInfo('1', 'tok', '2'), (err) => err.apiBase === 'https://api.first.com' && err.endpoint === '/yewu12/user/getUserInfoPB');

    get.mock.mockImplementation(async () => ({ status: 200, data: { code: '0401013', msg: 'expired' } }));
    await assert.rejects(fetchUserInfo('1', 'tok', '2'), (err) => err.apiBase === 'https://api.first.com' && err.responseCode === '0401013');
});

test('getUserInfoPB success: request + decoded response kept for the log, real values (no sid in this response)', async (t) => {
    const zlib = require('zlib');
    const userInfo = { userId: '537206819374508284', mId: 'm1', mc: 'REAL-MC', token: 'REAL-TOKEN', nickName: 'Jigar', balance: 12.5, vip: { level: 2, sessionKey: 'REAL-SESSION' } };
    const data = zlib.gzipSync(JSON.stringify(userInfo)).toString('base64');
    t.mock.method(axios, 'get', async () => ({ status: 200, data: { code: '0000000', msg: 'ok', data } }));

    const info = await fetchUserInfo('537206819374508284', 'tok', '2');
    assert.equal(info.sid, undefined, 'sid is never part of getUserInfoPB — generated locally instead');
    assert.deepEqual(info.requestPayload, { token: 'tok' });
    assert.equal(info.statusCode, 200);
    assert.equal(info.responseCode, '0000000');
    assert.deepEqual(info.responseBody, {
        code: '0000000',
        msg: 'ok',
        data: { userId: '537206819374508284', mId: 'm1', mc: 'REAL-MC', token: 'REAL-TOKEN', nickName: 'Jigar', balance: 12.5, vip: { level: 2, sessionKey: 'REAL-SESSION' } }
    });
});

test('getUserInfoPB failure bodies carry real values too (not redacted — local app, single user)', async (t) => {
    t.mock.method(axios, 'get', async () => ({ status: 200, data: { code: '0401013', msg: 'expired', token: 'REAL-T' } }));
    await assert.rejects(fetchUserInfo('1', 'tok', '2'), (err) =>
        err.responseBody.token === 'REAL-T' && err.responseBody.code === '0401013' && err.requestPayload.token === 'tok');
});


test('headers on the wire match the real client: same names, same order, content-type only on POST', async () => {
    const http = require('http');
    const seen = [];
    const server = http.createServer((req, res) => {
        const names = [];
        for (let i = 0; i < req.rawHeaders.length; i += 2) names.push(req.rawHeaders[i]);
        seen.push({ method: req.method, url: req.url, names, headers: req.headers });
        req.resume();
        req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end('{"code":"0000000","data":{"amount":"1"}}'); });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    domain = `http://127.0.0.1:${server.address().port}`;
    try {
        assert.equal((await sendHeartbeat(account)).success, true);
        await fetchBalance(account);
        await fetchUserInfo(account.uid, 'tok', '1').catch(() => {}); // reply isn't gzip: only the request matters here
        await fetchUserInfo(account.uid, 'tok', '2').catch(() => {});
    } finally {
        server.close();
        domain = 'https://api.first.com';
    }

    // Order captured from the real web client (full_session_log.txt); the rest are transport headers
    const captured = ['sec-ch-ua-platform', 'lang', 'checkid', 'sec-ch-ua', 'request-code', 'referer', 'sec-ch-ua-mobile', 'requestid', 'user-agent', 'accept'];
    const transport = new Set(['content-length', 'accept-encoding', 'host', 'connection']);
    const [post, get] = seen;
    assert.deepEqual(post.names.filter((n) => !transport.has(n.toLowerCase())), [...captured, 'content-type']);
    assert.deepEqual(get.names.filter((n) => !transport.has(n.toLowerCase())), captured);
    for (const { headers } of [post, get]) {
        assert.equal(headers.lang, 'zh');
        assert.equal(headers['sec-ch-ua'], '"Chromium";v="153", "Not_A Brand";v="8"');
        assert.equal(headers['sec-ch-ua-platform'], '"Android"');
        assert.equal(headers.accept, 'application/json, text/plain, */*');
        assert.match(headers.checkid, new RegExp(`^pc-[0-9a-f]{32}-${SID}-\\d+$`));
        assert.equal(headers.origin, undefined);
        assert.equal(headers['accept-language'], undefined);
    }
    assert.equal(post.headers['content-type'], 'application/json');

    // getUserInfoPB (iOS here): GET ?token=… only, and its own smaller header set
    const info = seen[2];
    assert.equal(info.method, 'GET');
    assert.equal(info.url, '/yewu12/user/getUserInfoPB?token=tok');
    assert.deepEqual(info.names.filter((n) => !transport.has(n.toLowerCase())),
        ['sec-ch-ua-platform', 'requestid', 'referer', 'user-agent', 'accept', 'sec-ch-ua', 'sec-ch-ua-mobile']);
    assert.equal(info.headers['sec-ch-ua-platform'], '"iOS"');
    assert.equal(info.headers.requestid, 'tok');

    // getUserInfoPB on Android: the real app's embedded WebView, not the browser session above —
    // Origin/X-Requested-With/Sec-Fetch-* (captured via proxy intercept), no sec-ch-ua* at all
    const infoAndroid = seen[3];
    assert.equal(infoAndroid.method, 'GET');
    assert.deepEqual(infoAndroid.names.filter((n) => !transport.has(n.toLowerCase())),
        ['accept', 'requestid', 'user-agent', 'origin', 'x-requested-with', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'referer', 'accept-language']);
    assert.equal(infoAndroid.headers.origin, 'https://app-h5.lzy21.com');
    assert.equal(infoAndroid.headers['x-requested-with'], 'com.fqwbqhdzajanq.icrelafkach');
    assert.equal(infoAndroid.headers['sec-fetch-site'], 'cross-site');
    assert.equal(infoAndroid.headers['accept-language'], 'en-US,en;q=0.9');
    assert.equal(infoAndroid.headers['sec-ch-ua-platform'], undefined, 'Android getUserInfoPB sends no sec-ch-ua* headers');
});
