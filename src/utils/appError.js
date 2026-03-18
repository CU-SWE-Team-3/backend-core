/**
 * Custom Error Class for Operational Errors
 * Use this for ALL errors you throw intentionally (not bugs).
 *
 * Usage:
 *   throw new AppError('User not found', 404);
 *   throw new AppError('You are not authorized', 403);
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    // 4xx = client error (fail), 5xx = server error (error)
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    // Mark as operational so we know it's a known, handled error
    this.isOperational = true;

    // Capture the stack trace, excluding the constructor itself
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
