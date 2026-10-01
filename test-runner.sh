#!/bin/bash
# CRYPTSK ISP Platform — Unit Test Runner
# Uses unique phone numbers and proper error handling

export PGPASSWORD='Cryptsk2026'
PGSQL='/home/z/my-project/runtime-applications/pgsql/bin/psql -h 127.0.0.1 -U z -d ispplatform -t -A'
BASE='http://localhost:3000'
OUT='/home/z/my-project/test-results.txt'
P=0; F=0; B=''

> "$OUT"

log() { echo "$1" | tee -a "$OUT"; }

r() {
  local id="$1" desc="$2" m="$3" url="$4" data="${5:-}" exp="${6:-200}"
  local resp s b
  if [ "$m" = "GET" ]; then
    resp=$(curl -s --max-time 60 -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" "$url" 2>/dev/null || echo "\n000")
  else
    resp=$(curl -s --max-time 60 -w '\n%{http_code}' -X "$m" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d "$data" "$url" 2>/dev/null || echo "\n000")
  fi
  s=$(echo "$resp" | tail -1)
  b=$(echo "$resp" | sed '$d')
  if [ "$s" = "$exp" ]; then
    P=$((P+1)); log "✅ $id: $desc (HTTP $s)"
  else
    F=$((F+1)); log "❌ $id: $desc (expected $exp, got $s) $(echo "$b" | head -c 300)"
  fi
}

db() {
  local id="$1" desc="$2" sql="$3" exp="$4"
  local val
  val=$($PGSQL -c "$sql" 2>/dev/null | tr -d '[:space:]')
  if [ "$val" = "$exp" ]; then
    P=$((P+1)); log "✅ $id: $desc (got: $val)"
  else
    F=$((F+1)); log "❌ $id: $desc (expected '$exp', got '$val')"
    B="$B  $id: $desc\n"
  fi
}

log "========================================"
log "CRYPTSK ISP PLATFORM — Unit Test Suite"
log "Started: $(date)"
log "========================================"

# Login
log ""
log "--- MODULE 1: Authentication ---"
LOGIN_RESP=$(curl -s --max-time 60 -X POST -H 'Content-Type: application/json' \
  -d '{"email":"admin@cryptsk.com","password":"Admin@2026"}' \
  $BASE/api/auth/login 2>/dev/null)
TOKEN=$(echo "$LOGIN_RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token","FAIL"))' 2>/dev/null)
if [ "$TOKEN" = "FAIL" ] || [ -z "$TOKEN" ]; then
  log "FATAL: Login failed. Response: $LOGIN_RESP"
  exit 1
fi
log "Token obtained (${#TOKEN} chars)"

r T1.1 'Login valid' POST "$BASE/api/auth/login" '{"email":"admin@cryptsk.com","password":"Admin@2026"}' 200
r T1.2 'Login wrong password' POST "$BASE/api/auth/login" '{"email":"admin@cryptsk.com","password":"wrong"}' 401
r T1.3 'Login missing fields' POST "$BASE/api/auth/login" '{"email":"admin@cryptsk.com"}' 400
r T1.4 'Get current user' GET "$BASE/api/auth/me" '' 200

# T1.5 - Unauth access
NOAUTH_S=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/subscribers 2>/dev/null)
if [ "$NOAUTH_S" = "401" ]; then
  P=$((P+1)); log "✅ T1.5: Protected route rejects unauth (401)"
else
  F=$((F+1)); log "❌ T1.5: Expected 401, got $NOAUTH_S"; B="$B  T1.5: Auth bypass on /api/subscribers\n"
fi

# --- MODULE 2: Registration ---
log ""
log "--- MODULE 2: Subscriber Registration ---"
PID=$($PGSQL -c 'SELECT "id" FROM "Plan" LIMIT 1;' | tr -d '[:space:]')
AID=$($PGSQL -c 'SELECT "id" FROM "Area" LIMIT 1;' | tr -d '[:space:]')
log "Using Plan: $PID, Area: $AID"

# Use unique phone numbers to avoid collisions
r T2.1 'Register prepaid' POST "$BASE/api/subscribers" \
  "{\"name\":\"Test Prepaid Unit\",\"email\":\"testprepaid_unit@cryptsk.test\",\"phone\":\"9111111111\",\"address\":\"123 Test\",\"areaId\":\"$AID\",\"planId\":\"$PID\",\"billingType\":\"PREPAID\",\"radiusEnabled\":true,\"connectionType\":\"FTTH\"}" 201

