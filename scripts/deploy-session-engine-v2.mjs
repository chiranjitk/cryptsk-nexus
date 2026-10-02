#!/usr/bin/env node
/**
 * Push the event-driven session engine to the CORRECT path
 * (mini-services/session-engine/index.ts, not gateway/session-engine/)
 * and restart PM2
 */
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const PROD = { host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 };
const SANDBOX_DIR = '/home/z/my-project';
const PROD_DIR = '/opt/ispplatform';
const FILE = 'mini-services/session-engine/index.ts';

function sshExec(conn, command, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const chunks = [], stderr = [];
    conn.exec(command, (e, stream) => {
      if (e) { reject(e); return; }
      stream.on('data', d => chunks.push(d));
      stream.stderr.on('data', d => stderr.push(d));
      stream.on('close', code => resolve({ stdout: Buffer.concat(chunks).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), code }));
    });
    setTimeout(() => reject(new Error('timeout')), timeout);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((r,j) => conn.on('ready', r).on('error', j).connect(PROD));
  console.log('✓ Connected');

  // Push the file
  const localPath = join(SANDBOX_DIR, FILE);
  const fileContent = readFileSync(localPath);
  const b64 = fileContent.toString('base64');
  const remotePath = `${PROD_DIR}/${FILE}`;
  const ts = Math.floor(Date.now()/1000);

  console.log(`Pushing ${FILE} (${fileContent.length} bytes)...`);
  await sshExec(conn, `cp "${remotePath}" "${remotePath}.bak.${ts}" 2>/dev/null || true`);

  const CHUNK = 60000;
  if (b64.length <= CHUNK) {
    await sshExec(conn, `echo '${b64}' | base64 -d > "${remotePath}"`);
  } else {
    const chunks = [];
    for (let i=0; i<b64.length; i+=CHUNK) chunks.push(b64.slice(i, i+CHUNK));
    await sshExec(conn, `echo '${chunks[0]}' | base64 -d > "${remotePath}"`);
    for (let i=1; i<chunks.length; i++) {
      await sshExec(conn, `echo '${chunks[i]}' | base64 -d >> "${remotePath}"`);
    }
  }
  const verify = await sshExec(conn, `wc -l "${remotePath}"`);
  console.log(`✓ Pushed: ${verify.stdout.trim()}`);

  // Install pg module in mini-services/session-engine if not present
  console.log('\nChecking if pg module is installed...');
  const pgCheck = await sshExec(conn, `ls ${PROD_DIR}/mini-services/session-engine/node_modules/pg/package.json 2>/dev/null && echo "INSTALLED" || echo "NOT_INSTALLED"`);
  if (pgCheck.stdout.includes('NOT_INSTALLED')) {
    console.log('Installing pg module...');
    const install = await sshExec(conn, `cd ${PROD_DIR}/mini-services/session-engine && bun add pg 2>&1 | tail -5`, 60000);
    console.log(install.stdout);
  } else {
    console.log('✓ pg module already installed');
  }

  // Restart PM2
  console.log('\n--- Restarting cryptsk-session-engine ---');
  const restart = await sshExec(conn, `pm2 restart cryptsk-session-engine 2>&1 | tail -5`, 25000);
  console.log(restart.stdout);
  await sshExec(conn, `pm2 save 2>&1 | tail -1`);

  // Wait for startup
  console.log('Waiting 6s for startup...');
  await new Promise(r => setTimeout(r, 6000));

  // Check logs
  console.log('\n--- PM2 logs (last 15 lines) ---');
  const logs = await sshExec(conn, `pm2 logs cryptsk-session-engine --nostream --lines 15 2>&1 | tail -20`);
  console.log(logs.stdout);

  // Health check
  console.log('\n--- Health check ---');
  const http = await sshExec(conn, `curl -s --max-time 5 http://127.0.0.1:3010/api/health 2>&1 | head -c 500`);
  console.log(http.stdout);

  if (http.stdout.includes('LISTEN')) {
    console.log('\n✅ Event-driven session engine deployed!');
    console.log('   PRIMARY: LISTEN/NOTIFY (instant, <1ms trigger)');
    console.log('   FALLBACK: 60s reconciliation');
  } else {
    console.log('\n⚠ Health check incomplete — check logs above');
  }

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
