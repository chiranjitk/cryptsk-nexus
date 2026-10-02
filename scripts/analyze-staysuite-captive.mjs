#!/usr/bin/env node
/**
 * COMPREHENSIVE StaySuite captive portal analysis
 * - Find correct DB URL from .env
 * - Find the REAL captive portal (not dummy /portal/captive)
 * - Find captive-redirect mini-service
 * - Find all captive API routes
 * - Find captive UI tabs (7-8 tabs)
 * - Get DB schema for captive tables
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
  console.log('✓ Connected to StaySuite\n');

  // 1. Get the correct DB URL from .env
  console.log('═══ 1. StaySuite .env (DB URL) ═══');
  const env = await sshExec(conn, `cat /opt/staysuite/.env 2>/dev/null | grep -iE 'DATABASE|POSTGRES|DB_' | head -5`);
  console.log(env.stdout);

  // 2. Find the REAL captive portal UI (excluding dummy /portal/captive)
  console.log('\n═══ 2. Captive portal UI pages (excluding dummy) ═══');
  const uiPages = await sshExec(conn, `find /opt/staysuite/src -type f -iname '*captive*' 2>/dev/null; find /opt/staysuite/src -type d -iname '*captive*' 2>/dev/null; echo "---CONNECT---"; find /opt/staysuite/src -path '*connect*' -type f 2>/dev/null | head -20`);
  console.log(uiPages.stdout);

  // 3. Find captive-redirect mini-service
  console.log('\n═══ 3. captive-redirect mini-service ═══');
  const captiveRedirect = await sshExec(conn, `find /opt/staysuite -type d -name 'captive-redirect' 2>/dev/null | grep -v node_modules | grep -v .next | head -5; echo "---"; find /opt -path '*captive-redirect*' -name '*.ts' -o -path '*captive-redirect*' -name '*.js' 2>/dev/null | grep -v node_modules | grep -v .next | head -10; echo "---PM2---"; pm2 show captive-redirect 2>&1 | grep -E 'script|cwd|exec' | head -5`);
  console.log(captiveRedirect.stdout);

  // 4. Find ALL captive-related API routes (real ones)
  console.log('\n═══ 4. All captive API routes ═══');
  const apiRoutes = await sshExec(conn, `find /opt/staysuite/src/app/api -type f -name 'route.ts' 2>/dev/null | xargs grep -l -i 'captive\\|portal\\|splash\\|guest' 2>/dev/null | head -30; echo "---WIFI-CAPTIVE---"; find /opt/staysuite/src/app/api/wifi -type f 2>/dev/null | head -30; echo "---CAPTIVE-DIR---"; find /opt/staysuite/src/app/api/captive* -type f 2>/dev/null | head -20`);
  console.log(apiRoutes.stdout);

  // 5. Find the captive portal UI page with tabs
  console.log('\n═══ 5. Captive portal UI page (with 7-8 tabs) ═══');
  const captivePage = await sshExec(conn, `find /opt/staysuite/src -path '*wifi*captive*' -o -path '*captive*page*' 2>/dev/null | grep -v node_modules | grep -v .next | head -20; echo "---COMPONENTS---"; find /opt/staysuite/src/components -iname '*captive*' -type f 2>/dev/null | head -20; echo "---PAGES---"; find /opt/staysuite/src/app -iname '*captive*' -type f 2>/dev/null | head -20`);
  console.log(captivePage.stdout);

  // 6. Get DB schema for captive tables (using correct DB URL)
  console.log('\n═══ 6. DB captive tables schema ═══');
  const dbSchema = await sshExec(conn, `cd /opt/staysuite && source .env 2>/dev/null; DB_URL=$(grep DATABASE_URL .env | cut -d= -f2- | tr -d '"'); echo "DB_URL=$DB_URL"; node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: '$DB_URL' });
(async () => {
  await c.connect();
  const r = await c.query(\\\"SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename ILIKE '%captive%' OR tablename ILIKE '%portal%' OR tablename ILIKE '%splash%' OR tablename ILIKE '%guest%' OR tablename ILIKE '%wifi%session%' OR tablename ILIKE '%wifi%voucher%' OR tablename ILIKE '%wifi%auth%') ORDER BY tablename\\\");
  console.log('Tables:', JSON.stringify(r.rows.map(x=>x.tablename)));
  await c.end();
})().catch(e => { console.error('DB ERROR:', e.message); process.exit(1); });
" 2>&1`, 20000);
  console.log(dbSchema.stdout);

  // 7. Check the captive-redirect service code
  console.log('\n═══ 7. captive-redirect service code ═══');
  const crCode = await sshExec(conn, `pm2 show captive-redirect 2>&1 | grep -E 'script path|exec cwd|script args' | head -5; echo "---"; find /opt/staysuite -path '*captive-redirect*' -name 'index.*' 2>/dev/null | grep -v node_modules | head -5; find /opt -path '*captive*redirect*' -name 'index.*' 2>/dev/null | grep -v node_modules | head -5; find /opt/staysuite/mini-services -type f 2>/dev/null | head -20`);
  console.log(crCode.stdout);

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
