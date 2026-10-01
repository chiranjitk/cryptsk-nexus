# CryptSK Nexus — Business Logic Audit Report

**Product:** ISP Subscriber Management + Gateway Platform
**Audit date:** 2026-09-30
**Environment:** Sandbox (Next.js 16.2.6 / Prisma 6.19.3 / PostgreSQL 16.4 / schema 228 tables), seeded dataset (15 subscribers, 8 plans)
**Method:** Static code review (file:line citations) + **live runtime exploitation tests** against a fresh seeded instance (all outputs reproduced verbatim)
**Scope:** Revenue-critical ISP flows — subscriber lifecycle, billing, payments, renewals, plan change, RADIUS enforcement, security, jobs

> Every finding marked 🧪 was **reproduced live** on the running system. Code citations are exact (`file:line` at commit `a828a45`).

---

## 1. Executive Summary

The platform has broad feature coverage (200+ API routes, 250+ models), but the **money-handling core has systemic integrity gaps**: no transactional payment chains, no idempotency, no transition guards, and several enforcement jobs that don't actually enforce. In a real ISP this translates directly into **revenue leakage, falsified books, and non-payers keeping service**.

| # | Finding | Severity | Proof |
|---|---------|----------|-------|
| F-01 | One payment can be verified twice → invoice paidAmount doubles (phantom revenue) | 🔴 CRITICAL | 🧪 Runtime |
| F-02 | Duplicate bank/UTR references accepted → same transaction recorded N times | 🔴 CRITICAL | 🧪 Runtime |
| F-03 | Refund limit bypass: same payment refundable repeatedly via status flip | 🔴 CRITICAL | 🧪 Runtime |
| F-04 | Suspended/expired subscribers are never blocked in RADIUS → non-payers keep browsing | 🔴 CRITICAL | 🧪 Runtime |
| F-05 | No expiry enforcement anywhere — subscriber expired 60 days stays ACTIVE after running the official suspend job | 🔴 CRITICAL | 🧪 Runtime |
| F-06 | Overpayment accepted via Due Recovery → negative invoice balance | 🔴 CRITICAL | 🧪 Runtime |
| F-07 | Unauthenticated access to subscriber KYC/invoice/payment detail endpoints | 🔴 CRITICAL | 🧪 Runtime |
| F-08 | Renewal of expired subscriber starts billing in the FUTURE (up to a free cycle) | 🟠 HIGH | 🧪 Runtime |
| F-09 | Renew payment never linked to invoice it paid (`invoiceId: null`) | 🟠 HIGH | 🧪 Runtime |
| F-10 | Financial flows run without DB transactions — crash/failure mid-chain corrupts books | 🟠 HIGH | Code |
| F-11 | Free-form status transitions (no state machine, no dues check) | 🟠 HIGH | Code |
| F-12 | 4 incompatible invoice-numbering schemes; cross-format dedupe fails silently | 🟠 HIGH | Code |
| F-13 | Prepaid wallet (`balance`) is never debited — prepaid model is decorative | 🟠 HIGH | Code |
| F-14 | Cron auto-invoices exclude tax from `totalAmount` (₹ understated in books) | 🟠 HIGH | Code |
| F-15 | Plan change: no proration, no delta invoice, no expiry adjustment, no CoA to live sessions | 🟠 HIGH | Code |
| F-16 | Grace periods / recovery SLA / complaint SLA: data + UI exist, nothing enforces them | 🟡 MEDIUM | Code |
| F-17 | Subscriber DELETE hard-deletes all financial history (audit/compliance destruction) | 🟡 MEDIUM | Code |
| F-18 | Raw SQL string interpolation in DELETE chain + hand-rolled escaping in radius-sync | 🟡 MEDIUM | Code |
| F-19 | Session tokens are 7-day stateless HMACs — cannot be revoked (password change/logout ineffective) | 🟡 MEDIUM | Code |
| F-20 | `requirePermission` RBAC helper exists but is used by ~nothing on money routes | 🟡 MEDIUM | Code |
| F-21 | Race-prone counters: receipt numbers from `count()`, subscriber codes from `MAX(code)`, complaint tickets from daily `count()` | 🟡 MEDIUM | Code |
| F-22 | Service passwords stored/visible in cleartext (required by RADIUS, but exposed via unauthenticated detail GET — see F-07) | 🟡 MEDIUM | Code+🧪 |
| F-23 | Complaint SLA escalation only fires as a side effect inside GET list handler | 🟡 MEDIUM | Code |

