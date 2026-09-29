# CRYPTSKINTELLIGENT-ISP-PLATFORM — Enterprise Unit Test Plan

**Version:** 1.0  
**Date:** 2025-07-30  
**Scope:** Subscriber Management, Registration, Renewal, Plan Change, Policy Engine, Session Engine, Billing Engine, Postpaid/Prepaid, Invoice, Accounting, FreeRADIUS Integration  
**Environment:** PostgreSQL 18 + FreeRADIUS 3.2.7 + Next.js 16  
**Test Type:** API-level integration tests (curl-based) + Database verification + RADIUS table verification

---

## Test Prerequisites

```bash
# Server must be running on port 3000
# PostgreSQL must be running on port 5432
# Auth token obtained from login

LOGIN_EMAIL="admin@cryptsk.com"
LOGIN_PASS="Admin@2026"
BASE_URL="http://localhost:3000"
PG_BIN="/home/z/my-project/runtime-applications/pgsql/bin/psql"
PG_CONN="PGPASSWORD='Cryptsk2026' $PG_BIN -h 127.0.0.1 -U z -d ispplatform -t -A"
```

---

## MODULE 1: Authentication & Authorization

### T1.1 — Login with valid credentials
- **Method:** POST `/api/auth/login`
- **Body:** `{"email":"admin@cryptsk.com","password":"Admin@2026"}`
- **Expect:** 200, `success:true`, JWT token in response
- **Verify:** Token is a valid JWT with `userId`, `role`, `exp`

### T1.2 — Login with wrong password
- **Method:** POST `/api/auth/login`
- **Body:** `{"email":"admin@cryptsk.com","password":"wrong"}`
- **Expect:** 401, error message

### T1.3 — Login with missing fields
- **Method:** POST `/api/auth/login`
- **Body:** `{"email":"admin@cryptsk.com"}`
- **Expect:** 400, validation error

### T1.4 — Get current user (me)
- **Method:** GET `/api/auth/me`
- **Headers:** `Authorization: Bearer <token>`
- **Expect:** 200, user object with role SUPER_ADMIN

### T1.5 — Access protected route without token
- **Method:** GET `/api/subscribers`
- **Expect:** 401

### T1.6 — Brute force lockout (5 attempts)
- **Method:** POST `/api/auth/login` x5 with wrong password
- **Expect:** Account locked after 5th attempt

---

## MODULE 2: Subscriber Registration

