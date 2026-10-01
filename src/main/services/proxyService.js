const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { Proxies } = require('../models');
const encryptionService = require('./encryptionService');

/**
 * Build an agent that routes a request through the given proxy row.
 * Returns null when no proxy is given (direct connection).
 */
function buildProxyAgent(proxy) {
    if (!proxy) return null;

    const password = proxy.passwordEncrypted ? encryptionService.decrypt(proxy.passwordEncrypted) : '';
    const auth = proxy.username
        ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(password || '')}@`
        : '';
    const scheme = proxy.protocol === 'socks5' ? 'socks5h' : proxy.protocol;
    const url = `${scheme}://${auth}${proxy.host}:${proxy.port}`;

    return proxy.protocol === 'socks5' ? new SocksProxyAgent(url) : new HttpsProxyAgent(url);
}

/**
 * axios options that send the request through the proxy (or directly if none).
 * `proxy: false` stops axios from also applying HTTP(S)_PROXY env vars.
 */
function axiosProxyOptions(proxy) {
    const agent = buildProxyAgent(proxy);
    if (!agent) return {};
    return { httpAgent: agent, httpsAgent: agent, proxy: false };
}

/**
 * Load the proxy assigned to an account, if any.
 */
async function getAccountProxy(account) {
    if (!account.proxyId) return null;
    return Proxies.findById(account.proxyId);
}

module.exports = { buildProxyAgent, axiosProxyOptions, getAccountProxy };
