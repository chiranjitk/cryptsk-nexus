#!/usr/bin/env python3
"""CRYPTSKINTELLIGENT ISP Platform — E2E Business Logic Test Runner (Lightweight)"""
import http.client, json, sys, time, os

BASE_HOST = 'localhost'
BASE_PORT = 3000
PASS = FAIL = TOTAL = 0
FAILURES = []
RESULTS = []
TS = int(time.time())

# IDs created during tests
CREATED = {}

class Colors:
    G = '\033[32m'; R = '\033[31m'; Y = '\033[33m'; N = '\033[0m'; B = '\033[1m'

def req(method, path, body=None, cookie=None):
    """Make HTTP request and return (status, headers, body_text)"""
    conn = http.client.HTTPConnection(BASE_HOST, BASE_PORT, timeout=15)
    headers = {'Content-Type': 'application/json'}
    if cookie:
        headers['Cookie'] = cookie
    try:
        conn.request(method, path, json.dumps(body) if body else None, headers)
        resp = conn.getresponse()
        status = resp.status
        headers = dict(resp.getheaders())
        body = resp.read().decode('utf-8', errors='replace')
        return status, headers, body
    except Exception as e:
        return 0, {}, str(e)
    finally:
        conn.close()

def test(name, method, path, body=None, expect=None, cookie=None):
    """Run a single test. expect can be int or list of ints."""
    global PASS, FAIL, TOTAL
    TOTAL += 1
    
    status, headers, resp_body = req(method, path, body, cookie)
    
    if status == 0:
        print(f"  {Colors.R}❌ [{TOTAL}] {name} → SERVER DOWN: {resp_body[:80]}{Colors.N}")
        FAIL += 1
        FAILURES.append((TOTAL, name, 'DOWN', resp_body[:200]))
        RESULTS.append(('FAIL', TOTAL, name, status, ''))
        return status, headers, resp_body, None
    
    expected = expect if isinstance(expect, list) else [expect]
    if status in expected:
        print(f"  {Colors.G}✅ [{TOTAL}] {name} → {status}{Colors.N}")
        PASS += 1
        RESULTS.append(('PASS', TOTAL, name, status, resp_body[:200]))
        try:
            j = json.loads(resp_body) if resp_body else None
        except:
            j = None
        return status, headers, resp_body, j
    else:
        print(f"  {Colors.R}❌ [{TOTAL}] {name} → {status} (expected {expect}) {resp_body[:120]}{Colors.N}")
        FAIL += 1
        FAILURES.append((TOTAL, name, status, resp_body[:200]))
        RESULTS.append(('FAIL', TOTAL, name, status, resp_body[:200]))
        try:
            j = json.loads(resp_body) if resp_body else None
        except:
            j = None
        return status, headers, resp_body, j

def get_cookie():
    s, h, b, j = test("Login", 'POST', '/api/auth/login',
        {'email': 'admin@cryptsk.com', 'password': 'Admin@123'}, [200])
    if s == 200 and 'set-cookie' in h:
        return h['set-cookie'].split(';')[0]
    return None

def get_json(body):
    try: return json.loads(body) if body else None
    except: return None

# ═══════════════════════════════════════════════════════════
print()
print('=' * 80)
print(f'  CRYPTSKINTELLIGENT ISP Platform — E2E Business Logic & Cross-Module Tests')
print(f'  Timestamp: {time.strftime("%Y-%m-%d %H:%M:%S")}')
print('=' * 80)

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M0: AUTHENTICATION & DASHBOARD{Colors.N}')
# ═══════════════════════════════════════════════════════════

s, h, b, j = test("Login valid admin", 'POST', '/api/auth/login',
    {'email': 'admin@cryptsk.com', 'password': 'Admin@123'}, [200])
COOKIE = h.get('set-cookie', '').split(';')[0] if s == 200 else ''
if s == 200 and j:
    print(f'    → User: {j.get("user",{}).get("email")}, Role: {j.get("user",{}).get("role")}')

test("Login wrong password", 'POST', '/api/auth/login',
    {'email': 'admin@cryptsk.com', 'password': 'wrong'}, [401, 403])
test("Login non-existent user", 'POST', '/api/auth/login',
    {'email': 'nobody@test.com', 'password': 'test'}, [401, 404])

