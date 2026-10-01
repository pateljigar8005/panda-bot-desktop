/** Ported from panda-bot/src/controllers/settingsController.js: no userId, settings are a singleton. */
const { AppError, badRequest } = require('../errors');
const encryptionService = require('../services/encryptionService');
const notificationService = require('../services/notificationService');

const normalizeRecipients = (list) => [...new Set((list || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];

/**
 * SMTP password handling for save/test: a non-empty string sets it, null clears it,
 * omitted/'' keeps the saved one (the UI never receives it, so the form sends nothing).
 */
function resolvePassword(input, saved) {
    if (input === null) return null;
    if (typeof input === 'string' && input) return encryptionService.encrypt(input);
    return saved ?? null;
}

function requireCompleteWhenEnabled(enabled, smtp, recipients) {
    if (!enabled) return;
    if (!smtp.host) throw badRequest('SMTP host is required to enable notifications');
    if (!smtp.fromAddress) throw badRequest('From address is required to enable notifications');
    if (!recipients.length) throw badRequest('Add at least one recipient to enable notifications');
}

function register(router) {
    router.handle('GET /settings/notifications', () => ({ settings: notificationService.settingsJSON(notificationService.getSettings()) }));

    router.handle('PUT /settings/notifications', ({ body, audit }) => {
        const settings = notificationService.getSettings();
        const smtp = { ...settings.smtp, ...(body.smtp || {}) };
        smtp.passwordEncrypted = resolvePassword(body.smtp?.password, settings.smtp.passwordEncrypted);
        delete smtp.password;
        const recipients = body.recipients !== undefined ? normalizeRecipients(body.recipients) : settings.recipients;
        const enabled = body.enabled !== undefined ? Boolean(body.enabled) : settings.enabled;

        requireCompleteWhenEnabled(enabled, smtp, recipients);

        const updated = {
            enabled, smtp, recipients,
            events: body.events ? { ...settings.events, ...body.events } : settings.events,
            heartbeatFailureThreshold: body.heartbeatFailureThreshold !== undefined ? body.heartbeatFailureThreshold : settings.heartbeatFailureThreshold
        };
        notificationService.saveSettings(updated);

        // The request body is recorded with the password redacted; note whether it changed
        audit({ meta: { passwordChanged: typeof body.smtp?.password === 'string' && body.smtp.password !== '' } });
        return { settings: notificationService.settingsJSON(updated) };
    });

    // Sends with the form's current values (saved or not)
    router.handle('POST /settings/notifications/test', async ({ body }) => {
        const saved = notificationService.getSettings();
        const smtp = { ...saved.smtp, ...(body.smtp || {}) };
        const passwordEncrypted = resolvePassword(body.smtp?.password, saved.smtp.passwordEncrypted);
        const password = passwordEncrypted ? encryptionService.decrypt(passwordEncrypted) : '';
        const recipients = normalizeRecipients(body.recipients ?? saved.recipients);

        if (!smtp.host) throw badRequest('SMTP host is required');
        if (!smtp.fromAddress) throw badRequest('From address is required');
        if (!recipients.length) throw badRequest('Add at least one recipient');

        try {
            await notificationService.sendTest(smtp, password, recipients);
        } catch (err) {
            throw new AppError(502, `Test email failed: ${err.message}`); // the SMTP server's own words
        }
        return { success: true, message: `Test email sent to ${recipients.join(', ')}` };
    });
}

module.exports = { register };
