/**
 * An error the UI should see as-is: status (like the old HTTP API's) + message (+ optional details).
 * Anything else thrown in a handler is reported as a generic 500, without internals.
 */
class AppError extends Error {
    constructor(status, message, details) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.details = details;
    }
}

const badRequest = (message, details) => new AppError(400, message, details);
const notFound = (message) => new AppError(404, message);
const conflict = (message, details) => new AppError(409, message, details);

module.exports = { AppError, badRequest, notFound, conflict };
