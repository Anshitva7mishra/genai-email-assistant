'use strict';

const router = require('express').Router();
const START_TIME = Date.now();

router.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: process.env.SERVICE_NAME || 'scheduler-service',
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
