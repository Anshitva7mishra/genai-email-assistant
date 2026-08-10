'use strict';

const pino = require('pino');

/**
 * Shared Pino logger instance. Configured once at module load and reused
 * across the service. In development, pino-pretty formats output for
 * human readability. In production, raw JSON is emitted for log aggregators.
 *
 * SERVICE_NAME and NODE_ENV are injected into every log line via the `base`
 * field so log aggregators can filter by service without parsing the message.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: process.env.SERVICE_NAME || 'unknown',
    env: process.env.NODE_ENV || 'development',
  },
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } }
      : undefined,
});

module.exports = logger;
