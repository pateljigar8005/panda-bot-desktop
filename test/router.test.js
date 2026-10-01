// Run: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRouter, AppError } = require('../src/main/router');
const { resolveFile, isAppUrl, RENDERER_DIR } = require('../src/main/appProtocol');

test('routes match method + path params + query, like the old HTTP API', async () => {
    const router = createRouter();
    router.handle('PUT /accounts/:id', ({ params, query, body }) => ({ params, query, body }));
    router.handle('GET /accounts', () => 'list');

    const res = await router.dispatch({ method: 'put', path: '/accounts/a%201?dry=1', body: { name: 'x' } });
    assert.deepEqual(res, { ok: true, status: 200, data: { params: { id: 'a 1' }, query: { dry: '1' }, body: { name: 'x' } } });
    assert.equal((await router.dispatch({ method: 'GET', path: '/accounts' })).data, 'list');
    assert.equal((await router.dispatch({ method: 'DELETE', path: '/accounts' })).status, 404);
    assert.equal((await router.dispatch({ method: 'GET', path: '/accounts/a/b' })).status, 404, 'a param never spans segments');
});

test('errors come back as an envelope; unexpected ones hide their details', async (t) => {
    t.mock.method(console, 'error', () => {});
    const router = createRouter();
    router.handle('POST /known', () => { throw new AppError(409, 'Proxy is in use', { accounts: 2 }); });
    router.handle('POST /crash', () => { throw new Error('secret internal detail'); });

    assert.deepEqual(await router.dispatch({ method: 'POST', path: '/known' }), { ok: false, status: 409, message: 'Proxy is in use', details: { accounts: 2 } });
    assert.deepEqual(await router.dispatch({ method: 'POST', path: '/crash' }), { ok: false, status: 500, message: 'Something went wrong' });
    assert.equal((await router.dispatch(null)).status, 400);
    assert.equal((await router.dispatch({ method: 1, path: '/known' })).status, 400);
});

test('app:// serves only the built UI: page loads of routes get index.html, nothing outside dist/renderer', () => {
    const index = path.join(RENDERER_DIR, 'index.html');
    assert.equal(resolveFile('/accounts/123', { navigation: true }), index);
    assert.equal(resolveFile('/auth/refresh'), null, 'fetch/XHR to an unknown path is a 404, not the app shell');
    assert.equal(resolveFile('/assets/missing.js', { navigation: true }), null, 'a missing asset is a 404');
    assert.equal(resolveFile('/../../src/main/index.js', { navigation: true }), null);
    assert.equal(resolveFile('/%2e%2e/%2e%2e/package.json', { navigation: true }), null);
});

test('only our own UI counts as the app (IPC callers, navigation)', () => {
    assert.equal(isAppUrl('app://panda/accounts/1'), true);
    assert.equal(isAppUrl('app://evil/'), false);
    assert.equal(isAppUrl('https://panda/'), false);
    assert.equal(isAppUrl('http://127.0.0.1:5173/login'), false, 'the dev server only counts in dev mode');
    assert.equal(isAppUrl('http://127.0.0.1:5173/login', 'http://127.0.0.1:5173'), true);
    assert.equal(isAppUrl('http://127.0.0.1:5174/', 'http://127.0.0.1:5173'), false);
    assert.equal(isAppUrl('not a url'), false);
});