PRE_ID=$($PGSQL -c "SELECT \"id\" FROM \"Subscriber\" WHERE email='testprepaid_unit@cryptsk.test';" | tr -d '[:space:]')
PRE_UN=$($PGSQL -c "SELECT \"serviceUsername\" FROM \"Subscriber\" WHERE email='testprepaid_unit@cryptsk.test';" | tr -d '[:space:]')
log "  Prepaid: $PRE_ID ($PRE_UN)"

r T2.2 'Register postpaid' POST "$BASE/api/subscribers" \
  "{\"name\":\"Test Postpaid Unit\",\"email\":\"testpostpaid_unit@cryptsk.test\",\"phone\":\"9222222222\",\"address\":\"456 Test\",\"areaId\":\"$AID\",\"planId\":\"$PID\",\"billingType\":\"POSTPAID\",\"radiusEnabled\":true,\"connectionType\":\"FTTH\"}" 201

POST_ID=$($PGSQL -c "SELECT \"id\" FROM \"Subscriber\" WHERE email='testpostpaid_unit@cryptsk.test';" | tr -d '[:space:]')
POST_UN=$($PGSQL -c "SELECT \"serviceUsername\" FROM \"Subscriber\" WHERE email='testpostpaid_unit@cryptsk.test';" | tr -d '[:space:]')
log "  Postpaid: $POST_ID ($POST_UN)"

r T2.3 'Register no-RADIUS' POST "$BASE/api/subscribers" \
  "{\"name\":\"Test NoRadius Unit\",\"email\":\"testnoradius_unit@cryptsk.test\",\"phone\":\"9333333333\",\"address\":\"789 Test\",\"areaId\":\"$AID\",\"planId\":\"$PID\",\"billingType\":\"POSTPAID\",\"radiusEnabled\":false,\"connectionType\":\"FTTH\"}" 201

NR_ID=$($PGSQL -c "SELECT \"id\" FROM \"Subscriber\" WHERE email='testnoradius_unit@cryptsk.test';" | tr -d '[:space:]')

r T2.4 'Duplicate phone rejection' POST "$BASE/api/subscribers" \
  "{\"name\":\"Dup\",\"email\":\"dup_unit@cryptsk.test\",\"phone\":\"9111111111\",\"address\":\"D\",\"areaId\":\"$AID\",\"planId\":\"$PID\",\"billingType\":\"POSTPAID\",\"radiusEnabled\":false,\"connectionType\":\"FTTH\"}" 409

r T2.6 'Invalid phone rejection' POST "$BASE/api/subscribers" \
  "{\"name\":\"BadPhone\",\"email\":\"badphone_unit@cryptsk.test\",\"phone\":\"12345\",\"address\":\"B\",\"areaId\":\"$AID\",\"planId\":\"$PID\",\"billingType\":\"POSTPAID\",\"radiusEnabled\":false,\"connectionType\":\"FTTH\"}" 400

r T2.7 'Invalid email rejection' POST "$BASE/api/subscribers" \
  "{\"name\":\"BadEmail\",\"email\":\"notanemail\",\"phone\":\"9444444444\",\"address\":\"B\",\"areaId\":\"$AID\",\"planId\":\"$PID\",\"billingType\":\"POSTPAID\",\"radiusEnabled\":false,\"connectionType\":\"FTTH\"}" 400

r T2.8 'Invalid MAC rejection' POST "$BASE/api/subscribers" \
  "{\"name\":\"BadMac\",\"email\":\"badmac_unit@cryptsk.test\",\"phone\":\"9555555555\",\"address\":\"B\",\"areaId\":\"$AID\",\"planId\":\"$PID\",\"billingType\":\"POSTPAID\",\"radiusEnabled\":false,\"connectionType\":\"FTTH\",\"macAddress\":\"ZZ:ZZ:ZZ\"}" 400

# --- MODULE 3: Subscriber Management ---
log ""
log "--- MODULE 3: Subscriber Management ---"

r T3.1 'List with pagination' GET "$BASE/api/subscribers?page=1&limit=10" '' 200
r T3.2 'Search by name' GET "$BASE/api/subscribers?search=Test" '' 200
r T3.3 'Filter by ACTIVE' GET "$BASE/api/subscribers?status=ACTIVE" '' 200
r T3.4 'Filter by PREPAID' GET "$BASE/api/subscribers?billingType=PREPAID" '' 200
r T3.5 'Filter by area' GET "$BASE/api/subscribers?areaId=$AID" '' 200
r T3.6 'Get by ID' GET "$BASE/api/subscribers/$PRE_ID" '' 200
r T3.7 'Update subscriber' PUT "$BASE/api/subscribers/$PRE_ID" '{"name":"Test Prepaid Updated"}' 200

