#!/usr/bin/env node
'use strict';

/**
 * scripts/health-check.js
 * Quick CLI tool to verify all services are running.
 * Usage: node scripts/health-check.js
 */

const http = require('http');

const SERVICES = [
  { name: 'gateway',           port: 3001 },
  { name: 'ai-service',        port: 3002 },
  { name: 'email-service',     port: 3003 },
  { name: 'template-service',  port: 3004 },
  { name: 'scheduler-service', port: 3005 },
  { name: 'analytics-service', port: 3006 },
];

function checkHealth(service) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://localhost:${service.port}/health`,
      { timeout: 3000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({ ...service, ok: res.statusCode === 200, data });
          } catch {
            resolve({ ...service, ok: false, error: 'Invalid JSON' });
          }
        });
      }
    );
    req.on('error', (err) => resolve({ ...service, ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ...service, ok: false, error: 'Timeout' });
    });
  });
}

async function main() {
  console.log('\n🔍  GenAI Email Assistant — Health Check\n');
  const results = await Promise.all(SERVICES.map(checkHealth));

  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    const detail = r.ok
      ? `uptime=${r.data.uptime}s`
      : `error=${r.error}`;
    console.log(`${icon}  ${r.name.padEnd(22)} :${r.port}  ${detail}`);
    if (!r.ok) allOk = false;
  }

  console.log(allOk ? '\n✨ All services healthy!\n' : '\n⚠️  Some services are not healthy.\n');
  process.exit(allOk ? 0 : 1);
}

main();