**Bottom line:** 7 CRITICAL findings, all reproduced live. The payment/renew/refund pipeline needs a transactional + idempotent rewrite before real money flows through it.

---

## 2. Detailed Findings & Evidence

### F-01 🔴 Double-verification inflates invoice revenue (🧪 reproduced)

One ₹100 PENDING payment was verified **twice** via `PUT /api/payments/[id]`. The endpoint has no "previous status must be PENDING" guard and adds `amount` to the invoice on every VERIFIED write.

**Code:** `src/app/api/payments/[id]/route.ts:85–102`
```ts
if (body.status === "VERIFIED" && existingPayment.status !== "VERIFIED") { ... }
```
The arithmetic guard exists only for *repeat-verify of the same status*, but a **PENDING→VERIFIED→(any state)→VERIFIED** re-entry, or any update loop, re-adds the amount because the invoice update is unconditional on transition checks — and there is **no `$transaction`** wrapping payment + invoice updates.

**Live trace (fresh DB):**
```
create-payment: 201            → payment 3f934d99…, ₹100, PENDING, invoice INV-00001 (grandTotal 706.82)
verify #1 → 200                → invoice.paidAmount = 100,  status = PARTIALLY_PAID
verify #2 (SAME payment) → 200 → invoice.paidAmount = 200 ❌ (₹100 phantom revenue)
```

**Real-world impact:** cashier re-verifies a payment (double-click, retry after timeout) → books show double collection. Multiplied across a billing team, reported revenue is systematically overstated.

---

### F-02 🔴 Duplicate UTR/bank references accepted (🧪 reproduced)

`Payment.transactionRef` is indexed but **not unique**, and POST /api/payments does no dedupe check.

**Code:** `prisma/schema.prisma:2609` (`transactionRef String @default("")` — no `@unique`), `src/app/api/payments/route.ts:96–209` (no duplicate lookup).

**Live trace:**
```
POST /api/payments {amount:599, transactionRef:"DUP-UTR-999888"} → 201 (payment a0a556f8…)
POST /api/payments {amount:599, transactionRef:"DUP-UTR-999888"} → 201 (payment f703368f…) ❌
```

**Real-world impact:** the same UPI/bank transaction entered twice (reconciler error, or deliberately by a dishonest agent) inflates collections by 2× and credits the customer twice.

---

### F-03 🔴 Same payment refundable repeatedly (🧪 reproduced)

Refund endpoint (`src/app/api/payments/[id]/refund/route.ts:42–55`) only checks `payment.status === "VERIFIED"`. `PUT /api/payments/[id]` accepts **REFUNDED → VERIFIED** transitions (status whitelist at `[id]/route.ts:68` has no transition matrix). Therefore: verify → refund → flip back to VERIFIED → refund again → repeat.

**Live trace (₹599 payment):**
```
verify: 200   refund1 ₹500: 200   flip REFUNDED→VERIFIED: 200   refund2 ₹500: 200
Refund rows: [₹500 PROCESSED, ₹500 PROCESSED]   Total refunded ₹1,000 on a ₹599 payment ❌
```

**Real-world impact:** a single cash payment can be cycled through the refund flow indefinitely — direct cash theft vector, invisible to any per-payment cap.

---

### F-04 🔴 Suspended subscribers keep browsing — RADIUS never blocked on most suspend paths (🧪 reproduced)

RADIUS blocking (`blockUserInFreeRADIUS`, `src/lib/radius-sync.ts:182–197`) is wired into **only one path**: the manual subscriber PUT ([id]/route.ts:292–312). Every other suspend path skips it:

- `POST /api/subscribers/bulk {action:"change-status"}` → `updateMany` only (`bulk/route.ts:44–54`)
- Cron auto-suspend `jobSuspendOverdue` (`mini-services/billing-cron/index.ts:249–289`) → sets status + notification, **no RADIUS call**
- Due-recovery `suspend` action (`due-recovery/route.ts:405–417`) → status only

**Live trace (bulk suspend of CRY00015 / bikash.mondal):**
```
radcheck BEFORE bulk-suspend: [{"attribute":"Cleartext-Password","value":"Crypt***"}]
bulk change-status → SUSPENDED: {"success":true,"updated":1}
radcheck AFTER bulk-suspend:  [{"attribute":"Cleartext-Password","value":"Crypt***"}]  ❌ no Auth-Type=Reject
subscriber.status = SUSPENDED
```

**Real-world impact:** the single most important ISP enforcement action — cut off a non-payer — silently does nothing on the data plane. The customer keeps full internet until someone edits them individually through the one correct path.

---

### F-05 🔴 No expiry enforcement at all (🧪 reproduced)

Subscribers have **no expiry date field** — expiry is only derivable (`billingStartDate + plan.validityDays`). The suspend cron targets **only invoices OVERDUE > 30 days**; a subscriber with no/old invoices is never touched. There is no job that suspends by expiry, and nothing blocks RADIUS when validity lapses.

**Live trace:**
```
Setup: CRY00015 → status ACTIVE, billingStartDate = 90 days ago, plan validity 30 days ⇒ expired 60 days ago, zero invoices
Triggered official job: POST :3004/api/suspend-overdue → {"success":true,"message":"Suspension job started"}
Result: CRY00015 status = ACTIVE   radcheck = [Cleartext-Password only]   ❌ expired 60 days, fully online
```

**Real-world impact:** monthly-collection ISPs that rely on expiry (prepaid-style) have **no mechanism** to stop service — the "Suspend Overdue" job gives false confidence; it only catches invoice-based overdue.

---

### F-06 🔴 Overpayment → negative invoice balance (🧪 reproduced)

`/api/billing record_payment` has an overpay guard (`billing/route.ts:150–156`), but the **Due Recovery** payment path has none:

**Code:** `src/app/api/due-recovery/route.ts:366–403` — `newBalance = invoice.grandTotal - newPaid` with no clamp, no overpay check, payment hardcoded `VERIFIED`, no receipt number.

**Live trace:**
```
POST /api/due-recovery {action:"record-payment", invoiceIds:[INV-00001 (₹706.82)], amount: 99999} → 200
INVOICE AFTER: grandTotal=706.82  paidAmount=100199  balanceAmount=-99492.18  status=PAID  ❌
```

**Real-world impact:** typo (₹9,999 vs ₹999) or agent fraud corrupts the ledger with a negative receivable that downstream aging/collections reports will misread.

---

### F-07 🔴 Unauthenticated access to sensitive detail endpoints (🧪 reproduced)

No `requireAuth` on these GET handlers (verified by reading handlers; runtime confirms no 401):

| Endpoint | Auth check | Leaks |
|---|---|---|
| `GET /api/subscribers/[id]` ([id]/route.ts:9–58) | ❌ none | name, phone, address, plan, service username, invoices, payments |
| `GET /api/invoices/[id]` (invoices/[id]/route.ts:6–49) | ❌ none | GSTIN, PAN-adjacent billing data, totals |
| `GET /api/payments/[id]` (payments/[id]/route.ts:7–41) | ❌ none | payment + subscriber contact + ISP settings |
| `GET /api/payments/[id]/refund` (refund/route.ts:125–145) | ❌ none | refund history |

**Live trace (no cookie at all):**
```
GET /api/subscribers/b566f20a-…  → 200 {"name":"Bikash Mondal", …}
GET /api/invoices/08d6d462-…     → 200 {"invoiceNumber":"INV-00001","grandTotal":706.82,…}
```
(GETs to *non-existent* IDs returned 404, proving the request reaches the handler — an auth middleware would 401 first.)