# Plan change
NEW_PID=$($PGSQL -c "SELECT \"id\" FROM \"Plan\" WHERE \"id\" != '$PID' AND \"connectionType\"='FTTH' LIMIT 1;" | tr -d '[:space:]')
if [ -n "$NEW_PID" ]; then
  r T3.8 'Plan change' PUT "$BASE/api/subscribers/$PRE_ID" "{\"planId\":\"$NEW_PID\"}" 200
fi

r T3.9 'Enable RADIUS' PUT "$BASE/api/subscribers/$NR_ID" '{"radiusEnabled":true}' 200
r T3.10 'Disable RADIUS' PUT "$BASE/api/subscribers/$NR_ID" '{"radiusEnabled":false}' 200
r T3.11 'Suspend subscriber' PUT "$BASE/api/subscribers/$PRE_ID" '{"status":"SUSPENDED"}' 200
r T3.12 'Reactivate subscriber' PUT "$BASE/api/subscribers/$PRE_ID" '{"status":"ACTIVE"}' 200
r T3.13 '360 view' GET "$BASE/api/subscribers/$PRE_ID/360" '' 200
r T3.14 'Balance' GET "$BASE/api/subscribers/$PRE_ID/balance" '' 200

# --- MODULE 4: Plan Management ---
log ""
log "--- MODULE 4: Plan Management ---"

r T4.1 'Create plan' POST "$BASE/api/plans" \
  '{"name":"UTPlan100M","type":"BROADBAND","downloadSpeed":102400,"uploadSpeed":51200,"priceMonthly":599,"validityDays":30,"dataLimitMb":102400,"billingType":"PREPAID","connectionType":"FTTH","status":"ACTIVE"}' 201

UT_PID=$($PGSQL -c "SELECT \"id\" FROM \"Plan\" WHERE name='UTPlan100M';" | tr -d '[:space:]')
UT_GID=$($PGSQL -c "SELECT \"groupId\" FROM \"Plan\" WHERE name='UTPlan100M';" | tr -d '[:space:]')
log "  Plan: $UT_PID, RADIUS Group: $UT_GID"

r T4.2 'List plans' GET "$BASE/api/plans" '' 200
if [ -n "$UT_PID" ]; then
  r T4.3 'Get plan by ID' GET "$BASE/api/plans/$UT_PID" '' 200
  r T4.4 'Update plan speeds' PUT "$BASE/api/plans/$UT_PID" '{"downloadSpeed":204800,"uploadSpeed":102400}' 200
fi

# Plan migration
if [ -n "$NEW_PID" ] && [ -n "$UT_PID" ]; then
  r T4.7 'Plan migration' POST "$BASE/api/plans/migrate" "{\"fromPlanId\":\"$NEW_PID\",\"toPlanId\":\"$UT_PID\"}" 200
fi

# --- MODULE 5: RADIUS Integration ---
log ""
log "--- MODULE 5: RADIUS Integration ---"

if [ -n "$PRE_UN" ]; then
  db T5.1a 'radcheck for prepaid user' "SELECT COUNT(*) FROM radcheck WHERE username='$PRE_UN'" '1'
  db T5.1b 'radreply for prepaid user' "SELECT COUNT(*) FROM radreply WHERE username='$PRE_UN'" '1'
  db T5.1c 'radusergroup for prepaid user' "SELECT COUNT(*) FROM radusergroup WHERE username='$PRE_UN'" '1'
fi

if [ -n "$POST_UN" ]; then
  db T5.1d 'radcheck for postpaid user' "SELECT COUNT(*) FROM radcheck WHERE username='$POST_UN'" '1'
  db T5.1e 'radreply for postpaid user' "SELECT COUNT(*) FROM radreply WHERE username='$POST_UN'" '1'
  db T5.1f 'radusergroup for postpaid user' "SELECT COUNT(*) FROM radusergroup WHERE username='$POST_UN'" '1'
fi

# Login limit (Simultaneous-Use)
SIM=$($PGSQL -c "SELECT COUNT(*) FROM radgroupcheck WHERE attribute='Simultaneous-Use';" | tr -d '[:space:]')
if [ "$SIM" -ge 1 ]; then
  P=$((P+1)); log "✅ T5.3: Simultaneous-Use found in $SIM group(s)"
else
  F=$((F+1)); log "❌ T5.3: Simultaneous-Use NOT in any radgroupcheck — login limit enforcement missing"; B="$B  T5.3: Login limits (Simultaneous-Use) missing from radgroupcheck\n"
fi

# RADIUS group from plan
if [ -n "$UT_GID" ]; then
  UT_GN=$($PGSQL -c "SELECT name FROM \"RadiusGroup\" WHERE \"id\"='$UT_GID';" | tr -d '[:space:]')
  log "  UT Group name: $UT_GN"
  db T5.2 'radgroupreply for plan group' "SELECT COUNT(*) FROM radgroupreply WHERE groupname='$UT_GN'" '1'
