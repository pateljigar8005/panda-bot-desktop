// App settings that aren't user-editable. Environment variables only override them in development.
const platform = {
    // Fallback only: the live API domain is discovered at runtime (services/apiDomainService.js)
    apiBase: process.env.PLATFORM_API_BASE || 'https://api.3qttu0s.com',
    // The platform's web client; sent as the referer, like the real client does
    webOrigin: process.env.PLATFORM_WEB_ORIGIN || 'https://app-h5.lzy21.com'
};

for (const [name, value] of Object.entries(platform)) {
    if (!/^https:\/\//.test(value)) throw new Error(`platform.${name} must be an https:// URL`);
}

module.exports = {
    platform,
    panda: {
        // Salt of the platform's dataCollect sign (taken from its web client)
        dataCollectSalt: process.env.PANDA_DATA_COLLECT_SALT || 'Sign9#kljfw#!'
    },
    // Heartbeat logs older than this are deleted automatically
    heartbeatLogRetentionDays: 7
};
