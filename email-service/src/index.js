'use strict';

require('dotenv').config();

const express = require('express');
const { logger, errorHandler, notFoundHandler } = require('../../shared');
const healthRouter = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.originalUrl }, 'incoming request');
  next();
});

app.use('/health', healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info({ port: PORT }, `${process.env.SERVICE_NAME} started`);
});

process.on('SIGTERM', () => { logger.info('SIGTERM — shutting down'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('SIGINT — shutting down');  process.exit(0); });

module.exports = app;
