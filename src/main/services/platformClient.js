const axios = require('axios');
const zlib = require('zlib');
const { generateCheckId, generateHeartbeatSign } = require('./signatureService');
const encryptionService = require('./encryptionService');
const { axiosProxyOptions, getAccountProxy } = require('./proxyService');
const { getApiBase } = require('./apiDomainService');

const config = require('../config');

const WEB_ORIGIN = config.platform.webOrigin;

// Copied from captured traffic of the real web client (full_session_log.txt, 336 API requests):
// same headers, same values, same order. iOS and Android differ only in platform + user-agent.
// Not sent by the real client: origin, accept-language. content-type only on POST.
const USER_AGENTS = {
    ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36'
};
const SEC_CH_UA = '"Chromium";v="153", "Not_A Brand";v="8"';

// Own axios instance without the global defaults: they'd put Accept / Content-Type first (capitalised)
// and break the captured order. Only transport headers (Content-Length, Accept-Encoding, Host,
// Connection) are added after ours.
const http = axios.create();
delete http.defaults.headers.common.Accept;
delete http.defaults.headers.common['Content-Type'];

function buildHeaders(token, uid, deviceId, method = 'POST') {
    const isIOS = deviceId === '1';
    const headers = {
        'sec-ch-ua-platform': isIOS ? '"iOS"' : '"Android"',
        'lang': 'zh',
        'checkid': generateCheckId(uid),
        'sec-ch-ua': SEC_CH_UA,
        'request-code': '{"panda-bss-source":"1"}',
        'referer': `${WEB_ORIGIN}/`,
        'sec-ch-ua-mobile': '?1',
        'requestid': token,
        'user-agent': isIOS ? USER_AGENTS.ios : USER_AGENTS.android,
        'accept': 'application/json, text/plain, */*'
    };
    if (method === 'POST') headers['content-type'] = 'application/json';
    return headers;
}

// getUserInfoPB is a plain GET in the capture: fewer headers, in this order (no lang/checkid/request-code)
function buildUserInfoHeaders(token, deviceId) {
    const isIOS = deviceId === '1';
    return {
        'sec-ch-ua-platform': isIOS ? '"iOS"' : '"Android"',
        'requestid': token,
        'referer': `${WEB_ORIGIN}/`,
        'user-agent': isIOS ? USER_AGENTS.ios : USER_AGENTS.android,
        'accept': 'application/json, text/plain, */*',
        'sec-ch-ua': SEC_CH_UA,
        'sec-ch-ua-mobile': '?1'
    };
}

function decodeGzip(data) {
    if (!data || typeof data !== 'string') return null;
    if (!data.startsWith('H4sI')) return null;
    try {
        const buffer = Buffer.from(data, 'base64');
        // Capped: a hostile or broken reply can't expand into gigabytes (zip bomb)
        const decompressed = zlib.gunzipSync(buffer, { maxOutputLength: 5 * 1024 * 1024 }).toString('utf-8');
        return JSON.parse(decompressed);
    } catch (e) {
        return null;
    }
}

// Error carrying exactly what the platform returned (status, code, body), so the setup log shows it verbatim
function lookupError(message, { statusCode = null, responseCode = null, responseBody = null, apiBase = null, endpoint = null, requestPayload = null } = {}) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.responseCode = responseCode;
    err.responseBody = redactDeep(responseBody);
    err.requestPayload = requestPayload;
    err.apiBase = apiBase;     // which platform domain the request went to (it rotates)
    err.endpoint = endpoint;
    return err;
}

/**
 * Copy of a platform response that's safe to store in logs: any token / session / sid / mc /
 * password / secret field is replaced, at any depth. The platform result `code` is kept.
 */
