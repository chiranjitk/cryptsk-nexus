#!/usr/bin/env node
/**
 * E2E test step 2 — verify triggers, LISTEN connection, and find FreeRADIUS ports
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
  console.log('✓ Connected\n');

  // 1. Check FreeRADIUS process + actual ports
  console.log('═══ FreeRADIUS process ═══');
  const frProc = await sshExec(conn, `ps aux | grep -i freeradius | grep -v grep | head -5`);
  console.log(frProc.stdout);

  console.log('═══ All listening ports (UDP) ═══');
  const udpPorts = await sshExec(conn, `ss -ulnp | head -20`);
  console.log(udpPorts.stdout);

  // 2. Check SQL triggers exist on radacct
  console.log('═══ SQL Triggers on radacct ═══');
  const triggers = await sshExec(conn, `cd /opt/ispplatform && node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus' });
(async () => {
  await c.connect();
  const r = await c.query(\\\"SELECT tgname, tgtype FROM pg_trigger WHERE tgrelid = 'radacct'::regclass AND NOT tgisinternal ORDER BY tgname\\\");
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
" 2>&1`);
  console.log(triggers.stdout);

  // 3. Check radacct existing sessions
  console.log('═══ radacct active sessions ═══');
  const radacct = await sshExec(conn, `cd /opt/ispplatform && node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus' });
(async () => {
  await c.connect();
  const r = await c.query(\\\"SELECT radacctid, acctsessionid, username, framedipaddress, nasipaddress, acctstarttime, acctstoptime FROM radacct ORDER BY acctstarttime DESC LIMIT 5\\\");
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
" 2>&1`);
  console.log(radacct.stdout);

  // 4. Test pg_notify manually — send a test notification and check if Session Engine receives it
  console.log('═══ Manual NOTIFY test ═══');
  const notifyTest = await sshExec(conn, `cd /opt/ispplatform && node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus' });
(async () => {
  await c.connect();
  await c.query(\\\"SELECT pg_notify('session_start', '{\\\\\"acctsessionid\\\\\":\\\\\"test-notify-001\\\\\",\\\\\"username\\\\\":\\\\\"test-notify-user\\\\\",\\\\\"framedipaddress\\\\\":\\\\\"10.0.99.99\\\\\",\\\\\"nasipaddress\\\\\":\\\\\"127.0.0.1\\\\\",\\\\\"callingstationid\\\\\":\\\\\"TEST\\\\\",\\\\\"acctstarttime\\\\\":\\\\\"2026-10-01T20:00:00Z\\\\\"}')\\\");
  console.log('NOTIFY sent');
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
" 2>&1`);
  console.log(notifyTest.stdout);

  // Wait 2s for Session Engine to process
  console.log('Waiting 2s for Session Engine to process...');
  await new Promise(r => setTimeout(r, 2000));

  // 5. Check Session Engine stats AFTER the notify
  console.log('\n═══ Session Engine stats AFTER ═══');
  const statsAfter = await sshExec(conn, `curl -s --max-time 5 http://127.0.0.1:3010/api/events/stats 2>&1`);
  console.log(statsAfter.stdout);

  // 6. Check Session Engine logs for the test event
  console.log('═══ Session Engine logs (last 10) ═══');
  const logs = await sshExec(conn, `pm2 logs cryptsk-session-engine --nostream --lines 10 2>&1 | tail -15`);
  console.log(logs.stdout);

  // 7. Find FreeRADIUS shared secret
  console.log('═══ FreeRADIUS shared secret ═══');
  const secret = await sshExec(conn, `grep -A 5 'client localhost' /etc/freeradius/clients.conf 2>/dev/null || grep -A 5 'client localhost' /etc/raddb/clients.conf 2>/dev/null || find / -name clients.conf 2>/dev/null | head -3`);
  console.log(secret.stdout);

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
