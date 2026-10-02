#!/usr/bin/env node
/**
 * E2E Login Test — Full flow verification:
 * 1. Check FreeRADIUS is running + find shared secret
 * 2. Send Access-Request (authenticate a test subscriber)
 * 3. Send Accounting-Start (INSERT into radacct)
 * 4. Verify LISTEN/NOTIFY fired (Session Engine received event)
 * 5. Verify VPP adapter was called (check logs)
 * 6. Verify session appears in Active Sessions API
 * 7. Send Accounting-Stop (cleanup)
 * 8. Verify VPP cleanup happened
 */
import { Client } from 'ssh2';
const PROD = { host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 };

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
  console.log('✓ Connected to prod\n');

  // ─── Step 1: Check FreeRADIUS + find shared secret ──────────
  console.log('═══ Step 1: Check FreeRADIUS setup ═══');

  // Check if FreeRADIUS is running
  const frRunning = await sshExec(conn, `systemctl is-active freeradius 2>/dev/null || systemctl is-active radiusd 2>/dev/null || pgrep -x freeradius > /dev/null && echo "RUNNING" || echo "NOT_RUNNING"`);
  console.log('FreeRADIUS:', frRunning.stdout.trim());

  // Find the shared secret (clients.conf)
  const secret = await sshExec(conn, `grep -r 'secret' /etc/freeradius/clients.conf 2>/dev/null | head -3; grep -r 'secret' /etc/raddb/clients.conf 2>/dev/null | head -3; find /opt -name clients.conf 2>/dev/null | head -3`);
  console.log('Clients config:', secret.stdout.trim());

  // Find FreeRADIUS auth port (usually 1812)
  const ports = await sshExec(conn, `ss -tlnp | grep -E ':(1812|1813|3799)' 2>/dev/null`);
  console.log('RADIUS ports:', ports.stdout.trim() || '(none found)');

  // Find a test subscriber (from radcheck)
  const testUser = await sshExec(conn, `cd /opt/ispplatform && node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus' });
(async () => {
  await c.connect();
  const r = await c.query(\"SELECT username, value as password FROM radcheck WHERE attribute = 'Cleartext-Password' LIMIT 1\");
  if (r.rows.length > 0) {
    console.log(JSON.stringify(r.rows[0]));
  } else {
    console.log('NO_USER_FOUND');
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
" 2>&1`);
  console.log('Test subscriber:', testUser.stdout.trim());

  // Check if radclient is available
  const radclient = await sshExec(conn, `which radclient 2>/dev/null || which radtest 2>/dev/null || find /opt -name radclient 2>/dev/null | head -1`);
  console.log('radclient:', radclient.stdout.trim() || 'NOT FOUND');

  // ─── Step 2: Get Session Engine event stats BEFORE test ─────
  console.log('\n═══ Step 2: Session Engine event stats (BEFORE) ═══');
  const statsBefore = await sshExec(conn, `curl -s --max-time 5 http://127.0.0.1:3010/api/events/stats 2>&1`);
  console.log('Before:', statsBefore.stdout.trim());

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
