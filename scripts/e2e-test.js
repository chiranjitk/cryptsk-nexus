/**
 * E2E Login Test Script — runs ON PROD
 * Tests the full flow: RADIUS auth → radacct INSERT → LISTEN/NOTIFY → VPP
 *
 * Usage (on prod): node /opt/ispplatform/_e2e-test.js
 */
const pg = require('pg');
const { execSync } = require('child_process');

const DB_URL = 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus';
const RADIUS_SECRET = 'testing123';
const RADIUS_HOST = '127.0.0.1';
const RADIUS_AUTH_PORT = '1812';
const RADIUS_ACCT_PORT = '1813';

// Test subscriber — use the first one from radcheck
const TEST_USER = 'rajesh.kumar';
const TEST_SESSION_ID = `e2e-test-${Date.now()}`;
const TEST_FRAMED_IP = '10.0.200.99';
const TEST_NAS_IP = '127.0.0.1';
const TEST_MAC = 'E2:E2:E2:E2:E2:E2';

async function main() {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();

  console.log('══════════════════════════════════════════════════');
  console.log('  E2E LOGIN TEST — Full Flow Verification');
  console.log('══════════════════════════════════════════════════\n');

  // ── Step 0: Get Session Engine stats BEFORE ─────────────────
  console.log('▸ Step 0: Session Engine event stats BEFORE');
  const statsBefore = JSON.parse(await curl('http://127.0.0.1:3010/api/events/stats'));
  console.log(`  notificationsReceived: ${statsBefore.eventStats.notificationsReceived}`);
  console.log(`  vppProgrammed: ${statsBefore.eventStats.vppProgrammed}`);
  console.log(`  vppEpoch: ${statsBefore.vppEpoch}\n`);

  // ── Step 1: Get test user password from radcheck ────────────
  console.log('▸ Step 1: Get test user credentials');
  const userResult = await c.query(
    "SELECT username, value as password FROM radcheck WHERE attribute = 'Cleartext-Password' AND username = $1 LIMIT 1",
    [TEST_USER]
  );
  if (userResult.rows.length === 0) {
    console.error(`✗ User ${TEST_USER} not found in radcheck`);
    process.exit(1);
  }
  const password = userResult.rows[0].password;
  console.log(`  User: ${TEST_USER}, Password: ${password.substring(0, 3)}***\n`);

  // ── Step 2: Send RADIUS Access-Request ──────────────────────
  console.log('▸ Step 2: Send RADIUS Access-Request');
  const authCmd = `echo "User-Name = \\"${TEST_USER}\\", User-Password = \\"${password}\\", NAS-IP-Address = ${TEST_NAS_IP}, NAS-Port = 0, Service-Type = Framed-User, Framed-Protocol = PPP" | radclient -x ${RADIUS_HOST}:${RADIUS_AUTH_PORT} auth ${RADIUS_SECRET} 2>&1`;
  console.log(`  Command: radclient auth`);
  try {
    const authResult = execSync(authCmd, { encoding: 'utf8', timeout: 10000 });
    const accepted = authResult.includes('Access-Accept');
    console.log(`  Result: ${accepted ? '✓ Access-Accept' : '✗ Access-Reject'}`);
    if (!accepted) {
      console.log(`  Full output:\n${authResult}`);
      // Continue anyway — we can test the accounting flow even if auth fails
    }
  } catch (err) {
    console.log(`  radclient error: ${err.message}`);
    console.log('  Continuing with accounting test...');
  }
  console.log('');

  // ── Step 3: Send Accounting-Start (INSERT into radacct) ─────
  console.log('▸ Step 3: Send Accounting-Start (triggers pg_notify)');
  const startCmd = `echo "User-Name = \\"${TEST_USER}\\", Acct-Status-Type = Start, Acct-Session-Id = \\"${TEST_SESSION_ID}\\", NAS-IP-Address = ${TEST_NAS_IP}, NAS-Port = 0, Framed-IP-Address = ${TEST_FRAMED_IP}, Calling-Station-Id = ${TEST_MAC}, Acct-Session-Time = 0" | radclient -x ${RADIUS_HOST}:${RADIUS_ACCT_PORT} acct ${RADIUS_SECRET} 2>&1`;
  try {
    const startResult = execSync(startCmd, { encoding: 'utf8', timeout: 10000 });
    const accounted = startResult.includes('Accounting-Response');
    console.log(`  Result: ${accounted ? '✓ Accounting-Response received' : '✗ No response'}`);
    if (!accounted) console.log(`  Output: ${startResult}`);
  } catch (err) {
    console.log(`  radclient error: ${err.message}`);
  }
  console.log('');

  // ── Step 4: Verify radacct INSERT happened ──────────────────
  console.log('▸ Step 4: Verify radacct INSERT');
  await sleep(500); // Give FreeRADIUS SQL module time to write
  const radacctResult = await c.query(
    'SELECT radacctid, acctsessionid, username, framedipaddress, acctstoptime FROM radacct WHERE acctsessionid = $1',
    [TEST_SESSION_ID]
  );
  if (radacctResult.rows.length > 0) {
    const row = radacctResult.rows[0];
    console.log(`  ✓ radacct row inserted: radacctid=${row.radacctid}, ip=${row.framedipaddress}, stop=${row.acctstoptime}`);
  } else {
    console.log(`  ✗ radacct row NOT found for session ${TEST_SESSION_ID}`);
    console.log('  (FreeRADIUS SQL module may not be writing to radacct)');
  }
  console.log('');

  // ── Step 5: Wait for LISTEN/NOTIFY to fire + Session Engine to process ──
  console.log('▸ Step 5: Waiting 2s for LISTEN/NOTIFY → Session Engine → VPP');
  await sleep(2000);

  // ── Step 6: Check Session Engine stats AFTER ────────────────
  console.log('▸ Step 6: Session Engine event stats AFTER');
  const statsAfter = JSON.parse(await curl('http://127.0.0.1:3010/api/events/stats'));
  const notifDelta = statsAfter.eventStats.notificationsReceived - statsBefore.eventStats.notificationsReceived;
  const vppDelta = statsAfter.eventStats.vppProgrammed - statsBefore.eventStats.vppProgrammed;
  console.log(`  notificationsReceived: ${statsBefore.eventStats.notificationsReceived} → ${statsAfter.eventStats.notificationsReceived} (Δ=${notifDelta})`);
  console.log(`  sessionStartEvents: ${statsAfter.eventStats.sessionStartEvents}`);
  console.log(`  vppProgrammed: ${statsBefore.eventStats.vppProgrammed} → ${statsAfter.eventStats.vppProgrammed} (Δ=${vppDelta})`);
  console.log(`  lastEventAt: ${statsAfter.eventStats.lastEventAt ? new Date(statsAfter.eventStats.lastEventAt).toISOString() : 'never'}`);

  if (notifDelta > 0) {
    console.log(`\n  ✅ LISTEN/NOTIFY WORKING! Session Engine received ${notifDelta} notification(s)`);
  } else {
    console.log(`\n  ⚠ LISTEN/NOTIFY not received — checking reconciliation fallback...`);
  }
  if (vppDelta > 0) {
    console.log(`  ✅ VPP programming happened (${vppDelta} call(s))`);
  }
  console.log('');

  // ── Step 7: Check Session Engine logs for the test session ──
  console.log('▸ Step 7: Check PM2 logs for test session');
  try {
    const logs = execSync(`pm2 logs cryptsk-session-engine --nostream --lines 15 2>&1 | grep -iE '${TEST_USER}|e2e-test|session_start|VPP|reconcile' | tail -10`, { encoding: 'utf8', timeout: 10000 });
    console.log(logs || '  (no matching log entries)');
  } catch (e) {
    console.log('  (could not read logs)');
  }
  console.log('');

  // ── Step 8: Check Active Sessions API (UI data source) ──────
  console.log('▸ Step 8: Check Active Sessions API (what the UI reads)');
  try {
    const apiResult = JSON.parse(await curl(`http://127.0.0.1:3000/api/aaa/active-sessions?search=${TEST_FRAMED_IP}`));
    if (apiResult.sessions && apiResult.sessions.length > 0) {
      const s = apiResult.sessions[0];
      console.log(`  ✓ Session appears in Active Sessions API:`);
      console.log(`    Username: ${s.username}`);
      console.log(`    IP: ${s.framedIpAddress}`);
      console.log(`    Plan: ${s.planName || 'unknown'}`);
      console.log(`    Start: ${s.startTime}`);
    } else if (apiResult.data && apiResult.data.length > 0) {
      const s = apiResult.data[0];
      console.log(`  ✓ Session appears in Active Sessions API:`);
      console.log(`    Username: ${s.username}`);
    } else {
      console.log(`  ✗ Session NOT found in Active Sessions API`);
      console.log(`  API response: ${JSON.stringify(apiResult).substring(0, 200)}`);
    }
  } catch (e) {
    console.log(`  API check error: ${e.message}`);
  }
  console.log('');

  // ── Step 9: Cleanup — Send Accounting-Stop ──────────────────
  console.log('▸ Step 9: Send Accounting-Stop (cleanup)');
  const stopCmd = `echo "User-Name = \\"${TEST_USER}\\", Acct-Status-Type = Stop, Acct-Session-Id = \\"${TEST_SESSION_ID}\\", NAS-IP-Address = ${TEST_NAS_IP}, NAS-Port = 0, Framed-IP-Address = ${TEST_FRAMED_IP}, Acct-Session-Time = 30, Acct-Input-Octets = 1000, Acct-Output-Octets = 2000" | radclient -x ${RADIUS_HOST}:${RADIUS_ACCT_PORT} acct ${RADIUS_SECRET} 2>&1`;
  try {
    const stopResult = execSync(stopCmd, { encoding: 'utf8', timeout: 10000 });
    console.log(`  Result: ${stopResult.includes('Accounting-Response') ? '✓ Accounting-Response' : '✗ No response'}`);
  } catch (err) {
    console.log(`  radclient error: ${err.message}`);
  }

  // ── Step 10: Verify cleanup ─────────────────────────────────
  await sleep(2000);
  console.log('\n▸ Step 10: Verify cleanup (session stopped in radacct)');
  const stoppedResult = await c.query(
    'SELECT acctstoptime FROM radacct WHERE acctsessionid = $1',
    [TEST_SESSION_ID]
  );
  if (stoppedResult.rows.length > 0 && stoppedResult.rows[0].acctstoptime) {
    console.log(`  ✓ Session stopped: acctstoptime = ${stoppedResult.rows[0].acctstoptime}`);
  } else {
    console.log(`  ⚠ Session still active or not found — manually cleaning up`);
    // Manual cleanup: DELETE the test row
    await c.query('DELETE FROM radacct WHERE acctsessionid = $1', [TEST_SESSION_ID]);
    console.log(`  ✓ Test row manually deleted`);
  }

  // Final stats
  console.log('\n▸ Final Session Engine stats');
  const statsFinal = JSON.parse(await curl('http://127.0.0.1:3010/api/events/stats'));
  console.log(`  Total notifications: ${statsFinal.eventStats.notificationsReceived}`);
  console.log(`  Total VPP programmed: ${statsFinal.eventStats.vppProgrammed}`);
  console.log(`  Total VPP cleaned: ${statsFinal.eventStats.vppCleaned}`);

  console.log('\n══════════════════════════════════════════════════');
  console.log('  E2E Test Complete');
  console.log('══════════════════════════════════════════════════');

  await c.end();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function curl(url) {
  const { execSync } = require('child_process');
  return execSync(`curl -s --max-time 5 "${url}"`, { encoding: 'utf8', timeout: 10000 });
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