const SECRET_RESPONSE_KEY = /^(sid|mc|sign)$|token|session|secret|passw|pwd/i;
function redactDeep(value, depth = 0) {
    if (value === null || typeof value !== 'object') return value;
    if (depth > 6) return '[…]';
    if (Array.isArray(value)) return value.slice(0, 100).map((v) => redactDeep(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = SECRET_RESPONSE_KEY.test(k) && v !== null && v !== '' ? '[redacted]' : redactDeep(v, depth + 1);
    }
    return out;
}

const USER_INFO_ENDPOINT = '/yewu12/user/getUserInfoPB';
const HEARTBEAT_ENDPOINT = '/yewu40/req/request';

/** The platform's own words for a failed response: its msg/message/error fields, as returned. */
function platformMessage(body) {
    if (!body || typeof body !== 'object') return typeof body === 'string' && body ? body.slice(0, 300) : null;
    const parts = [body.error, body.msg ?? body.message].filter((p) => typeof p === 'string' && p);
    return parts.length ? parts.join(': ') : null;
}

/**
 * Fetch mc / sid / mId from getUserInfoPB
 * `proxy` is a Proxy document (or null for a direct connection).
 */
async function fetchUserInfo(uid, token, deviceId, proxy = null) {
    // Resolved once per call, so the logged domain is exactly the one the request used
    const apiBase = await getApiBase();
    const requestPayload = { token: '[redacted]' }; // what we send, for the log; the token itself is never logged
    const where = { apiBase, endpoint: USER_INFO_ENDPOINT, requestPayload };
    let response;
    try {
        // As the real client: GET ?token=<token>, nothing else in the URL
        response = await http.get(`${apiBase}${USER_INFO_ENDPOINT}`, {
            params: { token },
            headers: buildUserInfoHeaders(token, deviceId),
            timeout: 10000,
            ...axiosProxyOptions(proxy)
        });
    } catch (error) {
        if (!error.response) {
            // No response at all: network / DNS / proxy / timeout
            throw lookupError(`getUserInfoPB request failed: ${error.message}`, where);
        }
        const { status, data } = error.response;
        const said = platformMessage(data);
        throw lookupError(`getUserInfoPB → HTTP ${status}${said ? ` · ${said}` : ''}`, {
            statusCode: status, responseCode: data?.code ?? null, responseBody: data ?? null, ...where
        });
    }

    if (response.data?.code !== '0000000') {
        const said = platformMessage(response.data);
        throw lookupError(`getUserInfoPB → code ${response.data?.code ?? 'missing'}${said ? ` · ${said}` : ''}`, {
            statusCode: response.status, responseCode: response.data?.code ?? null, responseBody: response.data ?? null, ...where
        });
    }

    const decoded = decodeGzip(response.data.data);
    if (!decoded) {
        throw lookupError('Failed to decode getUserInfoPB response', { statusCode: response.status, responseCode: response.data?.code ?? null, responseBody: response.data, ...where });
    }
    // The reply as the app would see it: envelope + decoded user info (secrets redacted when stored)
    const readableBody = { ...response.data, data: decoded };

    if (!decoded.sid || !decoded.mc) {
        throw lookupError('getUserInfoPB response has no sid/mc', { statusCode: response.status, responseCode: response.data?.code ?? null, responseBody: readableBody, ...where });
    }

    return {
        mc: decoded.mc,
        sid: decoded.sid,
        mId: decoded.mId,
        uid: decoded.userId,
        ...where,
        statusCode: response.status,
        responseCode: response.data?.code ?? null,
        responseBody: redactDeep(readableBody)   // for the log: sid / mc / tokens redacted
    };
}

/**
 * Send one heartbeat
 */
// Secrets that must never be persisted (heartbeat logs) or returned by the API in plaintext
const SECRET_PAYLOAD_FIELDS = ['sessionId', 'sid', 'code', 'sign'];

function redactPayload(payload) {
    if (!payload) return null;
    const out = { ...payload };
    for (const field of SECRET_PAYLOAD_FIELDS) {
        if (out[field] !== undefined) out[field] = '[redacted]';
    }
    return out;
}

async function sendHeartbeat(account) {
    let token, sessionId, sid, mc;
    try {
        token = encryptionService.decrypt(account.tokenEncrypted);
        sessionId = encryptionService.decrypt(account.sessionIdEncrypted);
        sid = encryptionService.decrypt(account.sidEncrypted);
        mc = encryptionService.decrypt(account.mcEncrypted);
    } catch (error) {
        // Corrupt value or ENCRYPTION_KEY changed — report it as a failed heartbeat, don't throw
        return { success: false, error: `Credential decryption failed: ${error.message}`, requestPayload: null };
    }

    const sign = generateHeartbeatSign(sid, mc, account.uid);
    const timestamp = Date.now();

    const payload = {
        sessionId,
        os: account.deviceId === '1' ? 'ios' : 'android',
        sid,
        uid: account.uid,
        code: mc,
        device: account.deviceId,
        sign,
        t: timestamp
    };

    // Resolved once, so the logged domain is exactly the one this heartbeat used
    const apiBase = await getApiBase();
    const where = { apiBase, endpoint: HEARTBEAT_ENDPOINT };

    try {
        const proxy = await getAccountProxy(account);
        const response = await http.post(
            `${apiBase}${HEARTBEAT_ENDPOINT}?t=${timestamp}`,
            payload,
            {
                headers: buildHeaders(token, account.uid, account.deviceId),
                timeout: 10000,
                ...axiosProxyOptions(proxy)
            }
        );

        const code = response.data?.code;
        return {
            success: code === '0000000',
            code,
            statusCode: response.status,
            response: response.data,
            requestPayload: redactPayload(payload),   // for logging — secrets removed
            ...where
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            statusCode: error.response?.status,
            responseCode: error.response?.data?.code,
            response: error.response?.data || null,
            requestPayload: redactPayload(payload),   // for logging — secrets removed
            ...where
        };
    }
}

/**
 * Fetch the current balance for an account
 * Endpoint: GET /yewu12/user/amount?uid=...&t=...
 */
async function fetchBalance(account) {
    const timestamp = Date.now();

    try {
        const token = encryptionService.decrypt(account.tokenEncrypted);
        const proxy = await getAccountProxy(account);
        const response = await http.get(
            `${await getApiBase()}/yewu12/user/amount`,
            {
                params: { uid: account.uid, t: timestamp },
                headers: buildHeaders(token, account.uid, account.deviceId, 'GET'),
                timeout: 10000,
                ...axiosProxyOptions(proxy)
            }
        );

        if (response.data?.code !== '0000000') {
            return {
                success: false,
                error: response.data?.msg || 'Unknown error',
                code: response.data?.code
            };
        }

        // Some endpoints return gzip+base64 payloads (see getUserInfoPB)
        const data = decodeGzip(response.data.data) || response.data.data;
        const balance = Number(data?.amount);
        if (!Number.isFinite(balance)) {
            return { success: false, error: 'Unexpected balance response', code: response.data.code };
        }

        return {
            success: true,
            balance,
            currency: 'CNY',
            raw: response.data
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            statusCode: error.response?.status,
            responseCode: error.response?.data?.code
        };
    }
}

module.exports = { http, redactDeep, fetchUserInfo, sendHeartbeat, fetchBalance, decodeGzip, buildHeaders, buildUserInfoHeaders, redactPayload, SECRET_PAYLOAD_FIELDS };