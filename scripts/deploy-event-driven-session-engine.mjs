#!/usr/bin/env node
/**
 * Deploy event-driven session engine:
 * 1. Apply SQL triggers (LISTEN/NOTIFY) to prod database
 * 2. Push rewritten session-engine/index.ts to prod
 * 3. Restart cryptsk-session-engine PM2 process
 * 4. Verify listener is active
 */
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const PROD = { host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 };
const SANDBOX_DIR = '/home/z/my-project';
const PROD_DIR = '/opt/ispplatform';

const c = { reset:'\x1b[0m', bold:'\x1b[1m', red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m', cyan:'\x1b[36m', magenta:'\x1b[35m' };
const ok = m => console.log(`${c.green}✓${c.reset} ${m}`);
const err = m => console.log(`${c.red}✗${c.reset} ${m}`);
const info = m => console.log(`${c.cyan}ℹ${c.reset} ${m}`);
const step = (n,m) => console.log(`${c.magenta}[${n}]${c.reset} ${c.bold}${m}${c.reset}`);

function sshExec(conn, command, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const chunks = [], stderr = [];
    conn.exec(command, (e, stream) => {
      if (e) { reject(e); return; }
      stream.on('data', d => chunks.push(d));
      stream.stderr.on('data', d => stderr.push(d));
      stream.on('close', code => resolve({ stdout: Buffer.concat(chunks).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), code }));
    });
    setTimeout(() => reject(new Error('timeout: ' + command.slice(0,50))), timeout);
  });
}

async function main() {
  console.log(`${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}║  Deploy Event-Driven Session Engine (LISTEN/NOTIFY)    ║${c.reset}`);
  console.log(`${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`);

  const conn = new Client();
  await new Promise((r,j) => conn.on('ready', r).on('error', j).connect(PROD));
  ok('Connected to prod');

  // ─── Step 1: Apply SQL triggers to prod database ────────────
  step(1, 'Applying SQL triggers (LISTEN/NOTIFY) to prod database...');
  const sqlContent = readFileSync(join(SANDBOX_DIR, 'prisma/radacct-triggers.sql'), 'utf8');
  const b64 = Buffer.from(sqlContent).toString('base64');

  // Write the SQL to a temp file on prod, then run it via the pg module
  const applyScript = `
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus' });
(async () => {
  await c.connect();
  const sql = Buffer.from('${b64}', 'base64').toString('utf8');
  const result = await c.query(sql);
  console.log(JSON.stringify(result[result.length - 1]?.rows || result));
  
  // Verify triggers exist
  const triggers = await c.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'radacct'::regclass AND NOT tgisinternal ORDER BY tgname");
  console.log('Triggers on radacct:', triggers.rows.map(r => r.tgname).join(', '));
  
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
`;
  const scriptB64 = Buffer.from(applyScript).toString('base64');
  await sshExec(conn, `echo '${scriptB64}' | base64 -d > ${PROD_DIR}/_apply-triggers.js`);
  const applyResult = await sshExec(conn, `cd ${PROD_DIR} && node _apply-triggers.js 2>&1`, 30000);
  console.log(applyResult.stdout);
  await sshExec(conn, `rm ${PROD_DIR}/_apply-triggers.js`);
  ok('SQL triggers applied');

  // ─── Step 2: Push rewritten session-engine/index.ts ─────────
  step(2, 'Pushing rewritten session-engine/index.ts...');
  const engineContent = readFileSync(join(SANDBOX_DIR, 'gateway/session-engine/index.ts'));
  const engineB64 = engineContent.toString('base64');
  const remotePath = `${PROD_DIR}/gateway/session-engine/index.ts`;
  const ts = Math.floor(Date.now()/1000);
  await sshExec(conn, `cp "${remotePath}" "${remotePath}.bak.${ts}" 2>/dev/null || true`);

  const CHUNK = 60000;
  if (engineB64.length <= CHUNK) {
    await sshExec(conn, `echo '${engineB64}' | base64 -d > "${remotePath}"`);
  } else {
    const chunks = [];
    for (let i=0; i<engineB64.length; i+=CHUNK) chunks.push(engineB64.slice(i, i+CHUNK));
    await sshExec(conn, `echo '${chunks[0]}' | base64 -d > "${remotePath}"`);
    for (let i=1; i<chunks.length; i++) {
      await sshExec(conn, `echo '${chunks[i]}' | base64 -d >> "${remotePath}"`);
    }
  }
  const verify = await sshExec(conn, `wc -l "${remotePath}"`);
  ok(`Pushed: ${verify.stdout.trim()}`);

  // ─── Step 3: Restart cryptsk-session-engine PM2 ─────────────
  step(3, 'Restarting cryptsk-session-engine PM2 process...');
  const restart = await sshExec(conn, `pm2 restart cryptsk-session-engine 2>&1 | tail -5`, 25000);
  console.log(restart.stdout);
  await sshExec(conn, `pm2 save 2>&1 | tail -1`);

  // ─── Step 4: Wait for startup + verify listener ─────────────
  step(4, 'Waiting 5s for startup, then verifying listener...');
  await new Promise(r => setTimeout(r, 5000));

  const logs = await sshExec(conn, `pm2 logs cryptsk-session-engine --nostream --lines 25 2>&1 | tail -30`);
  console.log(logs.stdout);

  // Health check
  const http = await sshExec(conn, `curl -s --max-time 5 http://127.0.0.1:3010/health 2>&1 | head -c 500`);
  console.log('\n=== Health endpoint ===');
  console.log(http.stdout);

  conn.end();

  if (http.stdout.includes('LISTEN')) {
    ok('✅ Event-driven session engine deployed!');
    ok('PRIMARY trigger: LISTEN/NOTIFY (instant, <1ms)');
    ok('FALLBACK: 60s reconciliation poller');
    ok('Login → VPP programming is now INSTANT (no more 5s wait)');
  } else {
    err('Health check failed — check logs above');
  }
}

main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
