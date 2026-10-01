/** Registers every route module onto the router. */
const accounts = require('./accounts');
const proxies = require('./proxies');
const master = require('./master');
const settings = require('./settings');
const system = require('./system');
const audit = require('./audit');

function register(router) {
    accounts.register(router);
    proxies.register(router);
    master.register(router);
    settings.register(router);
    system.register(router);
    audit.register(router);
}

module.exports = { register };