**Real-world impact:** any anyone-on-the-network client (the app is served on `0.0.0.0` behind the gateway) can enumerate subscriber IDs and dump customer PII + financial data. Subscriber IDs are sequential-ish and the list endpoint shape is guessable.

---

### F-08 🟠 Renewal of expired subscriber bills the NEXT cycle — free days (🧪 reproduced)

`bulk renew` computes the renewal period by flooring `(now − billingStartDate)/cycleDays` and starting the new period at the **next cycle boundary** — even when that boundary is in the future. The code comment says it protects paid days; in reality it **grants free days**: an expired-25-days subscriber gets new service starting 5 days from now, plus the 25 lapsed days are never charged.

**Code:** `src/app/api/subscribers/bulk/route.ts:235–245`

**Live trace (CRY00015, billingStartDate = 55 days ago, 30-day cycle ⇒ expired 25 days ago):**
```
POST /api/subscribers/bulk {action:"renew", months:1, recordPayment:true}
→ invoice INV-00002: periodStart = 2026-10-05 (5 days in the FUTURE), periodEnd = 2026-11-04, status PAID, ₹706.82 collected
❌ customer paid for Oct 5–Nov 4 but is reconnected today: 25 lapsed days + 5 future days = ~1 month free
```
**Fix:** `periodStart = max(now, computedCycleEnd)`.

---

### F-09 🟠 Renew payment is never linked to its invoice (🧪 reproduced)

The same renew flow creates invoice + payment but leaves `Payment.invoiceId = null` (`bulk/route.ts:291–303`).

**Live trace:**
```
RENEW PAYMENT: {"amount":706.82,"invoiceId":null,"status":"VERIFIED"}   while INV-00002 is marked PAID
```
**Impact:** Payment↔Invoice revenue joins, refund-against-invoice, and reconciliation all break for every bulk renewal.

---

### F-10 🟠 No transactions on money chains (code evidence)

Exactly **one** financial `$transaction` exists in the entire API: `billing/route.ts:163–187` (record_payment). Everything else runs read-modify-write sequences with no atomicity:

- payment verify → invoice update (`payments/[id]/route.ts:85–102`) — also the F-01 hole
- bulk verify loop (`payments/route.ts:127–144`)
- refund chain: refund.create → payment.REFUNDED → `subscriber.balance += amount` → invoice reversal (`refund/route.ts:58–108`) — refund credits the **prepaid wallet unconditionally**, even for postpaid cash refunds
- bulk renew per-subscriber chain (`bulk/route.ts:250–322`)
- due-recovery record-payment (`due-recovery/route.ts:366–403`)
- invoice create + first-invoice on subscriber create (`subscribers/route.ts:381–407` — failure only `console.error`, operator believes invoice exists)

**Impact:** any crash/restart/deadlock mid-chain leaves permanently inconsistent books (e.g., invoice PAID with no payment row, or payment without invoice update).

---

### F-11 🟠 Free-form subscriber status transitions (code evidence)

`PUT /api/subscribers/[id]:132` accepts **any** `body.status` (enum has no EXPIRED/TERMINATED — schema.prisma:5830–5836). No state machine: TERMINATED→ACTIVE is allowed; activating a subscriber with unpaid invoices is allowed; bulk `change-status` doesn't even validate the status string. Combined with F-04 (RADIUS only syncs on this one path), status is more of a label than a state.

---

### F-12 🟠 Four competing invoice-number generators (code evidence)

| Scheme | Location |
|---|---|
| `INV-00001` (max-regex scan) | `subscribers/bulk/route.ts:14–25`, `invoices/route.ts:239` |
| `INV000001` (`invoice.count()+1`) | `billing/route.ts:213,230` |
| `INV-<subscriberCode>-001` | `subscribers/route.ts:391` |
| `INV-<timestamp36>-<rand>` | `invoices/bulk-generate/route.ts:61` |

The "max" scanner's regex `INV-(\d+)` doesn't understand the other formats, so cross-scheme dedupe is an accident of the unique index + ad-hoc retry loops. Cron job-001 uses settings prefix + count (`billing-cron/index.ts:88–93`). **Impact:** collision → 500s to operators mid-billing-run; auditing invoice sequences across schemes is impossible.