fi

# AAA APIs
r T5.8 'RADIUS user list' GET "$BASE/api/aaa/users" '' 200
r T5.10 'RADIUS group list' GET "$BASE/api/aaa/groups" '' 200
r T5.14 'FreeRADIUS dashboard' GET "$BASE/api/freeradius?tab=overview" '' 200

if [ -n "$PRE_UN" ]; then
  r T5.9 'RADIUS user detail' GET "$BASE/api/aaa/users/$PRE_UN" '' 200

  # Change password
  r T5.5 'Change RADIUS password' PUT "$BASE/api/aaa/users/$PRE_UN" '{"action":"change-password","newPassword":"TestPass123!"}' 200
  db T5.5b 'Password synced to radcheck' "SELECT value FROM radcheck WHERE username='$PRE_UN' AND attribute='Cleartext-Password'" 'TestPass123!'

  # Change group
  if [ -n "$UT_GN" ]; then
    r T5.6 'Change RADIUS user group' PUT "$BASE/api/aaa/users/$PRE_UN" "{\"action\":\"change-group\",\"groupname\":\"$UT_GN\"}" 200
    db T5.6b 'Group updated in radusergroup' "SELECT groupname FROM radusergroup WHERE username='$PRE_UN'" "$UT_GN"
  fi
fi

# --- MODULE 6: Billing ---
log ""
log "--- MODULE 6: Billing Engine ---"

r T6.1 'Generate invoice' POST "$BASE/api/invoices" \
  "{\"subscriberId\":\"$POST_ID\",\"planId\":\"$PID\",\"issueDate\":\"2025-07-01\",\"dueDate\":\"2025-07-10\",\"lineItems\":[{\"description\":\"Monthly broadband\",\"quantity\":1,\"rate\":599,\"amount\":599}],\"taxRate\":18}" 201

INV_ID=$($PGSQL -c "SELECT \"id\" FROM \"Invoice\" WHERE \"subscriberId\"='$POST_ID' ORDER BY \"createdAt\" DESC LIMIT 1;" | tr -d '[:space:]')
log "  Invoice: $INV_ID"

r T6.4 'List invoices' GET "$BASE/api/invoices?status=DRAFT" '' 200
if [ -n "$INV_ID" ]; then
  r T6.5 'Get invoice by ID' GET "$BASE/api/invoices/$INV_ID" '' 200
  r T6.6 'Update invoice discount' PUT "$BASE/api/invoices/$INV_ID" '{"discountAmount":50}' 200
fi

# --- MODULE 7: Payments ---
log ""
log "--- MODULE 7: Payments ---"

if [ -n "$INV_ID" ]; then
  r T7.1 'Record cash payment' POST "$BASE/api/payments" \
    "{\"subscriberId\":\"$POST_ID\",\"invoiceId\":\"$INV_ID\",\"amount\":549,\"mode\":\"CASH\"}" 201

  PAY_ID=$($PGSQL -c "SELECT \"id\" FROM \"Payment\" WHERE \"invoiceId\"='$INV_ID' LIMIT 1;" | tr -d '[:space:]')
  log "  Payment: $PAY_ID"

  if [ -n "$PAY_ID" ]; then
    r T7.2 'Verify payment' PUT "$BASE/api/payments/$PAY_ID" '{"action":"verify"}' 200
  fi
fi

r T7.4 'List payments' GET "$BASE/api/payments" '' 200

# --- MODULE 13: Security ---
log ""
log "--- MODULE 13: Security Tests ---"

for tid tdesc turl in \
  'T13.2' 'Unauth session-history' 'http://localhost:3000/api/aaa/session-history' \
  'T13.3' 'Unauth auth-log' 'http://localhost:3000/api/aaa/auth-log' \
  'T13.4' 'Unauth freeradius' 'http://localhost:3000/api/freeradius?tab=overview'; do
  S=$(curl -s -o /dev/null -w '%{http_code}' "$turl" 2>/dev/null)
  if [ "$S" = "401" ]; then
    P=$((P+1)); log "✅ $tid: $tdesc returns 401"
  else
    F=$((F+1)); log "❌ $tid: $tdesc should return 401, got $S"; B="$B  $tid: Auth bypass on $tdesc\n"
  fi
done

# --- SUMMARY ---
log ""
log "========================================"
log "FINAL RESULTS: Pass=$P Fail=$F"
log "========================================"

if [ -n "$B" ]; then
  log ""
  log "🐛 BUGS/GAPS FOUND:"
  log -e "$B"
fi

log ""
log "Completed: $(date)"
