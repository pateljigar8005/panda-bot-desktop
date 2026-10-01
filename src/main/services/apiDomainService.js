const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');
const logger = require('../logger');

// Same discovery the platform's web app does (DomainState in its bundle):
//   1. download an OSS config file (prod.json) from any of these mirrors
//   2. take the encrypted API list for our group: GA<group>.api
//   3. decrypt each entry (AES-128-ECB, PKCS7, base64)
//   4. GET `${api}?t=<now>` on all of them and keep the first that answers
const OSS_FILE_URLS = (process.env.PLATFORM_OSS_URLS || [
    'https://xbnhjktbwggfvyok.ybgjhb.com/prod.json',
    'https://aukukktsxfauannt.zyakxf.com/prod.json',
    'https://xbnhjktbwggfvyok.chinazjyh.com/prod.json',
    'https://xbnhjktbwggfvyok.lcjzgt.com/prod.json'
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);

const OSS_DECRYPT_KEY = Buffer.from('panda1234_1234ob', 'utf8');
const DEFAULT_GROUP = 'COMMON';
const OSS_TIMEOUT_MS = 5000;
const PROBE_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 10 * 60 * 1000;

let cached = { apiBase: null, resolvedAt: 0 };
let inFlight = null;

/** get_oss_decrypt_str: AES-128-ECB of a base64 string, trimmed, without a trailing slash. Values already starting with http are plain. */
function decryptOssValue(value) {
    if (typeof value !== 'string' || !value) return '';
    if (value.startsWith('http')) return value.replace(/\/+$/, '');
    try {
        const decipher = crypto.createDecipheriv('aes-128-ecb', OSS_DECRYPT_KEY, null);
        const text = Buffer.concat([decipher.update(Buffer.from(value, 'base64')), decipher.final()]).toString('utf8');
        return text.trim().replace(/\/+$/, '');
    } catch (e) {
        return '';
    }
}

/** The first mirror to return a JSON object wins. */
async function fetchOssFile() {
    const attempts = OSS_FILE_URLS.map(async (url) => {
        const res = await axios.get(url, { params: { t: Date.now() }, timeout: OSS_TIMEOUT_MS });
        if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) throw new Error(`${url}: not a JSON object`);
        return res.data;
    });
    try {
        return await Promise.any(attempts);
    } catch (e) {
        throw new Error('No OSS config file could be downloaded');
    }
}

/** set_all_config_from_oss_file_data_2_api: GA<group>.api, falling back to GACOMMON. */
function getApiCandidates(ossData, group = DEFAULT_GROUP) {
    const encrypted = ossData?.[`GA${group}`]?.api || ossData?.[`GA${DEFAULT_GROUP}`]?.api || [];
    const apis = encrypted.map(decryptOssValue).filter((api) => /^https?:\/\//.test(api));
    return [...new Set(apis)];
}

/** compute_api_domain_firstone_by_currentTimeMillis: the first domain to answer `${api}?t=` is used. */
async function pickFastestApi(apis) {
    const probes = apis.map(async (api) => {
        await axios.get(api, { params: { t: Date.now() }, timeout: PROBE_TIMEOUT_MS });
        return new URL(api).origin;
    });
    try {
        return await Promise.any(probes);
    } catch (e) {
        throw new Error(`None of the ${apis.length} API domains answered`);
    }
}

async function discoverApiBase(group) {
    const ossData = await fetchOssFile();
    const apis = getApiCandidates(ossData, group);
    if (!apis.length) throw new Error(`OSS config file has no API domains for group ${group}`);
    return pickFastestApi(apis);
}

/**
 * The platform API origin, e.g. https://api.3qttu0s.com. Discovered from the OSS config and cached
 * for 10 minutes; on failure the last good value, then PLATFORM_API_BASE, is used.
 */
async function getApiBase({ group = DEFAULT_GROUP, forceRefresh = false } = {}) {
    if (!forceRefresh && cached.apiBase && Date.now() - cached.resolvedAt < CACHE_TTL_MS) return cached.apiBase;
    if (!inFlight) {
        inFlight = discoverApiBase(group)
            .then((apiBase) => {
                if (apiBase !== cached.apiBase) logger.info(`Platform API base resolved to ${apiBase}`);
                cached = { apiBase, resolvedAt: Date.now() };
                return apiBase;
            })
            .catch((e) => {
                const fallback = cached.apiBase || config.platform.apiBase;
                logger.warn(`Platform API base discovery failed (${e.message}); using ${fallback}`);
                return fallback;
            })
            .finally(() => { inFlight = null; });
    }
    return inFlight;
}

module.exports = { getApiBase, decryptOssValue, getApiCandidates };
