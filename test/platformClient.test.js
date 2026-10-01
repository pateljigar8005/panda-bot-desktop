// Run: npm test   (no database or network: the platform and domain discovery are stubbed)
const { test } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

// Domain discovery stubbed before platformClient loads (it imports getApiBase at require time)
const apiDomainService = require('../services/apiDomainService');
let domain = 'https://api.first.com';
apiDomainService.getApiBase = async () => domain;

const encryptionService = require('../services/encryptionService');
const { http: axios, sendHeartbeat, fetchUserInfo, fetchBalance } = require('../services/platformClient');

const account = {
    _id: 'a1', uid: '537206819374508284', deviceId: '2', proxyId: null,
    tokenEncrypted: encryptionService.encrypt('tok'), sessionIdEncrypted: encryptionService.encrypt('sess'),
    sidEncrypted: encryptionService.encrypt('sid'), mcEncrypted: encryptionService.encrypt('mc')
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

test('getUserInfoPB success: request + decoded response kept for the log, with sid/mc/tokens redacted', async (t) => {
    const zlib = require('zlib');
    const userInfo = { userId: '537206819374508284', mId: 'm1', sid: 'SECRET-SID', mc: 'SECRET-MC', token: 'SECRET-TOKEN', nickName: 'Jigar', balance: 12.5, vip: { level: 2, sessionKey: 'SECRET-SESSION' } };
    const data = zlib.gzipSync(JSON.stringify(userInfo)).toString('base64');
    t.mock.method(axios, 'get', async () => ({ status: 200, data: { code: '0000000', msg: 'ok', data } }));

    const info = await fetchUserInfo('537206819374508284', 'tok', '2');
    assert.equal(info.sid, 'SECRET-SID', 'the real values are still returned for encryption');
    assert.deepEqual(info.requestPayload, { token: '[redacted]' });
    assert.equal(info.statusCode, 200);
    assert.equal(info.responseCode, '0000000');
    assert.deepEqual(info.responseBody, {
        code: '0000000',
        msg: 'ok',
        data: { userId: '537206819374508284', mId: 'm1', sid: '[redacted]', mc: '[redacted]', token: '[redacted]', nickName: 'Jigar', balance: 12.5, vip: { level: 2, sessionKey: '[redacted]' } }
    });
    assert.ok(!JSON.stringify(info.responseBody).includes('SECRET'), 'nothing secret in what gets logged');
});

test('getUserInfoPB failure bodies are redacted too', async (t) => {
    t.mock.method(axios, 'get', async () => ({ status: 200, data: { code: '0401013', msg: 'expired', token: 'SECRET-T' } }));
    await assert.rejects(fetchUserInfo('1', 'tok', '2'), (err) =>
        err.responseBody.token === '[redacted]' && err.responseBody.code === '0401013' && err.requestPayload.token === '[redacted]');
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
        assert.match(headers.checkid, /^pc-[0-9a-f]{32}-537206819374508284-\d+$/);
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
});