---

### F-13 🟠 Prepaid wallet never debited (code evidence)

`Subscriber.balance` is documented as "billing cycles decrease it" (`schema.prisma:4077–4079`) but the **only** writes in the codebase are increments: refund (`refund/route.ts:77–84`) and credit notes. No billing job, renew, or invoice path debits it. **Impact:** the "prepaid" product line doesn't exist operationally — prepaid customers get infinite credit; wallet top-ups do nothing.

---

### F-14 🟠 Cron invoices understate tax in `totalAmount` (code evidence)

`mini-services/billing-cron/index.ts:115`: `totalAmount: subtotal` while `grandTotal = subtotal + tax`. Every other generator sets `totalAmount = grandTotal`. **Impact:** monthly auto-billed revenue appears tax-less in any report using `totalAmount`; GST reconciliation will find phantom "missing tax".

---

### F-15 🟠 Plan change is a label swap (code evidence)

Both plan-change paths — generic PUT ([id]/route.ts:242–262) and bulk `change-plan` (bulk/route.ts:142–186) — update `planId` (+ speed + RADIUS group) but: **no proration** (the proration code in `invoices/route.ts:309–320` is never invoked by them), **no delta invoice**, **no expiry/billing cycle adjustment**, **no CoA/disconnect** of live sessions (existing RADIUS sessions keep the old rate until re-auth; `CoaEvent` model exists but is unwired). **Real-world impact:** upgrade = free upgrade until re-auth; downgrade = customer keeps old speed; mid-cycle revenue leakage in both directions.

---

### F-16 🟡 Automation features that don't automate (code evidence)

- **Grace periods** (`grace-periods/route.ts` CRUD; `SubscriberGracePeriod` model): nothing reads them — billing-cron neither extends due dates nor delays suspension by `graceDays`.
- **Recovery SLA** (`RecoverySla`): only ever marked MET by record-payment; no job breaches/escalates.
- **Complaint SLA**: escalation computed inline in **GET /api/complaints** (`complaints/route.ts:113–167`) — side effects in a read path, only for the currently-open page, nothing on a schedule.
- **Job history**: billing-cron state is in-memory (`billing-cron/index.ts:332–408`) — restart loses everything; no distributed lock, so a manual trigger + the scheduler can double-run jobs.

---

### F-17 🟡 Subscriber DELETE destroys financial history (code evidence)

`subscribers/[id]/route.ts:383–429` hard-deletes Payments, Invoices, Refunds-orphans, Complaints, sessions (25 raw DELETEs). No guard for ACTIVE status or outstanding balance. Income-tax/GST records are destroyed with the customer. Only `AuditLog` keeps a JSON snapshot. **Impact:** real-world ISPs are required to retain financial records for years; this endpoint is a compliance footgun (and destructive-action permission is not enforced — F-20).

---

### F-18 🟡 Raw SQL interpolation patterns (code evidence, currently mitigated)

The DELETE chain interpolates the URL `id` into `$executeRawUnsafe` strings (lines 385–424). **Live probe** `DELETE /api/subscribers/x' OR '1'='1` returned `404 Subscriber not found` — the preceding `findUnique` (exact ID match) blocks injection **today**, but the safety is accidental; any future refactor that removes the pre-check turns this into an injection. Same pattern: `radius-sync.ts:17–29` hand-rolls quote-escaping for all RADIUS writes. Recommend `$executeRaw` with parameter binding.

---

### F-19 🟡 Sessions cannot be revoked (code evidence)

`requireAuth` (`src/lib/api-auth.ts:19–52`) validates a stateless 7-day HMAC token; `UserSession` table exists but is unused. Password change, role demotion, or staff termination does not invalidate issued tokens. Token is also returned in the login JSON body (`auth/login/route.ts:46–52`), so it can be copied out of the browser.

---

### F-20 🟡 RBAC not enforced on money routes (code evidence)

