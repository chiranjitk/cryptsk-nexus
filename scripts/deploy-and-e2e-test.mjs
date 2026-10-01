#!/usr/bin/env node
/**
 * Push fixed session engine + E2E test script, restart, run test
 */
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const PROD = { host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 };
const SANDBOX_DIR = '/home/z/my-project';
const PROD_DIR = '/opt/ispplatform';

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

async function pushFile(conn, localPath, remotePath) {
  const content = readFileSync(localPath);
  const b64 = content.toString('base64');
  const ts = Math.floor(Date.now()/1000);
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
  return verify.stdout.trim();
}

async function main() {
  const conn = new Client();
  await new Promise((r,j) => conn.on('ready', r).on('error', j).connect(PROD));
  console.log('✓ Connected');

  // Push fixed session engine
  console.log('\n--- Pushing fixed session-engine/index.ts ---');
  const engineInfo = await pushFile(conn, 
    join(SANDBOX_DIR, 'mini-services/session-engine/index.ts'),
    `${PROD_DIR}/mini-services/session-engine/index.ts`);
  console.log(`✓ Pushed: ${engineInfo}`);

  // Push E2E test script
  console.log('\n--- Pushing E2E test script ---');
  const testInfo = await pushFile(conn,
    join(SANDBOX_DIR, 'scripts/e2e-test.js'),
    `${PROD_DIR}/_e2e-test.js`);
  console.log(`✓ Pushed: ${testInfo}`);

  // Restart session engine
  console.log('\n--- Restarting cryptsk-session-engine ---');
  const restart = await sshExec(conn, `pm2 restart cryptsk-session-engine 2>&1 | tail -3`, 25000);
  console.log(restart.stdout);
  await sshExec(conn, `pm2 save 2>&1 | tail -1`);

  console.log('Waiting 6s for startup...');
  await new Promise(r => setTimeout(r, 6000));

  // Run the E2E test
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RUNNING E2E LOGIN TEST');
  console.log('═══════════════════════════════════════════════════\n');
  const testResult = await sshExec(conn, `cd ${PROD_DIR} && node _e2e-test.js 2>&1`, 60000);
  console.log(testResult.stdout);

  // Cleanup test script
  await sshExec(conn, `rm ${PROD_DIR}/_e2e-test.js`);

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
