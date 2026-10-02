#!/usr/bin/env node
/**
 * Find the REAL admin captive portal page (with 7-8 tabs) + read it
 */
import { Client } from 'ssh2';
const STAYSUITE = { host: '103.244.7.218', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 };

function sshExec(conn, command, timeout = 25000) {
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
  console.log('✓ Connected\n');

  // 1. Find ALL wifi management admin pages (the captive page is under "wifi management menu")
  console.log('═══ WiFi management admin pages ═══');
  const wifiPages = await sshExec(conn, `find /opt/staysuite/src -path '*/wifi*' -name 'page.tsx' 2>/dev/null | head -20; echo "---PORTAL---"; find /opt/staysuite/src/app/portal -name 'page.tsx' 2>/dev/null | head -20; echo "---DASHBOARD---"; find /opt/staysuite/src/app/dashboard -name 'page.tsx' 2>/dev/null | head -20`);
  console.log(wifiPages.stdout);

  // 2. Search for files with TabsTrigger (7-8 tabs) related to captive/portal
  console.log('\n═══ Files with multiple TabsTrigger (captive-related) ═══');
  const tabbedFiles = await sshExec(conn, `grep -rl 'TabsTrigger' /opt/staysuite/src 2>/dev/null | xargs grep -l -i 'captive\\|portal\\|splash\\|guest.*wifi\\|wifi.*auth' 2>/dev/null | head -10`);
  console.log(tabbedFiles.stdout);

  // 3. List ALL page.tsx files to find the captive admin page
  console.log('\n═══ All page.tsx files (grep for captive/portal/wifi) ═══');
  const allPages = await sshExec(conn, `find /opt/staysuite/src/app -name 'page.tsx' 2>/dev/null | xargs grep -l -i 'captive\\|portal\\|splash\\|wifi.*management\\|wifi.*config' 2>/dev/null | head -20`);
  console.log(allPages.stdout);

  // 4. Read the captive-redirect mini-service
  console.log('\n═══ captive-redirect mini-service (first 60 lines) ═══');
  const crService = await sshExec(conn, `head -60 /opt/staysuite/mini-services/captive-redirect/index.ts`);
  console.log(crService.stdout);

  // 5. Get the captive tables from DB (using port 6432)
  console.log('\n═══ DB captive tables ═══');
  const dbTables = await sshExec(conn, `cd /opt/staysuite && node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: 'postgresql://staysuite:Staysuite2025@127.0.0.1:6432/staysuite' });
(async () => {
  await c.connect();
  const r = await c.query(\\\"SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename ILIKE '%captive%' OR tablename ILIKE '%portal%' OR tablename ILIKE '%splash%' OR tablename ILIKE '%wifi%' OR tablename ILIKE '%guest%session%' OR tablename ILIKE '%guest%auth%') ORDER BY tablename\\\");
  console.log(JSON.stringify(r.rows.map(x=>x.tablename), null, 2));
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
" 2>&1`, 20000);
  console.log(dbTables.stdout);

  // 6. Check the nav config to find "WiFi Management" menu → captive page
  console.log('\n═══ Nav config (find captive page under WiFi Management) ═══');
  const navConfig = await sshExec(conn, `find /opt/staysuite/src -name '*nav*' -o -name '*menu*' -o -name '*sidebar*' -o -name '*route*' 2>/dev/null | grep -v node_modules | grep -v .next | head -10; echo "---"; grep -r 'captive' /opt/staysuite/src/lib/nav* /opt/staysuite/src/config/* /opt/staysuite/src/contexts/* 2>/dev/null | head -10; echo "---SIDEBAR---"; find /opt/staysuite/src -name '*sidebar*' -o -name '*nav-config*' -o -name '*menu-config*' 2>/dev/null | head -10`);
  console.log(navConfig.stdout);

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
