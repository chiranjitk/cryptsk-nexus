#!/usr/bin/env node
/**
 * Explore StaySuite codebase — find captive portal engine structure
 */
import { Client } from 'ssh2';
const STAYSUITE = { host: '103.244.7.218', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 };

function sshExec(conn, command, timeout = 20000) {
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
  await new Promise((r,j) => conn.on('ready', r).on('error', j).connect(STAYSUITE));
  console.log('✓ Connected to StaySuite\n');

  // 1. Explore /opt/staysuite structure
  console.log('=== /opt/staysuite structure ===');
  const root = await sshExec(conn, `ls -la /opt/staysuite/ 2>/dev/null | head -20`);
  console.log(root.stdout);

  // 2. Find the frontend framework
  console.log('=== Framework detection ===');
  const framework = await sshExec(conn, `ls /opt/staysuite/package.json 2>/dev/null && head -5 /opt/staysuite/package.json; echo "---"; ls /opt/staysuite/next.config.* 2>/dev/null; ls /opt/staysuite/src/ 2>/dev/null | head -10; ls /opt/staysuite/app/ 2>/dev/null | head -10`);
  console.log(framework.stdout);

  // 3. Find captive portal related files
  console.log('=== Captive portal files ===');
  const captive = await sshExec(conn, `find /opt/staysuite -type f -iname '*captive*' 2>/dev/null | grep -v node_modules | grep -v .next | head -30`);
  console.log(captive.stdout);

  // 4. Find captive portal UI components/pages
  console.log('=== Captive portal UI pages ===');
  const uiPages = await sshExec(conn, `find /opt/staysuite/src /opt/staysuite/app -type f -iname '*captive*' 2>/dev/null | head -30; find /opt/staysuite -path '*/components/*captive*' -o -path '*/pages/*captive*' 2>/dev/null | head -30`);
  console.log(uiPages.stdout);

  // 5. Find captive portal API routes
  console.log('=== Captive portal API routes ===');
  const apiRoutes = await sshExec(conn, `find /opt/staysuite -path '*/api/*captive*' -type f 2>/dev/null | head -30`);
  console.log(apiRoutes.stdout);

  // 6. Check the DB schema for captive portal tables
  console.log('=== DB: captive-related tables ===');
  const dbCheck = await sshExec(conn, `cd /opt/staysuite && node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://cryptsk:Cryptsk2026@127.0.0.1:5432/staysuite' });
(async () => {
  await c.connect();
  const r = await c.query(\\\"SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename ILIKE '%captive%' OR tablename ILIKE '%portal%' OR tablename ILIKE '%splash%' OR tablename ILIKE '%voucher%' OR tablename ILIKE '%guest%' OR tablename ILIKE '%session%') ORDER BY tablename\\\");
  console.log(JSON.stringify(r.rows.map(x=>x.tablename), null, 2));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
" 2>&1`, 20000);
  console.log(dbCheck.stdout);

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
