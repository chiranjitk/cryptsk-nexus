#!/usr/bin/env node
/**
 * Read the admin captive page + captive-redirect service + API routes
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

  // 1. Read the admin captive page — find tabs
  console.log('═══ Admin captive page — tab structure ═══');
  const captivePage = await sshExec(conn, `grep -n 'TabsTrigger\\|TabsContent\\|TabsList\\|Tabs\\|value=' /opt/staysuite/src/app/portal/captive/page.tsx | head -40`);
  console.log(captivePage.stdout);

  // 2. Page size + line count
  console.log('\n═══ Page size ═══');
  const sizeInfo = await sshExec(conn, `wc -l /opt/staysuite/src/app/portal/captive/page.tsx; echo "---IMPORTS---"; head -30 /opt/staysuite/src/app/portal/captive/page.tsx`);
  console.log(sizeInfo.stdout);

  // 3. Read the captive-redirect mini-service (full)
  console.log('\n═══ captive-redirect service size ═══');
  const crSize = await sshExec(conn, `wc -l /opt/staysuite/mini-services/captive-redirect/index.ts; echo "---PORTS---"; grep -n 'PORT\\|port\\|listen\\|8888\\|8443' /opt/staysuite/mini-services/captive-redirect/index.ts | head -10`);
  console.log(crSize.stdout);

  // 4. List all captive-related API routes
  console.log('\n═══ All captive/wifi API routes (count) ═══');
  const apiCount = await sshExec(conn, `find /opt/staysuite/src/app/api/wifi -name 'route.ts' 2>/dev/null | wc -l; echo "---ALL WIFI ROUTES---"; find /opt/staysuite/src/app/api/wifi -name 'route.ts' 2>/dev/null | sort`);
  console.log(apiCount.stdout);

  // 5. Read the captive auth route
  console.log('\n═══ Captive auth route (first 40 lines) ═══');
  const authRoute = await sshExec(conn, `head -40 /opt/staysuite/src/app/api/wifi/captive/auth/route.ts`);
  console.log(authRoute.stdout);

  // 6. DB schema for CaptivePortal table
  console.log('\n═══ CaptivePortal table schema ═══');
  const schema = await sshExec(conn, `cd /opt/staysuite && node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: 'postgresql://staysuite:Staysuite2025@127.0.0.1:6432/staysuite' });
(async () => {
  await c.connect();
  const r = await c.query(\\\"SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'CaptivePortal' ORDER BY ordinal_position\\\");
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
" 2>&1`, 20000);
  console.log(schema.stdout);

  // 7. Check CRYPTSK's current captive page for comparison
  console.log('\n═══ CRYPTSK current captive page (local) ═══');
  // This is local — not via SSH
  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
