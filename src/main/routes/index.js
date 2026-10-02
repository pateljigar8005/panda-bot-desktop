/** Registers every route module onto the router. */
const accounts = require('./accounts');
const proxies = require('./proxies');
const master = require('./master');
const system = require('./system');
const audit = require('./audit');
const heartbeatLogs = require('./heartbeatLogs');
const browser = require('./browser');
const bets = require('./bets');

function register(router) {
    accounts.register(router);
    proxies.register(router);
    master.register(router);
    system.register(router);
    audit.register(router);
    heartbeatLogs.register(router);
    browser.register(router);
    bets.register(router);
}

module.exports = { register };
