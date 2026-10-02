#!/usr/bin/env node
/**
 * Push captive portal bundle to prod + build + restart
 * 1. Upload tar bundle via SSH (base64 chunks)
 * 2. Extract on prod
 * 3. Run build in background
 * 4. Poll for completion
 * 5. Restart PM2
 */
import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const PROD = { host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 30000 };
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
    setTimeout(() => reject(new Error('timeout')), timeout);
  });
}

async function main() {
  console.log(`${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}║  Deploy Captive Portal Engine (97 files, 300KB)        ║${c.reset}`);
  console.log(`${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`);

  const conn = new Client();
  await new Promise((r,j) => conn.on('ready', r).on('error', j).connect(PROD));
  ok('Connected to prod');

  // Step 1: Upload tar bundle via base64 chunks
  step(1, 'Uploading captive portal bundle (300KB, 97 files)...');
  const bundle = readFileSync('/tmp/captive-portal-bundle.tar.gz');
  const b64 = bundle.toString('base64');
  const CHUNK = 50000;
  const chunks = [];
  for (let i=0; i<b64.length; i+=CHUNK) chunks.push(b64.slice(i, i+CHUNK));
  info(`  Uploading in ${chunks.length} chunks...`);
  for (let i=0; i<chunks.length; i++) {
    if (i === 0) {
      await sshExec(conn, `echo '${chunks[0]}' | base64 -d > /tmp/captive-portal-bundle.tar.gz`);
    } else {
      await sshExec(conn, `echo '${chunks[i]}' | base64 -d >> /tmp/captive-portal-bundle.tar.gz`);
    }
  }
  const verify = await sshExec(conn, `ls -la /tmp/captive-portal-bundle.tar.gz`);
  ok(`Bundle uploaded: ${verify.stdout.trim()}`);

  // Step 2: Extract on prod (backup existing files first)
  step(2, 'Extracting bundle on prod...');
  const ts = Math.floor(Date.now()/1000);
  await sshExec(conn, `cd ${PROD_DIR} && tar xzf /tmp/captive-portal-bundle.tar.gz 2>&1 | tail -5`);
  ok('Bundle extracted');

  // Step 3: Install pg in captive-redirect if not present
  step(3, 'Checking captive-redirect dependencies...');
  const pgCheck = await sshExec(conn, `ls ${PROD_DIR}/mini-services/captive-redirect/node_modules/pg/package.json 2>/dev/null && echo "INSTALLED" || echo "NOT_INSTALLED"`);
  if (pgCheck.stdout.includes('NOT_INSTALLED')) {
    info('Installing pg module for captive-redirect...');
    const install = await sshExec(conn, `cd ${PROD_DIR}/mini-services/captive-redirect && bun add pg 2>&1 | tail -3`, 60000);
    console.log(install.stdout);
  } else {
    ok('pg module already installed');
  }

  // Step 4: Kill stuck build + clean .next
  step(4, 'Killing stuck build + wiping .next/');
  await sshExec(conn, `cd ${PROD_DIR} && pkill -KILL -f 'next build' 2>/dev/null; pkill -KILL -f 'webpack' 2>/dev/null; rm -rf .next && echo cleaned`);
  ok('.next/ wiped');

  // Step 5: Start build in background
  step(5, 'Starting build in background (detached)...');
  const startBuild = await sshExec(conn,
    `cd ${PROD_DIR} && (nohup bun run build </dev/null >/tmp/build.log 2>&1 & disown) && sleep 1 && echo "BUILD_LAUNCHED"`,
    20000);
  if (startBuild.stdout.includes('BUILD_LAUNCHED')) {
    ok('Build launched in background');
  } else {
    err(`Build launch issue: ${startBuild.stdout}`);
  }
  info('Build log: /tmp/build.log (takes ~5-25 min)');

  conn.end();
  ok('Disconnected — build continues in background');

  // Step 6: Poll
  step(6, 'Polling every 30s (max 30 min)...');
  const startTime = Date.now();
  const maxWait = 30 * 60 * 1000;

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, 30000));
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    const pollConn = new Client();
    try {
      await new Promise((r,j) => pollConn.on('ready', r).on('error', j).connect(PROD));
    } catch (e) {
      info(`  [${elapsed}s] reconnect failed, retrying...`);
      continue;
    }

    try {
      const ps = await sshExec(pollConn, `pgrep -f 'next build' >/dev/null 2>&1 && echo "RUNNING" || echo "DONE"`, 10000);
      pollConn.end();

      if (ps.stdout.includes('DONE')) {
        ok(`[${elapsed}s] Build finished!`);
        const checkConn = new Client();
        await new Promise((r,j) => checkConn.on('ready', r).on('error', j).connect(PROD));

        // Show last 20 lines of build log
        const logTail = await sshExec(checkConn, `tail -25 /tmp/build.log`);
        console.log(`\n─── BUILD LOG (last 25 lines) ───`);
        console.log(logTail.stdout);

        // Check for success/failure
        const success = logTail.stdout.includes('ƒ  (Dynamic)') || logTail.stdout.includes('○  (Static)');
        const failed = logTail.stdout.includes('Build failed') || logTail.stdout.includes('error: script');

        // Verify artifacts
        const verify = await sshExec(checkConn, `cd ${PROD_DIR} && ls -la .next/standalone/server.js 2>/dev/null && stat -c '%y' .next/standalone/server.js 2>/dev/null && echo "ARTIFACTS_OK" || echo "NO_ARTIFACTS"`);

        if (verify.stdout.includes('ARTIFACTS_OK')) {
          ok('Build artifacts verified!');
        } else {
          err('Build artifacts missing — build may have failed');
        }

        // Restart PM2 regardless (to load whatever built)
        step(7, 'Restarting PM2 processes...');
        const restart = await sshExec(checkConn, `pm2 restart cryptsk-nextjs 2>&1 | tail -3`, 25000);
        console.log(restart.stdout);

        // Also start captive-redirect if not running
        const crStatus = await sshExec(checkConn, `pm2 list 2>&1 | grep captive-redirect || echo "NOT_IN_PM2"`);
        if (crStatus.stdout.includes('NOT_IN_PM2')) {
          info('Starting captive-redirect service...');
          const crStart = await sshExec(checkConn, `cd ${PROD_DIR} && pm2 start mini-services/captive-redirect/index.ts --name cryptsk-captive-redirect --interpreter bun 2>&1 | tail -3`, 25000);
          console.log(crStart.stdout);
        } else {
          const crRestart = await sshExec(checkConn, `pm2 restart cryptsk-captive-redirect 2>&1 | tail -3`, 25000);
          ok('captive-redirect restarted');
        }
        await sshExec(checkConn, `pm2 save 2>&1 | tail -1`);

        info('Waiting 12s for app to start...');
        await new Promise(r => setTimeout(r, 12000));

        // HTTP check
        const http = await sshExec(checkConn, `curl -s -o /dev/null -w "HTTP %{http_code} (%{time_total}s)\\n" --max-time 8 http://127.0.0.1:3000/ 2>&1`);
        console.log(`\nHTTP: ${http.stdout.trim()}`);

        if (http.stdout.includes('HTTP 200')) {
          ok('✅ Production live with captive portal engine!');
        } else {
          err('HTTP check failed — checking PM2 logs:');
          const logs = await sshExec(checkConn, `pm2 logs cryptsk-nextjs --nostream --lines 20 2>&1 | tail -25`);
          console.log(logs.stdout);
        }

        checkConn.end();
        return;
      } else {
        // Show progress
        const logConn = new Client();
        try {
          await new Promise((r,j) => logConn.on('ready', r).on('error', j).connect(PROD));
          const tail = await sshExec(logConn, `tail -1 /tmp/build.log 2>/dev/null`, 10000);
          const line = tail.stdout.trim().slice(0, 90);
          if (line) info(`  [${elapsed}s] ${line}`);
          logConn.end();
        } catch (e) {
          info(`  [${elapsed}s] (polling)`);
        }
      }
    } catch (e) {
      info(`  [${elapsed}s] poll error: ${e.message}`);
      try { pollConn.end(); } catch {}
    }
  }
  err('Build did not complete within 30 min');
}

main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