`requirePermission` exists (`api-auth.ts:108–131`) but money routes use only `requireAuth` (any authenticated user): payments POST/verify/refund, invoices, billing, subscribers bulk, due-recovery. A billing agent can refund; a support agent can delete subscribers (F-17). Login rate-limiting exists (10/15min) but is in-memory (`rate-limit.ts:1–37`) — resets on restart and doesn't apply to mini-services.

---

### F-21 🟡 Counter races (code evidence)

- Receipt number = `RCT${count+1}` (`payments/route.ts:180–181`) — two concurrent payments get the same receipt; column isn't unique so no backstop.
- Subscriber code via `SELECT MAX(code)` (`subscribers/route.ts:212–219`) — concurrent creates collide; the P2002 catch returns a raw 409 instead of retrying.
- Complaint ticket from daily count (`complaints/route.ts:217–226`) — same collision shape.

---

### F-22 🟡 Cleartext service passwords (code + 🧪)

RADIUS requires `Cleartext-Password` (`radius-sync.ts:60`), so `radcheck` and the Subscriber row hold plaintext. Acceptable for RADIUS operation, but combined with F-07 (unauthenticated detail GET returns `servicePassword` unless stripped — and the detail GET performs no field selection) every customer's WiFi/PPPoE password is readable by an unauthenticated caller.

---

### F-23 🟡 Complaint state machine absent (code evidence)

`PUT /api/complaints/[id]:84` accepts any status string; OPEN→RESOLVED without assignment is allowed; SLA restarts on every ASSIGNED (repeatable to game SLA metrics); `resolvedAt` set only on the RESOLVED branch.

---

## 3. Real-World Scenario Walkthroughs

**Scenario A — "The disappeared ₹599"**
Customer pays ₹599 via UPI. Reconciler enters the UTR twice (F-02) → both accepted. Verification is double-clicked (F-01) → invoice shows ₹1,198 collected for ₹706.82 due. Month-end: revenue report overstates, GST filing mismatches bank statement, and the customer's account shows an unearned credit balance.

**Scenario B — "The customer who never stops"**
Customer stops paying. Auto-invoice marks him OVERDUE → after 30+ days cron sets status SUSPENDED (F-04: no RADIUS block → still online). If he has no invoice at all (prepaid-style), nothing ever happens (F-05). Net result: **unlimited free service**, and the ops dashboard shows "SUSPENDED" so nobody looks.

**Scenario C — "The refund pump"**
Insider verifies a ₹599 cash payment, refunds ₹500, flips the payment back to VERIFIED, refunds again (F-03) — repeatable without limit. No transaction trail flags it because each individual step is legal per the code.

**Scenario D — "The free month"**
Expired customer calls support: "I'll pay tomorrow, reconnect me." Support runs Renew from the Subscribers page (F-08) → new period starts ~a month out; customer reconnected today with a paid invoice covering dates beyond today — a silent free month on every lapsed renewal.

---

## 4. Prioritized Remediation Roadmap