### T2.1 — Register new prepaid subscriber
- **Method:** POST `/api/subscribers`
- **Body:** Full subscriber payload with `billingType:"PREPAID"`, `radiusEnabled:true`
- **Expect:** 201, subscriber object with auto-generated code (CRY#####), service username
- **DB Verify:** Row in `"Subscriber"` table, row in `"RadiusUser"` table

### T2.2 — Register new postpaid subscriber
- **Method:** POST `/api/subscribers`
- **Body:** Full subscriber payload with `billingType:"POSTPAID"`, `radiusEnabled:true`
- **Expect:** 201, subscriber created

### T2.3 — Register subscriber without RADIUS
- **Method:** POST `/api/subscribers`
- **Body:** Subscriber with `radiusEnabled:false`
- **Expect:** 201, no RadiusUser created

### T2.4 — Duplicate phone number rejection
- **Method:** POST `/api/subscribers` with existing phone
- **Expect:** 409 or validation error

### T2.5 — Duplicate username rejection
- **Method:** POST `/api/subscribers` with existing service username
- **Expect:** 409 or validation error

### T2.6 — Invalid phone number rejection
- **Method:** POST `/api/subscribers` with phone `"12345"`
- **Expect:** 400, validation error

### T2.7 — Invalid email rejection
- **Method:** POST `/api/subscribers` with email `"notanemail"`
- **Expect:** 400, validation error

### T2.8 — Invalid MAC address rejection
- **Method:** POST `/api/subscribers` with MAC `"ZZ:ZZ:ZZ"`
- **Expect:** 400, validation error

---

## MODULE 3: Subscriber Management (CRUD)

### T3.1 — List subscribers with pagination
- **Method:** GET `/api/subscribers?page=1&limit=10`
- **Expect:** 200, array with pagination metadata

### T3.2 — Search subscriber by name/phone/code
- **Method:** GET `/api/subscribers?search=CRY`
- **Expect:** 200, filtered results

### T3.3 — Filter by status
- **Method:** GET `/api/subscribers?status=ACTIVE`
- **Expect:** 200, only ACTIVE subscribers

### T3.4 — Filter by billing type
- **Method:** GET `/api/subscribers?billingType=PREPAID`
- **Expect:** 200, only PREPAID subscribers

### T3.5 — Filter by area
- **Method:** GET `/api/subscribers?areaId=<id>`
- **Expect:** 200, filtered by area

### T3.6 — Get subscriber by ID (with includes)
- **Method:** GET `/api/subscribers/<id>`
- **Expect:** 200, full subscriber with plan, area, radiusUser, invoices, payments

### T3.7 — Update subscriber details
- **Method:** PUT `/api/subscribers/<id>`
- **Body:** Updated name, phone, planId
- **Expect:** 200, updated subscriber

### T3.8 — Update subscriber plan (plan change)
- **Method:** PUT `/api/subscribers/<id>` with new `planId`
- **Expect:** 200, plan changed
- **DB Verify:** Subscriber's `"planId"` updated
- **RADIUS Verify:** `radusergroup` updated to new group (if applicable)

### T3.9 — Enable RADIUS on existing subscriber
- **Method:** PUT `/api/subscribers/<id>` with `radiusEnabled:true`
- **Expect:** 200, RadiusUser created
- **RADIUS Verify:** Row in `radcheck`, `radreply`, `radusergroup`

### T3.10 — Disable RADIUS on subscriber
- **Method:** PUT `/api/subscribers/<id>` with `radiusEnabled:false`
- **Expect:** 200, RadiusUser deleted
- **RADIUS Verify:** Rows removed from `radcheck`, `radreply`, `radusergroup`

### T3.11 — Suspend subscriber
- **Method:** PUT `/api/subscribers/<id>` with `status:"SUSPENDED"`
- **Expect:** 200

### T3.12 — Delete subscriber
- **Method:** DELETE `/api/subscribers/<id>`
- **Expect:** 200
- **BUG CHECK:** Verify `radcheck`/`radreply`/`radusergroup` are cleaned up (known gap)

### T3.13 — Subscriber 360 view
- **Method:** GET `/api/subscribers/<id>/360`
- **Expect:** 200, comprehensive subscriber data

### T3.14 — Subscriber balance
- **Method:** GET `/api/subscribers/<id>/balance`
- **Expect:** 200, outstanding balance calculation

---

## MODULE 4: Plan Management

### T4.1 — Create new plan
- **Method:** POST `/api/plans`
- **Body:** Full plan with speed, price, tax, data limit, SLA
- **Expect:** 201, plan created with auto-generated RADIUS group
- **RADIUS Verify:** `radgroupreply` has `Mikrotik-Rate-Limit` attribute

### T4.2 — List plans
- **Method:** GET `/api/plans`
- **Expect:** 200, array with subscriber counts

### T4.3 — Get plan by ID
- **Method:** GET `/api/plans/<id>`
- **Expect:** 200, full plan details

### T4.4 — Update plan speeds
- **Method:** PUT `/api/plans/<id>` with new download/upload speed
- **Expect:** 200
- **BUG CHECK:** Verify `radgroupreply` `Mikrotik-Rate-Limit` is updated (known gap)

### T4.5 — Delete plan with active subscribers
- **Method:** DELETE `/api/plans/<id>` (plan with subscribers)
- **Expect:** 400/409, rejection

### T4.6 — Delete plan without subscribers
- **Method:** DELETE `/api/plans/<id>` (empty plan)
- **Expect:** 200

### T4.7 — Plan migration (bulk plan change)
- **Method:** POST `/api/plans/migrate`
- **Body:** `{"fromPlanId":"...","toPlanId":"..."}`
- **Expect:** 200, migration count
- **BUG CHECK:** Verify subscribers' `radiusGroupId` is updated (known gap)

---

## MODULE 5: RADIUS Integration (FreeRADIUS Table Verification)

### T5.1 — Verify RADIUS user creation sync
- **Action:** Create subscriber with `radiusEnabled:true`
- **DB Verify:** `SELECT * FROM radcheck WHERE username='<serviceUsername>'` → has `Cleartext-Password`
- **DB Verify:** `SELECT * FROM radreply WHERE username='<serviceUsername>'` → has `Mikrotik-Rate-Limit`
- **DB Verify:** `SELECT * FROM radusergroup WHERE username='<serviceUsername>'` → has group assignment

### T5.2 — Verify RADIUS group creation sync
- **Action:** Create new plan (auto-creates RADIUS group)
- **DB Verify:** `SELECT * FROM radgroupreply WHERE groupname='<planName>'` → has rate limit
- **DB Verify:** `SELECT * FROM radgroupcheck WHERE groupname='<planName>'` → check attributes

### T5.3 — Verify Simultaneous-Use (login limit) enforcement
- **Action:** Check if plan's `maxDevices` is synced to `radgroupcheck` as `Simultaneous-Use`
- **DB Verify:** `SELECT * FROM radgroupcheck WHERE attribute='Simultaneous-Use' AND groupname='<group>'`

### T5.4 — Verify IP restriction (Framed-IP-Address)
- **Action:** Create subscriber with static IP
- **DB Verify:** `SELECT * FROM radreply WHERE username='<user>' AND attribute='Framed-IP-Address'`

### T5.5 — Change RADIUS user password
- **Method:** PUT `/api/aaa/users/<username>` with `action:"change-password"`
- **DB Verify:** `SELECT * FROM radcheck WHERE username='<user>' AND attribute='Cleartext-Password'` → updated

### T5.6 — Change RADIUS user group
- **Method:** PUT `/api/aaa/users/<username>` with `action:"change-group"`
- **DB Verify:** `SELECT * FROM radusergroup WHERE username='<user>'` → new group
- **DB Verify:** `SELECT * FROM radreply WHERE username='<user>' AND attribute='Mikrotik-Rate-Limit'` → updated from new group

### T5.7 — Disable RADIUS user
- **Method:** PUT `/api/aaa/users/<username>` with `action:"toggle-enabled"`
- **DB Verify:** `radcheck`, `radreply`, `radusergroup` all empty for this user

### T5.8 — RADIUS user list
- **Method:** GET `/api/aaa/users`
- **Expect:** 200, list with check/reply attributes, group assignments

### T5.9 — RADIUS user detail
- **Method:** GET `/api/aaa/users/<username>`
- **Expect:** 200, full detail with inherited group attributes, auth attempts, sessions

### T5.10 — RADIUS group list
- **Method:** GET `/api/aaa/groups`
- **Expect:** 200, groups with check/reply attributes, user counts

### T5.11 — RADIUS group detail
- **Method:** GET `/api/aaa/groups/<groupname>`
- **Expect:** 200, full group with all attributes

### T5.12 — Create RADIUS group manually
- **Method:** POST `/api/aaa/groups`
- **Body:** Group with check/reply attributes
- **DB Verify:** `radgroupcheck` + `radgroupreply` populated

### T5.13 — Delete RADIUS group
- **Method:** DELETE `/api/aaa/groups/<groupname>`
- **DB Verify:** `radgroupcheck` + `radgroupreply` + `radusergroup` cleaned

### T5.14 — FreeRADIUS dashboard overview
- **Method:** GET `/api/freeradius?tab=overview`
- **Expect:** 200, stats (total users, active, groups)

---

## MODULE 6: Billing Engine

### T6.1 — Generate invoice for subscriber
- **Method:** POST `/api/invoices`
- **Body:** Invoice with subscriberId, line items, tax
- **Expect:** 201, invoice with calculated totals
- **DB Verify:** `"Invoice"` row + `"InvoiceLineItem"` rows

### T6.2 — Pro-rata invoice calculation
- **Action:** Create invoice for subscriber activated mid-cycle
- **Expect:** Amount prorated based on remaining days

### T6.3 — Generate invoices in bulk
- **Method:** POST `/api/invoices/bulk-generate`
- **Body:** `{"subscriberIds":[...]}`
- **Expect:** 200, count of generated invoices

### T6.4 — List invoices with filters
- **Method:** GET `/api/invoices?status=DRAFT`
- **Expect:** 200, filtered invoices with status counts

### T6.5 — Get invoice by ID
- **Method:** GET `/api/invoices/<id>`
- **Expect:** 200, invoice with line items

### T6.6 — Update invoice (add discount)
- **Method:** PUT `/api/invoices/<id>` with `discountAmount:50`
- **Expect:** 200, `grandTotal` recalculated

### T6.7 — Mark invoice as PAID (with payment)
- **Method:** PUT `/api/invoices/<id>` with inline payment
- **Expect:** 200, invoice PAID, payment record created

### T6.8 — Billing cycle: generate invoices for all ACTIVE
- **Method:** POST `/api/billing` (default action)
- **Expect:** 200, invoices generated for all active subscribers without existing invoice for the period

### T6.9 — Cyclic billing milestone creation
- **Method:** POST `/api/cyclic-billing` with `action:"create-milestone"`
- **Body:** Data threshold with speed limits
- **Expect:** 201

### T6.10 — Cyclic billing cycle creation
- **Method:** POST `/api/cyclic-billing` with `action:"create-cycle"`
- **Expect:** 201

---

## MODULE 7: Payment & Collection

### T7.1 — Record payment (cash)
- **Method:** POST `/api/payments`
- **Body:** `{"subscriberId":"...","invoiceId":"...","amount":500,"mode":"CASH"}`
- **Expect:** 201, payment in PENDING status

### T7.2 — Verify payment
- **Method:** PUT `/api/payments/<id>` with `action:"verify"`
- **Expect:** 200, payment VERIFIED, invoice balance updated

### T7.3 — Reject payment
- **Method:** PUT `/api/payments/<id>` with `action:"reject"`
- **Expect:** 200, payment REJECTED

### T7.4 — Delete pending payment
- **Method:** DELETE `/api/payments/<id>` (PENDING status)
- **Expect:** 200

### T7.5 — Bulk verify payments
- **Method:** POST `/api/payments` with `action:"bulk_verify"`
- **Expect:** 200, all payments verified, invoice balances updated

### T7.6 — Payment receipt number uniqueness
- **Action:** Create 2 payments, verify receipt numbers are unique

### T7.7 — Online payment order creation
- **Method:** POST `/api/payments/create-order`
- **Expect:** 201, payment order with gateway reference

### T7.8 — Field collection
- **Method:** POST `/api/collection`
- **Body:** Collection with agent assignment
- **Expect:** 201, payment VERIFIED directly

---

## MODULE 8: Top-Ups & Add-ons

### T8.1 — Create top-up product
- **Method:** POST `/api/top-ups` with `action:"create-product"`
- **Body:** Product with type, amount, validity, price
- **Expect:** 201

### T8.2 — Purchase top-up
- **Method:** POST `/api/top-ups` with `action:"purchase"`
- **Expect:** 201
- **BUG CHECK:** Verify RADIUS CoA is sent (known gap)

### T8.3 — Subscribe to add-on service
- **Method:** POST `/api/add-on-services/subscribe`
- **Body:** `{"subscriberId":"...","serviceId":"..."}`
- **Expect:** 201
- **BUG CHECK:** Verify RADIUS attributes updated (known gap)

---

## MODULE 9: Policy Engine

### T9.1 — Get subscriber policy
- **Method:** GET `/api/session-engine/policy/<subscriberId>`
- **Expect:** Policy evaluation (rate limits, data caps, time access)

### T9.2 — Charge override creation
- **Method:** POST `/api/charge-overrides`
- **Body:** Override with schedule, amount
- **Expect:** 201
- **BUG CHECK:** Verify override is consumed by billing (known gap)

### T9.3 — Charge override status lifecycle
- **Action:** Create override with future `validFrom`
- **Expect:** Status SCHEDULED → ACTIVE → EXPIRED

### T9.4 — Grace period creation
- **Method:** POST `/api/grace-periods`
- **Expect:** 201
- **BUG CHECK:** Verify grace period is enforced (known gap)

### T9.5 — Time access policy
- **Method:** GET `/api/time-access-policies`
- **Expect:** 200

---

## MODULE 10: Session Engine

### T10.1 — Active sessions list
- **Method:** GET `/api/aaa/active-sessions`
- **Expect:** 200, list from `radacct` (Acct-Stop-Time IS NULL)

### T10.2 — Session history
- **Method:** GET `/api/aaa/session-history`
- **Expect:** 200, completed sessions from `radacct`

### T10.3 — Auth log
- **Method:** GET `/api/aaa/auth-log`
- **Expect:** 200, from `radpostauth`

### T10.4 — Disconnect session
- **Method:** POST `/api/aaa/active-sessions` with `action:"disconnect"`
- **Expect:** 200
- **BUG CHECK:** Verify actual CoA sent to NAS (known gap)

### T10.5 — Session engine stats
- **Method:** GET `/api/session-engine` with `action:"stats"`
- **Expect:** Stats (proxied to port 3010)

---

## MODULE 11: Radius Users Management (Prisma Layer)

### T11.1 — List radius users (Prisma)
- **Method:** GET `/api/radius-users`
- **Expect:** 200, list with subscriber info

### T11.2 — Sync radius user to FreeRADIUS
- **Method:** POST `/api/radius-users` (create new)
- **DB Verify:** `radcheck`, `radreply`, `radusergroup` populated

### T11.3 — Remove radius user from FreeRADIUS
- **Method:** DELETE `/api/radius-users/<id>`
- **DB Verify:** `radcheck`, `radreply`, `radusergroup` cleaned

### T11.4 — Toggle radius user enabled/disabled
- **Method:** POST `/api/radius-users/toggle-enabled`
- **DB Verify:** RADIUS tables updated

### T11.5 — Radius user custom attributes
- **Method:** POST `/api/radius-attributes/user-attributes`
- **Expect:** 201, per-user attribute override

---

## MODULE 12: Invoice Export & Reporting

### T12.1 — Export invoices as CSV
- **Method:** GET `/api/billing/export?format=csv`
- **Expect:** 200, CSV with BOM

### T12.2 — Export subscribers
- **Method:** GET `/api/subscribers/export`
- **Expect:** 200, CSV/Excel data

### T12.3 — Revenue report
- **Method:** GET `/api/reports/revenue`
- **Expect:** 200, revenue data

---

## MODULE 13: Security Tests

### T13.1 — SQL injection in RADIUS sync
- **Method:** Create subscriber with username containing `' OR 1=1--`
- **Expect:** 400, rejected (BUG: currently vulnerable)

### T13.2 — Unauthenticated access to sensitive endpoints
- **Method:** GET `/api/aaa/session-history` (no token)
- **Expect:** 401 (BUG: currently returns 200)

### T13.3 — Unauthenticated access to auth log
- **Method:** GET `/api/aaa/auth-log` (no token)
- **Expect:** 401 (BUG: currently returns 200)

### T13.4 — Unauthenticated access to FreeRADIUS dashboard
- **Method:** GET `/api/freeradius?tab=overview` (no token)
- **Expect:** 401 (BUG: currently returns 200)

### T13.5 — Payment verification without auth
- **Method:** PUT `/api/payments/create-order` (no token)
- **Expect:** 401 (BUG: currently allows)

---

## MODULE 14: Business Logic Edge Cases

### T14.1 — Invoice number uniqueness under concurrent load
- **Action:** Generate multiple invoices rapidly
- **Expect:** All invoice numbers unique (BUG: race condition possible)

### T14.2 — Subscriber delete RADIUS cleanup
- **Action:** Delete RADIUS-enabled subscriber
- **DB Verify:** No orphaned rows in `radcheck`/`radreply`/`radusergroup` (BUG: known gap)

### T14.3 — Plan update RADIUS sync
- **Action:** Update plan speed, check subscriber in that group
- **DB Verify:** `radgroupreply` updated (BUG: known gap)

### T14.4 — Plan migration RADIUS sync
- **Action:** Migrate subscribers between plans
- **DB Verify:** `radusergroup` updated for all migrated subscribers (BUG: known gap)

### T14.5 — Charge override consumption
- **Action:** Create charge override, generate invoice
- **Expect:** Invoice uses override price (BUG: overrides not consumed)

### T14.6 — Grace period enforcement
- **Action:** Set grace period, let invoice become overdue
- **Expect:** Subscriber NOT suspended during grace period (BUG: not enforced)

---

## Test Execution Summary Template

| Module | Tests | Pass | Fail | Bugs Found |
|--------|-------|------|------|-------------|
| 1. Auth | 6 | | | |
| 2. Registration | 8 | | | |
| 3. Subscriber Mgmt | 14 | | | |
| 4. Plans | 7 | | | |
| 5. RADIUS Integration | 14 | | | |
| 6. Billing | 10 | | | |
| 7. Payments | 8 | | | |
| 8. Top-Ups/Add-ons | 3 | | | |
| 9. Policy Engine | 5 | | | |
| 10. Session Engine | 5 | | | |
| 11. Radius Users | 5 | | | |
| 12. Export/Report | 3 | | | |
| 13. Security | 5 | | | |
| 14. Edge Cases | 6 | | | |
| **TOTAL** | **99** | | | |
