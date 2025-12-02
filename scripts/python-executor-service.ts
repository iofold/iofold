#!/usr/bin/env bun
/**
 * Python Executor HTTP Service
 *
 * Run alongside wrangler dev for local eval testing.
 * Usage: bun scripts/python-executor-service.ts
 */

import { spawn } from 'node:child_process';

const PORT = 9999;
const DEFAULT_TIMEOUT = 5000;

const ALLOWED_IMPORTS = ['json', 're', 'typing'];
const BLOCKED_IMPORTS = [
  'os', 'sys', 'subprocess', 'socket', 'urllib',
  'requests', 'http', 'ftplib', 'smtplib',
  'pickle', 'shelve', 'dbm'
];

function validateCode(code: string): string | null {
  for (const blocked of BLOCKED_IMPORTS) {
    if (new RegExp(`import\\s+${blocked}|from\\s+${blocked}`, 'i').test(code)) {
      return `Blocked import: ${blocked}`;
    }
  }
  if (/\beval\s*\(|\bexec\s*\(|\bcompile\s*\(/.test(code)) {
    return 'Blocked: eval/exec/compile';
  }
  for (const match of code.matchAll(/^import\s+(\w+)/gm)) {
    if (match[1] && !ALLOWED_IMPORTS.includes(match[1])) {
      return `Import not whitelisted: ${match[1]}`;
    }
  }
  for (const match of code.matchAll(/^from\s+(\w+)\s+import/gm)) {
    if (match[1] && !ALLOWED_IMPORTS.includes(match[1])) {
      return `Import not whitelisted: ${match[1]}`;
    }
  }
  return null;
}

async function executePython(code: string, timeout: number) {
  const startTime = Date.now();
  const validationError = validateCode(code);
  if (validationError) {
    return { success: false, error: validationError, executionTimeMs: Date.now() - startTime };
  }

  return new Promise((resolve) => {
    let stdout = '', stderr = '', timedOut = false;
    const child = spawn('python3', ['-']);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000);
    }, timeout);

    child.stdout.on('data', (d) => stdout += d);
    child.stderr.on('data', (d) => stderr += d);

    child.on('close', (code) => {
      clearTimeout(timer);
      const ms = Date.now() - startTime;
      if (timedOut) resolve({ success: false, error: `Timeout exceeded ${timeout}ms`, executionTimeMs: ms });
      else if (code === 0) resolve({ success: true, output: stdout.trim(), executionTimeMs: ms });
      else resolve({ success: false, error: stderr.trim() || `Exit code ${code}`, executionTimeMs: ms });
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ success: false, error: e.message, executionTimeMs: Date.now() - startTime });
    });

    child.stdin.write(code);
    child.stdin.end();
  });
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health') return Response.json({ status: 'ok' }, { headers: cors });

    if (url.pathname === '/execute' && req.method === 'POST') {
      const body = await req.json();
      if (!body.code) return Response.json({ success: false, error: 'Missing code', executionTimeMs: 0 }, { status: 400, headers: cors });
      const result = await executePython(body.code, body.timeout || DEFAULT_TIMEOUT);
      return Response.json(result, { headers: cors });
    }

    return new Response('Not Found', { status: 404, headers: cors });
  }
});

console.log(`\x1b[33m🐍 Python Executor running on http://localhost:${PORT}\x1b[0m`);
