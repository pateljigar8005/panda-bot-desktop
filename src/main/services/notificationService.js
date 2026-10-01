const nodemailer = require('nodemailer');
const store = require('./settingsStore');
const encryptionService = require('./encryptionService');
const logger = require('../logger');

// Same alert for the same account at most once per window, so a failing account doesn't flood the inbox
const COOLDOWN_MS = 60 * 60 * 1000;
const lastSent = new Map(); // `${accountId}:${event}` -> timestamp

const EVENT_TITLES = {
    tokenExpired: 'Token expired',
    heartbeatFailing: 'Heartbeats failing',
    setupFailed: 'Setup failed',
    accountOnHold: 'Account put on hold',
    test: 'Test email'
};

const DEFAULTS = {
    enabled: false,
    smtp: {
        host: '',
        port: 587,
        // starttls = port 587 style, ssl = port 465 style (TLS from the start), none = plain (local relays)
        security: 'starttls',
        username: '',
        passwordEncrypted: null,
        fromAddress: ''
    },
    recipients: [],
    events: { tokenExpired: true, heartbeatFailing: true, setupFailed: true, accountOnHold: true },
    // "Heartbeats failing" fires once an account has this many consecutive failures
    heartbeatFailureThreshold: 5
};

/** Saved settings merged over the defaults (password still encrypted). */
function getSettings() {
    const saved = store.read('notifications') || {};
    return {
        ...DEFAULTS,
        ...saved,
        smtp: { ...DEFAULTS.smtp, ...(saved.smtp || {}) },
        events: { ...DEFAULTS.events, ...(saved.events || {}) }
    };
}

const saveSettings = (settings) => store.write('notifications', settings);

/** Settings for the UI: never the password, only whether one is saved. */
function settingsJSON(settings) {
    const { passwordEncrypted, ...smtp } = settings.smtp;
    return { ...settings, smtp: { ...smtp, hasPassword: Boolean(passwordEncrypted) } };
}

function createTransport(smtp, password) {
    return nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.security === 'ssl',
        requireTLS: smtp.security === 'starttls',
        ignoreTLS: smtp.security === 'none',
        auth: smtp.username ? { user: smtp.username, pass: password || '' } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    });
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildEmail({ event, account, details, from, to }) {
    const title = EVENT_TITLES[event] || event;
    const rows = [
        account && ['Account', `${account.name} (UID ${account.uid})`],
        ['Event', title],
        details && ['Details', details],
        ['Time (UTC)', new Date().toISOString()]
    ].filter(Boolean);
    const where = account ? `Open Panda Bot → Accounts → ${account.name} → Activity for the full log.` : '';

    return {
        from,
        to: to.join(', '),
        subject: `[Panda Bot] ${title}${account ? ` — ${account.name}` : ''}`,
        text: `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${where}\n`,
        html: `<table cellpadding="4" style="font-family:sans-serif;font-size:14px">${rows
            .map(([k, v]) => `<tr><td style="color:#666">${escapeHtml(k)}</td><td><b>${escapeHtml(v)}</b></td></tr>`)
            .join('')}</table>${where ? `<p style="font-family:sans-serif">${escapeHtml(where)}</p>` : ''}`
    };
}

/** Send a test email with the given (possibly unsaved) settings. Throws with the SMTP server's own error. */
async function sendTest(smtp, password, recipients) {
    await createTransport(smtp, password).sendMail(buildEmail({
        event: 'test',
        details: 'Email notifications are working. You will get alerts for the events enabled in Settings.',
        from: smtp.fromAddress,
        to: recipients
    }));
}

/**
 * Email an alert about an account, if that event is enabled. Never throws — callers are background
 * loops (heartbeats) or requests that must not fail because an email couldn't be sent.
 */
async function notify(event, account, details) {
    try {
        const settings = getSettings();
        if (!settings.enabled || !settings.events[event] || !settings.recipients.length || !settings.smtp.host) return false;

        const key = `${account._id}:${event}`;
        if (Date.now() - (lastSent.get(key) || 0) < COOLDOWN_MS) return false;
        lastSent.set(key, Date.now()); // claim before sending, so concurrent triggers don't double-send

        const password = settings.smtp.passwordEncrypted ? encryptionService.decrypt(settings.smtp.passwordEncrypted) : '';
        await createTransport(settings.smtp, password).sendMail(buildEmail({
            event, account, details, from: settings.smtp.fromAddress, to: settings.recipients
        }));
        logger.info(`Notification sent: ${event} for ${account.name}`);
        return true;
    } catch (err) {
        logger.error(`Notification failed: ${event} for ${account?.name}`, err.message);
        return false;
    }
}

/** Called after each failed heartbeat with the new consecutive-failure count. */
async function onHeartbeatFailure(account, consecutiveFailures, errorText) {
    if (consecutiveFailures >= getSettings().heartbeatFailureThreshold) {
        await notify('heartbeatFailing', account, `${consecutiveFailures} heartbeats in a row failed. Last error: ${errorText || 'unknown'}`);
    }
}

/** Test helper: forget cooldowns. */
const resetCooldowns = () => lastSent.clear();

module.exports = { getSettings, saveSettings, settingsJSON, notify, onHeartbeatFailure, sendTest, resetCooldowns, COOLDOWN_MS };
