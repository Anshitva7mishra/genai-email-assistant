'use strict';

const logger = require('./logger');

/**
 * Converts any unmatched route into a 404 error and forwards it to the
 * central error handler. Must be registered after all route definitions.
 */
function notFoundHandler(req, _res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
}

/**
 * Central Express error handler. Logs the error with request context and
 * responds with a consistent JSON envelope. Stack traces are suppressed in
 * production to avoid leaking implementation details to clients.
 *
 * The four-argument signature is required by Express to recognise this as
 * an error-handling middleware — do not remove the unused `next` parameter.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  logger.error({ err, method: req.method, url: req.originalUrl, status }, 'Request error');

  res.status(status).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