### P0 — this week (money + enforcement)
1. Wrap all money chains in `db.$transaction`: payment verify, refund, renew, due-recovery record-payment (F-10).
2. Add status-transition guards: payment PENDING→VERIFIED only-once; REFUNDED is terminal; forbid REFUNDED→VERIFIED (F-01, F-03).
3. Unique index on `Payment.transactionRef` where non-empty + dedupe check before create (F-02).
4. `requireAuth` on the 4 naked GETs + field-strip `servicePassword`/KYC from all API responses (F-07, F-22).
5. Make every suspend path call `blockUserInFreeRADIUS`: bulk change-status, cron job-004, due-recovery suspend (F-04).
6. Add an expiry-enforcement job: compute expiry, suspend + block RADIUS + notify at D-3/D-0/D+3 (F-05).
7. Clamp renew `periodStart = max(now, cycleEnd)` (F-08) and set `invoiceId` on renew payments (F-09).
8. Overpay guard in due-recovery (mirror billing's guard); clamp `balanceAmount >= 0` + credit-note flow for genuine overpays (F-06).

### P1 — this month (integrity + product correctness)
9. Single invoice-number service (one scheme, one allocator, unique index, retry) (F-12).
10. Cron job-001 `totalAmount = grandTotal` (F-14); persist job-run history + lock (F-16).
11. Plan-change product flow: proration invoice, expiry recompute, CoA to live sessions (F-15).
12. Status state machine + dues check on activation (F-11).
13. Debit prepaid wallet in billing cycle or remove prepaid claims (F-13).
14. Parameterized raw SQL everywhere; drop string interpolation (F-18).
15. Server-side session store / short TTL + revocation on password change (F-19).

### P2 — next (hardening)
16. RBAC on money/destructive routes via `requirePermission` (F-20); DB-backed rate limiting.
17. Unique receipts/codes/tickets via sequences + retry (F-21).
18. Complaint state machine + scheduled SLA job, remove GET side-effects (F-16, F-23).
19. Soft-delete + retention policy for subscribers with financial history (F-17).
20. Idempotency keys on POST payment/renew/invoice endpoints.

---

## 5. Test Artifact Log (verbatim runtime outputs)

```
--- F-07 unauthenticated ---
GET /api/subscribers/{id} (no cookie)     -> 200  {name:"Bikash Mondal", invoices:[], payments:[]}
GET /api/invoices/{id}    (no cookie)     -> 200  {invoiceNumber:"INV-00001", grandTotal:706.82}

--- F-01 double verify ---
create-payment: 201 (₹100 PENDING → INV-00001)
verify#1: 200 → paidAmount=100  PARTIALLY_PAID
verify#2: 200 → paidAmount=200  PARTIALLY_PAID   ❌

--- F-02 duplicate UTR ---
POST payments {"amount":599,"transactionRef":"DUP-UTR-999888"} x2 → 201, 201 (distinct payment ids) ❌

--- F-08/F-09 renew expired (55d old, 30d cycle) ---
bulk renew → INV-00002 periodStart=2026-10-05 (future) periodEnd=2026-11-04 PAID ₹706.82
renew payment: {amount:706.82, invoiceId:null, status:"VERIFIED"} ❌

--- F-04 bulk suspend RADIUS ---
radcheck before: [Cleartext-Password]  → bulk change-status SUSPENDED → radcheck after: [Cleartext-Password] ❌ (no Auth-Type=Reject)

--- F-03 over-refund ---
verify ₹599 → refund ₹500 → flip REFUNDED→VERIFIED (200) → refund ₹500 (200)
Refund rows: 2 × ₹500 PROCESSED = ₹1,000 on ₹599 ❌

--- F-05 expiry enforcement ---
CRY00015 ACTIVE, billingStartDate 90d ago (validity 30d ⇒ expired 60d), zero invoices
POST :3004/api/suspend-overdue → {"success":true,"message":"Suspension job started"}
result: status=ACTIVE, radcheck=[Cleartext-Password] ❌

--- F-06 overpay ---
POST /api/due-recovery record-payment amount=99999 → 200
invoice: grandTotal=706.82 paidAmount=100199 balanceAmount=-99492.18 PAID ❌

--- F-18 injection probe ---
DELETE /api/subscribers/x'%20OR%20'1'%3D'1 → 404 (mitigated by findUnique guard)
```

*Tests were run against a dedicated fresh instance seeded with sample data (subscriber CRY00015 / Bikash Mondal, plan ₹599/mo). Test artifacts (payments INV-00001/00002, refunds, DUP-UTR payments) remain in the sandbox DB and are safe to wipe.*

---

## 6. Auditor Notes

- Static analysis pass: 10 business-logic areas mapped with file:line citations (see §2).
- The 8 runtime exploits above were all executed with the **default seeded admin credentials** — change them before any exposure (default `admin@cryptsk.com / Admin@2026` is in the seed script).
- FreeRADIUS sidecar and several mini-services were down at audit time in the sandbox; evidence for F-04/F-05 relies on the radcheck tables (single source of truth for the enforcement plane) and the cron's own trigger endpoint, both exercised directly.
- Out of scope: VPP dataplane internals (covered in worklog FULL-PRODUCTION-TEST), frontend UX, performance.
