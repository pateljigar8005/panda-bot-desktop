const { EventEmitter } = require('node:events');

/**
 * Live events for the UI (Live Monitor, alerts): the main process forwards every 'event' to the
 * window. Payloads must never contain secrets.
 */
const bus = new EventEmitter();

function emit(name, payload) {
    bus.emit('event', { name, payload, at: Date.now() });
}

module.exports = { bus, emit };
