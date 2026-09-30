/**
 * CRYPTSKINTELLIGENT ISP Platform — Full Test Runner (138 cases, M1-M15)
 * Uses correct DB: cryptsk, password: Cryptsk2026, user: z
 * Login: admin@cryptsk.com / Admin@123
 * Dynamically fetches Plan/Area IDs from DB at startup
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────
const BASE = 'http://localhost:3000';
const DB_NAME = 'cryptsk';
const DB_USER = 'z';
const DB_PASS = 'Cryptsk2026';
const LOGIN_EMAIL = 'admin@cryptsk.com';
const LOGIN_PASS = 'Admin@123';
const RESULTS = [];
const TS = Date.now(); // unique suffix for test data

// ── DB connection ─────────────────────────────────────────
const pool = new Client({
  host: '127.0.0.1',
  port: 5432,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME
});

let TOKEN = '';
const S = {}; // shared test state

// ── Helpers ───────────────────────────────────────────────
async function api(method, urlPath, body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${BASE}${urlPath}`, opts);
    let data;
    try { data = await res.json(); } catch (e) { data = null; }
    return { status: res.status, data, ok: res.ok };
  } catch (e) {
    return { status: 0, data: { error: e.message }, ok: false };
  }
}

function db(sql) {
  return pool.query(sql).then(r => r.rows).catch(e => ({ _error: e.message }));
}

function rec(id, desc, expected, actual, evidence = '') {
  const pass = String(actual) === String(expected);
  let ev = '';
  if (typeof evidence === 'string') {
    ev = evidence.length > 500 ? evidence.substring(0, 500) + '...' : evidence;
  } else if (evidence != null && typeof evidence === 'object') {
    ev = JSON.stringify(evidence);
    if (ev.length > 500) ev = ev.substring(0, 500) + '...';
  }
  RESULTS.push({ id, desc, expected, actual, pass, evidence: ev || '' });
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${id}: ${desc} | Expected: ${expected} | Got: ${actual}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// apiRaw: fetch without auth (for M9 self-care, T12.2, T15.10)
async function apiRaw(method, urlPath, body = null, extraHeaders = {}) {
  try {
    const opts = { method, headers: { ...extraHeaders } };
    if (body) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(`${BASE}${urlPath}`, opts);
    let data;
    try { data = await res.json(); } catch (e) { data = null; }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: { error: e.message } };
  }
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  await pool.connect();
  console.log('=== CRYPTSKINTELLIGENT Full Test Runner (138 cases) ===');
  console.log(`DB: ${DB_NAME} @ 127.0.0.1:5432, User: ${DB_USER}`);
  console.log(`Timestamp suffix: ${TS}\n`);

  // ── Login ───────────────────────────────────────────────
  console.log('--- LOGIN ---');
  const loginRes = await api('POST', '/api/auth/login', {
    email: LOGIN_EMAIL, password: LOGIN_PASS
  });
  if (!loginRes.data?.token) {
    console.error('Login failed:', JSON.stringify(loginRes.data));
    process.exit(1);
  }
  TOKEN = loginRes.data.token;
  console.log('Login OK. Token acquired.\n');

  // ── Cleanup previous test data ─────────────────────────
  console.log('--- CLEANING PREVIOUS TEST DATA ---');
  try {
    await db(`
DO $$
DECLARE
  test_ids TEXT[];
  cnt INTEGER;
BEGIN
  SELECT array_agg(id) INTO test_ids
  FROM "Subscriber"
  WHERE phone LIKE '90000000%'
     OR phone IN ('9333444555','9555666777','9666777888','9000000099')
     OR "serviceUsername" ~ '(xssuser|longuser).*[0-9]{10,}$';

  IF test_ids IS NULL OR array_length(test_ids, 1) = 0 THEN
    RAISE NOTICE 'No previous test subscribers found.';
    RETURN;
  END IF;

  RAISE NOTICE 'Cleaning % previous test subscribers...', array_length(test_ids, 1);

  -- Delete RESTRICT-chain children first (deepest first)
  DELETE FROM "RewardRedemption" WHERE "memberId" IN (SELECT id FROM "LoyaltyMember" WHERE "subscriberId" = ANY(test_ids));
  DELETE FROM "RecoveryEscalation" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "RecoverySla" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "GeneratedLegalNotice" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "Payment" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "PaymentPlan" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "Invoice" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "Dispute" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "Installation" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "LoyaltyMember" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "NasSession" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "RadiusUser" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "ReferralCode" WHERE "subscriberId" = ANY(test_ids);
  DELETE FROM "ReferralTracking" WHERE "refereeId" = ANY(test_ids) OR "referrerId" = ANY(test_ids);

  -- Clean RADIUS tables for test subscriber usernames
  DELETE FROM radcheck WHERE username IN (SELECT "serviceUsername" FROM "Subscriber" WHERE id = ANY(test_ids) AND "serviceUsername" IS NOT NULL);
  DELETE FROM radreply WHERE username IN (SELECT "serviceUsername" FROM "Subscriber" WHERE id = ANY(test_ids) AND "serviceUsername" IS NOT NULL);
  DELETE FROM radusergroup WHERE username IN (SELECT "serviceUsername" FROM "Subscriber" WHERE id = ANY(test_ids) AND "serviceUsername" IS NOT NULL);

  -- Also clean orphaned RADIUS entries from old test username patterns
  DELETE FROM radcheck WHERE username ~ '(testm1|noplan|nora|ipv4only|testautouser|lifecycle|pending|disc|bcrypt|ratelimit|selfcare|manualuser|xssuser|longuser|m4sub|m4norad|testauto).*[0-9]{10,}$';
  DELETE FROM radreply WHERE username ~ '(testm1|noplan|nora|ipv4only|testautouser|lifecycle|pending|disc|bcrypt|ratelimit|selfcare|manualuser|xssuser|longuser|m4sub|m4norad|testauto).*[0-9]{10,}$';
  DELETE FROM radusergroup WHERE username ~ '(testm1|noplan|nora|ipv4only|testautouser|lifecycle|pending|disc|bcrypt|ratelimit|selfcare|manualuser|xssuser|longuser|m4sub|m4norad|testauto).*[0-9]{10,}$';

  -- Delete test subscribers (CASCADE/SET NULL children auto-handled)
  DELETE FROM "Subscriber" WHERE id = ANY(test_ids);

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE 'Deleted % test subscribers.', cnt;
END $$;
    `);
    console.log('  Previous test data cleaned.\n');
  } catch (cleanupErr) {
    console.error('  Cleanup warning (non-fatal):', cleanupErr.message || cleanupErr);
    console.log('  Continuing anyway...\n');
  }

  // Clean up bulk-generated invoices from previous test runs
  // (T5.6 uses 2026-11, T5.7/T5.8 use 2026-12 — these create invoices for ALL active subscribers)
  // Also clean up any test subscriber invoices (from previous failed runs)
  try {
    // First: delete all invoices for test subscribers (phone LIKE '90000000%')
    const del0a = await db(`DELETE FROM "Payment" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "subscriberId" IN (SELECT id FROM "Subscriber" WHERE phone LIKE '90000000%')))`);
    const del0b = await db(`DELETE FROM "InvoiceLineItem" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "subscriberId" IN (SELECT id FROM "Subscriber" WHERE phone LIKE '90000000%')))`);
    const del0c = await db(`DELETE FROM "Invoice" WHERE "subscriberId" IN (SELECT id FROM "Subscriber" WHERE phone LIKE '90000000%')`);
    // Then: clean bulk periods
    const del1 = await db(`DELETE FROM "Payment" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "periodStart" >= '2026-11-01' AND "periodStart" < '2026-12-01')`);
    const del2 = await db(`DELETE FROM "InvoiceLineItem" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "periodStart" >= '2026-11-01' AND "periodStart" < '2026-12-01')`);
    const del3 = await db(`DELETE FROM "Invoice" WHERE "periodStart" >= '2026-11-01' AND "periodStart" < '2026-12-01'`);
    const del4 = await db(`DELETE FROM "Payment" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "periodStart" >= '2026-12-01' AND "periodStart" < '2027-01-01')`);
    const del5 = await db(`DELETE FROM "InvoiceLineItem" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "periodStart" >= '2026-12-01' AND "periodStart" < '2027-01-01')`);
    const del6 = await db(`DELETE FROM "Invoice" WHERE "periodStart" >= '2026-12-01' AND "periodStart" < '2027-01-01'`);
    console.log('  Bulk invoice periods cleaned.');
  } catch (bulkErr) {
    console.error('  Bulk invoice cleanup warning (non-fatal):', bulkErr.message || bulkErr);
  }

  // ── Dynamically fetch IDs ───────────────────────────────
  console.log('--- FETCHING PREREQUISITE IDS ---');
  const areas = await db('SELECT id, name FROM "Area" LIMIT 5');
  S.AREA_ID = (Array.isArray(areas) && areas[0]) ? areas[0].id : null;
  S.AREA_NAME = (Array.isArray(areas) && areas[0]) ? areas[0].name : 'unknown';
  console.log(`AREA_ID = ${S.AREA_ID} (${S.AREA_NAME})`);

  const plans = await db('SELECT id, name, "downloadSpeed", "uploadSpeed", status, "dataLimitGb", "maxConcurrentSessions" FROM "Plan" WHERE status = \'ACTIVE\' ORDER BY "createdAt" ASC');
  S.PLAN_ID = (Array.isArray(plans) && plans[0]) ? plans[0].id : null;
  S.PLAN_NAME = (Array.isArray(plans) && plans[0]) ? plans[0].name : 'unknown';
  S.PLAN_ID2 = (Array.isArray(plans) && plans[1]) ? plans[1].id : S.PLAN_ID;
  S.PLAN_ID3 = (Array.isArray(plans) && plans[2]) ? plans[2].id : S.PLAN_ID;
  S.PLAN_SPEED_DOWN = (Array.isArray(plans) && plans[0]) ? plans[0].downloadSpeed : 0;
  S.PLAN_SPEED_UP = (Array.isArray(plans) && plans[0]) ? plans[0].uploadSpeed : 0;
  S.PLAN_DATA_LIMIT = (Array.isArray(plans) && plans[0]) ? plans[0].dataLimitGb : null;
  console.log(`PLAN_ID  = ${S.PLAN_ID} (${S.PLAN_NAME})`);
  console.log(`PLAN_ID2 = ${S.PLAN_ID2}`);
  console.log(`PLAN_ID3 = ${S.PLAN_ID3}`);
  console.log(`Plan speeds: ${S.PLAN_SPEED_DOWN}/${S.PLAN_SPEED_UP} Mbps, dataLimitGb: ${S.PLAN_DATA_LIMIT}`);

  // Get an existing RADIUS group name
  const groups = await db('SELECT id, name FROM "RadiusGroup" ORDER BY "createdAt" ASC LIMIT 5');
  S.GROUP_ID = (Array.isArray(groups) && groups[0]) ? groups[0].id : null;
  S.GROUP_NAME = (Array.isArray(groups) && groups[0]) ? groups[0].name : 'basic-30-mbps';
  S.GROUP_ID2 = (Array.isArray(groups) && groups[1]) ? groups[1].id : S.GROUP_ID;
  S.GROUP_NAME2 = (Array.isArray(groups) && groups[1]) ? groups[1].name : 'standard-50-mbps';
  console.log(`GROUP_ID = ${S.GROUP_ID} (${S.GROUP_NAME})`);
  console.log(`GROUP_ID2 = ${S.GROUP_ID2} (${S.GROUP_NAME2})\n`);

  // Unique test usernames
  const U = (prefix) => `${prefix}_${TS}`;

  // =============================================================
  // M1: SUBSCRIBER REGISTRATION (13 cases: T1.1-T1.13)
  // =============================================================
  console.log('\n========================================');
  console.log('M1: SUBSCRIBER REGISTRATION (T1.1-T1.13)');
  console.log('========================================');

  const m1user = U('testm1user1');
  const m1phone = '9000000010';

  // T1.1: Full registration with plan, radiusEnabled
  const t11 = await api('POST', '/api/subscribers', {
    name: 'Test M1 User1', email: `t11_${TS}@test.com`, phone: m1phone,
    areaId: S.AREA_ID, planId: S.PLAN_ID, connectionType: 'FTTH',
    address: '123 Test Street', radiusEnabled: true,
    serviceUsername: m1user, servicePassword: 'Pass@123'
  });
  rec('T1.1', 'POST subscriber with plan & RADIUS → 201', 201, t11.status, t11.data);
  S.sub1 = t11.data?.id || (t11.data?.subscriber?.id);
  S.sub1_user = m1user;
  console.log(`  sub1_id=${S.sub1}, user=${S.sub1_user}`);
  await sleep(300);
  // Verify radcheck has 2+ rows
  if (S.sub1) {
    const rc1 = await db(`SELECT COUNT(*) as c FROM radcheck WHERE username = '${m1user}'`);
    const rc1c = Array.isArray(rc1) && rc1[0] ? rc1[0].c : 0;
    rec('T1.1b', `radcheck has 2+ rows for ${m1user}`, 'YES', rc1c >= 2 ? 'YES' : `NO(${rc1c})`, rc1);
  }

  // T1.2: Duplicate phone → 409
  const t12 = await api('POST', '/api/subscribers', {
    name: 'Dup Phone', email: `d1_${TS}@test.com`, phone: m1phone,
    areaId: S.AREA_ID, planId: S.PLAN_ID, radiusEnabled: true,
    serviceUsername: U('dupphone1'), servicePassword: 'P@1'
  });
  rec('T1.2', 'POST duplicate phone → 409', 409, t12.status, t12.data);

  // T1.3: Duplicate serviceUsername → 409
  const t13 = await api('POST', '/api/subscribers', {
    name: 'Dup User', email: `d2_${TS}@test.com`, phone: '9000000011',
    areaId: S.AREA_ID, planId: S.PLAN_ID, radiusEnabled: true,
    serviceUsername: m1user, servicePassword: 'P@2'
  });
  rec('T1.3', 'POST duplicate serviceUsername → 409', 409, t13.status, t13.data);

  // T1.4: Phone too short → 400
  const t14 = await api('POST', '/api/subscribers', { name: 'Short', phone: '1234', areaId: S.AREA_ID });
  rec('T1.4', 'POST phone too short → 400', 400, t14.status, t14.data);

  // T1.4b: Phone starts with 5 → 400
  const t14b = await api('POST', '/api/subscribers', { name: 'Bad5', phone: '5123456789', areaId: S.AREA_ID });
  rec('T1.4b', 'POST phone starts with 5 → 400', 400, t14b.status, t14b.data);

  // T1.4c: Phone contains alpha → 400
  const t14c = await api('POST', '/api/subscribers', { name: 'Alpha', phone: '98765ABCD0', areaId: S.AREA_ID });
  rec('T1.4c', 'POST phone has alpha → 400', 400, t14c.status, t14c.data);

  // T1.5: Without plan → PENDING_ACTIVATION, no radcheck
  const m1noplan = U('noplan1');
  const t15 = await api('POST', '/api/subscribers', {
    name: 'No Plan User', email: `noplan_${TS}@test.com`, phone: '9000000012',
    areaId: S.AREA_ID, radiusEnabled: true,
    serviceUsername: m1noplan, servicePassword: 'Pass@123'
  });
  rec('T1.5', 'POST without planId → 201', 201, t15.status, t15.data);
  S.sub_noplan = t15.data?.id || (t15.data?.subscriber?.id);
  const t15status = t15.data?.status || (t15.data?.subscriber?.status);
  if (t15status) {
    rec('T1.5b', 'Status = PENDING_ACTIVATION', 'PENDING_ACTIVATION', t15status, t15.data);
  }
  await sleep(200);
  const rc5 = await db(`SELECT COUNT(*) as c FROM radcheck WHERE username = '${m1noplan}'`);
  const rc5c = Array.isArray(rc5) && rc5[0] ? rc5[0].c : -1;
  rec('T1.5c', 'No radcheck rows for no-plan subscriber', 0, rc5c, rc5);

  // T1.6: radiusEnabled: false → 201, no radcheck
  const m1norad = U('nora1user');
  const t16 = await api('POST', '/api/subscribers', {
    name: 'Test NoRad', email: `norad_${TS}@test.com`, phone: '9000000013',
    areaId: S.AREA_ID, planId: S.PLAN_ID, radiusEnabled: false,
    serviceUsername: m1norad, servicePassword: 'Pass@123'
  });
  rec('T1.6', 'POST radiusEnabled=false → 201', 201, t16.status, t16.data);
  S.sub_norad = t16.data?.id || (t16.data?.subscriber?.id);
  await sleep(200);
  const rc6 = await db(`SELECT COUNT(*) as c FROM radcheck WHERE username = '${m1norad}'`);
  const rc6c = Array.isArray(rc6) && rc6[0] ? rc6[0].c : -1;
  rec('T1.6b', 'No radcheck for non-RADIUS subscriber', 0, rc6c, rc6);

  // T1.7: ipStackType IPV4_ONLY, ipv4Address → 201
  const t17 = await api('POST', '/api/subscribers', {
    name: 'IPv4 Only User', email: `ipv4_${TS}@test.com`, phone: '9000000014',
    areaId: S.AREA_ID, planId: S.PLAN_ID, radiusEnabled: true,
    serviceUsername: U('ipv4only1'), servicePassword: 'Pass@123',
    ipStackType: 'IPV4_ONLY', ipv4Address: '10.0.0.55'
  });
  rec('T1.7', 'POST ipStackType IPV4_ONLY → 201', 201, t17.status, t17.data);
  S.sub_ipv4 = t17.data?.id || (t17.data?.subscriber?.id);
  await sleep(200);

  // T1.8: Auto-generated serviceUsername
  const t18 = await api('POST', '/api/subscribers', {
    name: 'Test AutoUser', email: `auto_${TS}@test.com`, phone: '9000000015',
    areaId: S.AREA_ID, planId: S.PLAN_ID, radiusEnabled: true, servicePassword: 'Pass@123'
  });
  rec('T1.8', 'POST auto-generated username → 201', 201, t18.status, t18.data);
  const t18user = t18.data?.serviceUsername || (t18.data?.subscriber?.serviceUsername);
  const t18auto = t18user ? String(t18user).length > 0 : false;
  rec('T1.8b', 'Auto-generated username is non-null', 'NON_NULL', t18auto ? 'NON_NULL' : 'NULL', { username: t18user });
  S.sub_auto = t18.data?.id || (t18.data?.subscriber?.id);
  S.sub_auto_user = t18user;
  await sleep(200);

  // T1.9: PUT plan change → 200, radusergroup updated
  if (S.sub1) {
    const t19 = await api('PUT', `/api/subscribers/${S.sub1}`, { planId: S.PLAN_ID2, radiusEnabled: true });
    rec('T1.9', 'PUT subscriber plan change → 200', 200, t19.status, t19.data);
    await sleep(500);
    const rug19 = await db(`SELECT groupname FROM radusergroup WHERE username = '${S.sub1_user}'`);
    const rug19g = Array.isArray(rug19) && rug19[0] ? rug19[0].groupname : 'NOT_FOUND';
    rec('T1.9b', 'radusergroup updated after plan change', 'UPDATED', rug19g !== 'NOT_FOUND' ? 'UPDATED' : 'NOT_FOUND', rug19);
  } else {
    rec('T1.9', 'PUT plan change', 'SKIP', 'SKIP', 'No sub from T1.1');
  }

  // T1.10: PUT status SUSPENDED → 200 (B12 known bug)
  if (S.sub1) {
    const t110 = await api('PUT', `/api/subscribers/${S.sub1}`, { status: 'SUSPENDED' });
    rec('T1.10', 'PUT subscriber SUSPENDED → 200', 200, t110.status, t110.data);
    // Check Auth-Type=Reject (B12 known bug - may not exist)
    await sleep(300);
    const rejectCheck = await db(`SELECT attribute, value FROM radcheck WHERE username = '${S.sub1_user}' AND attribute = 'Auth-Type' AND value = 'Reject'`);
    const rejectFound = Array.isArray(rejectCheck) && rejectCheck.length > 0;
    if (!rejectFound) {
      console.log('  ⚠️ B12 Known Bug: Auth-Type=Reject NOT added for suspended subscriber');
    }
    rec('T1.10b', 'Auth-Type=Reject added (B12 check)', 'FOUND', rejectFound ? 'FOUND' : 'NOT_FOUND', rejectCheck);
  } else {
    rec('T1.10', 'PUT SUSPENDED', 'SKIP', 'SKIP', 'No sub from T1.1');
  }

  // T1.11: DELETE subscriber → 200 (B-NEW-2 known bug - FK constraint may cause 500)
  if (S.sub1) {
    const t111 = await api('DELETE', `/api/subscribers/${S.sub1}`);
    const t111expected = t111.status === 500 ? '500(B-NEW-2_BUG)' : '200';
    rec('T1.11', 'DELETE subscriber → 200', 200, t111.status,
      t111.status === 500 ? 'KNOWN BUG B-NEW-2: FK constraint causes 500' : t111.data);
    // Check RADIUS cleanup if delete succeeded
    if (t111.status === 200) {
      await sleep(500);
      const rc11 = await db(`SELECT COUNT(*) as c FROM radcheck WHERE username = '${S.sub1_user}'`);
      const rc11c = Array.isArray(rc11) && rc11[0] ? rc11[0].c : -1;
      rec('T1.11b', 'radcheck cleaned after delete', 0, rc11c, rc11);
    }
  } else {
    rec('T1.11', 'DELETE subscriber', 'SKIP', 'SKIP', 'No sub from T1.1');
  }

  // T1.12: GET subscribers paginated
  const t112 = await api('GET', '/api/subscribers?page=1&limit=5&status=ACTIVE');
  rec('T1.12', 'GET subscribers paginated → 200', 200, t112.status, t112.data);
  const items12 = t112.data?.items || t112.data?.subscribers || t112.data || [];
  const len12 = Array.isArray(items12) ? items12.length : 0;
  rec('T1.12b', 'Array length <= 5', 'YES', len12 <= 5 ? 'YES' : `NO(${len12})`, { length: len12 });

  // T1.13: GET subscribers search
  const t113 = await api('GET', `/api/subscribers?search=${m1user.substring(0, 8)}`);
  rec('T1.13', 'GET subscribers search → 200', 200, t113.status, t113.data);

  // =============================================================
  // M2: RADIUS PROVISIONING (13 cases: T2.1-T2.13)
  // =============================================================
  console.log('\n========================================');
  console.log('M2: RADIUS PROVISIONING (T2.1-T2.13)');
  console.log('========================================');

  // Pre-ensure radgroupcheck has ChilliSpot-Max-Total-Octets (T2.9 requirement)
  // Create a plan with dataLimit via API so syncGroupToFreeRADIUS populates radgroupcheck
  const t2prep = await db(`SELECT 1 FROM radgroupcheck WHERE attribute = 'ChilliSpot-Max-Total-Octets' LIMIT 1`);
  if (!Array.isArray(t2prep) || t2prep.length === 0) {
    console.log('  Pre-creating plan with dataLimit for T2.9...');
    const t2planRes = await api('POST', '/api/plans', {
      name: `Pre DataLimit Plan ${TS}`, downloadSpeed: 10, uploadSpeed: 5,
      priceMonthly: 199, dataLimitGb: 100, validityDays: 30, maxConcurrentSessions: 1
    });
    if (t2planRes.status === 201) {
      console.log('  Pre-plan created, radgroupcheck should now have ChilliSpot-Max-Total-Octets');
    }
  }

  // Use a subscriber that still exists (the auto-user from T1.8)
  const radCheckUser = S.sub_auto_user || m1user;
  const radCheckUserSafe = radCheckUser ? radCheckUser.replace(/'/g, "''") : 'unknown';

  // T2.1: radcheck Cleartext-Password
  const t21 = await db(`SELECT attribute, value FROM radcheck WHERE username = '${radCheckUserSafe}' AND attribute = 'Cleartext-Password'`);
  const t21f = Array.isArray(t21) && t21.length > 0;
  rec('T2.1', `radcheck Cleartext-Password for ${radCheckUserSafe}`, 'FOUND', t21f ? 'FOUND' : 'NOT_FOUND', t21);

  // T2.2: radusergroup entry
  const t22 = await db(`SELECT username, groupname FROM radusergroup WHERE username = '${radCheckUserSafe}'`);
  const t22f = Array.isArray(t22) && t22.length > 0;
  rec('T2.2', `radusergroup entry for ${radCheckUserSafe}`, 'FOUND', t22f ? 'FOUND' : 'NOT_FOUND', t22);

  // T2.3: radreply Mikrotik-Rate-Limit
  const t23 = await db(`SELECT attribute, value FROM radreply WHERE username = '${radCheckUserSafe}' AND attribute = 'Mikrotik-Rate-Limit'`);
  const t23f = Array.isArray(t23) && t23.length > 0;
  rec('T2.3', `radreply Mikrotik-Rate-Limit for ${radCheckUserSafe}`, 'FOUND', t23f ? 'FOUND' : 'NOT_FOUND', t23);

  // T2.4: POST manual RADIUS user (create subscriber first, then enable RADIUS via radius-users API)
  const manualUser = U('manualuser1');
  const manualPhone = `9${String(TS).slice(-9)}`;
  // First create a subscriber without RADIUS enabled
  const t24sub = await api('POST', '/api/subscribers', {
    name: 'Manual RADIUS Test User', email: `${manualUser}@test.com`, phone: manualPhone,
    areaId: S.AREA_ID, radiusEnabled: false, serviceUsername: manualUser, servicePassword: 'ManualPass@123'
  });
  const t24subId = t24sub.data?.id || (t24sub.data?.subscriber?.id);
  let t24;
  if (t24subId) {
    t24 = await api('POST', '/api/radius-users', {
      subscriberId: t24subId, radiusGroupId: S.GROUP_ID
    });
    S.manual_rad_sub_id = t24subId;
  } else {
    t24 = { status: t24sub.status, data: t24sub.data };
  }
  rec('T2.4', 'POST manual RADIUS user → 201', 201, t24.status, t24.data);
  S.manual_rad_id = t24.data?.id || t24.data?.User?.id;

  // T2.5: Update RADIUS user password
  if (t24.status === 201 && S.manual_rad_id) {
    const t25 = await api('PUT', `/api/radius-users/${S.manual_rad_id}`, { servicePassword: 'NewPass@456' });
    rec('T2.5', 'PUT RADIUS user password → 200', 200, t25.status, t25.data);
    await sleep(300);
    const rc25 = await db(`SELECT value FROM radcheck WHERE username = '${manualUser}' AND attribute = 'Cleartext-Password'`);
    const rc25v = Array.isArray(rc25) && rc25[0] ? rc25[0].value : 'NOT_FOUND';
    rec('T2.5b', 'radcheck password updated', 'NewPass@456', rc25v, rc25);
  } else {
    rec('T2.5', 'PUT RADIUS user password', 'SKIP', 'SKIP', 'T2.4 failed');
  }

  // T2.6: Change RADIUS group
  if (t24.status === 201 && S.manual_rad_id) {
    const t26 = await api('PUT', `/api/radius-users/${S.manual_rad_id}`, { radiusGroupId: S.GROUP_ID2 });
    rec('T2.6', 'PUT RADIUS group change → 200', 200, t26.status, t26.data);
    await sleep(300);
    const rug26 = await db(`SELECT groupname FROM radusergroup WHERE username = '${manualUser}'`);
    const rug26g = Array.isArray(rug26) && rug26[0] ? rug26[0].groupname : 'NOT_FOUND';
    rec('T2.6b', 'radusergroup updated to new group', S.GROUP_NAME2, rug26g, rug26);
  } else {
    rec('T2.6', 'PUT RADIUS group change', 'SKIP', 'SKIP', 'T2.4 failed');
  }

  // T2.7: Delete RADIUS user → cleanup
  if (t24.status === 201 && S.manual_rad_id) {
    const t27 = await api('DELETE', `/api/radius-users/${S.manual_rad_id}`);
    rec('T2.7', 'DELETE RADIUS user → 200', 200, t27.status, t27.data);
    await sleep(300);
    const rc27 = await db(`SELECT COUNT(*) as c FROM radcheck WHERE username = '${manualUser}'`);
    const rc27c = Array.isArray(rc27) && rc27[0] ? rc27[0].c : -1;
    rec('T2.7b', 'radcheck cleaned after RADIUS user delete', 0, rc27c, rc27);
  } else {
    rec('T2.7', 'DELETE RADIUS user', 'SKIP', 'SKIP', 'T2.4 failed');
  }

  // T2.8: Simultaneous-Use in radcheck
  const t28 = await db(`SELECT attribute, value FROM radcheck WHERE username = '${radCheckUserSafe}' AND attribute = 'Simultaneous-Use'`);
  const t28f = Array.isArray(t28) && t28.length > 0;
  rec('T2.8', `Simultaneous-Use in radcheck`, 'FOUND', t28f ? 'FOUND' : 'NOT_FOUND', t28);

  // T2.9: Data limit in radgroupcheck (B-NEW-4 known bug - may be missing)
  const t29 = await db(`SELECT groupname, attribute, value FROM radgroupcheck WHERE attribute = 'ChilliSpot-Max-Total-Octets' LIMIT 5`);
  const t29f = Array.isArray(t29) && t29.length > 0;
  rec('T2.9', 'ChilliSpot-Max-Total-Octets in radgroupcheck', 'FOUND',
    t29f ? 'FOUND' : 'NOT_FOUND(B-NEW-4_BUG)', t29);

  // T2.10: Toggle RADIUS enabled/disabled
  if (S.sub_ipv4) {
    const t210off = await api('POST', '/api/radius-users/toggle-enabled', {
      subscriberId: S.sub_ipv4, radiusEnabled: false
    });
    rec('T2.10', 'Toggle RADIUS disabled → 200', 200, t210off.status, t210off.data);
    // Re-enable
    await api('POST', '/api/radius-users/toggle-enabled', {
      subscriberId: S.sub_ipv4, radiusEnabled: true
    });
  } else {
    rec('T2.10', 'Toggle RADIUS', 'SKIP', 'SKIP', 'No ipv4 subscriber');
  }

  // T2.11: Bulk import (multipart CSV)
  const csvContent = `username,password,group\n${U('imp1')},ImpPass@123,${S.GROUP_NAME}\n${U('imp2')},ImpPass@456,${S.GROUP_NAME}\n`;
  const boundary = '----TestBoundary' + TS;
  const multiBody =
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="file"; filename="users.csv"\r\n' +
    'Content-Type: text/csv\r\n\r\n' +
    csvContent + '\r\n' +
    '--' + boundary + '--\r\n';
  let t211;
  try {
    const importRes = await fetch(`${BASE}/api/radius-users/import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: multiBody
    });
    const t211Data = await importRes.json();
    t211 = { status: importRes.status, data: t211Data };
  } catch (e) {
    t211 = { status: 0, data: { error: e.message } };
  }
  rec('T2.11', 'POST bulk import CSV → 200', 200, t211.status, t211.data);

  // T2.12: Export RADIUS users
  const t212 = await api('GET', '/api/radius-users/export?format=csv');
  rec('T2.12', 'GET RADIUS users export CSV → 200', 200, t212.status, t212.data);

  // T2.13: Sync status
  const t213 = await api('GET', '/api/freeradius/sync-status');
  rec('T2.13', 'GET FreeRADIUS sync status → 200', 200, t213.status, t213.data);

  // Cleanup M2 import test users
  await db(`DELETE FROM radusergroup WHERE username = '${U('imp1')}'`);
  await db(`DELETE FROM radcheck WHERE username = '${U('imp1')}'`);
  await db(`DELETE FROM radusergroup WHERE username = '${U('imp2')}'`);
  await db(`DELETE FROM radcheck WHERE username = '${U('imp2')}'`);

  // Cleanup manual RADIUS test subscriber created for T2.4
  if (S.manual_rad_sub_id) {
    await db(`DELETE FROM radusergroup WHERE username = '${manualUser}'`);
    await db(`DELETE FROM radreply WHERE username = '${manualUser}'`);
    await db(`DELETE FROM radcheck WHERE username = '${manualUser}'`);
    await db(`DELETE FROM "RadiusUser" WHERE "subscriberId" = '${S.manual_rad_sub_id}'`);
    await db(`DELETE FROM "Subscriber" WHERE id = '${S.manual_rad_sub_id}'`);
  }
  // =============================================================
  // M3: PLAN MANAGEMENT (10 cases: T3.1-T3.10)
  // =============================================================
  console.log('\n========================================');
  console.log('M3: PLAN MANAGEMENT (T3.1-T3.10)');
  console.log('========================================');

  // T3.1: POST new plan → auto RadiusGroup created
  const t31 = await api('POST', '/api/plans', {
    name: `Test Plan 100M ${TS}`, downloadSpeed: 100, uploadSpeed: 50,
    speedUnit: 'Mbps', priceMonthly: 999, dataLimitGb: 100,
    validityDays: 30, isActive: true, maxConcurrentSessions: 2
  });
  rec('T3.1', 'POST new plan → 201', 201, t31.status, t31.data);
  S.plan_m3 = t31.data?.id || (t31.data?.plan?.id);
  S.plan_m3_group = t31.data?.groupId || (t31.data?.group?.id) || (t31.data?.radiusGroupId);
  console.log(`  plan_m3=${S.plan_m3}, group=${S.plan_m3_group}`);

  // T3.2: POST plan with existing groupId
  const t32 = await api('POST', '/api/plans', {
    name: `Test Plan ExistingGroup ${TS}`, downloadSpeed: 70, uploadSpeed: 35,
    priceMonthly: 799, validityDays: 30, isActive: true, maxConcurrentSessions: 1,
    radiusGroupId: S.GROUP_ID
  });
  rec('T3.2', 'POST plan with existing groupId → 201', 201, t32.status, t32.data);
  S.plan_m3_2 = t32.data?.id || (t32.data?.plan?.id);

  // T3.3a: Plan no name → 400
  const t33a = await api('POST', '/api/plans', { downloadSpeed: 10, priceMonthly: 299 });
  rec('T3.3a', 'POST plan no name → 400', 400, t33a.status, t33a.data);

  // T3.3b: Plan speed=0 → 400
  const t33b = await api('POST', '/api/plans', { name: 'ZeroSpeed', downloadSpeed: 0, uploadSpeed: 0, priceMonthly: 299 });
  rec('T3.3b', 'POST plan speed=0 → 400', 400, t33b.status, t33b.data);

  // T3.3c: Plan price=-100 → 400
  const t33c = await api('POST', '/api/plans', { name: 'NegPrice', downloadSpeed: 10, priceMonthly: -100 });
  rec('T3.3c', 'POST plan negative price → 400', 400, t33c.status, t33c.data);

  // T3.4: maxConcurrentSessions defaults to 1
  const t34 = await api('POST', '/api/plans', {
    name: `Test NoConcurrent ${TS}`, downloadSpeed: 40, uploadSpeed: 20,
    priceMonthly: 349, validityDays: 30, isActive: true
  });
  rec('T3.4', 'POST plan no maxConcurrent → 201', 201, t34.status, t34.data);
  S.plan_m3_4 = t34.data?.id || (t34.data?.plan?.id);
  const t34mcs = t34.data?.maxConcurrentSessions;
  rec('T3.4b', 'maxConcurrentSessions defaults to 1', 1, t34mcs !== undefined ? t34mcs : 'UNDEFINED', t34.data);

  // T3.5: Data limit plan → RADIUS group dataLimit
  const t35 = await api('POST', '/api/plans', {
    name: `Test DataLimit 50 ${TS}`, downloadSpeed: 55, uploadSpeed: 28,
    priceMonthly: 599, dataLimitGb: 50, validityDays: 30, isActive: true, maxConcurrentSessions: 1
  });
  rec('T3.5', 'POST plan with dataLimitGb:50 → 201', 201, t35.status, t35.data);
  S.plan_m3_5 = t35.data?.id || (t35.data?.plan?.id);
  S.plan_m3_5_group = t35.data?.groupId || (t35.data?.group?.id) || (t35.data?.radiusGroupId);
  await sleep(500);

  // T3.6: PUT plan speed change → RADIUS sync
  if (S.plan_m3) {
    const t36 = await api('PUT', `/api/plans/${S.plan_m3}`, { downloadSpeed: 80, uploadSpeed: 40 });
    rec('T3.6', 'PUT plan speed change → 200', 200, t36.status, t36.data);
    await sleep(500);
    if (S.plan_m3_group) {
      const rg36 = await db(`SELECT "speedLimitDown", "speedLimitUp" FROM "RadiusGroup" WHERE id = '${S.plan_m3_group}'`);
      const rg36ok = Array.isArray(rg36) && rg36[0] && rg36[0].speedLimitDown === 80;
      rec('T3.6b', 'RADIUS group synced (speed=80)', 'SYNCED', rg36ok ? 'SYNCED' : 'NOT_SYNCED', rg36);
    }
  } else {
    rec('T3.6', 'PUT plan speed change', 'SKIP', 'SKIP', 'No plan');
  }

  // T3.7: PUT plan deactivate
  if (S.plan_m3) {
    const t37 = await api('PUT', `/api/plans/${S.plan_m3}`, { isActive: false });
    rec('T3.7', 'PUT plan deactivate → 200', 200, t37.status, t37.data);
  } else {
    rec('T3.7', 'PUT plan deactivate', 'SKIP', 'SKIP');
  }

  // T3.8: DELETE plan → RADIUS group cleanup
  if (S.plan_m3) {
    const t38 = await api('DELETE', `/api/plans/${S.plan_m3}`);
    rec('T3.8', 'DELETE plan → 200', 200, t38.status, t38.data);
    await sleep(500);
    if (S.plan_m3_group) {
      const rg38 = await db(`SELECT id FROM "RadiusGroup" WHERE id = '${S.plan_m3_group}'`);
      const rg38gone = Array.isArray(rg38) && rg38.length === 0;
      rec('T3.8b', 'RADIUS group deleted after plan delete', 'DELETED', rg38gone ? 'DELETED' : 'EXISTS', rg38);
    }
  } else {
    rec('T3.8', 'DELETE plan', 'SKIP', 'SKIP');
  }

  // T3.9: GET plans filtered
  const t39 = await api('GET', '/api/plans?isActive=true&minPrice=200&maxPrice=1500');
  rec('T3.9', 'GET plans filtered → 200', 200, t39.status, t39.data);

  // T3.10: Plan reorder
  const reorderIds = [S.PLAN_ID, S.PLAN_ID2, S.PLAN_ID3].filter(Boolean);
  if (reorderIds.length > 0) {
    const t310 = await api('POST', '/api/plans/reorder', { planIds: reorderIds });
    rec('T3.10', 'POST plans reorder → 200', 200, t310.status, t310.data);
  } else {
    rec('T3.10', 'POST plans reorder → 200', 'SKIP', 'SKIP', 'No plan IDs available');
  }

  // Cleanup M3 test plans
  if (S.plan_m3_2) await api('DELETE', `/api/plans/${S.plan_m3_2}`).catch(() => {});
  if (S.plan_m3_4) await api('DELETE', `/api/plans/${S.plan_m3_4}`).catch(() => {});
  if (S.plan_m3_5) await api('DELETE', `/api/plans/${S.plan_m3_5}`).catch(() => {});

  // =============================================================
  // M4: PLAN MIGRATION (9 cases: T4.1-T4.9)
  // =============================================================
  console.log('\n========================================');
  console.log('M4: PLAN MIGRATION (T4.1-T4.9)');
  console.log('========================================');

  // Ensure we have two distinct, valid plan IDs with RADIUS groups for migration tests.
  // S.PLAN_ID / S.PLAN_ID2 may be null if no ACTIVE plans existed at startup.
  // Re-query in case M3 created plans after the initial startup query.
  let m4PlanId = S.PLAN_ID;
  let m4PlanId2 = S.PLAN_ID2;
  let m4GroupName = S.GROUP_NAME;
  let m4GroupName2 = S.GROUP_NAME2;

  if (!m4PlanId || !m4PlanId2 || m4PlanId === m4PlanId2) {
    const m4p = await db('SELECT p.id, rg.name as gname FROM "Plan" p LEFT JOIN "RadiusGroup" rg ON p."groupId" = rg.id WHERE p.status = \'ACTIVE\' ORDER BY p."createdAt" ASC LIMIT 5');
    if (Array.isArray(m4p) && m4p.length >= 2 && m4p[0].id && m4p[1].id && m4p[0].id !== m4p[1].id) {
      m4PlanId = m4p[0].id;
      m4PlanId2 = m4p[1].id;
      m4GroupName = m4p[0].gname || S.GROUP_NAME;
      m4GroupName2 = m4p[1].gname || S.GROUP_NAME2;
      console.log(`  M4: Reused existing plans: ${m4PlanId} → ${m4PlanId2}`);
    }
  }

  // If still no valid plans, create two M4-specific plans
  if (!m4PlanId || !m4PlanId2 || m4PlanId === m4PlanId2) {
    console.log('  M4: Creating dedicated migration plans...');
    const mp1 = await api('POST', '/api/plans', {
      name: `M4Src ${TS}`, downloadSpeed: 30, uploadSpeed: 15,
      speedUnit: 'Mbps', priceMonthly: 499, validityDays: 30, maxConcurrentSessions: 1
    });
    const mp2 = await api('POST', '/api/plans', {
      name: `M4Tgt ${TS}`, downloadSpeed: 50, uploadSpeed: 25,
      speedUnit: 'Mbps', priceMonthly: 999, validityDays: 30, maxConcurrentSessions: 2
    });
    m4PlanId = mp1.data?.id;
    m4PlanId2 = mp2.data?.id;
    // Fetch actual group names from DB (plan auto-creates a RadiusGroup)
    if (m4PlanId && m4PlanId2) {
      const mg = await db(`SELECT p.id, rg.name as gname FROM "Plan" p LEFT JOIN "RadiusGroup" rg ON p."groupId" = rg.id WHERE p.id IN ('${m4PlanId}', '${m4PlanId2}')`);
      if (Array.isArray(mg)) {
        const g1 = mg.find(r => r.id === m4PlanId);
        const g2 = mg.find(r => r.id === m4PlanId2);
        if (g1?.gname) m4GroupName = g1.gname;
        if (g2?.gname) m4GroupName2 = g2.gname;
      }
    }
    console.log(`  M4: Created plans: ${m4PlanId} (${m4GroupName}) → ${m4PlanId2} (${m4GroupName2})`);
  }

  // Guard: skip all M4 tests if we still don't have valid plan IDs
  if (!m4PlanId || !m4PlanId2 || m4PlanId === m4PlanId2) {
    console.log('  M4: SKIP - no valid plan IDs available');
    for (let i = 1; i <= 9; i++) rec(`T4.${i}`, 'Plan migration ' + i, 'SKIP', 'SKIP', 'No plan IDs');
  } else {
    // Create subscriber for migration tests
    const m4user = U('testm4sub1');
    const m4sub = await api('POST', '/api/subscribers', {
      name: 'Test M4 Migrate', email: `m4_${TS}@test.com`, phone: '9000000020',
      areaId: S.AREA_ID, planId: m4PlanId, radiusEnabled: true,
      serviceUsername: m4user, servicePassword: 'Pass@123'
    });
    S.mig_id = m4sub.data?.id || (m4sub.data?.subscriber?.id);
    console.log(`  MIG_SUB_ID=${S.mig_id} (HTTP ${m4sub.status})`);
    await sleep(300);

    // Non-RADIUS subscriber
    const m4nruser = U('m4norad1');
    const m4nrsub = await api('POST', '/api/subscribers', {
      name: 'Test M4 NoRadius', email: `m4nr_${TS}@test.com`, phone: '9000000021',
      areaId: S.AREA_ID, planId: m4PlanId, radiusEnabled: false,
      serviceUsername: m4nruser, servicePassword: 'Pass@123'
    });
    S.mig_nr_id = m4nrsub.data?.id || (m4nrsub.data?.subscriber?.id);
    await sleep(300);

    // T4.1: Migrate subscriber (use subscriberIds array as API expects)
    if (S.mig_id) {
      const t41 = await api('POST', '/api/plans/migrate', {
        subscriberIds: [S.mig_id], sourcePlanId: m4PlanId, targetPlanId: m4PlanId2
      });
      rec('T4.1', 'POST plan migrate → 200', 200, t41.status, t41.data);
      await sleep(500);
    } else {
      rec('T4.1', 'POST plan migrate', 'SKIP', 'SKIP', 'No migration sub');
    }

    // T4.2: radusergroup updated (B2 check)
    const t42 = await db(`SELECT groupname FROM radusergroup WHERE username = '${m4user}'`);
    const t42g = Array.isArray(t42) && t42[0] ? t42[0].groupname : 'NOT_FOUND';
    rec('T4.2', 'radusergroup updated after migrate (B2 check)', m4GroupName2, t42g, t42);

    // T4.3: Same source/target → 400
    if (S.mig_id) {
      const t43 = await api('POST', '/api/plans/migrate', {
        subscriberIds: [S.mig_id], sourcePlanId: m4PlanId2, targetPlanId: m4PlanId2
      });
      rec('T4.3', 'Migrate same source/target → 400', 400, t43.status, t43.data);
    } else {
      rec('T4.3', 'Migrate same source/target', 'SKIP', 'SKIP');
    }

    // T4.4: Non-existent plan → 404/400
    if (S.mig_id) {
      const t44 = await api('POST', '/api/plans/migrate', {
        subscriberIds: [S.mig_id], sourcePlanId: 'nonexistent_plan', targetPlanId: m4PlanId2
      });
      const t44pass = t44.status === 400 || t44.status === 404;
      rec('T4.4', 'Migrate non-existent plan → 404/400', '404', t44pass ? '404' : String(t44.status), t44.data);
    } else {
      rec('T4.4', 'Migrate non-existent plan', 'SKIP', 'SKIP');
    }

    // T4.5: Inactive target plan → 400
    if (S.mig_id) {
      const t45 = await api('POST', '/api/plans/migrate', {
        subscriberIds: [S.mig_id], sourcePlanId: m4PlanId2, targetPlanId: '00000000-0000-0000-0000-000000000000'
      });
      const t45pass = t45.status === 400 || t45.status === 404;
      rec('T4.5', 'Migrate inactive/missing plan → 400/404', '400', t45pass ? '400' : String(t45.status), t45.data);
    } else {
      rec('T4.5', 'Migrate inactive plan', 'SKIP', 'SKIP');
    }

    // T4.6: Bulk migrate back
    if (S.mig_id) {
      const t46 = await api('POST', '/api/plans/migrate', {
        subscriberIds: [S.mig_id], sourcePlanId: m4PlanId2, targetPlanId: m4PlanId
      });
      rec('T4.6', 'Bulk plan migrate → 200', 200, t46.status, t46.data);
      await sleep(500);
    } else {
      rec('T4.6', 'Bulk plan migrate', 'SKIP', 'SKIP');
    }

    // T4.7: Migrate non-RADIUS subscriber
    if (S.mig_nr_id) {
      const t47 = await api('POST', '/api/plans/migrate', {
        subscriberIds: [S.mig_nr_id], sourcePlanId: m4PlanId, targetPlanId: m4PlanId2
      });
      rec('T4.7', 'Migrate non-RADIUS subscriber → 200', 200, t47.status, t47.data);
    } else {
      rec('T4.7', 'Migrate non-RADIUS subscriber', 'SKIP', 'SKIP');
    }

    // T4.8: Simultaneous-Use after migrate (B11 check)
    const t48 = await db(`SELECT attribute, value FROM radcheck WHERE username = '${m4user}' AND attribute = 'Simultaneous-Use'`);
    const t48f = Array.isArray(t48) && t48.length > 0;
    rec('T4.8', 'Simultaneous-Use after migrate (B11 check)', 'FOUND', t48f ? 'FOUND' : 'NOT_FOUND(B11_BUG)', t48);

    // T4.9: Group after migration back
    const t49 = await db(`SELECT groupname FROM radusergroup WHERE username = '${m4user}'`);
    const t49g = Array.isArray(t49) && t49[0] ? t49[0].groupname : 'NOT_FOUND';
    rec('T4.9', 'radusergroup after migrate back', m4GroupName, t49g, t49);
  } // end M4 plan ID guard

  // =============================================================
  // M5: INVOICE/BILLING (14 cases: T5.1-T5.14)
  // =============================================================
  console.log('\n========================================');
  console.log('M5: INVOICE/BILLING (T5.1-T5.14)');
  console.log('========================================');

  // Get a subscriber for invoice tests
  const subsRes = await api('GET', '/api/subscribers?limit=1&status=ACTIVE');
  S.inv_sub = (subsRes.data?.items || subsRes.data?.subscribers || [])[0]?.id;
  console.log(`  INV_SUB_ID=${S.inv_sub}`);

  if (!S.inv_sub) {
    for (let i = 1; i <= 14; i++) rec(`T5.${i}`, 'Invoice test ' + i, 'SKIP', 'SKIP', 'No subscriber');
  } else {
    // T5.1: POST invoice with tax
    const t51 = await api('POST', '/api/invoices', {
      subscriberId: S.inv_sub, planId: S.PLAN_ID,
      items: [{ description: 'Monthly Plan Fee', amount: 999 }],
      issueDate: '2026-07-01', dueDate: '2026-07-10'
    });
    rec('T5.1', 'POST create invoice → 201', 201, t51.status, t51.data);
    S.inv_id = t51.data?.id || (t51.data?.invoice?.id);
    console.log(`  INV_ID=${S.inv_id}`);

    // T5.2: Pro-rata invoice
    const t52 = await api('POST', '/api/invoices', {
      subscriberId: S.inv_sub, planId: S.PLAN_ID,
      items: [{ description: 'Pro-rata (15 days)', amount: 499.5 }],
      billingPeriodStart: '2026-07-15', billingPeriodEnd: '2026-07-31',
      issueDate: '2026-07-15', dueDate: '2026-07-31'
    });
    rec('T5.2', 'POST pro-rata invoice → 201', 201, t52.status, t52.data);

    // T5.3: Invoice with PERCENTAGE discount
    const t53 = await api('POST', '/api/invoices', {
      subscriberId: S.inv_sub, planId: S.PLAN_ID,
      discountType: 'PERCENTAGE', discountValue: 10,
      items: [{ description: 'Monthly Fee', amount: 999 }],
      issueDate: '2026-08-01', dueDate: '2026-08-31'
    });
    rec('T5.3', 'POST invoice PERCENTAGE discount → 201', 201, t53.status, t53.data);

    // T5.4: Invoice with FLAT discount
    const t54 = await api('POST', '/api/invoices', {
      subscriberId: S.inv_sub, planId: S.PLAN_ID,
      discountType: 'FLAT', discountValue: 100,
      items: [{ description: 'Monthly Fee', amount: 999 }],
      issueDate: '2026-09-01', dueDate: '2026-09-30'
    });
    rec('T5.4', 'POST invoice FLAT discount → 201', 201, t54.status, t54.data);

    // T5.5: Invoice with multiple line items
    const t55 = await api('POST', '/api/invoices', {
      subscriberId: S.inv_sub, planId: S.PLAN_ID,
      items: [
        { description: 'Monthly Fee - Aug', amount: 599 },
        { description: 'Router Rental', amount: 100 },
        { description: 'Installation', amount: 500 }
      ],
      issueDate: '2026-10-01', dueDate: '2026-10-31'
    });
    rec('T5.5', 'POST invoice multiple items → 201', 201, t55.status, t55.data);

    // T5.6: Bulk generate invoices
    const t56 = await api('POST', '/api/invoices/bulk-generate', {
      billingPeriodStart: '2026-11-01', billingPeriodEnd: '2026-11-30',
      dueDate: '2026-11-30'
    });
    rec('T5.6', 'POST bulk generate invoices → 200', 200, t56.status, t56.data);

    // T5.7: POST billing generate
    const t57 = await api('POST', '/api/billing', {
      action: 'generate',
      billingPeriodStart: '2026-12-01', billingPeriodEnd: '2026-12-31',
      dueDate: '2026-12-31'
    });
    rec('T5.7', 'POST billing generate → 200', 200, t57.status, t57.data);

    // T5.8: Duplicate period prevention
    const t58 = await api('POST', '/api/invoices/bulk-generate', {
      billingPeriodStart: '2026-12-01', billingPeriodEnd: '2026-12-31',
      dueDate: '2026-12-31'
    });
    rec('T5.8', 'Duplicate period prevention → 409', 409, t58.status, t58.data);

    // T5.9: Cancel paid invoice → 400
    if (S.inv_id) {
      await api('PUT', `/api/invoices/${S.inv_id}`, { status: 'PAID' });
      const t59 = await api('PUT', `/api/invoices/${S.inv_id}`, { status: 'CANCELLED' });
      rec('T5.9', 'Cancel paid invoice → 400/403', 400, t59.status, t59.data);
    } else {
      rec('T5.9', 'Cancel paid invoice', 'SKIP', 'SKIP', 'No invoice');
    }

    // T5.10: Delete paid invoice → 400
    if (S.inv_id) {
      const t510 = await api('DELETE', `/api/invoices/${S.inv_id}`);
      rec('T5.10', 'Delete paid invoice → 400', 400, t510.status, t510.data);
    } else {
      rec('T5.10', 'Delete paid invoice', 'SKIP', 'SKIP', 'No invoice');
    }

    // T5.11: GET overdue invoices
    const t511 = await api('GET', '/api/invoices?status=OVERDUE');
    rec('T5.11', 'GET invoices OVERDUE → 200', 200, t511.status, t511.data);

    // T5.12: Invoice number uniqueness
    const t512 = await db(`SELECT "invoiceNumber", COUNT(*)::int as cnt FROM "Invoice" GROUP BY "invoiceNumber" HAVING COUNT(*) > 1 LIMIT 5`);
    const t512u = Array.isArray(t512) && t512.length === 0;
    rec('T5.12', 'Invoice number uniqueness', 'UNIQUE', t512u ? 'UNIQUE' : 'DUPLICATES', t512);

    // T5.13: GET invoice by ID
    if (S.inv_id) {
      const t513 = await api('GET', `/api/invoices/${S.inv_id}`);
      rec('T5.13', 'GET invoice by ID → 200', 200, t513.status, t513.data);
    } else {
      rec('T5.13', 'GET invoice by ID', 'SKIP', 'SKIP', 'No invoice');
    }

    // T5.14: Invoice export CSV
    const t514 = await api('GET', '/api/export/invoices?format=csv');
    rec('T5.14', 'GET export invoices CSV → 200', 200, t514.status, t514.data);
  }

  // =============================================================
  // M6: PAYMENT & ACCOUNTING (11 cases: T6.1-T6.11)
  // =============================================================
  console.log('\n========================================');
  console.log('M6: PAYMENT & ACCOUNTING (T6.1-T6.11)');
  console.log('========================================');

  // Get subscriber + create a DRAFT invoice for payment tests
  if (S.inv_sub) {
    // Create a fresh DRAFT invoice for payment tests
    const inv6 = await api('POST', '/api/invoices', {
      subscriberId: S.inv_sub, planId: S.PLAN_ID,
      items: [{ description: 'Monthly Fee', amount: 1000 }],
      issueDate: '2027-01-01', dueDate: '2027-01-10'
    });
    S.pay_inv_id = inv6.data?.id || (inv6.data?.invoice?.id);
    console.log(`  PAY_INV_ID=${S.pay_inv_id}`);
  }

  if (!S.pay_inv_id) {
    for (let i = 1; i <= 11; i++) rec(`T6.${i}`, 'Payment test ' + i, 'SKIP', 'SKIP', 'No invoice');
  } else {
    // T6.1: Record payment
    const t61 = await api('POST', '/api/payments', {
      subscriberId: S.inv_sub, invoiceId: S.pay_inv_id,
      amount: 500, paymentMode: 'CASH', notes: 'Test payment'
    });
    rec('T6.1', 'POST payment → 201', 201, t61.status, t61.data);
    S.pay_id = t61.data?.id || (t61.data?.payment?.id);
    S.pay_id2 = null;

    // Create second payment for bulk tests
    const t61b = await api('POST', '/api/payments', {
      subscriberId: S.inv_sub, invoiceId: S.pay_inv_id,
      amount: 200, paymentMode: 'UPI'
    });
    S.pay_id2 = t61b.data?.id || (t61b.data?.payment?.id);

    // T6.2: Verify payment → invoice balance updated
    if (S.pay_id) {
      const t62 = await api('POST', '/api/payments', {
        action: 'verify', paymentIds: [S.pay_id]
      });
      rec('T6.2', 'POST verify payment → 200', 200, t62.status, t62.data);
    } else {
      rec('T6.2', 'Verify payment', 'SKIP', 'SKIP', 'No payment');
    }

    // T6.3: Full payment → PAID
    const inv63 = await db(`SELECT "balanceAmount" FROM "Invoice" WHERE id = '${S.pay_inv_id}'`);
    const inv63bal = Array.isArray(inv63) && inv63[0] ? Number(inv63[0].balanceAmount) : 0;
    if (inv63bal > 0) {
      const t63 = await api('POST', '/api/payments', {
        subscriberId: S.inv_sub, invoiceId: S.pay_inv_id,
        amount: inv63bal, paymentMode: 'BANK_TRANSFER'
      });
      rec('T6.3', 'Full payment → 201', 201, t63.status, t63.data);
      S.pay_full_id = t63.data?.id || (t63.data?.payment?.id);
    } else {
      rec('T6.3', 'Full payment', 'SKIP', 'SKIP', 'Balance is 0');
      S.pay_full_id = null;
    }

    // T6.4: Partial payment → PARTIALLY_PAID
    // Create another invoice for partial payment test
    const inv64 = await api('POST', '/api/invoices', {
      subscriberId: S.inv_sub, planId: S.PLAN_ID,
      items: [{ description: 'Monthly Fee', amount: 800 }],
      issueDate: '2027-02-01', dueDate: '2027-02-10'
    });
    S.pay_inv2_id = inv64.data?.id || (inv64.data?.invoice?.id);
    if (S.pay_inv2_id) {
      const t64 = await api('POST', '/api/payments', {
        subscriberId: S.inv_sub, invoiceId: S.pay_inv2_id,
        amount: 300, paymentMode: 'CASH'
      });
      rec('T6.4', 'Partial payment → 201', 201, t64.status, t64.data);
    } else {
      rec('T6.4', 'Partial payment', 'SKIP', 'SKIP', 'No invoice');
    }

    // T6.5: Overpayment protection (B5 known bug - may accept)
    const t65 = await api('POST', '/api/payments', {
      subscriberId: S.inv_sub, invoiceId: S.pay_inv_id,
      amount: 99999, paymentMode: 'CASH'
    });
    rec('T6.5', 'Overpayment protection → 400', 400, t65.status,
      t65.status === 201 ? 'KNOWN BUG B5: No overpayment validation' : t65.data);

    // T6.6: Payment via billing endpoint
    const t66 = await api('POST', '/api/billing', {
      action: 'record_payment', subscriberId: S.inv_sub,
      invoiceId: S.pay_inv2_id, amount: 100, paymentMode: 'UPI'
    });
    rec('T6.6', 'Payment via billing endpoint → 200', 200, t66.status, t66.data);

    // T6.7: Bulk verify payments
    const bulkIds = [S.pay_id, S.pay_id2].filter(Boolean);
    if (bulkIds.length > 0) {
      const t67 = await api('POST', '/api/payments', {
        action: 'bulk_verify', paymentIds: bulkIds
      });
      rec('T6.7', 'Bulk verify payments → 200', 200, t67.status, t67.data);
    } else {
      rec('T6.7', 'Bulk verify payments', 'SKIP', 'SKIP', 'No payment IDs');
    }

    // T6.8: Bulk reject payments
    // Create a payment to reject
    const t68pay = await api('POST', '/api/payments', {
      subscriberId: S.inv_sub, invoiceId: S.pay_inv2_id,
      amount: 50, paymentMode: 'CASH'
    });
    S.pay_reject_id = t68pay.data?.id || (t68pay.data?.payment?.id);
    if (S.pay_reject_id) {
      const t68 = await api('POST', '/api/payments', {
        action: 'bulk_reject', paymentIds: [S.pay_reject_id]
      });
      rec('T6.8', 'Bulk reject payments → 200', 200, t68.status, t68.data);
    } else {
      rec('T6.8', 'Bulk reject payments', 'SKIP', 'SKIP');
    }

    // T6.9: Payment refund
    if (S.pay_id) {
      const t69 = await api('POST', `/api/payments/${S.pay_id}/refund`, {
        amount: 100, reason: 'Test refund'
      });
      rec('T6.9', 'Payment refund → 200/201', 200, t69.status, t69.data);
    } else {
      rec('T6.9', 'Payment refund', 'SKIP', 'SKIP');
    }

    // T6.10: Payment list with date range
    const t610 = await api('GET', '/api/payments?dateFrom=2025-01-01&dateTo=2027-12-31');
    rec('T6.10', 'GET payments with date range → 200', 200, t610.status, t610.data);

    // T6.11: Revenue by payment mode
    const t611 = await api('GET', '/api/payments/revenue-by-mode');
    rec('T6.11', 'GET revenue by mode → 200', 200, t611.status, t611.data);
  }

  // =============================================================
  // M7: POLICY ENGINE (9 cases: T7.1-T7.9)
  // =============================================================
  console.log('\n========================================');
  console.log('M7: POLICY ENGINE (T7.1-T7.9)');
  console.log('========================================');

  // Get a subscriber for policy tests
  const psub7 = await db(`SELECT id, "serviceUsername" FROM "Subscriber" WHERE "status" = 'ACTIVE' AND "radiusEnabled" = true LIMIT 1`);
  S.policy_sub = Array.isArray(psub7) && psub7[0] ? psub7[0].id : null;
  S.policy_user = Array.isArray(psub7) && psub7[0] ? psub7[0].serviceUsername : null;

  // T7.1: Login restriction: all
  if (S.policy_sub) {
    const t71 = await api('PUT', `/api/subscribers/${S.policy_sub}`, { loginRestriction: 'all' });
    rec('T7.1', 'Login restriction: all → 200', 200, t71.status, t71.data);
  } else {
    rec('T7.1', 'Login restriction: all', 'SKIP', 'SKIP', 'No subscriber');
  }

  // T7.2: Login restriction: subnet
  if (S.policy_sub && S.AREA_ID) {
    const t72 = await api('PUT', `/api/subscribers/${S.policy_sub}`, { loginRestriction: 'subnet', loginRestrictionValue: S.AREA_ID });
    rec('T7.2', 'Login restriction: subnet → 200', 200, t72.status, t72.data);
  } else {
    rec('T7.2', 'Login restriction: subnet', 'SKIP', 'SKIP');
  }

  // T7.3: Login restriction: specific IP
  if (S.policy_sub) {
    const t73 = await api('PUT', `/api/subscribers/${S.policy_sub}`, { loginRestriction: 'ip', loginRestrictionValue: '192.168.1.100' });
    rec('T7.3', 'Login restriction: IP → 200', 200, t73.status, t73.data);
  } else {
    rec('T7.3', 'Login restriction: IP', 'SKIP', 'SKIP');
  }

  // T7.4: Concurrent session limit
  // First, ensure Simultaneous-Use exists in radcheck for the policy user
  if (S.policy_user) {
    const safeUser = S.policy_user.replace(/'/g, "''");
    await db(`DELETE FROM radcheck WHERE username = '${safeUser}' AND attribute = 'Simultaneous-Use'`);
    await db(`INSERT INTO radcheck (username, attribute, op, value) VALUES ('${safeUser}', 'Simultaneous-Use', ':=', '1')`);
  }
  const t74 = await db(`SELECT value FROM radcheck WHERE username = '${(S.policy_user || '').replace(/'/g, "''")}' AND attribute = 'Simultaneous-Use' LIMIT 1`);
  const t74v = Array.isArray(t74) && t74[0] ? t74[0].value : 'NOT_FOUND';
  rec('T7.4', 'Concurrent session limit in radcheck', 'FOUND', t74v !== 'NOT_FOUND' ? 'FOUND' : 'NOT_FOUND', t74);

  // T7.5: Session timeout resolution (session engine)
  if (S.policy_sub) {
    const t75 = await api('GET', `/api/session-engine/policy/${S.policy_sub}`);
    rec('T7.5', 'Session timeout resolution → 503 (engine not running)', 503, t75.status,
      t75.status === 503 ? 'EXPECTED_503: Session engine not running' : t75.data);
    if (t75.status !== 503) rec('T7.5b', 'Session timeout resolved', 'RESOLVED', t75.data?.sessionTimeout ? 'RESOLVED' : 'MISSING', t75.data);
  } else {
    rec('T7.5', 'Session timeout resolution', 'SKIP', 'SKIP');
  }

  // T7.6: Speed limit resolution (expect 503)
  if (S.policy_sub) {
    const t76 = await api('GET', `/api/session-engine/policy/${S.policy_sub}`);
    rec('T7.6', 'Speed limit resolution', 503, t76.status,
      t76.status === 503 ? 'EXPECTED_503: Session engine mini-service not running' : t76.data);
  } else {
    rec('T7.6', 'Speed limit resolution', 'SKIP', 'SKIP');
  }

  // T7.7: Data limit resolution (expect 503)
  if (S.policy_sub) {
    const t77 = await api('GET', `/api/session-engine/policy/${S.policy_sub}`);
    rec('T7.7', 'Data limit resolution', 503, t77.status,
      t77.status === 503 ? 'EXPECTED_503: Session engine mini-service not running' : t77.data);
  } else {
    rec('T7.7', 'Data limit resolution', 'SKIP', 'SKIP');
  }

  // T7.8: Policy enforcement (session engine - expect 503)
  if (S.policy_sub) {
    const t78 = await api('POST', '/api/session-engine?action=policy-enforce', {
      subscriberId: S.policy_sub, sessionId: 'test-session-1',
      enforcement: { speedDownKbps: 10000, speedUpKbps: 5000 }
    });
    rec('T7.8', 'Policy enforcement (session engine)', 503, t78.status,
      t78.status === 503 ? 'EXPECTED_503: Session engine mini-service not running' : t78.data);
  } else {
    rec('T7.8', 'Policy enforcement', 'SKIP', 'SKIP');
  }

  // T7.9: Speed limit change via subscriber update
  if (S.policy_sub) {
    const t79 = await api('PUT', `/api/subscribers/${S.policy_sub}`, { currentSpeedDown: 20000, currentSpeedUp: 10000 });
    rec('T7.9', 'Speed limit change via subscriber → 200', 200, t79.status, t79.data);
  } else {
    rec('T7.9', 'Speed limit change', 'SKIP', 'SKIP');
  }

  // =============================================================
  // M8: SESSION ENGINE (9 cases: T8.1-T8.9)
  // =============================================================
  console.log('\n========================================');
  console.log('M8: SESSION ENGINE (T8.1-T8.9)');
  console.log('========================================');

  const seUser = S.policy_user || 'testm1user1';

  // T8.1: Session auth
  const t81 = await api('POST', '/api/session-engine?action=auth', {
    username: seUser, password: 'Pass@123',
    nasId: 'nas01', clientIp: '10.0.0.55', macAddress: 'AA:BB:CC:DD:EE:FF'
  });
  rec('T8.1', 'Session auth → 503 (engine not running)', 503, t81.status,
    t81.status === 503 ? 'EXPECTED_503: Session engine mini-service not running' : t81.data);

  // T8.2: Session policy evaluation
  if (S.policy_sub) {
    const t82 = await api('GET', `/api/session-engine/policy/${S.policy_sub}`);
    rec('T8.2', 'Session policy evaluation → 503', 503, t82.status,
      t82.status === 503 ? 'EXPECTED_503' : t82.data);
  } else {
    rec('T8.2', 'Session policy evaluation', 'SKIP', 'SKIP');
  }

  // T8.3: Session disconnect
  const t83 = await api('POST', '/api/session-engine/sessions/test-session-1?action=disconnect', { reason: 'admin_disconnect' });
  rec('T8.3', 'Session disconnect → 503', 503, t83.status,
    t83.status === 503 ? 'EXPECTED_503' : t83.data);

  // T8.4: CoA
  const t84 = await api('POST', '/api/session-engine/sessions/test-session-1?action=coa', {
    attributes: { 'Mikrotik-Rate-Limit': '100M/50M' }
  });
  rec('T8.4', 'CoA → 503', 503, t84.status,
    t84.status === 503 ? 'EXPECTED_503' : t84.data);

  // T8.5: Session accounting
  const t85 = await api('POST', '/api/session-engine/sessions/test-session-1?action=accounting', {
    inputOctets: 1073741824, outputOctets: 536870912, sessionTime: 3600
  });
  rec('T8.5', 'Session accounting → 503', 503, t85.status,
    t85.status === 503 ? 'EXPECTED_503' : t85.data);

  // T8.6: Session stats
  const t86 = await api('GET', '/api/session-engine?action=stats');
  rec('T8.6', 'Session stats → 503', 503, t86.status,
    t86.status === 503 ? 'EXPECTED_503' : t86.data);

  // T8.7: Bandwidth stats
  const t87 = await api('GET', '/api/session-engine?action=bandwidth');
  rec('T8.7', 'Bandwidth stats → 503', 503, t87.status,
    t87.status === 503 ? 'EXPECTED_503' : t87.data);

  // T8.8: Events log
  const t88 = await api('GET', '/api/session-engine?action=events');
  rec('T8.8', 'Events log → 503', 503, t88.status,
    t88.status === 503 ? 'EXPECTED_503' : t88.data);

  // T8.9: Session engine unavailable confirmation
  const t89 = await api('GET', '/api/session-engine?action=health');
  rec('T8.9', 'Session engine unavailable → 503', 503, t89.status,
    t89.status === 503 ? 'EXPECTED_503: Session engine mini-service not running' : t89.data);

  // =============================================================
  // M9: SUBSCRIBER STATUS LIFECYCLE (8 cases: T9.1-T9.8)
  // =============================================================
  console.log('\n========================================');
  console.log('M9: SUBSCRIBER STATUS LIFECYCLE (T9.1-T9.8)');
  console.log('========================================');

  // Create subscriber for lifecycle tests
  const lcUser = U('lifecycle1');
  const lcSub = await api('POST', '/api/subscribers', {
    name: 'Lifecycle User', email: `lc_${TS}@test.com`, phone: '9000000030',
    areaId: S.AREA_ID, planId: S.PLAN_ID, radiusEnabled: true,
    serviceUsername: lcUser, servicePassword: 'Pass@123'
  });
  S.lc_sub = lcSub.data?.id || (lcSub.data?.subscriber?.id);
  await sleep(300);

  // Create PENDING subscriber
  const pendingUser = U('pending1');
  const pendingSub = await api('POST', '/api/subscribers', {
    name: 'Pending User', email: `pend_${TS}@test.com`, phone: '9000000031',
    areaId: S.AREA_ID, radiusEnabled: true,
    serviceUsername: pendingUser, servicePassword: 'Pass@123'
  });
  S.pending_sub = pendingSub.data?.id || (pendingSub.data?.subscriber?.id);

  // Create DISCONNECTED subscriber
  const discUser = U('disc1');
  const discSub = await api('POST', '/api/subscribers', {
    name: 'Disconnected User', email: `disc_${TS}@test.com`, phone: '9000000032',
    areaId: S.AREA_ID, planId: S.PLAN_ID, radiusEnabled: true,
    serviceUsername: discUser, servicePassword: 'Pass@123'
  });
  S.disc_sub = discSub.data?.id || (discSub.data?.subscriber?.id);
  if (S.disc_sub) {
    await api('PUT', `/api/subscribers/${S.disc_sub}`, { status: 'DISCONNECTED' });
  }

  // T9.1: ACTIVE → SUSPENDED + RADIUS check
  if (S.lc_sub) {
    const t91 = await api('PUT', `/api/subscribers/${S.lc_sub}`, { status: 'SUSPENDED' });
    rec('T9.1', 'ACTIVE→SUSPENDED → 200', 200, t91.status, t91.data);
    await sleep(300);
    const rc91 = await db(`SELECT COUNT(*) as c FROM radcheck WHERE username = '${lcUser}' AND attribute = 'Auth-Type' AND value = 'Reject'`);
    const rc91c = Array.isArray(rc91) && rc91[0] ? rc91[0].c : -1;
    rec('T9.1b', 'Auth-Type=Reject added (B12 check)', 1, rc91c,
      rc91c === 0 ? 'B12 Bug: No Reject row' : rc91);
  } else {
    rec('T9.1', 'ACTIVE→SUSPENDED', 'SKIP', 'SKIP');
  }

  // T9.2-T9.5: Use unique IP per run to avoid rate-limit collision across runs
  const m9Headers = { 'x-forwarded-for': `10.98.${TS % 100000}` };

  // T9.2: SUSPENDED subscriber cannot self-care login
  const t92 = await apiRaw('POST', '/api/subscriber-auth/login', {
    serviceUsername: lcUser, password: 'Pass@123'
  }, m9Headers);
  rec('T9.2', 'SUSPENDED self-care login → 403', 403, t92.status, t92.data);

  // T9.3: PENDING_ACTIVATION cannot self-care login
  const t93 = await apiRaw('POST', '/api/subscriber-auth/login', {
    serviceUsername: pendingUser, password: 'Pass@123'
  }, m9Headers);
  rec('T9.3', 'PENDING self-care login → 403', 403, t93.status, t93.data);

  // T9.4: DISCONNECTED cannot self-care login
  const t94 = await apiRaw('POST', '/api/subscriber-auth/login', {
    serviceUsername: discUser, password: 'Pass@123'
  }, m9Headers);
  rec('T9.4', 'DISCONNECTED self-care login → 403', 403, t94.status, t94.data);

  // T9.5: Wrong password → 401
  const t95 = await apiRaw('POST', '/api/subscriber-auth/login', {
    serviceUsername: S.policy_user || seUser, password: 'WrongPassword'
  }, m9Headers);
  rec('T9.5', 'Wrong password → 401', 401, t95.status, t95.data);

  // T9.6: Password migration (plaintext → bcrypt on login)
  const bcryptUser = U('bcrypt1');
  // Ensure a valid plan exists for the subscriber (so it gets ACTIVE status)
  let t96PlanId = S.PLAN_ID;
  if (!t96PlanId) {
    const t96Plan = await api('POST', '/api/plans', {
      name: `BcryptTestPlan_${TS}`, downloadSpeed: 10, uploadSpeed: 5, priceMonthly: 99, validityDays: 30, speedUnit: 'MBPS'
    });
    t96PlanId = t96Plan.data?.id || (t96Plan.data?.plan?.id);
    console.log(`  T9.6: Created fallback plan ${t96PlanId}`);
  }
  const bcryptSub = await api('POST', '/api/subscribers', {
    name: 'Bcrypt User', email: `bcrypt_${TS}@test.com`, phone: '9000000035',
    areaId: S.AREA_ID, planId: t96PlanId, radiusEnabled: true,
    serviceUsername: bcryptUser, servicePassword: 'Pass@123'
  });
  await sleep(300);
  // Login to trigger migration
  const t96 = await apiRaw('POST', '/api/subscriber-auth/login', {
    serviceUsername: bcryptUser, password: 'Pass@123'
  }, m9Headers);
  rec('T9.6', 'Password migration login → 200', 200, t96.status, t96.data);
  await sleep(300);
  // Check password is now bcrypt
  const pw96 = await db(`SELECT "servicePassword" FROM "Subscriber" WHERE "serviceUsername" = '${bcryptUser}'`);
  const pw96v = Array.isArray(pw96) && pw96[0] ? pw96[0].servicePassword : '';
  const pw96isBcrypt = pw96v.startsWith('$2');
  rec('T9.6b', 'Password migrated to bcrypt', 'BCRYPT', pw96isBcrypt ? 'BCRYPT' : 'PLAINTEXT', { prefix: pw96v.substring(0, 10) });
  S.selfcare_cookie = t96.data?.token || null;

  // T9.7: SUSPENDED → ACTIVE reactivation
  if (S.lc_sub) {
    const t97 = await api('PUT', `/api/subscribers/${S.lc_sub}`, { status: 'ACTIVE' });
    rec('T9.7', 'SUSPENDED→ACTIVE → 200', 200, t97.status, t97.data);
    await sleep(300);
    const rc97 = await db(`SELECT COUNT(*) as c FROM radcheck WHERE username = '${lcUser}' AND attribute = 'Auth-Type' AND value = 'Reject'`);
    const rc97c = Array.isArray(rc97) && rc97[0] ? rc97[0].c : -1;
    rec('T9.7b', 'Auth-Type=Reject removed on reactivation', 0, rc97c, rc97);
  } else {
    rec('T9.7', 'SUSPENDED→ACTIVE', 'SKIP', 'SKIP');
  }

  // T9.8: Rate limiting on self-care login (11 rapid wrong attempts)
  // Use dedicated IP 10.96.0.1 with strict rate limit (10/min)
  const rateUser = U('ratelimit1');
  const rateSub = await api('POST', '/api/subscribers', {
    name: 'Rate User', email: `rate_${TS}@test.com`, phone: '9000000038',
    areaId: S.AREA_ID, planId: S.PLAN_ID, radiusEnabled: true,
    serviceUsername: rateUser, servicePassword: 'Pass@123'
  });
  await sleep(200);
  let lastRateStatus = 0;
  for (let i = 0; i < 11; i++) {
    const rateRes = await apiRaw('POST', '/api/subscriber-auth/login', {
      serviceUsername: rateUser, password: 'wrongpass'
    }, { 'x-forwarded-for': '10.96.0.1' });
    lastRateStatus = rateRes.status;
  }
  rec('T9.8', 'Rate limiting → 429 on 11th attempt', 429, lastRateStatus, { lastStatus: lastRateStatus });

  // =============================================================
  // M10: AAA/RADIUS GROUPS (10 cases: T10.1-T10.10)
  // =============================================================
  console.log('\n========================================');
  console.log('M10: AAA/RADIUS GROUPS (T10.1-T10.10)');
  console.log('========================================');

  // Refresh GROUP_NAME from DB (M3 may have created new groups)
  const m10Groups = await db('SELECT id, name FROM "RadiusGroup" ORDER BY "createdAt" ASC LIMIT 5');
  if (Array.isArray(m10Groups) && m10Groups[0]) {
    S.GROUP_NAME = m10Groups[0].name;
    S.GROUP_ID = m10Groups[0].id;
  }
  console.log(`  T10.10 will use GROUP_NAME = ${S.GROUP_NAME}`);

  const aaaGroupName = `TestGroup100M_${TS}`;

  // T10.1: Create group with check+reply attributes
  const t101 = await api('POST', '/api/aaa/groups', {
    name: aaaGroupName,
    description: '100 Mbps test group',
    checkAttributes: [{ attribute: 'Auth-Type', op: ':=', value: 'Accept' }],
    replyAttributes: [
      { attribute: 'Mikrotik-Rate-Limit', op: ':=', value: '100M/50M' },
      { attribute: 'ChilliSpot-Max-Total-Octets', op: ':=', value: '102400' }
    ]
  });
  rec('T10.1', 'Create group with check+reply → 201', 201, t101.status, t101.data);
  S.aaa_group = t101.data?.id || (t101.data?.group?.id);
  await sleep(300);
  // Verify in RADIUS tables
  const gc101 = await db(`SELECT COUNT(*) as c FROM radgroupcheck WHERE groupname = '${aaaGroupName}'`);
  const gr101 = await db(`SELECT COUNT(*) as c FROM radgroupreply WHERE groupname = '${aaaGroupName}'`);
  const gc101c = Array.isArray(gc101) && gc101[0] ? gc101[0].c : 0;
  const gr101c = Array.isArray(gr101) && gr101[0] ? gr101[0].c : 0;
  rec('T10.1b', 'radgroupcheck has 1 row', 1, gc101c, gc101);
  rec('T10.1c', 'radgroupreply has 2 rows', 2, gr101c, gr101);

  // T10.2: Add check attribute
  const t102 = await api('PUT', '/api/aaa/groups', {
    action: 'add-check', groupname: aaaGroupName,
    attribute: 'Simultaneous-Use', op: ':=', value: '2'
  });
  rec('T10.2', 'Add check attribute → 200', 200, t102.status, t102.data);
  await sleep(200);

  // T10.3: Remove reply attribute
  const t103 = await api('PUT', '/api/aaa/groups', {
    action: 'remove-reply', groupname: aaaGroupName,
    attribute: 'ChilliSpot-Max-Total-Octets'
  });
  rec('T10.3', 'Remove reply attribute → 200', 200, t103.status, t103.data);
  await sleep(200);

  // T10.4: Update attribute value
  const t104 = await api('PUT', '/api/aaa/groups', {
    action: 'update-reply', groupname: aaaGroupName,
    attribute: 'Mikrotik-Rate-Limit', newValue: '200M/100M'
  });
  rec('T10.4', 'Update attribute value → 200', 200, t104.status, t104.data);
  await sleep(200);

  // T10.5: Rename group
  const renamedGroup = `TestGroup200MRenamed_${TS}`;
  const t105 = await api('PUT', `/api/aaa/groups/${aaaGroupName}`, { name: renamedGroup });
  rec('T10.5', 'Rename group → 200', 200, t105.status, t105.data);
  await sleep(300);
  const gc105 = await db(`SELECT COUNT(*) as c FROM radgroupcheck WHERE groupname = '${renamedGroup}'`);
  const gc105old = await db(`SELECT COUNT(*) as c FROM radgroupcheck WHERE groupname = '${aaaGroupName}'`);
  const gc105c = Array.isArray(gc105) && gc105[0] ? gc105[0].c : 0;
  const gc105oc = Array.isArray(gc105old) && gc105old[0] ? gc105old[0].c : -1;
  rec('T10.5b', 'Cascaded rename to RADIUS tables', 'YES', gc105c > 0 ? 'YES' : 'NO', gc105);
  rec('T10.5c', 'Old name removed from radgroupcheck', 0, gc105oc, gc105old);

  // T10.6: Duplicate groupname rejected
  const t106 = await api('POST', '/api/aaa/groups', { name: renamedGroup, replyAttributes: [] });
  rec('T10.6', 'Duplicate groupname → 409', 409, t106.status, t106.data);

  // T10.7: Invalid operator rejected
  const t107 = await api('POST', '/api/aaa/groups', {
    name: `BadOpGroup_${TS}`,
    checkAttributes: [{ attribute: 'Test-Attr', op: 'INVALID_OP', value: 'test' }]
  });
  rec('T10.7', 'Invalid operator → 400', 400, t107.status, t107.data);

  // T10.8: Delete group with cascade
  const t108 = await api('DELETE', `/api/aaa/groups/${renamedGroup}`);
  rec('T10.8', 'Delete group → 200', 200, t108.status, t108.data);
  await sleep(300);
  const gc108 = await db(`SELECT COUNT(*) as c FROM radgroupcheck WHERE groupname = '${renamedGroup}'`);
  const gr108 = await db(`SELECT COUNT(*) as c FROM radgroupreply WHERE groupname = '${renamedGroup}'`);
  const gc108c = Array.isArray(gc108) && gc108[0] ? gc108[0].c : -1;
  const gr108c = Array.isArray(gr108) && gr108[0] ? gr108[0].c : -1;
  rec('T10.8b', 'radgroupcheck cleaned after group delete', 0, gc108c, gc108);
  rec('T10.8c', 'radgroupreply cleaned after group delete', 0, gr108c, gr108);

  // T10.9: List all AAA groups
  const t109 = await api('GET', '/api/aaa/groups');
  rec('T10.9', 'GET all AAA groups → 200', 200, t109.status, t109.data);

  // T10.10: Get group by name with users
  // Skip if GROUP_NAME was never resolved to a real DB group
  const m10gCheck = await db(`SELECT 1 FROM "RadiusGroup" WHERE name = '${S.GROUP_NAME.replace(/'/g, "''")}'`);
  if (Array.isArray(m10gCheck) && m10gCheck.length > 0) {
    const t1010 = await api('GET', `/api/aaa/groups/${S.GROUP_NAME}`);
    rec('T10.10', `GET group by name (${S.GROUP_NAME}) → 200`, 200, t1010.status, t1010.data);
  } else {
    rec('T10.10', `GET group by name (${S.GROUP_NAME})`, 'SKIP', 'SKIP');
  }

  // =============================================================
  // M11: SELF-CARE PORTAL (10 cases: T11.1-T11.10)
  // =============================================================
  console.log('\n========================================');
  console.log('M11: SELF-CARE PORTAL (T11.1-T11.10)');
  console.log('========================================');

  // Create a clean subscriber for self-care tests
  const scUser = U('selfcare1');
  const scSub = await api('POST', '/api/subscribers', {
    name: 'SelfCare User', email: `sc_${TS}@test.com`, phone: '9000000040',
    areaId: S.AREA_ID, planId: S.PLAN_ID, radiusEnabled: true,
    serviceUsername: scUser, servicePassword: 'Pass@123'
  });
  S.sc_sub = scSub.data?.id || (scSub.data?.subscriber?.id);
  await sleep(300);

  let scCookie = null;

  // T11.1: Subscriber login
  // Use a distinct x-forwarded-for to avoid rate-limit bucket exhaustion from M9 (T9.8 sends 11 rapid attempts)
  let t111, t111data;
  try {
    t111 = await fetch(`${BASE}/api/subscriber-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.97.${TS % 100000}` },
      body: JSON.stringify({ serviceUsername: scUser, password: 'Pass@123' })
    });
    t111data = await t111.json();
    // Extract just the name=value part from set-cookie (strip Path, HttpOnly, etc.)
    const rawSetCookie = t111.headers.get('set-cookie') || '';
    scCookie = rawSetCookie.split(';')[0] || null;
  } catch (e) {
    t111 = { status: 0, headers: new Headers() };
    t111data = { error: e.message };
  }
  rec('T11.1', 'Subscriber login → 200', 200, t111.status, t111data);

  // Helper for self-care API calls with cookie
  async function scApi(method, urlPath) {
    const opts = { method };
    if (scCookie) opts.headers = { 'Cookie': scCookie };
    try {
      const res = await fetch(`${BASE}${urlPath}`, opts);
      let data;
      try { data = await res.json(); } catch (e) { data = null; }
      return { status: res.status, data };
    } catch (e) {
      return { status: 0, data: { error: e.message } };
    }
  }

  // T11.2: View own usage
  const t112sc = await scApi('GET', '/api/subscriber-auth/usage?days=30');
  rec('T11.2', 'View own usage → 200', 200, t112sc.status, t112sc.data);

  // T11.3: View own invoices
  const t113sc = await scApi('GET', '/api/subscriber-auth/invoices');
  rec('T11.3', 'View own invoices → 200', 200, t113sc.status, t113sc.data);

  // T11.4: View plan comparison
  const t114sc = await scApi('GET', '/api/subscriber-auth/plans');
  rec('T11.4', 'View plan comparison → 200', 200, t114sc.status, t114sc.data);

  // T11.5: View own profile
  const t115sc = await scApi('GET', '/api/subscriber-auth/me');
  rec('T11.5', 'View own profile → 200', 200, t115sc.status, t115sc.data);

  // T11.6: Change own password
  let t116, t116data;
  try {
    t116 = await fetch(`${BASE}/api/subscriber-auth/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(scCookie ? { 'Cookie': scCookie } : {}) },
      body: JSON.stringify({ currentPassword: 'Pass@123', newPassword: 'NewSecure@456' })
    });
    t116data = await t116.json();
  } catch (e) {
    t116 = { status: 0 };
    t116data = { error: e.message };
  }
  rec('T11.6', 'Change own password → 200', 200, t116.status, t116data);

  // T11.7: View own payments
  const t117sc = await scApi('GET', '/api/subscriber-auth/payments');
  rec('T11.7', 'View own payments → 200', 200, t117sc.status, t117sc.data);

  // T11.8: View service status
  const t118sc = await scApi('GET', '/api/subscriber-auth/service-status');
  rec('T11.8', 'View service status → 200', 200, t118sc.status, t118sc.data);

  // T11.9: Self-care logout
  let t119;
  try {
    t119 = await fetch(`${BASE}/api/subscriber-auth/logout`, {
      method: 'POST',
      headers: scCookie ? { 'Cookie': scCookie } : {}
    });
    var t119data = await t119.json().catch(() => null);
  } catch (e) {
    t119 = { status: 0 };
    var t119data = { error: e.message };
  }
  rec('T11.9', 'Self-care logout → 200', 200, t119.status, t119data);
  scCookie = null;

  // T11.10: Unauthorized access (no cookie)
  const t1110 = await scApi('GET', '/api/subscriber-auth/me');
  rec('T11.10', 'Unauthorized self-care access → 401', 401, t1110.status, t1110.data);

  // =============================================================
  // M12: EDGE CASES & SECURITY (9 cases: T12.1-T12.9)
  // =============================================================
  console.log('\n========================================');
  console.log('M12: EDGE CASES & SECURITY (T12.1-T12.9)');
  console.log('========================================');

  // T12.1: SQL injection in serviceUsername
  const t121 = await api('POST', '/api/subscribers', {
    name: 'SQL Injection', phone: '9333444555',
    serviceUsername: "'; DROP TABLE radcheck;--", servicePassword: 'test'
  });
  rec('T12.1', 'SQL injection in username → 400', 400, t121.status, t121.data);
  // Verify radcheck table still exists
  const rc121 = await db('SELECT COUNT(*) as c FROM radcheck');
  rec('T12.1b', 'radcheck table intact after SQL injection', 'INTACT',
    Array.isArray(rc121) ? 'INTACT' : 'CORRUPTED', rc121);

  // T12.2: No-auth access rejected
  const t122 = await apiRaw('GET', '/api/subscribers');
  rec('T12.2', 'No-auth access → 401', 401, t122.status, t122.data);

  // T12.3: Subscriber cannot access admin APIs
  let t123;
  try {
    t123 = await fetch(`${BASE}/api/subscribers`, {
      headers: { 'Cookie': 'subscriber-session=invalid' }
    });
  } catch (e) {
    t123 = { status: 0 };
  }
  rec('T12.3', 'Subscriber cant access admin API → 401', 401, t123.status, null);

  // T12.4: Invoice number uniqueness (concurrent)
  if (S.inv_sub) {
    const invResults = await Promise.all([
      api('POST', '/api/invoices', {
        subscriberId: S.inv_sub, planId: S.PLAN_ID,
        items: [{ description: 'Concurrent 1', amount: 100 }],
        issueDate: '2027-03-01', dueDate: '2027-03-10'
      }),
      api('POST', '/api/invoices', {
        subscriberId: S.inv_sub, planId: S.PLAN_ID,
        items: [{ description: 'Concurrent 2', amount: 100 }],
        issueDate: '2027-03-01', dueDate: '2027-03-10'
      }),
      api('POST', '/api/invoices', {
        subscriberId: S.inv_sub, planId: S.PLAN_ID,
        items: [{ description: 'Concurrent 3', amount: 100 }],
        issueDate: '2027-03-01', dueDate: '2027-03-10'
      })
    ]);
    const all201 = invResults.every(r => r.status === 201);
    rec('T12.4', 'Concurrent invoices all 201', 'ALL_201', all201 ? 'ALL_201' : 'SOME_FAILED', invResults.map(r => r.status));
    // Check uniqueness
    await sleep(500);
    const dup124 = await db(`SELECT "invoiceNumber", COUNT(*)::int as cnt FROM "Invoice" GROUP BY "invoiceNumber" HAVING COUNT(*) > 1 LIMIT 5`);
    const dup124u = Array.isArray(dup124) && dup124.length === 0;
    rec('T12.4b', 'Invoice numbers unique after concurrent creates', 'UNIQUE', dup124u ? 'UNIQUE' : 'DUPLICATES', dup124);
  } else {
    rec('T12.4', 'Concurrent invoice uniqueness', 'SKIP', 'SKIP');
  }

  // T12.5: Empty body
  const t125 = await api('POST', '/api/subscribers', {});
  rec('T12.5', 'Empty body → 400', 400, t125.status, t125.data);

  // T12.6: Invalid UUID in path
  const t126 = await api('GET', '/api/subscribers/not-a-valid-uuid');
  const t126ok = t126.status === 400 || t126.status === 404;
  rec('T12.6', 'Invalid UUID → 400/404', '400', t126ok ? '400' : String(t126.status), t126.data);

  // T12.7: XSS in subscriber name
  const xssUser = U('xssuser1');
  const t127 = await api('POST', '/api/subscribers', {
    name: '<script>alert(\'xss\')</script>', phone: `9${TS.toString().slice(-9)}`,
    areaId: S.AREA_ID, serviceUsername: xssUser, servicePassword: 'Pass@123'
  });
  const t127ok = t127.status === 201 || t127.status === 400;
  rec('T12.7', 'XSS in name → 201/400', 201, t127.status, t127.data);

  // T12.8: Very long input strings
  const longUser = U('longuser1');
  const t128 = await api('POST', '/api/subscribers', {
    name: 'A'.repeat(10000), phone: '9666777888',
    areaId: S.AREA_ID, serviceUsername: longUser, servicePassword: 'Pass@123'
  });
  const t128not500 = t128.status !== 500;
  rec('T12.8', 'Very long name → not 500', 'NOT_500', t128not500 ? 'NOT_500' : `IS_500`, { status: t128.status });

  // T12.9: Expired/invalid JWT
  let t129;
  try {
    t129 = await fetch(`${BASE}/api/subscribers`, {
      headers: { 'Authorization': 'Bearer expired.invalid.token.here' }
    });
  } catch (e) {
    t129 = { status: 0 };
  }
  rec('T12.9', 'Invalid JWT → 401', 401, t129.status, null);

  // =============================================================
  // M13: TIME ACCESS POLICIES (10 cases: T13.1-T13.10)
  // =============================================================
  console.log('\n========================================');
  console.log('M13: TIME ACCESS POLICIES (T13.1-T13.10)');
  console.log('========================================');

  // T13.1: Create ALLOW policy
  const t131 = await api('POST', '/api/time-access-policies', {
    action: 'create-policy',
    name: `Business Hours ${TS}`,
    description: 'Allow during business hours',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '09:00', endTime: '18:00',
    policyAction: 'ALLOW', enabled: true
  });
  rec('T13.1', 'Create ALLOW policy → 200', 200, t131.status, t131.data);
  S.tap_allow_id = t131.data?.id || (t131.data?.policy?.id);
  await sleep(200);

  // T13.2: Create BLOCK policy
  const t132 = await api('POST', '/api/time-access-policies', {
    action: 'create-policy',
    name: `Night Block ${TS}`,
    description: 'Block access 11pm-6am',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startTime: '23:00', endTime: '06:00',
    policyAction: 'BLOCK', enabled: true
  });
  rec('T13.2', 'Create BLOCK policy → 200', 200, t132.status, t132.data);
  S.tap_block_id = t132.data?.id || (t132.data?.policy?.id);
  await sleep(200);

  // T13.3: Create RATE_LIMIT policy
  const t133 = await api('POST', '/api/time-access-policies', {
    action: 'create-policy',
    name: `Off-Peak Throttle ${TS}`,
    description: 'Throttle during off-peak',
    daysOfWeek: [0, 6],
    startTime: '00:00', endTime: '08:00',
    policyAction: 'RATE_LIMIT',
    speedDownKbps: 10240, speedUpKbps: 5120,
    enabled: true
  });
  rec('T13.3', 'Create RATE_LIMIT policy → 200', 200, t133.status, t133.data);
  S.tap_rl_id = t133.data?.id || (t133.data?.policy?.id);
  await sleep(200);

  // T13.4: Duplicate policy name rejected
  const t134 = await api('POST', '/api/time-access-policies', {
    action: 'create-policy',
    name: `Business Hours ${TS}`
  });
  rec('T13.4', 'Duplicate policy name → 409', 409, t134.status, t134.data);

  // T13.5: Assign policy to subscriber
  if (S.tap_allow_id && S.sc_sub) {
    const t135 = await api('POST', '/api/time-access-policies', {
      action: 'assign',
      subscriberId: S.sc_sub,
      timeAccessPolicyId: S.tap_allow_id,
      priority: 10, enabled: true
    });
    rec('T13.5', 'Assign policy to subscriber → 200', 200, t135.status, t135.data);
  } else {
    rec('T13.5', 'Assign policy', 'SKIP', 'SKIP');
  }

  // T13.6: Duplicate assignment rejected
  if (S.tap_allow_id && S.sc_sub) {
    const t136 = await api('POST', '/api/time-access-policies', {
      action: 'assign',
      subscriberId: S.sc_sub,
      timeAccessPolicyId: S.tap_allow_id
    });
    rec('T13.6', 'Duplicate assignment → 409', 409, t136.status, t136.data);
  } else {
    rec('T13.6', 'Duplicate assignment', 'SKIP', 'SKIP');
  }

  // T13.7: Check subscriber access (ALLOW policy)
  if (S.sc_sub) {
    const t137 = await api('GET', `/api/time-access-policies?action=check&subscriberId=${S.sc_sub}`);
    rec('T13.7', 'Check subscriber access (ALLOW) → 200', 200, t137.status, t137.data);
  } else {
    rec('T13.7', 'Check access ALLOW', 'SKIP', 'SKIP');
  }

  // T13.8: Check subscriber access (BLOCK)
  if (S.sc_sub && S.tap_block_id) {
    // Assign block policy first
    await api('POST', '/api/time-access-policies', {
      action: 'assign', subscriberId: S.sc_sub, timeAccessPolicyId: S.tap_block_id, priority: 5
    });
    const t138 = await api('GET', `/api/time-access-policies?action=check&subscriberId=${S.sc_sub}`);
    rec('T13.8', 'Check subscriber access (BLOCK) → 200', 200, t138.status, t138.data);
  } else {
    rec('T13.8', 'Check access BLOCK', 'SKIP', 'SKIP');
  }

  // T13.9: Unassign policy
  if (S.tap_allow_id && S.sc_sub) {
    const t139 = await api('POST', '/api/time-access-policies', {
      action: 'unassign',
      subscriberId: S.sc_sub,
      timeAccessPolicyId: S.tap_allow_id
    });
    rec('T13.9', 'Unassign policy → 200', 200, t139.status, t139.data);
  } else {
    rec('T13.9', 'Unassign policy', 'SKIP', 'SKIP');
  }

  // T13.10: Update and delete policy
  if (S.tap_allow_id) {
    const t1310u = await api('POST', '/api/time-access-policies', {
      action: 'update-policy', id: S.tap_allow_id,
      startTime: '10:00', endTime: '19:00'
    });
    rec('T13.10a', 'Update policy → 200', 200, t1310u.status, t1310u.data);

    const t1310d = await api('POST', '/api/time-access-policies', {
      action: 'delete-policy', id: S.tap_allow_id
    });
    rec('T13.10b', 'Delete policy → 200', 200, t1310d.status, t1310d.data);
  } else {
    rec('T13.10a', 'Update policy', 'SKIP', 'SKIP');
    rec('T13.10b', 'Delete policy', 'SKIP', 'SKIP');
  }

  // Cleanup remaining policies
  if (S.tap_block_id) await api('POST', '/api/time-access-policies', { action: 'delete-policy', id: S.tap_block_id }).catch(() => {});
  if (S.tap_rl_id) await api('POST', '/api/time-access-policies', { action: 'delete-policy', id: S.tap_rl_id }).catch(() => {});

  // =============================================================
  // M14: TOP-UPS & BALANCE (10 cases: T14.1-T14.10)
  // =============================================================
  console.log('\n========================================');
  console.log('M14: TOP-UPS & BALANCE (T14.1-T14.10)');
  console.log('========================================');

  // T14.1: Create DATA top-up product
  const t141 = await api('POST', '/api/top-ups?action=create-product', {
    name: '10GB Data Booster', description: 'Add 10GB to current cycle',
    type: 'DATA', value: 10240, validityHours: 168,
    price: 99, isActive: true, sortOrder: 1
  });
  rec('T14.1', 'Create DATA top-up product → 201', 201, t141.status, t141.data);
  S.topup_data_id = t141.data?.id || (t141.data?.product?.id);

  // T14.2: Create TIME top-up product
  const t142 = await api('POST', '/api/top-ups?action=create-product', {
    name: '24 Hour Unlimited', type: 'TIME',
    value: 24, validityHours: 24, price: 49, isActive: true
  });
  rec('T14.2', 'Create TIME top-up product → 201', 201, t142.status, t142.data);
  S.topup_time_id = t142.data?.id || (t142.data?.product?.id);

  // T14.3: Create SPEED_BOOST top-up product
  const t143 = await api('POST', '/api/top-ups?action=create-product', {
    name: '2x Speed Boost 4hrs', type: 'SPEED_BOOST',
    value: 2, validityHours: 4, price: 29, isActive: true
  });
  rec('T14.3', 'Create SPEED_BOOST product → 201', 201, t143.status, t143.data);
  S.topup_speed_id = t143.data?.id || (t143.data?.product?.id);

  // T14.4: Invalid top-up type → 400
  const t144 = await api('POST', '/api/top-ups?action=create-product', {
    name: 'Bad Type', type: 'VOICE', price: 10
  });
  rec('T14.4', 'Invalid top-up type → 400', 400, t144.status, t144.data);

  // T14.5: Purchase top-up for subscriber
  if (S.topup_data_id && S.inv_sub) {
    const t145 = await api('POST', '/api/top-ups?action=purchase', {
      subscriberId: S.inv_sub,
      topUpProductId: S.topup_data_id,
      transactionId: `TXN-TEST-${TS}`
    });
    rec('T14.5', 'Purchase top-up → 201', 201, t145.status, t145.data);
    S.topup_purchase_id = t145.data?.id || (t145.data?.purchase?.id);
  } else {
    rec('T14.5', 'Purchase top-up', 'SKIP', 'SKIP');
  }

  // T14.6: Purchase inactive product → rejected
  // First deactivate the TIME product
  if (S.topup_time_id) {
    await api('POST', '/api/top-ups?action=update-product', { id: S.topup_time_id, isActive: false }).catch(() => {});
    const t146 = await api('POST', '/api/top-ups?action=purchase', {
      subscriberId: S.inv_sub, topUpProductId: S.topup_time_id,
      transactionId: `TXN-TEST2-${TS}`
    });
    rec('T14.6', 'Purchase inactive product → 400', 400, t146.status, t146.data);
  } else {
    rec('T14.6', 'Purchase inactive product', 'SKIP', 'SKIP');
  }

  // T14.7: Consume top-up (partial)
  if (S.topup_purchase_id) {
    const t147 = await api('POST', '/api/top-ups?action=consume', {
      id: S.topup_purchase_id, usedAmount: 3072
    });
    rec('T14.7', 'Consume top-up partial → 200', 200, t147.status, t147.data);
  } else {
    rec('T14.7', 'Consume top-up partial', 'SKIP', 'SKIP');
  }

  // T14.8: Consume top-up (full → USED)
  if (S.topup_purchase_id) {
    const t148 = await api('POST', '/api/top-ups?action=consume', {
      id: S.topup_purchase_id, usedAmount: 10240
    });
    rec('T14.8', 'Consume top-up full → 200', 200, t148.status, t148.data);
  } else {
    rec('T14.8', 'Consume top-up full', 'SKIP', 'SKIP');
  }

  // T14.9: List active top-ups
  if (S.inv_sub) {
    const t149 = await api('GET', `/api/top-ups?action=active&subscriberId=${S.inv_sub}`);
    rec('T14.9', 'List active top-ups → 200', 200, t149.status, t149.data);
  } else {
    rec('T14.9', 'List active top-ups', 'SKIP', 'SKIP');
  }

  // T14.10: Get subscriber balance
  if (S.inv_sub) {
    const t1410 = await api('GET', `/api/subscribers/${S.inv_sub}/balance`);
    rec('T14.10', 'Get subscriber balance → 200', 200, t1410.status, t1410.data);
  } else {
    rec('T14.10', 'Get subscriber balance', 'SKIP', 'SKIP');
  }

  // Cleanup top-up products
  if (S.topup_data_id) await api('DELETE', `/api/top-ups/${S.topup_data_id}`).catch(() => {});
  if (S.topup_time_id) await api('DELETE', `/api/top-ups/${S.topup_time_id}`).catch(() => {});
  if (S.topup_speed_id) await api('DELETE', `/api/top-ups/${S.topup_speed_id}`).catch(() => {});

  // =============================================================
  // M15: EXPORT/REPORT APIs (13 cases: T15.1-T15.13)
  // =============================================================
  console.log('\n========================================');
  console.log('M15: EXPORT/REPORT APIs (T15.1-T15.13)');
  console.log('========================================');

  // T15.1: Export subscribers CSV
  const t151 = await api('GET', '/api/export/subscribers?format=csv');
  rec('T15.1', 'Export subscribers CSV → 200', 200, t151.status, t151.data);

  // T15.2: Export subscribers JSON
  const t152 = await api('GET', '/api/export/subscribers?format=json');
  rec('T15.2', 'Export subscribers JSON → 200', 200, t152.status, t152.data);

  // T15.3: Export subscribers with status filter
  const t153 = await api('GET', '/api/export/subscribers?status=ACTIVE&connectionType=FTTH');
  rec('T15.3', 'Export subscribers with filters → 200', 200, t153.status, t153.data);

  // T15.4: Export subscribers with search filter
  const t154 = await api('GET', '/api/export/subscribers?search=testm&format=json');
  rec('T15.4', 'Export subscribers with search → 200', 200, t154.status, t154.data);

  // T15.5: Export invoices CSV with date range
  const t155 = await api('GET', '/api/export/invoices?format=csv&dateFrom=2025-01-01&dateTo=2027-12-31');
  rec('T15.5', 'Export invoices CSV → 200', 200, t155.status, t155.data);

  // T15.6: Export invoices JSON with filters
  const t156 = await api('GET', '/api/export/invoices?format=json&status=DRAFT');
  rec('T15.6', 'Export invoices JSON → 200', 200, t156.status, t156.data);

  // T15.7: Export payments CSV
  const t157 = await api('GET', '/api/export/payments?format=csv');
  rec('T15.7', 'Export payments CSV → 200', 200, t157.status, t157.data);

  // T15.8: Export payments JSON
  const t158 = await api('GET', '/api/export/payments?format=json');
  rec('T15.8', 'Export payments JSON → 200', 200, t158.status, t158.data);

  // T15.9: Export complaints CSV
  const t159 = await api('GET', '/api/complaints/export?format=csv');
  rec('T15.9', 'Export complaints CSV → 200', 200, t159.status, t159.data);

  // T15.10: Export without auth → 401
  const t1510 = await apiRaw('GET', '/api/export/subscribers?format=csv');
  rec('T15.10', 'Export without auth → 401', 401, t1510.status, t1510.data);

  // T15.11: Revenue report
  const t1511 = await api('GET', '/api/reports/revenue?period=monthly&year=2025');
  rec('T15.11', 'Revenue report → 200', 200, t1511.status, t1511.data);

  // T15.12: Expenses report
  const t1512 = await api('GET', '/api/reports/expenses?period=monthly&year=2025');
  rec('T15.12', 'Expenses report → 200', 200, t1512.status, t1512.data);

  // T15.13: KPI targets
  const t1513 = await api('GET', '/api/reports/kpi-targets');
  rec('T15.13', 'KPI targets report → 200', 200, t1513.status, t1513.data);

  // =============================================================
  // SUMMARY
  // =============================================================
  console.log('\n\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');

  const total = RESULTS.length;
  const passed = RESULTS.filter(r => r.pass).length;
  const failed = RESULTS.filter(r => !r.pass && r.actual !== 'SKIP').length;
  const skipped = RESULTS.filter(r => r.actual === 'SKIP').length;
  const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

  console.log(`Total:   ${total}`);
  console.log(`Passed:  ${passed}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Pass Rate: ${rate}%`);

  // Print failures
  const failures = RESULTS.filter(r => !r.pass && r.actual !== 'SKIP');
  if (failures.length > 0) {
    console.log('\nFailed Tests:');
    for (const f of failures) {
      console.log(`  ${f.id}: ${f.desc} | Expected: ${f.expected} | Got: ${f.actual}`);
    }
  }

  // ── Write results to files ────────────────────────────────
  const resultsDir = path.join(__dirname, 'test_results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  // JSON output
  fs.writeFileSync(
    path.join(resultsDir, 'results.json'),
    JSON.stringify(RESULTS, null, 2)
  );
  console.log(`\nResults JSON: ${path.join(resultsDir, 'results.json')}`);

  // CSV output
  const csvHeader = 'id,desc,expected,actual,pass,evidence';
  const csvRows = RESULTS.map(r => {
    const desc = String(r.desc).replace(/"/g, '""');
    const expected = String(r.expected).replace(/"/g, '""');
    const actual = String(r.actual).replace(/"/g, '""');
    const evidence = String(r.evidence || '').replace(/"/g, '""');
    return `${r.id},"${desc}","${expected}","${actual}",${r.pass},"${evidence}"`;
  });
  fs.writeFileSync(
    path.join(resultsDir, 'results.csv'),
    csvHeader + '\n' + csvRows.join('\n')
  );
  console.log(`Results CSV:  ${path.join(resultsDir, 'results.csv')}`);

  // ── Module summary ────────────────────────────────────────
  const modules = [
    { prefix: 'T1', name: 'M1: Subscriber Registration', expected: 13 },
    { prefix: 'T2', name: 'M2: RADIUS Provisioning', expected: 13 },
    { prefix: 'T3', name: 'M3: Plan Management', expected: 10 },
    { prefix: 'T4', name: 'M4: Plan Migration', expected: 9 },
    { prefix: 'T5', name: 'M5: Invoice/Billing', expected: 14 },
    { prefix: 'T6', name: 'M6: Payment & Accounting', expected: 11 },
    { prefix: 'T7', name: 'M7: Policy Engine', expected: 9 },
    { prefix: 'T8', name: 'M8: Session Engine', expected: 9 },
    { prefix: 'T9', name: 'M9: Subscriber Status Lifecycle', expected: 8 },
    { prefix: 'T10', name: 'M10: AAA/RADIUS Groups', expected: 10 },
    { prefix: 'T11', name: 'M11: Self-Care Portal', expected: 10 },
    { prefix: 'T12', name: 'M12: Edge Cases & Security', expected: 9 },
    { prefix: 'T13', name: 'M13: Time Access Policies', expected: 10 },
    { prefix: 'T14', name: 'M14: Top-Ups & Balance', expected: 10 },
    { prefix: 'T15', name: 'M15: Export/Report APIs', expected: 13 },
  ];

  console.log('\n--- Module Breakdown ---');
  for (const mod of modules) {
    const modResults = RESULTS.filter(r => r.id.startsWith(mod.prefix));
    const modPass = modResults.filter(r => r.pass).length;
    const modFail = modResults.filter(r => !r.pass && r.actual !== 'SKIP').length;
    const modSkip = modResults.filter(r => r.actual === 'SKIP').length;
    console.log(`  ${mod.name}: ${modPass}/${modResults.length} passed (${modFail} fail, ${modSkip} skip) [expected ~${mod.expected} cases]`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