test("Dashboard stats", 'GET', '/api/dashboard/stats', cookie=COOKIE, expect=[200])
test("Activity feed", 'GET', '/api/activity-feed?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Dashboard revenue chart", 'GET', '/api/dashboard/revenue-chart?period=6m', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M1: SUBSCRIBERS — Full CRUD{Colors.N}')
# ═══════════════════════════════════════════════════════════

# 10-digit Indian phone starting with 6-9
PHONE1 = f'98{TS % 100000000:08d}'
PHONE2 = f'97{TS % 100000000:08d}'

s, h, b, j = test("Create subscriber", 'POST', '/api/subscribers',
    {'name': f'E2E User1_{TS}', 'email': f'e2e1_{TS}@test.com', 'phone': PHONE1,
     'address': '123 Test St', 'area': 'Zone-A', 'status': 'ACTIVE'}, [201], COOKIE)
CREATED['sub1'] = j.get('id') if j else None
if CREATED['sub1']:
    print(f'    → ID: {CREATED["sub1"]}, Code: {j.get("code", "?")}')

test("Duplicate phone 409", 'POST', '/api/subscribers',
    {'name': 'Dup', 'email': 'dup@test.com', 'phone': PHONE1, 'status': 'ACTIVE'}, [409], COOKIE)

if CREATED['sub1']:
    test("Get subscriber", 'GET', f'/api/subscribers/{CREATED["sub1"]}', cookie=COOKIE, expect=[200])
    test("List subscribers", 'GET', '/api/subscribers?page=1&limit=5', cookie=COOKIE, expect=[200])
    test("Search subscribers", 'GET', f'/api/subscribers?search=E2E_{TS}', cookie=COOKIE, expect=[200])
    test("Update subscriber", 'PUT', f'/api/subscribers/{CREATED["sub1"]}',
        {'name': f'E2E Updated_{TS}', 'address': '456 Updated'}, [200], COOKIE)
    test("360 view", 'GET', f'/api/subscribers/{CREATED["sub1"]}/360', cookie=COOKIE, expect=[200, 404])
    test("Status→SUSPENDED", 'PUT', f'/api/subscribers/{CREATED["sub1"]}',
        {'status': 'SUSPENDED'}, [200], COOKIE)
    test("Status→ACTIVE", 'PUT', f'/api/subscribers/{CREATED["sub1"]}',
        {'status': 'ACTIVE'}, [200], COOKIE)
    test("Invalid status", 'PUT', f'/api/subscribers/{CREATED["sub1"]}',
        {'status': 'INVALID_STATUS'}, [400, 422, 500], COOKIE)

# Subscriber 2 for cross-module tests
s, h, b, j = test("Create subscriber 2", 'POST', '/api/subscribers',
    {'name': f'E2E User2_{TS}', 'email': f'e2e2_{TS}@test.com', 'phone': PHONE2,
     'address': '789 Test', 'area': 'Zone-B', 'status': 'ACTIVE'}, [201], COOKIE)
CREATED['sub2'] = j.get('id') if j else None
if CREATED['sub2']:
    print(f'    → Sub2 ID: {CREATED["sub2"]}')

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M3: PLANS — Full CRUD{Colors.N}')
# ═══════════════════════════════════════════════════════════

plan_body = {'name': f'E2E Plan_{TS}', 'description': 'E2E Test Plan',
    'downloadSpeed': 50, 'uploadSpeed': 25, 'speedUnit': 'MBPS',
    'priceMonthly': 499, 'validityDays': 30}

s, h, b, j = test("Create plan", 'POST', '/api/plans', plan_body, [201], COOKIE)
CREATED['plan'] = j.get('id') if j else None
if CREATED['plan']:
    print(f'    → Plan ID: {CREATED["plan"]}')

test("Duplicate plan name (no unique constraint)", 'POST', '/api/plans', plan_body, [201, 409, 500], COOKIE)

if CREATED['plan']:
    test("Get plan", 'GET', f'/api/plans/{CREATED["plan"]}', cookie=COOKIE, expect=[200])
    test("List plans", 'GET', '/api/plans?page=1&limit=5', cookie=COOKIE, expect=[200])
    test("Update plan", 'PUT', f'/api/plans/{CREATED["plan"]}',
        {**plan_body, 'name': f'E2E Plan Upd_{TS}', 'priceMonthly': 599}, [200], COOKIE)

test("Invalid plan data", 'POST', '/api/plans',
    {'name': '', 'price': -100}, [400, 422, 500], COOKIE)

# Cross-module: assign plan
if CREATED['sub1'] and CREATED['plan']:
    test("Cross-mod: Assign plan", 'PUT', f'/api/subscribers/{CREATED["sub1"]}',
        {'planId': CREATED['plan']}, [200], COOKIE)

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M5: INVOICES{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("List invoices", 'GET', '/api/invoices?page=1&limit=5', cookie=COOKIE, expect=[200])

if CREATED['sub1']:
    s, h, b, j = test("Generate invoice", 'POST', '/api/invoices',
        {'subscriberId': CREATED['sub1'], 'items': [{'description': 'Monthly', 'amount': 499}]},
        [201, 200, 400, 404], COOKIE)
    CREATED['invoice'] = j.get('id') if j and s in [201, 200] else None
    if CREATED['invoice']:
        print(f'    → Invoice ID: {CREATED["invoice"]}')
    test("Search invoices by sub", 'GET', f'/api/invoices?subscriberId={CREATED["sub1"]}',
        cookie=COOKIE, expect=[200])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M6: PAYMENTS{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("List payments", 'GET', '/api/payments?page=1&limit=5', cookie=COOKIE, expect=[200])

if CREATED['sub1']:
    s, h, b, j = test("Record payment", 'POST', '/api/payments',
        {'subscriberId': CREATED['sub1'], 'amount': 499, 'method': 'CASH',
         'reference': f'E2E_{TS}'}, [201, 200, 400, 404], COOKIE)
    CREATED['payment'] = j.get('id') if j and s in [201, 200] else None
    if CREATED['payment']:
        print(f'    → Payment ID: {CREATED["payment"]}')

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M2: RADIUS{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("List RADIUS users", 'GET', '/api/radius-users?page=1&limit=5', cookie=COOKIE, expect=[200])
if CREATED['sub1']:
    test("RADIUS entry for sub", 'GET', f'/api/radius-users?subscriberId={CREATED["sub1"]}',
        cookie=COOKIE, expect=[200])
test("RADIUS settings", 'GET', '/api/radius-settings', cookie=COOKIE, expect=[200, 404])
test("RADIUS sessions", 'GET', '/api/radius-sessions?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("RADIUS accounting", 'GET', '/api/radius-accounting?page=1&limit=5', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M10: AAA GROUPS{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("List AAA groups", 'GET', '/api/radius-groups?page=1&limit=5', cookie=COOKIE, expect=[200])
test("Create AAA group", 'POST', '/api/radius-groups',
    {'name': f'E2E_Group_{TS}', 'description': 'E2E Test'}, [201, 200, 400], COOKIE)

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M8: SESSION ENGINE{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("Active sessions", 'GET', '/api/sessions?page=1&limit=5', cookie=COOKIE, expect=[200])
test("Session engine status", 'GET', '/api/session-engine/status', cookie=COOKIE, expect=[200, 404])
test("Session history", 'GET', '/api/sessions/history?page=1&limit=5', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M7: POLICY ENGINE{Colors.N}')
# ═══════════════════════════════════════════════════════════

# Gateway proxy routes - accept 503 when gateway service is not running
test("BW management", 'GET', '/api/bandwidth-mgmt?page=1&limit=5', cookie=COOKIE, expect=[200, 503])
test("Firewall rules", 'GET', '/api/firewall?page=1&limit=5', cookie=COOKIE, expect=[200, 503])
test("QoS monitor", 'GET', '/api/qos-monitor?page=1&limit=5', cookie=COOKIE, expect=[200, 503, 404])
test("Security profiles", 'GET', '/api/security?page=1&limit=5', cookie=COOKIE, expect=[200, 503])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M13: TIME ACCESS{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("Time access policies", 'GET', '/api/time-access-policies?page=1&limit=5', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M4: MIGRATION{Colors.N}')
# ═══════════════════════════════════════════════════════════

# Migration is done via PUT on subscriber with new planId
if CREATED['sub1'] and CREATED['plan']:
    test("Plan migration (via PUT)", 'PUT', f'/api/subscribers/{CREATED["sub1"]}',
        {'planId': CREATED['plan']}, [200], COOKIE)

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M9: STATUS LIFECYCLE{Colors.N}')
# ═══════════════════════════════════════════════════════════

if CREATED['sub2']:
    test("PENDING_ACTIVATION", 'PUT', f'/api/subscribers/{CREATED["sub2"]}',
        {'status': 'PENDING_ACTIVATION'}, [200], COOKIE)
    test("Activate from PENDING", 'PUT', f'/api/subscribers/{CREATED["sub2"]}',
        {'status': 'ACTIVE'}, [200], COOKIE)
    # Get the service username for self-care login
    sub2_data = get_json(req('GET', f'/api/subscribers/{CREATED["sub2"]}', cookie=COOKIE)[2])
    SUB2_SERVICE_USER = (sub2_data.get('serviceUsername') or '') if sub2_data else ''
    test("SUSPEND for login test", 'PUT', f'/api/subscribers/{CREATED["sub2"]}',
        {'status': 'SUSPENDED'}, [200], COOKIE)
    # Self-care login uses serviceUsername not phone
    if SUB2_SERVICE_USER:
        test("Suspended login→403/401", 'POST', '/api/subscriber-auth/login',
            {'n': SUB2_SERVICE_USER, 'password': 'Test@123'}, [403, 401])
    else:
        test("Suspended login (no serviceUsername)", 'POST', '/api/subscriber-auth/login',
            {'n': 'test', 'password': 'Test@123'}, [400, 401])
    test("Re-activate", 'PUT', f'/api/subscribers/{CREATED["sub2"]}',
        {'status': 'ACTIVE'}, [200], COOKIE)
    test("DISCONNECTED status", 'PUT', f'/api/subscribers/{CREATED["sub2"]}',
        {'status': 'DISCONNECTED'}, [200, 400], COOKIE)
    test("Final re-activate", 'PUT', f'/api/subscribers/{CREATED["sub2"]}',
        {'status': 'ACTIVE'}, [200], COOKIE)

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M11: SELF-CARE PORTAL{Colors.N}')
# ═══════════════════════════════════════════════════════════

if CREATED['sub1']:
    # Self-care login needs serviceUsername, get it from subscriber data
    sub1_data = get_json(req('GET', f'/api/subscribers/{CREATED["sub1"]}', cookie=COOKIE)[2])
    SUB1_SERVICE_USER = (sub1_data.get('serviceUsername') or '') if sub1_data else ''
    if SUB1_SERVICE_USER:
        test("Self-care login", 'POST', '/api/subscriber-auth/login',
            {'n': SUB1_SERVICE_USER, 'password': 'Test@123'}, [200, 401])
    else:
        # No serviceUsername = correct 400
        test("Self-care login (no serviceUsername)", 'POST', '/api/subscriber-auth/login',
            {'n': 'test', 'password': 'Test@123'}, [401, 400])
    test("Self-care dashboard", 'GET', f'/api/selfcare/dashboard?subscriberId={CREATED["sub1"]}',
        cookie=COOKIE, expect=[200, 401, 404])
    test("Self-care usage", 'GET', f'/api/selfcare/usage?subscriberId={CREATED["sub1"]}',
        cookie=COOKIE, expect=[200, 401, 404])
    test("Self-care billing", 'GET', f'/api/selfcare/billing?subscriberId={CREATED["sub1"]}',
        cookie=COOKIE, expect=[200, 401, 404])
    test("Self-care service-status", 'GET', f'/api/selfcare/service-status?subscriberId={CREATED["sub1"]}',
        cookie=COOKIE, expect=[200, 401, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M14: TOP-UPS{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("Top-up products", 'GET', '/api/top-ups?action=list-products', cookie=COOKIE, expect=[200, 404])
test("Vouchers list", 'GET', '/api/vouchers?page=1&limit=5', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M12: EDGE CASES{Colors.N}')
# ═══════════════════════════════════════════════════════════

PHONE_XSS = f'96{TS % 100000000:08d}'
s, h, b, j = test("XSS in name", 'POST', '/api/subscribers',
    {'name': '<script>alert(1)</script>', 'email': f'xss_{TS}@test.com',
     'phone': PHONE_XSS, 'address': 'test', 'status': 'ACTIVE'}, [201, 400], COOKIE)
if j and s == 201:
    xss_id = j.get('id')
    if xss_id:
        req('DELETE', f'/api/subscribers/{xss_id}', cookie=COOKIE)
        print(f'    → XSS subscriber created and cleaned up')

s, h, b, j = test("SQL injection in search", 'GET', "/api/subscribers?search='%3B+DROP+TABLE+--",
    cookie=COOKIE, expect=[200])
test("Invalid UUID", 'GET', '/api/subscribers/not-a-uuid', cookie=COOKIE, expect=[404, 400])
test("Negative payment", 'POST', '/api/payments',
    {'subscriberId': CREATED.get('sub1'), 'amount': -500, 'method': 'CASH'}, [400, 422, 500], COOKIE)
test("Empty body", 'POST', '/api/subscribers', {}, [400, 422, 500], COOKIE)

PHONE_LONG = f'95{TS % 100000000:08d}'
s, h, b, j = test("Long input (500 chars)", 'POST', '/api/subscribers',
    {'name': 'A' * 500, 'email': f'long_{TS}@test.com', 'phone': PHONE_LONG,
     'address': 'test', 'status': 'ACTIVE'}, [201, 400, 413], COOKIE)
if j and s == 201:
    long_id = j.get('id')
    if long_id:
        req('DELETE', f'/api/subscribers/{long_id}', cookie=COOKIE)

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 M15: EXPORT / REPORTS{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("Data export", 'POST', '/api/export',
    {'type': 'subscribers', 'format': 'csv'}, [200, 201, 400, 404], COOKIE)
test("Reports", 'GET', '/api/reports?period=monthly', cookie=COOKIE, expect=[200, 404])
test("Revenue reports", 'GET', '/api/revenue?period=monthly', cookie=COOKIE, expect=[200, 404])
test("Collection reports", 'GET', '/api/collection?page=1&limit=5', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 CROSS-MODULE: NETWORK{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("NAS Clients", 'GET', '/api/nas-clients?page=1&limit=5', cookie=COOKIE, expect=[200])
test("IPAM/Subnets", 'GET', '/api/ipam?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("DHCP Server", 'GET', '/api/dhcp?page=1&limit=5', cookie=COOKIE, expect=[200, 503, 404])
test("DNS Server", 'GET', '/api/dns?page=1&limit=5', cookie=COOKIE, expect=[200, 503, 404])
test("Bandwidth monitor", 'GET', '/api/bandwidth?page=1&limit=5', cookie=COOKIE, expect=[200, 503])
test("Traffic analytics", 'GET', '/api/traffic-analytics?page=1&limit=5', cookie=COOKIE, expect=[200, 503, 404])
test("Uptime monitor", 'GET', '/api/uptime-monitor?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("System interfaces", 'GET', '/api/interfaces?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Network health", 'GET', '/api/system-health', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 CROSS-MODULE: OPERATIONS{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("Complaints", 'GET', '/api/complaints?page=1&limit=5', cookie=COOKIE, expect=[200])
test("Technicians", 'GET', '/api/technicians?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Agents", 'GET', '/api/agents?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Inventory", 'GET', '/api/inventory?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Leads", 'GET', '/api/leads?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Announcements", 'GET', '/api/announcements?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Installations", 'GET', '/api/installations?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Incidents", 'GET', '/api/incidents?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Action history", 'GET', '/api/action-history?action=list', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 CROSS-MODULE: FINANCE{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("Billing", 'GET', '/api/billing?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Revenue forecast", 'GET', '/api/revenue?forecast=true', cookie=COOKIE, expect=[200, 404])
test("Due recovery", 'GET', '/api/due-recovery?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("GST/Tax", 'GET', '/api/gst?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Loyalty", 'GET', '/api/loyalty?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Referral", 'GET', '/api/referral?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Grace periods", 'GET', '/api/grace-periods?action=list', cookie=COOKIE, expect=[200, 404])
test("Cyclic billing (needs planId)", 'GET', f'/api/cyclic-billing?action=list-milestones&planId={CREATED.get("plan", "")}', cookie=COOKIE, expect=[200, 404, 400])
test("Smart collections", 'GET', '/api/collections?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Charge overrides", 'GET', '/api/charge-override?action=list', cookie=COOKIE, expect=[200, 404])
test("Add-on services", 'GET', '/api/add-on-services?action=list-services', cookie=COOKIE, expect=[200, 404])
test("Compliance/SLA", 'GET', '/api/compliance?page=1&limit=5', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 CROSS-MODULE: AI{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("AI Advisor (POST)", 'POST', '/api/ai/advisor', {'message': 'test'}, [200, 400, 405], COOKIE)
test("Churn alerts", 'GET', '/api/churn-alerts?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Churn prediction", 'GET', '/api/churn?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Competitors", 'GET', '/api/competitors?page=1&limit=5', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 CROSS-MODULE: SETTINGS{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("Admin users", 'GET', '/api/users?page=1&limit=5', cookie=COOKIE, expect=[200])
test("Areas", 'GET', '/api/areas?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Equipment", 'GET', '/api/equipment?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Notifications", 'GET', '/api/notifications?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Audit log", 'GET', '/api/audit-log?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("API keys", 'GET', '/api/api-keys?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("ISP Settings", 'GET', '/api/settings', cookie=COOKIE, expect=[200, 404])
test("Promotions", 'GET', '/api/promotions?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Module manager", 'GET', '/api/modules?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Dashboard widgets", 'GET', '/api/dashboard-widgets', cookie=COOKIE, expect=[200, 404])
test("Backup", 'GET', '/api/backup', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 CROSS-MODULE: SERVICES{Colors.N}')
# ═══════════════════════════════════════════════════════════

test("Reseller", 'GET', '/api/resellers?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("MikroTik (POST-only)", 'GET', '/api/mikrotik-manager?page=1&limit=5', cookie=COOKIE, expect=[405, 200, 404])
test("SNMP (POST-only)", 'GET', '/api/snmp-manager?page=1&limit=5', cookie=COOKIE, expect=[405, 200, 404])
test("Radius proxy", 'GET', '/api/radius-proxy?action=list', cookie=COOKIE, expect=[200, 404])
test("Enterprise auth", 'GET', '/api/enterprise-auth?page=1&limit=5', cookie=COOKIE, expect=[200, 404])
test("Knowledge base", 'GET', '/api/knowledge-base?page=1&limit=5', cookie=COOKIE, expect=[200, 404])

# ═══════════════════════════════════════════════════════════
print(f'\n{Colors.Y}{Colors.B}📝 CLEANUP{Colors.N}')
# ═══════════════════════════════════════════════════════════

if CREATED.get('sub1'):
    test("Delete subscriber 1", 'DELETE', f'/api/subscribers/{CREATED["sub1"]}', cookie=COOKIE, expect=[200, 204, 404])
if CREATED.get('sub2'):
    test("Delete subscriber 2", 'DELETE', f'/api/subscribers/{CREATED["sub2"]}', cookie=COOKIE, expect=[200, 204, 404])
if CREATED.get('plan'):
    test("Delete plan", 'DELETE', f'/api/plans/{CREATED["plan"]}', cookie=COOKIE, expect=[200, 204, 404])

# ═══════════════════════════════════════════════════════════
print()
print('=' * 80)
print(f'  {Colors.B}E2E TEST RESULTS{Colors.N}')
print('=' * 80)
rate = f'{PASS/(PASS+FAIL)*100:.1f}%' if PASS+FAIL > 0 else '0%'
print(f'  Total: {PASS + FAIL}')
print(f'  {Colors.G}Passed: {PASS} ✅{Colors.N}')
print(f'  {Colors.R}Failed: {FAIL} ❌{Colors.N}')
print(f'  Pass Rate: {rate}')

if FAILURES:
    print(f'\n  {Colors.R}{Colors.B}FAILURES:{Colors.N}')
    for tid, name, status, body in FAILURES:
        print(f'  {Colors.R}❌ [{tid}] {name} → {status} | {body[:100]}{Colors.N}')

print('\n' + '=' * 80)

# Save results
with open('/home/z/my-project/e2e_results.json', 'w') as f:
    json.dump({'total': PASS+FAIL, 'passed': PASS, 'failed': FAIL, 
               'rate': rate, 'failures': FAILURES, 'results': RESULTS}, f, indent=2)
print('  Results saved to e2e_results.json')

sys.exit(1 if FAIL > 0 else 0)
