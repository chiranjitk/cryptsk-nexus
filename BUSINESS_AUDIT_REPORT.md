# CryptSK Nexus — Full Codebase Business Audit Report

**Generated:** 01 Oct 2026, 21:53 IST · **Commit audited:** `60ae354` (main, synced with origin)
**Scope:** ~95 registered pages · ~140 API route families · 227 Prisma models · ~318K LOC · 13 pm2 services + gateway/daemons
**Method:** 9 parallel read-only audit agents (one per business domain). Every audited page read in full; every `fetch` URL traced to a real `route.ts`; money/security-critical route bodies read; Prisma models cross-checked; enforcement paths traced into `mini-services/`. All findings carry file:line evidence. No code was modified during the audit.

---

## 1. Executive Summary

### 1.1 Domain readiness scores

| # | Domain | Pages | Score | Verdict |
|---|--------|------:|------:|---------|
| A | Billing Core (billing, invoices, payments, vouchers, cyclic, grace, overrides, top-ups, add-ons) | 9 | **55/100** | Core invoice→payment→receipt loop is production-grade; side revenue never reaches the ledger; 3 pages broken/fake |
| B | Finance & Revenue (collection, due-recovery, GST, leakage, reports, forecast, referral, loyalty, compliance, export) | 13 | **82/100** | Best domain — real DB-backed numbers everywhere; reminder delivery + loyalty earn-side are theater |
| C | Subscribers & CRM (subscribers, plans, 360°, batch-prov, leads, agents, techs, complaints, installations, action-history, reseller) | 13 | **62/100** | Strong money+RADIUS core; provisioning is fiction; 2 endpoints 500 forever; 5 unauth PII endpoints |
| D | Network & Infra (NAS, devices, IPAM, DHCPv4/v6, DNS, PPPoE, portal, MultiWAN, FRR, FTTH, VPP, health) | 15 | **55/100** | Real OS/KEA/dnsmasq/FRR plumbing; 2 runtime-500 routes; 4 config domains with zero enforcement; unauth VPP proxy |
| E | Monitoring (sessions, history, auth-log, bandwidth, traffic, DPI, uptime, latency, speedtest, syslog, diag, NAT, grafana) | 16 | **58/100** | Plumbing real; 2 pages can never render their data; server-side fabricated SLA telemetry on 3 surfaces |
| F | Policy & Security (BW-mgmt, time-access, QoS, firewall, IPS, DDoS, VPN, L2 security) | 8 | **35/100** | Worst domain — every security list view permanently empty (envelope mismatch); fake telemetry; 1 unauth CRUD; match-everything-DROP risk |
| G | Services & AAA (TR-069, MikroTik, SSH, SNMP, RADIUS proxy/attrs, enterprise-auth, wifi-offload, hotspot, CoA + 5 orphans) | 16 | **55/100** | TR-069 & hotspot production-shaped; 3 unauth route families; CoA pipeline is log-only; 5 best-in-repo AAA pages are unreachable orphans |
| H | Partners & Settings (hubs, partners, partner-users/reports, ISP profile, users, areas, equipment, promotions, API keys, audit-log, automation, backup, KB, modules, health, widgets) | 18 | **62/100** | Mostly solid CRUD; API-key subsystem insecure end-to-end; audit trail mutable by any user; backup/DR is an illusion; partner users can never log in |
| I | Integrations + Alerts + AI (integrations, gateways, SMS/email/WA push, webhooks, logs, alert center/rules/suppressions/history, AI advisor/diagnosis, churn, competitor, WA bot) | 20 | **62/100** | 24 real provider adapters, real Razorpay/Stripe money flow, real alert lifecycle — but the *last mile* (sending messages, firing notifications) is fake in 4+ paths |

**Weighted platform score: ≈ 58/100.**

The platform's spine — DB-backed auth with RBAC, audit logging, transactional billing, real provider adapters, real OS-level network actions — is genuinely strong. The score is dragged down by one dominant systemic defect family and several deliberate fictions, detailed below.

### 1.2 The five systemic failure families (cross-domain)

1. **UI↔API contract mismatches (19 surfaces).** Pages expect `{rules}` / `{policies}` / `{entries}` while backends return `{success, data:[...]}` (or vice versa) — list views permanently empty, stat tiles pinned to 0, mutations 400/405 with success toasts. Surfaces: firewall, IPS, DDoS, security-profiles, time-access, session-history, auth-log, action-history, grace-periods, dashboard-widgets, zone-budgets, add-on-services, top-ups, wifi-offload, ddos counters, notifications templates. *Evidence throughout §3; register in §5.*

2. **Unauthenticated API surface (≥16 route families).** Against the otherwise-consistent `src/lib/api-auth.ts` doctrine: `/api/charge-override` (legacy twin, price manipulation), `/api/vpp` (BNG dataplane rebuild/CoA!), `/api/api-keys` create+PATCH (mint/rotate admin keys anonymously), `/api/whatsapp/config` GET (plaintext WhatsApp Business token), `/api/enterprise-auth/*` (6 files incl. plaintext LDAP bindPassword), `/api/wifi-offload/*` (10 files, session tamper + Gy/Gx/SWa proxy), `/api/coa-events`, `/api/ip-mac-history` (PII + unauth writes), `/api/time-access-policies`, `/api/dashboard-widgets`, `/api/metrics`, plus unauth GETs on `/api/leads` (+CSV export of PII), `/api/reseller` (bank accounts), `/api/plans/[id]`, `/api/installations/[id]`, `/api/vouchers/stats`. Plus an **auth-swallow pattern** (`catch` continuing on non-AuthError) in bw-reports, grafana, ndpi, subscribers/online-count (fail-open) — auth bypasses on DB blips.

3. **Fabricated telemetry presented as measured (13 surfaces).** Server-side `Math.random` business data: latency-monitor (latency/jitter/loss/timeline/events/trends), qos-monitor (packet drops, queues, heatmap, event history), enterprise-auth "AD sync" (fake users+sessions+health), due-recovery agent dashboard (`avgDaysToResolve: 18 + Math.random()*10`), competitor-intel (price trends via `Math.sin`, market share heuristics), zone-budgets (permanent demo data), action-history (permanent fallback data), grace-periods (fake subscriber picker + fallback rows), batch-provisioning ("COMPLETED N/N success" while creating 0 subscribers), integrations-page mock transaction logs, app-awareness traffic-trend chart, bandwidth protocol pie (self-flagged TODO), backup health tab (CPU/history random), KB analytics (hardcoded 1,247 views), reseller commission ledger (ARPU fallback ₹1,500).

4. **Fake last-mile delivery & dead actions.** Messages marked `SENT` with no gateway call: WhatsApp conversations/schedule/broadcast, churn retention SMS/Email/WA (`churn/retention/route.ts:101-112`). Notifications that never fire: `AlertRule.notifyChannels` never dispatched, `NotificationRule.triggerEvent` evaluated by nothing, auto-escalation only while a browser has the page open, `ScheduledMessage` rows created with no dispatcher, announcement channels (EMAIL/SMS/WA/PUSH) stored as CSV and never fanned out. Dead buttons: device/OLT "Reboot" (sets status=MAINTENANCE + lies in toast), network-health "Create Ticket" (toast only), top-ups/add-on-services catalog CRUD (wrong contract), SSH quick commands (fail own allowlist), radius-proxy test (404 route), wifi-offload peer/policy CRUD (unknown action), dashboard-widgets save (400 + fake success), integrations "Retry" (fabricates success log), CoA/Kill/Disconnect everywhere (DB status flip only — no NAS packet ever sent; the real radclient sender in `mini-services/radius-service` has **zero callers**).

5. **Config without enforcement.** Four complete admin UIs that change nothing on the wire: CGNAT pools/mappings (no nft/daemon consumer; per-subnet NAT fields not even persisted), DHCPv6 (models unread by any service; conf generated client-side for copy/paste), Captive Portal (gateway has a real nft apply endpoint — **nothing calls it**), MultiWAN FailoverRule (monitor daemon ignores it, uses `backupLinks[0]`). Plus: `policy-compiler.ts` (plan→RADIUS enforcement) has **zero callers**; RADIUS custom attributes never reach radcheck/radreply; RADIUS proxy realms never generate `proxy.conf`; IPS configuration tab is localStorage-only; time-access `action=check` evaluator has no callers.

### 1.3 Top 10 critical gaps (business impact ranked)

| # | Gap | Domain | Impact |
|---|-----|--------|--------|
| 1 | Unauthenticated `/api/vpp` proxy — rebuild, CoA, policy CRUD on the BNG dataplane | D | Anyone who can reach the app can tear down the network |
| 2 | Firewall UI create stores `matchCriteria:"{}"` and auto-applies → **match-everything DROP = total-traffic outage**; edits always 500 | F | One "Block IP" click can black out the ISP |
| 3 | API keys: plaintext at rest, re-served on every GET, unauthenticated create (`optionalAuth`) and unauthenticated PATCH (regenerate/rotate) | H | Total external-credential compromise |
| 4 | Audit trail mutable: any authenticated user can bulk-delete, purge by date, or **forge entries** (POST) | H | Compliance/forensics integrity destroyed |
| 5 | `/api/ipam` GET 500s once any subnet exists (`include: IpAddress` vs read `sn.ipAddresses`); `/api/captive-portal` GET 500s on `CAST(uuid AS int)`; technicians/[id] + complaints auto-assign 500 forever (invalid includes) | D/C | Core screens die exactly when real data exists |
| 6 | Side revenue never reaches the ledger: top-up purchases, add-on subscriptions, voucher redemption (nonexistent) create entitlements with **no Payment/Invoice**; charge overrides consulted by zero invoice paths — plus unauth legacy override API | A | Systematic revenue leakage, the exact no-leak gap the platform was built to close |
| 7 | Ledger integrity edges: negative `record_payment` accepted server-side; `GET /api/invoices` resurrects CANCELLED invoices as OVERDUE; manual invoices get balanceAmount=0 (AR understated); GST computed before discount (tax overstated); refund = wallet credit + invoice re-charge (double compensation); no idempotency on payment capture | A/B | Financial reports wrong; fraud-shaped edges |
| 8 | Fake provisioning: batch-provisioning writes jobs "COMPLETED, N/N success" creating zero subscribers; plan-migrate moves subscribers with zero proration billing | C | Silent operational lie with customer-visible fallout |
| 9 | Fake message delivery at scale: WA bot, churn retention, scheduled reminders, announcements, alert channels, notification rules — recorded SENT, never sent | I/A/B | Customers never reached; staff believe they were |
| 10 | PII/security exposure cluster: Aadhaar+PAN in 360° API (explicitly stripped elsewhere), device SSH/SNMP credentials in detail API, localhost RADIUS secret plaintext, LDAP bindPassword ×2 routes, SMTP passwords, webhook HMAC secrets, reseller bank accounts (unauth GET) | C/D/G/H | Regulatory + breach exposure (India DPDP Act) |

### 1.4 Revenue-leak register (the no-leak lens)

| Leak | Evidence | Severity |
|------|----------|----------|
| Top-up purchases never invoiced/paid — revenue invisible to collections & reports | `api/top-ups/route.ts:297-358` (bare `transactionId: string`, no Payment/Invoice FK) | HIGH |
| Add-on subscriptions never billed (incl. PER_MONTH recurring) | `api/add-on-services/subscribe/route.ts:61-82` | HIGH |
| Vouchers can never be redeemed — no redemption path exists in the platform | `api/vouchers/[id]/route.ts:81-87` is the only `status:"USED"` writer (manual admin) | HIGH |
| Charge overrides ignored by all 3 invoice-generation paths | `api/billing/route.ts:243` `const subtotal = sub.Plan.priceMonthly;` | HIGH |
| Manual/duplicate invoices created with `balanceAmount=0` → excluded from AR aging | `api/invoices/route.ts:236-275` | MED |
| Cancelled invoices resurrected to OVERDUE by the overdue sweep on every list load | `api/invoices/route.ts:57-64` | HIGH |
| Negative payments accepted (client guards; API is authority) | `api/billing/route.ts:145,155-161` | HIGH |
| Pro-rata checkbox ignored — truthy string `"false"` activates proration | `invoices-page.tsx:531` + `route.ts:192-197` | HIGH |
| Discount applied after tax → GST returns overstate tax liability | `api/invoices/route.ts:224-225` | MED |
| Refund: wallet credit + invoice balance restored in one transaction (double effect) | `api/payments/[id]/refund/route.ts:104-136` | MED |
| Collect path drops collector attribution (`collectedById` never set) | `api/payments/route.ts:222-237` | MED |
| Loyalty/referral points never earned from payments (earn-rate config dead) | grep: `pointsHistory.create` only in `/api/referral` manual ops | HIGH |
| Reseller counters (`totalSubscribers/totalCommission`) written by nothing; commission ledger synthetic | grep + `api/reseller/route.ts:145-151` | MED |
| Plan migration (plans page) bills nothing (vs subscriber bulk-change which does) | `api/plans/migrate/route.ts:87-96` | MED |

---

## 2. Method & Evidence Standard

- **Read-only.** No source files modified; no pm2/git/build operations during audit.
- Each agent: (1) read every assigned page component in full; (2) traced every `fetch`/`apiFetch` URL to a matching `route.ts` under `src/app/api/`; (3) read money/security-critical route bodies; (4) verified Prisma models against `prisma/schema.prisma` (227 models); (5) traced enforcement paths into `mini-services/` (gateway-service :3005, multiwan-monitor, session-engine, ips-daemon, radius-service, billing-cron :3004, vpp-adapter :3015, diameter-service).
- **Context honored:** 6 daemons intentionally stopped in this sandbox (syslog, whatsapp-bot, ips, snmp, network-monitor, multiwan-monitor). Empty-state pages depending on them are *not* flagged as gaps unless they fabricate data instead of honest zeros, or unless config CRUD has no enforcement path at all.
- **Severity rubric:** HIGH = fake business data / revenue leak / broken core workflow / security hole; MED = workflow, validation, contract gap; LOW = minor disconnect, perf, hygiene.
- **Maturity labels:** FULLY WIRED (reads+writes real) · PARTIAL (some real, some broken/fake) · STUB/STATIC (fiction or dead).

---

## 3. Domain Findings (evidence-annotated)

> Format: `[SEV] [Category] statement — EVIDENCE: path:lines → excerpt → impact.`
> Only top findings per page (max ~5); full detail preserved in worklog.md (Task IDs AUDIT-A…AUDIT-I).

### 3.A Billing Core — 55/100

**billing-page — FULLY WIRED**
- `[HIGH][VALIDATION]` record_payment accepts negative amounts — `api/billing/route.ts:145,155-161` → only `!invoiceId || !amount` + `amount > outstanding + 0.01` checks; negative passes both → counter staff can silently reverse receivables outside the refund chain.
- `[MED][WORKFLOW]` Payment capture race, no idempotency — `route.ts:164-168` → `invoice.paidAmount + amount` read outside transaction → double-book on concurrency/retry.
- `[MED][CROSS-MODULE]` Settled invoice never unblocks subscriber — `route.ts:168-198` → transaction writes payment+invoice only; no RADIUS reactivation → paid customers stay suspended until manual ops.
- `[MED][STATIC]` "Total Revenue" KPI = sum over the 15 visible rows — `billing-page.tsx:679`.
- `[LOW]` `"__none__"` discountType stored raw — `billing-page.tsx:1068` + `billing/[id]/route.ts:80`.

**invoices-page — FULLY WIRED (with server-side landmines)**
- `[HIGH][WORKFLOW]` GET /api/invoices resurrects CANCELLED→OVERDUE — `api/invoices/route.ts:57-64` → `updateMany({ where: { dueDate: { lt: now }, status: { notIn: ["PAID","OVERDUE"] } } ...})` → cancelled debt re-enters dunning.
- `[HIGH][WORKFLOW]` Pro-rata checkbox ignored — `invoices-page.tsx:531` `isProRata: isProRata ? "true" : "false"` (truthy string) vs `route.ts:192-197` `isProRata ? calculateProRataDays(...) : 0` → wrong amounts even when unchecked.
- `[HIGH][DEAD UI]` "No Discount" (`discountType:"none"`) violates enum `DiscountType{PERCENTAGE,FLAT}` → 500 on the most common create option — `invoices-page.tsx:618`, schema `:5355`.
- `[MED][DATA MODEL]` Manual invoices get `balanceAmount=0` → excluded from AR aging (`payments/analytics:99` `balanceAmount > 0.01`).
- `[MED][SECURITY]` Credit notes: POST `requireAuth` only (no permission), GET none, cap is per-note not cumulative, autoApply credits wallet not invoice — `api/invoices/[id]/credit-note/route.ts:11,49-54,71-78` → any user can mint wallet money; AR never reflects credit.

**payments-page — FULLY WIRED (hardest module in repo)**
- `[MED]` collect path never sets `collectedById` — `api/payments/route.ts:222-237` → collections leaderboard shows "Unattributed".
- `[MED]` Refund = wallet increment + invoice balance restore in one tx regardless of mode — `api/payments/[id]/refund/route.ts:104-136` → double compensation.
- `[LOW]` `PENDING/VERIFIED→REFUNDED` reachable via plain PUT with no Refund ledger row — `api/payments/[id]/route.ts:94-99`; partial payment erases OVERDUE aging (`:133-135`); `paymentMode` not enum-validated (`route.ts:227`).

**vouchers-page — PARTIAL**
- `[HIGH][WORKFLOW]` No redemption path anywhere — only `status:"USED"` writer is admin PUT (`api/vouchers/[id]/route.ts:81-87`); subscriber-auth has zero voucher refs → vouchers are printable paper, nothing more.
- `[MED][SECURITY]` `/api/vouchers/stats` swallows AuthError ("accessible without auth") → financial totals public — `route.ts:7-15`; auto-expire fire-and-forget `.catch(()=>{})` (:88-91).
- `[MED][STATIC]` "Expiring Soon" counts only the current page against global stats — `vouchers-page.tsx:593`. `[LOW]` no permission model on mint/cancel.

**cyclic-billing-page — PARTIAL**
- `[MED][STATIC]` Cycle telemetry placeholder (`currentSpeedDownKbps: 0`, raw UUID badge) — `api/cyclic-billing/route.ts:91-93`.
- `[MED][DEAD UI]` Milestones can't be edited/disabled/deleted from UI though API supports it — `cyclic-billing-page.tsx:294-318` vs `route.ts:178-227,272-331`.
- `[MED][WORKFLOW]` No enforcement engine: nothing evaluates milestones vs `usedTotalMb` → FUP throttling never happens automatically — page:324-343 is display-only.

**grace-periods-page — STUB/STATIC**
- `[HIGH][STATIC]` Hardcoded `demoSubscribers` (sub-100 "Vikram Rao"…) used by the lookup handler — `grace-periods-page.tsx:131-137,163-165`.
- `[HIGH][DEAD UI]` All 3 actions fail: POST without `?action=apply` → 400; PATCH/DELETE have no handlers — `:201-205` vs `api/grace-periods/route.ts:205-208,223,246`.
- `[HIGH][STATIC]` `FALLBACK_DATA` fills the table on any error; field shapes don't even match the API — `:148,152`.

**charge-overrides-page — PARTIAL**
- `[HIGH][CROSS-MODULE]` Overrides never affect invoicing: all 3 generation paths use `sub.Plan.priceMonthly`; `subscriberChargeOverride` referenced only by its own CRUD — `api/billing/route.ts:243`, `invoices/route.ts:191`, `bulk-generate:66`.
- `[HIGH][SECURITY]` Legacy twin `/api/charge-override` has **no authentication** on list/create/update/cancel — `api/charge-override/route.ts:5-46`.
- `[MED]` Changes bypass audit (`auditCreate` never called); `approvedBy` client-supplied — `charge-overrides/route.ts:153-171`; no overlap guard — `charge-override/route.ts:107-112`.

**top-ups-page — PARTIAL**
- `[HIGH][DEAD UI]` Product create/edit/delete all fail (no `?action=` contract; PATCH/DELETE 405) + fake optimistic row `id: tp-${Date.now()}` — `top-ups-page.tsx:229-236` vs `api/top-ups/route.ts:434-440`.
- `[HIGH][CROSS-MODULE]` Purchase creates entitlement only; no Payment/Invoice FK in schema — `route.ts:297-358`, schema `:4236-4254` → top-up revenue invisible.
- `[MED]` Consume has no idempotency/race protection — `route.ts:400-412`. `[LOW]` "Revenue" stat sums unpurchase prices — `top-ups-page.tsx:267`.

**add-on-services-page — STUB/STATIC**
- `[HIGH][DEAD UI]` Create 400 (no `?action=create-service`), edit 405 (route doesn't exist), subscription list 404 (no parent route) — `add-on-services-page.tsx:176-179,121` vs `api/add-on-services/route.ts:410-416`.
- `[MED][CONTRACT]` Page expects `type/price`; API returns `chargeType/chargeValue/isActive` → prices render ₹0 — `:35-44,368` vs `route.ts:23-33`.
- `[MED][CROSS-MODULE]` Subscriptions never bill; renewal is a status flip — `subscribe/route.ts:61-82`.

**Missing (billing schema):** Payment.idempotencyKey (unique), gateway fee/settlement fields; Invoice dunning state + reminder history, placeOfSupply, round-off; per-line tax breakup; CreditNote number + APPLIED/VOID lifecycle (applied to invoice, not just wallet); SubscriberTopUp/SubscriberAddOn.paymentId FK; Voucher batch + applied-payment linkage; TaxRate/slab model; RecurringInvoiceTemplate runner (`nextGenerateAt` written by nothing).

---

### 3.B Finance & Revenue — 82/100

**dashboard-page — FULLY WIRED** — All headline KPIs (revenue, MRR, ARPU, churn, collection-today, overdue) trace to real Prisma aggregates in `/api/dashboard`. `[LOW]` Monthly target falls back to invented ₹15,000 / revenue×1.2 when unset (`dashboard/route.ts:802`); CAC is a 15%-of-revenue heuristic (`:727`).

**collection-page — FULLY WIRED** — record-payment (tx + duplicate check), verify, reconcile, refunds, disputes, targets all real. `[MED][DEAD UI]` Bulk checkboxes exist only to be cleared — no bulk action (`collection-page.tsx:450,638-640`). `[MED]` "Agent Target Achievement" renders contribution share, ignores per-agent monthlyTarget (`:628`). `[LOW]` CSV export only the loaded page; no zod on `/api/collection*`, `/api/disputes`, `/api/refunds`.

**smart-collections-page — PARTIAL** — Scoring real (deterministic buckets from actual avgDaysToPay). `[HIGH][WORKFLOW]` **Reminders never delivered**: POST creates PENDING `ScheduledMessage` rows; no worker/cron anywhere; WA "send_now" flips status to SENT with no gateway call — `collections/schedule/route.ts:130-135`, `whatsapp/schedule/route.ts:99-101`.

**due-recovery-page — PARTIAL** — Core deeply real (RBAC record-payment, suspend/write-off, payment plans+installments, SLA pause/resume, real legal-notice generation+print+persist, real CSV export). `[HIGH][STATIC]` Agent dashboard `avgDaysToResolve: Math.round(18 + Math.random()*10)` — fabricated 18–28 day performance metric — `due-recovery/route.ts:187`. `[MED][DEAD TAB]` Audit Trail reads `data.actions`; GET never returns it → permanently empty (`due-recovery-page.tsx:1818`). `[MED]` Payment Promises tab is session-local; server rows never listed back (`:612`). `[LOW]` Agent assignment joins via `Subscriber.internalNotes contains agent.id` (`route.ts:144-146`).

**gst-tax-page — FULLY WIRED** — GSTR-1 B2B, GSTR-3B (monthly+quarterly), GSTR-9, HSN, TDS/TCS, reverse-charge all real Invoice aggregates (`gst/route.ts:34-65,128-165`). `[MED][DATA MODEL]` No TaxFilingPeriod/GstrFiling persistence → returns are recompute-only; TDS "DEPOSITED" is a manual badge.

**revenue-leakage-page — FULLY WIRED** — 8 heuristics all query real tables; aging tab computes doubtful-debt provision from real invoices. `[LOW]` Auto-fix toast reports client count, not server `fixedCount` (`revenue-leakage-page.tsx:302`).

**revenue-reports-page — FULLY WIRED** — Paid invoices + payments + churn/ARPU + area/plan breakdown; expenses DB-backed; KPI targets persisted. `[MED][DATA MODEL]` Expense has no approval workflow (no status/approvedBy/receipt) → any POST instantly hits net-margin KPIs (schema:1371-1384). `[LOW]` Accrual (invoice) vs cash (collection) bases unreconciled.

**revenue-forecast-page — FULLY WIRED** — 6-month MRR from VERIFIED payments; real churn. `[LOW]` `avgPlanPrice` is unweighted plan mean, not subscriber-mix-weighted ARPU (`forecast/route.ts:146-149`); ±20% bands fixed multipliers.

**reports-page — FULLY WIRED** — 8 report families from real tables; custom builder real; no fake found.

**referral-page — FULLY WIRED (engine island)** — `[HIGH][CROSS-MODULE]` Points never earned from payments — `pointsHistory.create` exists only in `/api/referral` manual adjust/redeem; "X points per ₹100" earn-rate config is dead; conversions have no automated reward payout.

**loyalty-gamification-page — FULLY WIRED (read-side)** — Real payment streaks; tier PUT batch-recalculates from totalPoints. `[HIGH]` Shares the referral earn-side gap — gamification decays to manual admin adjustments.

**compliance-sla-page — FULLY WIRED (read-only)** — SLA from real complaint deadlines; regulatory from tax aggregates + KYC counts. `[LOW]` "Export Report" downloads raw JSON (`:331`).

**data-export-page — FULLY WIRED** — 4 endpoints stream real CSV/JSON with filters. `[LOW]` Rows silently capped `take: 10000` without warning (`export/payments/route.ts:53`).

**Missing (finance schema):** TaxFilingPeriod/GstrFiling; Ledger/Journal (accrual-vs-cash reconciliation); Expense approval fields; CommissionRule linking collections→CommissionPayout (payouts manual-only); ScheduledMessage dispatcher/attempt state.

---

### 3.C Subscribers & CRM — 62/100

**subscribers-page — FULLY WIRED** — bulk renew (atomic invoice+payment+wallet), change-plan with proration invoices+credit notes, status→RADIUS block propagation, delete guarded by GST financial-history retention, PII stripped in detail. Gaps:
- `[MED][SECURITY]` `online-count` fails open: `await requireAuth({} as any).catch(()=>{})` — always throws, always swallowed → unauthenticated telemetry + fake zeros on DB error — `subscribers/online-count/route.ts:11,34-37`.
- `[MED][VALIDATION]` Single PUT accepts arbitrary status strings (enum whitelist only in bulk) — `[id]/route.ts:147` vs `bulk/route.ts:41`.
- `[MED][WORKFLOW]` Suspend/Disconnect blocks future auth but never CoA-kills live sessions — `[id]/route.ts:306-327`.
- `[LOW]` RADIUS sync failure swallowed on create (`subscribers/route.ts:375-377`); expiring watchlist loads all ACTIVE then filters in JS.

**plans-page — FULLY WIRED** — create auto-creates+syncs RadiusGroup; PUT re-syncs radgroupreply on speed/data/session change; delete guarded. Gaps:
- `[MED][SECURITY]` Single-plan GET unauthenticated (list GET authed) — `plans/[id]/route.ts:9-31`.
- `[MED][WORKFLOW]` "Migrate subscribers" = bare `updateMany`, zero money movement (vs subscriber bulk-change which issues proration invoices) — `plans/migrate/route.ts:87-96`.
- `[LOW][SECURITY]` Migrate hand-rolls quote-doubled `$executeRawUnsafe` SQL — `migrate/route.ts:96-130`.

**subscriber-360-page — FULLY WIRED (read-only)**
- `[HIGH][PII]` Returns Aadhaar + PAN + kycDocPath while sibling detail endpoint was explicitly patched (F-22) to strip exactly these — `[id]/360/route.ts:256-258` vs `[id]/route.ts:42`.
- `[MED][WORKFLOW]` "Lead Source" card can never render: `convertedSubscriberId` written by nothing in the codebase — `[id]/360/route.ts:201`.
- `[MED]` Picker capped at first 100 subscribers, client-side slice — page:268,346.

**batch-provisioning-page — STUB/STATIC**
- `[HIGH][STATIC]` Batch creation is theater: CSV parsed only to count lines; job written **COMPLETED, 0 failures** with in-code confession `// Simulate immediate completion for the demo` — `batch-provisioning/jobs/route.ts:80-100`.
- `[HIGH][DEAD UI]` Provisions 0 subscribers while reporting success — same route.
- `[MED]` Parallel `/api/provisioning` engine is a worker-less state machine (`start-job` flips a flag; `update-progress` has no caller) — `provisioning/route.ts:242-302`.
- `[MED][DATA MODEL]` Template options silently dropped on save (ipv6/radius/ipv4Type/area); DHCP/STATIC collapse to FTTH/PPPoE — `templates/route.ts:66-72,96-104`.

**leads-page — PARTIAL**
- `[HIGH][WORKFLOW]` "Convert" is a status label — no subscriber created, no hand-off, `convertedSubscriberId` never set — `leads-page.tsx:438-445` → `leads/route.ts:283-290`.
- `[HIGH][SECURITY]` Entire read surface unauthenticated incl. 9999-row CSV of names/phones/emails/UTM — `leads/route.ts:104-183` (GET), `leads/[id]/route.ts:80-108`.
- `[MED]` No follow-up reminder mechanism; `followUpDate` consumed client-side only. Wired ✅: scoring, round-robin, duplicate detection, comms log.

**agents-page — FULLY WIRED** — reconciliation, follow-ups, payouts, analytics all payment-derived and authed.
- `[MED][DEAD UI]` "Create Login" hashes a generated password then returns only id/email — credential destroyed, account unusable — `agents/create-login/route.ts:32,60`.
- `[LOW]` Client-sent `totalCollectedToday/Month/totalCommission` accepted verbatim — `agents/[id]/route.ts:123-125`.

**technicians-page — PARTIAL**
- `[HIGH][BROKEN API]` Detail endpoint 500s on every call — invalid include `installations` (back-relation is `Installation`) + nested `areasManaged` in wrong includes — `technicians/[id]/route.ts:26-47` vs schema:4428-4430 → detail drawer dead.
- `[HIGH][DEAD UI]` "Create Login" generates+hashes `Tech@`+random then communicates nothing ("secure channel" that discards the secret) — `[id]/route.ts:224-238`; create hardcodes `bcrypt("technician_default")` — `technicians/route.ts:73-77`.

**complaints-page — PARTIAL**
- `[HIGH][BROKEN API]` Auto-assign 500s on every call — include `assignedTo` (relation is `Technician`); the sibling [id] route documents this exact bug as fixed but the copy survives — `complaints/[id]/auto-assign/route.ts:25-29` vs schema:794.
- `[MED][WORKFLOW]` GET handler runs SLA auto-escalation writes directly above a comment claiming the sweep was moved to "job-007 billing-cron" which doesn't exist — `complaints/route.ts:128-180` → escalation only when someone browses.
- `[LOW]` Escalation/notify write audit rows only — no notifications; ticket number = count+1 → concurrent-create collision 500 (`route.ts:237-245`).

**installations-page — PARTIAL**
- `[HIGH][WORKFLOW]` Completing an installation activates nothing: only stamps `completedAt` — no subscriber activation, no RADIUS, no first invoice — `installations/[id]/route.ts:53-70` → lead→install→activation cascade is a manual bridge.
- `[MED]` No status whitelist on PUT (`:60`). `[LOW]` GET single unauthenticated (PII) — `:8-42`.

**action-history-page — STUB/STATIC**
- `[HIGH][STATIC]` Always renders 10 fabricated entries: never sends `?action=list` → API 400s → `FALLBACK_DATA` behind an amber banner — `action-history-page.tsx:112,119,46-57` vs `action-history/route.ts:96-99`.
- `[HIGH][DEAD UI]` "Reverse" doubly dead (wrong contract + status never checked) → success toast + optimistic UI on every failure — `:175-179` vs `route.ts:180-186,232-236`.
- `[MED]` Even with correct action, page/API shapes are entirely different protocols — `:33-44` vs `route.ts:117-135,206-218`.

**announcements-page — PARTIAL**
- `[MED][WORKFLOW]` Channels (EMAIL/SMS/WA/PUSH) stored as CSV; no delivery, no fan-out, audience never evaluated — `announcements/route.ts:70-86`.
- `[LOW]` `expiresAt` never filtered on GET — stale promos render forever (`:17-24,37`).

**technician-performance-page — FULLY WIRED (1 dead button)** — All metrics from real 30-day data. `[HIGH][DEAD UI]` "Auto-Assign" hits the 500-ing route — `technician-performance-page.tsx:309-314`. `[LOW]` "First-Visit Fix Rate" is actually rating-share mislabeled (`technicians/performance/route.ts:155-160`).

**reseller-page — PARTIAL**
- `[HIGH][SECURITY]` GET fully unauthenticated — bank account/IFSC + subscriber PII + commissions public — `reseller/route.ts:23-201,187,55-56`.
- `[HIGH][STATIC]` Commission ledger synthetic: revenue = totalSubscribers × avgArpu (ARPU fallback ₹1,500); `paymentStatus = totalCommission > 0 ? "Pending" : "Paid"` — `route.ts:145-151`.
- `[MED][DATA]` `totalSubscribers/totalCommission` written by nothing — FLAT/SLAB math runs on dead counters. `[MED][STATIC]` Wholesale price = ×0.9, margin hardcoded 10 (`:155-158`).

**selfcare/ — WIRED** — 10 components, 11 `/api/subscriber-auth/*` routes + 4 `/api/selfcare/*` + real payment order flow. No missing endpoints, no static-data layer.

**Missing (CRM schema):** KYC/SubscriberDocument (type/expiry/verification trail); Port-In/Out; announcement delivery records; scheduled-job backing for "job-007"; transactionally-maintained reseller counters; per-row provisioning results table.

---

### 3.D Network & Infrastructure — 55/100

**nas-clients-page — FULLY WIRED** — real FreeRADIUS `nas` table, auth+audit.
- `[MED][SECURITY]` GET returns real plaintext secret for built-in localhost NAS (`secret: isDefault ? r.secret : maskSecret(...)`, `DEFAULT_SECRET = "CryptskRADIUS2026"`) — `api/nas-clients/route.ts:157,23`.
- `[MED][DEAD UI]` Test-connection always toasts `"undefined (undefinedms)"` (nested response read flat) — `nas-clients-page.tsx:308-315` vs `test-connection/route.ts:195-203`.
- `[LOW]` Copy-secret copies masked value; editing masked secret saves mask text as real secret; second NAS registry (`/api/nas-client-config`) orphaned.

**devices-page — PARTIAL**
- `[HIGH][DEAD UI]` Reboot (single+bulk) never reboots — flips status to MAINTENANCE; toast lies "Reboot command sent" — `devices-page.tsx:702-706`, `api/devices/bulk/route.ts:21-24` → NOC believes fleet rebooted; stats corrupted.
- `[HIGH][SECURITY]` Device detail returns SSH password + SNMPv3 keys unmasked (list strips them) — `api/devices/[id]/route.ts:14-34` vs `route.ts:61`.
- `[MED][STALE]` CPU/MEM/temp render raw DB values with no staleness hint; only writer is stopped SNMP daemon — `devices-page.tsx:1228-1240`.

**ipam-page — PARTIAL (main listing broken at runtime)**
- `[HIGH][RUNTIME BUG]` GET 500s once any subnet exists: `include: { IpAddress: true }` but code reads `sn.ipAddresses` — `api/ipam/route.ts:45` vs `:111` (schema relation `IpAddress`, :4032) → page silently renders 0 subnets.
- `[HIGH][DEAD REF]` Traffic-shaping gate calls nonexistent `/api/gateway/config` (silent catch) → per-subnet TC switch permanently disabled + permanent warning — `ipam-page.tsx:332,862-876`.
- `[MED][FIELD LOSS]` Form sends `vlan`, API persists only `vlanId` → VLAN column always "—" (`:588/598` vs `route.ts:180,206-212`); IP rows read `ip.subnet?.cidr` vs include `Subnet` (`:67` vs `:137`).

**ipam-cgnat-tab — PARTIAL (bookkeeping-only)**
- `[HIGH][DEAD UI]` Per-subnet NAT-mode "Save" posts fields (`natMode/wanInterfaceId/cgnatPoolId/oneToOneNatIp`) that `update-subnet` never touches → "NAT mode updated" toast, nothing persisted — `ipam-cgnat-tab.tsx:293-303` vs `api/ipam/route.ts:203-231`.
- `[HIGH][NO ENFORCEMENT]` CgnatPool/CgnatMapping consumed by nothing but this tab — no nftables/daemon reads them → CGNAT is an inventory spreadsheet — grep across src+mini-services.
- `[MED]` Invalidation key `"cgnat-"` matches none of the real query keys → stale lists; every query masks failures with empty fallbacks (`:243,380,189-191,210`).

**interfaces-page — FULLY WIRED** (best-in-repo: real `/sys/class/net`, `ip -j`, live `ip link add/set`) — `[MED]` Gateway-config form edits 8 fields, save persists 4 (`interfaces-page.tsx:376` vs `api/interfaces/route.ts:663`); `[MED]` GET always reports `tcEnabled/natEnabled/nftablesEnabled: false` (`route.ts:397-399`); `[LOW]` VLAN/bridge/bond live-only, no netplan persistence; `run()` swallows errors to "".

**dhcp-page — FULLY WIRED** — honest proxy to gateway-service→KEA (Connected/Disconnected chip). `[MED]` Gateway-down → 503s render as zeros with no error UI (`dhcp-page.tsx:251-286`). `[LOW]` Portal dropdown uses `/api/hotspot` while CaptivePortal↔DhcpSubnet relation exists (two portal concepts).

**dhcpv6-page — PARTIAL**
- `[HIGH][NO ENFORCEMENT]` DhcpV6* models read/written only by this page; gateway-service has zero dhcpV6 handlers; KEA v6 conf generated client-side for copy — page:435,463,1085 (honest note) → full v6 plan never reaches any server.
- `[MED]` No DhcpV6Lease runtime table; `[LOW]` no CIDR validation on prefixes.

**dns-page — FULLY WIRED** — gateway reads DnsRecord, writes /etc/dnsmasq.d, real `killall -HUP dnsmasq`. `[MED]` Gateway-down shows zero records with no banner (same pattern as DHCP).

**pppoe-server-page — PARTIAL (3 permanently dead actions)**
- `[HIGH][DEAD UI]` Profile edit / profile delete / session disconnect hit routes that cannot exist (no dynamic routes, no rewrites; API's PUT expects body-id) → always 404 — `pppoe-server-page.tsx:435,448,472` vs `api/pppoe/route.ts:283-291` (unreachable nested-path parser).
- `[MED]` Gateway-down catch returns HTTP 200 with empty arrays; config tab falls back to `DEFAULT_SERVER_CONFIG` displayed as live — `route.ts:176-179`, `page:394,185-199`.

**captive-portal-page — PARTIAL**
- `[HIGH][RUNTIME BUG]` GET 500s once ≥1 portal exists: raw SQL `CAST(cp."id" AS int)` on a uuid String id — `api/captive-portal/route.ts:54-58` vs schema:530 → portal list dies with `invalid input syntax for type integer`.
- `[HIGH][NO ENFORCEMENT]` Gateway HAS a real nftables apply endpoint (`gateway-service/index.ts:2169-2173` builds `cryptsk_portal` chains) — **nothing ever calls it**; page has no Apply/Reload button → portals never intercept clients.
- `[MED][SECURITY]` Raw SQL string-interpolates ids (`:51`).

**multiwan-page — FULLY WIRED** (real tc/nft/route/ping OS actions; honest isError UI) —
- `[HIGH][DISCONNECT]` FailoverRule rows never read by the enforcement daemon — multiwan-monitor fails over on WanLink fields + `backupLinks[0]` only — `api/multiwan/route.ts:100,446-455` vs `mini-services/multiwan-monitor/index.ts:265-294` → configured triggers/priorities cosmetic.
- `[MED]` load-balancing-status masks errors as `success:true, active:false` — `route.ts:786-793`.

**dynamic-routing-page — FULLY WIRED** — real FRR: vtysh, injection-safe execFileSync arg arrays, BGP/OSPF parsers, route-maps/prefix-lists; static routes via `ip route add/del`. `[LOW]` No install affordance when FRR missing; no zod on user clauses.

**ftth-gpon-page — PARTIAL** — `[MED][DEAD UI]` OLT "Reboot" sets status MAINTENANCE only (`api/ftth/olts/[id]/reboot/route.ts:18-21`); `[MED][DATA MODEL]` No Onu entity at all (serial/auth-list/PON binding impossible); `[LOW]` line/service profiles assigned but never provisioned to hardware; tx/rx power manual entry.

**vpp-gateway-page — FULLY WIRED (all 21 actions proxy to real adapters)**
- `[HIGH][SECURITY]` `/api/vpp` proxy has **no requireAuth on any method** — rebuild, simulate-restart, reconcile, CoA, policy CRUD callable unauthenticated — `api/vpp/route.ts:1-3,68-176,184-315` vs api-auth doctrine everywhere else.
- `[MED][FAKE DATA]` DPI tab "seed synthetic" button injects synthetic classifications into live session-engine with a celebratory toast — `vpp-gateway-page.tsx:4577-4590`.
- `[LOW]` Page uses raw fetch (no Bearer) — adding auth to the proxy would silently break it.

**network-health-enhanced-page — PARTIAL** — `[HIGH][DEAD UI]` "Create Ticket" on every prediction fires a toast only; real `/api/complaints` unused — `network-health-enhanced-page.tsx:306-310`. Data itself real + honest retry states.

**Missing (infra):** Onu (serial/auth/PON binding/last-seen); FiberRoute + splitter cascade capacity; DhcpV6Lease/PD runtime; OLT/ONU performance samples; device-config backup artifacts (autoBackup flag has no scheduler); CGNAT→dataplane binding; portal applied-version tracking; IPAM exhaustion alerts wired to alert-center.

---

### 3.E Monitoring — 58/100

**sessions-page — FULLY WIRED**
- `[MED]` "Active RADIUS" tile always 0 — page reads `stats.activeSessions`, API returns `stats.totalActive` — `sessions-page.tsx:313,775` vs `api/radius/sessions/route.ts:163`.
- `[MED]` RADIUS "Kill" fakes disconnect: sets DB `stopTime/terminateCause`, no CoA — `route.ts:213-220`.
- `[MED]` CoA endpoint always resolves success (timeout/error/catch → `resolve(true)`; zeroed authenticator) — `api/sessions/disconnect/route.ts:243-266`.
- `[LOW]` Detail dialog download/upload/MAC are API-hardcoded placeholders (`api/sessions/route.ts:73,83-84`).

**session-history-page — PARTIAL (dead wire)**
- `[HIGH]` Page can NEVER render: expects `{entries, totalPages, stats.avgDurationFormatted}`; API returns `{data, pagination:{pages,total}, stats.avgDuration}` — `session-history-page.tsx:216-226` vs `api/aaa/session-history/route.ts:98-107`; row fields mismatch too (`acctSessionTime` vs `sessionTime` etc.) — page:56-59 vs route:54-66.

**auth-log-page — PARTIAL (dead wire + missing export)**
- `[HIGH]` Same envelope mismatch → always empty — `auth-log-page.tsx:243-251` vs `api/aaa/auth-log/route.ts:85-94`.
- `[HIGH][DEAD UI]` Export CSV button 404s — fetches `/api/aaa/auth-log/export` which doesn't exist — page:302-304.
- `[MED]` Renders `timestamp/clientIp/authType`; API has `authdate` only.

**bandwidth-page — FULLY WIRED (data frozen by stopped daemon — honest zeros)**
- `[MED][STATIC]` Protocol mix invented: 52% HTTPS/18% HTTP/… self-flagged `TODO: hardcoded estimates` — `bandwidth-page.tsx:376-389`.
- `[MED][DEAD-WRITE]` BandwidthLog's only writer is stopped network-monitor; no backfill; no pruning anywhere while route loads full-range logs into JS — `mini-services/network-monitor/index.ts:449`, `api/bandwidth/route.ts:179-188`.

**traffic-analytics-page — PARTIAL**
- `[MED][DEAD-MODEL]` Protocol distribution reads `ndpiAppUsage` — no code writes it (ndpi-service writes `dpiClassification` only) — `api/traffic-analytics/route.ts:97-103,248-254`.
- `[MED][STATIC]` Missing subscribers get invented codes `SUB-${10000+i}` and `10.0.x.x` IPs — `route.ts:200-202`.
- `[MED]` Time-range filter decorative (queryFn ignores it); raw fetch without apiFetch; "Live" pulse cosmetic.

**bw-reports-page — FULLY WIRED** — Gateway-first + honest Prisma fallback; real zeros when empty. `[MED]` "Top Consumers" ignores period (ranks lifetime UsageLog, no where clause) — `api/bw-reports/route.ts:133-143`. `[LOW][SECURITY]` Auth-swallow: non-AuthError continues unauthenticated (`route.ts:276-287`). `[LOW]` Dead Math.random demo generators left in file (annotated not-called) — `:168-289`.

**app-awareness-page — FULLY WIRED (one fake chart)**
- `[HIGH][STATIC]` App-detail "Traffic Trend" = 24 `Math.random()` points regenerated per open — `app-awareness-page.tsx:1329-1331`.
- `[MED]` Pipeline starved: ndpi-service derives from NatLog whose only writer (nat-logger) is stopped — honest `daemonOnline:false` zeros.

**uptime-monitor-page — FULLY WIRED** — real HTTP/ping/TCP/DNS probes persisted.
- `[MED]` Scheduler lives in the Next route process (`setInterval` map + init on import) → dies on redeploys, duplicates across instances — `api/uptime-monitor/route.ts:13,132-165`.
- `[MED]` UptimeCheck grows unbounded; `action=incidents` full-scans — `:228-231`. `[LOW]` Zero-check targets show 100% uptime (`:190`).

**latency-monitor-page — PARTIAL (server fabricates)**
- `[HIGH][STATIC]` When no uptime targets exist: `avgLatency: 3 + Math.random()*25`, jitter/loss invented; timeline "Generate realistic timeline" sine+random; events fabricated ("Team Paged", duration `Math.random()*30+3` min); trends random; 8 hardcoded fake alert rules — `api/latency-monitor/route.ts:107-141,177-199,313-347,373-385,236-249` → NOC sees SLA-grade fiction. (When UptimeCheck rows exist, link metrics are genuinely computed — `:24-87`.)

**speed-test-page — FULLY WIRED** — real Ookla server-side. `[MED][DATA MODEL]` Results never persisted — no SpeedTest model, no history/SLA evidence (`api/speed-test/route.ts:139-180`). `[LOW]` Progress bar simulated client-side; auto-installs binary from speedtest.net into /tmp.

**syslog-server-page — FULLY WIRED** — honest offline state; Start really boots the mini-service. `[MED]` Retention = manual Clear button only; `count()` full-table polled every 5s — `route.ts:225,51`.

**diagnostic-tools-page — FULLY WIRED** — real execution, injection-safe Bun.spawn argv arrays, DiagnosticCapture persisted. `[MED]` POSTs have no timeout/fallback when gateway down (`api/diag/route.ts`); `[LOW]` read queries `.catch(()=>empty)` mask auth failures.

**ip-mac-history-page — PARTIAL (feature orphaned + UNAUTH API)**
- `[HIGH][SECURITY]` No auth at all: GET leaks subscriber PII; POST writes history and mutates `subscriber.macAddress` — `api/ip-mac-history/route.ts:5-256,259-322,68-72,290-310`.
- `[HIGH][DEAD-WRITE]` Zero producers in mini-services → table empty forever; built-in spoofing detector can never fire — grep.

**zone-budgets-page — STUB/STATIC**
- `[HIGH][STATIC]` Permanent demo data: GET without `?action=` → 400 → DEMO_BUDGETS ("Downtown Zone"…) — `zone-budgets-page.tsx:65-77,134-139` vs `api/area-budgets/route.ts:158-161`.
- `[HIGH][DEAD UI]` Both mutations fake success (create: wrong fields + no `?action=create`, skips res.ok; update: PATCH on a route with no PATCH → 405) — `:162-181`.
- `[MED]` Area selector hardcodes 4 fake ids; `alert-check` endpoint never called on schedule; no enforcement — over-budget is a badge.

**nat-logs-page — PARTIAL**
- `[HIGH][DEAD UI]` Entire Syslog tab dead — hits `/api/syslog/configs*` on the Next origin; those routes don't exist (gateway-only) → every load/save/test 404s — `nat-logs-page.tsx:1388,1442-1481`.
- `[MED][STATIC]` "Active Logging — Running" badge hardcoded regardless of daemon — `:280-284`.
- `[MED]` NatLog (legal) has no scheduled cleanup — only a manual gateway DELETE (`/api/nat-logs/cleanup`) — compliance + disk risk.

**grafana-dashboards-page — FULLY WIRED** — real proxying, honest unconfigured state. `[MED][SECURITY]` Auth-swallow + server-side fetch of user URLs (SSRF surface, 10s timeout); API key plaintext in IspSettings — `api/grafana-dashboards/route.ts:170-233`.

**Missing (monitoring):** SpeedTestResult; NetFlow/sFlow or real per-protocol source (NdpiAppUsage writer-orphaned); SlaBreach/MTTR persistence; IpMacHistory producers; UsageLog↔NasSession octets linkage for quota billing; scheduled-retention config entity.

---

### 3.F Policy & Security — 35/100 (worst domain)

Route-layer verified: all fetch URLs resolve (one exception: `/api/ddos/counters` → 404 swallowed). `/api/bandwidth-mgmt` route is an orphan (no page). **`src/lib/policy-compiler.ts` has zero callers repo-wide** — plan→RADIUS enforcement never compiled.

**bandwidth-mgmt — PARTIAL** — fully wired to gateway TC, honest errors, no fake data. `[MED]` Shaping completely decoupled from plans/RADIUS (orphaned compiler above); `[MED]` Numeric inputs silently coerced (`Number(x) || 25000` → garbage becomes plausible 25 Gbps — `:419-426,434,464`); `[LOW]` Dead route + dead `useQosMutation`.

**time-access — STUB/STATIC (worst page in domain)**
- `[HIGH][STATIC]` 5 demo policies + 6 fake assignments render **permanently** — API returns `{success, data}` while page checks `data.policies/data.assignments` → Array.isArray fails → FALLBACK even on success — `time-access-page.tsx:72-87,150-164`.
- `[HIGH][DEAD UI]` Every write broken: create POSTs without `action` → 400; edit PATCH → 405; delete DELETE?id → no handler but local row removal + "deleted" toast; assign sends `policyId`, route requires `timeAccessPolicyId` → 400 swallowed as "assigned successfully" — `:190-259` vs `route.ts:173-345`.
- `[HIGH][SECURITY]` Policy CRUD **unauthenticated** — only route in the domain missing requireAuth — `time-access-policies/route.ts:1-2`.
- `[HIGH][STATIC]` Assign-dialog searches a hardcoded 3-fake-user list — `:136-141,524-551`.
- `[MED]` UI vocabulary (LIMIT_SPEED/ALLOW_ONLY/REDIRECT, "Mon") doesn't exist in schema enums — even a fixed page couldn't save 3 of 4 action types; `action=check` evaluator has zero callers.

**qos-monitor — PARTIAL (API fabricates the telemetry)**
- `[HIGH][STATIC]` Packet drops = `Math.floor(Math.random()*5000+500)` when "congested"; sessions `Math.random()*30+5`; heatmap `hourFactor = Math.random()` (hourLogs computed then never used); with no QosConfig rows the API invents 7 queues incl. `droppedPkts: 2847` + fabricated incident events — `api/qos-monitor/route.ts:77-83,117,290-311,121-132,255-281`.
- `[MED][CORRECTNESS]` Real-queue sessions always 0 (reads `config.Plan?.Subscriber`, relation is `targetPlan`); priority = string length; every audit entry labeled `queue_congested` — `:48,47,231`.
- `[LOW]` Pulsing "Live" badge over fabricated data.

**firewall — PARTIAL (real enforcement, broken at every UI operation)**
- `[HIGH][CONTRACT]` List/stats can never display: gateway returns `{success, data:[...]}`, page expects `{rules, stats}` — `gateway-service/index.ts:1658-1660` vs `firewall-page.tsx:236-254` → "No firewall rules found" forever.
- `[HIGH][OUTAGE RISK]` Create silently drops every match field (UI sends flat `sourceIp/destIp/...`, never `matchCriteria`) → gateway stores `matchCriteria:"{}"` and **applies immediately** → "DROP from 1.2.3.4" becomes match-everything DROP = full-traffic blackout; edits always 500 (unknown columns spread into prisma.update) — page:168-191,494-504 vs gateway:1668-1683,1700-1710.
- `[MED]` No IP/CIDR/port validation anywhere in the chain (`10.0.0.0/33` flows into nft); "Block Specific IP" quick rule has no IP input; IPv6 quick rules toast before mutation resolves.
- `[POSITIVE]` Apply path genuine: gateway compiles full ruleset from enabled DB rules by priority.

**ips — PARTIAL (strongest backend, broken UI contract)**
- `[HIGH][CONTRACT]` All 6 read queries mismatch daemon envelope/field names → alerts/rules/blocks/scores/stats permanently empty; "Daemon Offline" banner even when healthy — daemon `{status:"running", activeBlockCount,...}` (`ips-daemon/index.ts:1149-1160`) vs page `daemonData?.running` (`ips-page.tsx:353`), `{rules}`/:341, `{scores}`/:348, `{alerts,total}`/:316, flat stats/:316; fields `alert.type/destination`, `block.ip` vs model `eventType/destIp/sourceIp`.
- `[HIGH][DEAD UI]` Bulk ack/false-positive PUT → route exports only GET/DELETE → 405; manual "Block IP" sends `{ip}`, daemon requires `sourceIp` → 400; rule create sends single `threshold` → daemon stores thresholdPps/Bps/Conn = 0 → rules never fire; "Clear old alerts" forwards query params, daemon reads body → purges all >30d regardless of status — `alerts/route.ts`, daemon `:1233-1256,1407-1409,1310-1330,1260-1276` vs page `:186-191,554-557,176-184`.
- `[HIGH][STATIC]` Entire Configuration tab (auto-block, durations, decay, retention, whitelist) is useState + toasts — never fetched, never persisted — page:299-304,585-597,1482-1565.
- `[MED][DATA MODEL]` UI durations 1h/6h/24h/7d/30d vs enum TEMP_5M..TEMP_24H|PERMANENT → unknown → 1800s fallback → "Permanent" expires in 30 min; threat scores live in an in-memory Map (wiped on restart); expired blocks never swept.

**ddos-protection — PARTIAL**
- `[HIGH][DEAD UI]` Every policy create/edit 500s: form includes `connectionRate`, column is `thresholdConnRate` → Prisma UnknownArgError — `ddos-protection-page.tsx:235-261` vs schema:888-926 vs gateway:3066.
- `[HIGH][CONTRACT]` Policies list + stat cards permanently empty (`{success,data}` vs `{policies,stats}`); Monitor + nftables tabs can never show data (no such gateway routes) — gateway:3048-3057, route table:461-482 vs page:505,522,531,552-560.
- `[HIGH][STATIC]` Traffic-stats card silently fabricates all-zero "live" data via `.catch(()=>({totalPps:0,...}))` on a 404ing `/api/ddos/counters` — page:540-548.
- `[MED]` Quick-rule posts nonexistent `quick-rule` action; counters tab uses `{success,data}` object as an array.

**vpn-server — FULLY WIRED** — real WireGuard/strongSwan shell management, strong validation, honest empty states. `[MED][SECRETS]` Server WireGuard PrivateKey returned on every config fetch + reveal/copy UI — `route.ts:129-136`, page:634-651. `[LOW]` Peer add/edit says "(not yet applied)" — no reload action; no peer/user DB model → no accounting/expiry.

**security (L2 profiles) — PARTIAL**
- `[HIGH][CONTRACT]` Profile list + stats permanently empty (same envelope family) — gateway:2203-2213 vs security-page.tsx:197-224.
- `[HIGH][SILENT FIELD LOSS]` Created profiles have every feature OFF and no thresholds: UI sends 12 fields, gateway maps only 5 `*Enabled` keys the UI never sends → `features:"[]"`; edit then 500s — page:103-119,348-367 vs gateway:2216-2234.
- `[MED][DEAD TABS]` Features + Audit-logs tabs 404 (`/api/security/features|logs` don't exist at gateway); "Apply Security" toasts success while iterating always-empty `features` — gateway:2270-2277 vs page:294-310.
- `[LOW]` Field-model drift (`interfaceName` vs `interfaceId`; arrays vs String columns).

**Related exposure:** LdapConfig `bindPassword` returned in plaintext by enterprise-auth GETs (`enterprise-auth/route.ts:85`, `[id]/route.ts:122,138`).

**Missing (security):** geo-IP rule entity (GEO_BLOCK has no rule); rule versioning/rollback; security-incident workflow (IPS alert→incident→complaint w/ SLA); 2FA/MFA policy entity; IP-reputation feed table; VPN peer/user registry; IPS config persistence; 7d/30d block durations.

---

### 3.G Services, AAA & Orphans — 55/100

**tr069-acs — FULLY WIRED** — real GenieACS spawn (mongod + cwmp/nbi/fs), honest offline banner, reboot/factory/getParameter really queue tasks. `[LOW]` POST proxy passes client `resource` straight to NBI path (needs allowlist) — `route.ts:222`.

**mikrotik-manager — PARTIAL (backend daemon doesn't exist)**
- `[HIGH][WORKFLOW]` Every action proxies to `http://127.0.0.1:3021` — no mikrotik service in mini-services → all 503; entire page a facade — `route.ts:4`.
- `[HIGH][SECURITY]` Router admin passwords in plaintext localStorage — `page:152,227`.

**ssh-device-manager — PARTIAL**
- `[HIGH][DEAD UI]` All 5 built-in Quick Commands rejected by the server's own allowlist prefixes → 403 every time — `page:65-70` vs `route.ts:13-22`.
- `[HIGH][SECURITY]` Root passwords + PEM keys plaintext localStorage (page admits it) — `page:85-86,230-231,469`.
- `[MED]` Allowlist prefix-only, no metachar filter → `show x; rm -rf /` executes (`route.ts:61`); batch drops key-based auth (`:191`).

**snmp-manager — PARTIAL** — honest 503s (daemon intentionally stopped). `[MED]` Community strings in localStorage + displayed in list (`page:164-165,455`); `[MED]` No server-side poll schedule — collection dies when browser closes.

**radius-proxy — PARTIAL**
- `[HIGH][DEAD UI]` Test-connectivity calls `/api/radius-proxy/servers/[id]/test` — doesn't exist → every test fails — `page:262`.
- `[HIGH][WORKFLOW]` Realms/servers persist to Postgres only — no `proxy.conf` generation, no radius-service linkage → "proxy forwarding" never affects live RADIUS — `realms/route.ts:71`.
- `[LOW]` Shared secrets returned plaintext for edit round-trip (`:35`).

**radius-attributes — PARTIAL** — `[HIGH][WORKFLOW]` Custom attributes written to `UserRadiusAttribute` with **zero consumers** (no radcheck/radreply write, no view, no daemon) → per-subscriber attributes inert — `user-attributes/route.ts:107`.

**enterprise-auth — STUB/STATIC (backend)**
- `[HIGH][FAKE DATA]` "Sync Users from AD" fabricates 5 hardcoded users + fake sessions (Math.random IPs/MACs/bytes) + `healthStatus:"reachable"` **without contacting LDAP** — `users/route.ts:58-138` (`// Simulate LDAP user sync`).
- `[HIGH][SECURITY]` ZERO auth on the whole family (grep requireAuth = 0 hits across 6 files); `bindPassword` stored+returned plaintext — `route.ts:85`.
- `[HIGH][WORKFLOW]` LDAP "test" is a TCP socket connect reported as "LDAP connection successful" — `test-ldap/route.ts:37-56`; disconnect = DB flip, no RADIUS POD.

**wifi-offload — PARTIAL**
- `[HIGH][DEAD UI]` 7 proxy actions missing from ACTION_MAP (peer-create/update/delete, policy-create/update/delete/test, stop-simulation) → guaranteed 400 — `page:562,594,606,620,626,1507,539` vs `proxy/route.ts:7-20` — though DB-backed `case "peer"/"policy"` handlers exist (`:299,322`).
- `[HIGH][SECURITY]` No requireAuth anywhere under `/api/wifi-offload/` (10 files) — unauth session tamper (quota grants, speed changes) + open Gy/Gx/SWa proxy.

**hotspot — FULLY WIRED** — requireAuth on all 8 routes, real revenue from VERIFIED payments, audit-logged. `[MED]` Disconnect DB-only (same POD gap); `[LOW]` vouchers tab read-only.

**coa-events — PARTIAL**
- `[HIGH][WORKFLOW]` CoA events recorded-but-never-dispatched **and** nobody records them: `db.coaEvent.create` has zero producers; the real radclient sender (`mini-services/radius-service/index.ts:467-577`) has zero callers from src — `route.ts:217` → PENDING/REQUESTED unreachable; plan changes never hit NAS live.
- `[HIGH][SECURITY]` No requireAuth on GET/POST — unauth CoA history reads + status spoofing — `route.ts:5,29`.

**Orphans (reachability):** `aaa-groups/aaa-radius/aaa-sessions/aaa-users/plan-recommendation` registered in page-loaders but absent from registry + nav-config → **unreachable**. Ironically these are the most correct RADIUS CRUD in the repo (bound-param SQL, requireAuth, real radacct queries). `reseller-analytics` is NOT an orphan ("Reseller Intelligence").
- `[HIGH][WORKFLOW]` aaa-sessions "disconnect" = `UPDATE radacct SET acctstoptime` only — no POD; GUI lies — `active-sessions/route.ts:327`.
- `[MED][SECURITY]` `radius-users/route.ts:6-90` still uses quote-doubling string interpolation (pattern F-18 removed elsewhere) + `ON CONFLICT DO NOTHING` without unique index → duplicate/stale passwords.
- `[LOW]` plan-recommendation "Apply recommendations" is toast-only (`page:234-236`).

**Missing (services):** SNMP OID-template/poll-config model + scheduler; CoA outbox/dispatcher linkage; FreeRADIUS proxy.conf generation record.

---

### 3.H Partners & Settings — 62/100

**distribution-hub — FULLY WIRED** — `[MED]` Deactivated hubs can never be re-activated from UI (API accepts status; form never sends it) — `distribution-hub-page.tsx:378-379,41-45` vs `[id]/route.ts:84`. `[LOW]` Double search.

**partner — FULLY WIRED** — `[MED]` IP Pools + Portal Mappings have POST APIs with **zero UI consumers** → counts stay 0 forever — `partner-page.tsx:623-654`; `[LOW]` White-label fields (logoUrl/primaryColor/customDomain) exist in schema+API, no form inputs; no server pagination.

**partner-users — FULLY WIRED (CRUD) but the accounts are unusable**
- `[HIGH][WORKFLOW]` Partner users can **never log in**: auth queries only `db.user`, never `db.partnerUser`; no partner-portal login route — `src/lib/auth.ts:99-105`; grep partnerUser in src/lib + api/auth = 0 → bcrypt-hashed credentials for accounts that can't authenticate; RBAC layer decorative.
- `[MED]` Permissions (PartnerRolePermission) assigned via real API, enforced by nothing. `[LOW]` 6-char password minimum vs IspSettings policy 8.

**partner-reports — FULLY WIRED (read-only)** — `[MED][DATA MODEL]` No commission/payout/settlement dimension — `CommissionPayout` is agentId-based; partner revenue-share cannot be computed or settled — schema:717-723. `[LOW]` Hub report N+1.

**isp-profile — FULLY WIRED** — SENSITIVE_FIELDS masking, masked-value preservation, field whitelist, audit — the model route. Two residual leaks: PUT response returns raw unmasked row (`settings/isp-profile/route.ts:339`); audit entry stores previousValues incl. plaintext radiusSecret/smtpPass/razorpayKeySecret (`:322`).

**admin-users — FULLY WIRED** — bcrypt-12, session revocation F-19, SUPER_ADMIN-gated impersonation, CSV import/export/bulk.
- `[MED][DEAD SECURITY CONTROL]` 2FA switch flips `twoFactorEnabled`; login never verifies a TOTP code — `users-page.tsx:1005`, `lib/auth.ts:80` → security theater.
- `[LOW]` DB-backed Role/Permission tables dormant — `requirePermission` uses static `ROLE_PERMISSIONS`; `/api/roles` has zero page consumers (`api-auth.ts:144`). `[LOW]` Reset accepts 6 chars.

**areas — FULLY WIRED** — CRUD, reorder, bulk-import, per-area stats real. `[LOW]` Silent `catch { return [] }` on lookups (`:204,215`).

**equipment — FULLY WIRED** — vendors, POs, transfers, repairs, inspections, returns, stock-count — most complete page in the domain. `[LOW]` Repair/low-stock thresholds localStorage-only.

**promotions — FULLY WIRED** — no HIGH/MED findings; server validation + toggle-status sub-route real.

**notifications — PARTIAL** — `[MED][STUB]` "Templates" are localStorage-only CRUD; `/api/notifications/send` never reads them — `notifications-page.tsx:109-119`. `[LOW]` No channel-preference entity (opt-in per subscriber).

**api-keys — PARTIAL (security-broken)**
- `[HIGH][SECURITY]` Keys stored and re-served plaintext on every GET (no hash column; `data: { key, ... }`) — `api-keys/route.ts:56,24-29` → DB leak = total credential compromise.
- `[HIGH][SECURITY]` Creation unauthenticated (`optionalAuth` then proceeds); PATCH (regenerate/extend) has **no auth check at all** — `route.ts:46`, `[id]/route.ts:115-120` → anonymous key minting/rotation.
- `[MED]` No enforcement point exists for the keys anyway — nothing validates `csk_` on ingress; scopes/rate-limits stored, never applied.

**audit-log — FULLY WIRED (read) / broken guarantees (write)**
- `[HIGH][IMMUTABILITY]` Any authenticated user can bulk-delete (`delete-selected`), purge by date, or **forge arbitrary entries** via POST — gated by bare `requireAuth`, no permission check — `audit-log/route.ts:610-625,471-499` → a VIEWER can erase/fabricate the trail. (Archive/restore correctly gated by settings.update.)
- `[LOW][POSITIVE]` Read side solid: real pagination, DB-backed anomaly detection, retention + archive lifecycle tied to billing-cron job-009.

**automation-jobs — PARTIAL (sidecar dependency)**
- `[HIGH][ARCH]` Page calls `/api/jobs?XTransformPort=3004` — resolves only if the billing-cron sidecar is running; it's absent from pm2 ecosystem → bare deploys 404, page permanently empty — `automation-jobs-page.tsx:298,325,616` vs `mini-services/billing-cron/index.ts:1083-1186`.
- `[MED]` Enable/disable persists NOTHING (in-memory, documented) — page:320-322; run-now IS real.

**backup — PARTIAL (misleading DR)**
- `[HIGH][WORKFLOW]` "Backup now" copies static `db/ispplatform.dump` — nothing generates it (pg_dump never invoked; live Postgres untouched); "restore" copies the file back and deletes the backup; "verify" checks a SQLite header on a claimed pg_dump — `backup/route.ts:13,1085,1163-1170,1124-1127` → RPO story an illusion; BackupRecord claims COMPLETED restores that changed nothing.
- `[MED][STATIC]` Health tab fabricates CPU (`Math.random()*30+5`), 24h history (sin+random), hardcoded caps — `route.ts:714-746`.

**knowledge-base — PARTIAL** — `[MED][STATIC]` Analytics tab shows hardcoded defaults (1,247 views / 892 searches) from localStorage while the API tracks real views nobody reads back — `knowledge-base-page.tsx:147-157,142-144,411`.

**module-manager — FULLY WIRED** — DB-first ModuleState upserts, dependency checks, core guard, live sidebar. `[LOW]` API routes don't check module-enabled state (nav gating only).

**system-health — FULLY WIRED** — real DB latency probe, memory/uptime. `[MED][SECURITY]` `/api/metrics` (Prometheus) has zero auth — `metrics/route.ts`. `[LOW]` Orphaned `/api/system-health` twin.

**dashboard-widgets — STUB/STATIC**
- `[HIGH][DEAD UI]` "Save layout" ALWAYS toasts success while POSTing `{userId, widgets}` with no `action` → route default 400, unchecked — `dashboard-widgets-page.tsx:222-229` vs `dashboard-widgets/route.ts:269-271`; renders hardcoded DEMO_WIDGETS; parses a `data.layouts` shape GET never returns → whole page theater.
- `[MED][SECURITY]` Widgets API fully unauthenticated (0 auth refs) — anyone can mutate any user's config.

**Missing (settings/partners):** PartnerCommission/settlement invoices; PartnerUserSession (portal login) or descope; NotificationTemplate + channel prefs; ApiKey hash column + middleware; real pg_dump schedule; DB-roles wired into requirePermission or retired.

---

### 3.I Integrations + Alerts + AI — 62/100

**integrations (legacy hub) — PARTIAL**
- `[HIGH][STATIC]` Per-gateway "Transaction Log" dialog = Math.random fabrications seeded into localStorage — `integrations-page.tsx:294-321` (real ledger = IntegrationTransaction).
- `[HIGH][DEAD UI]` Log "Retry" fabricates success without network activity — `api/integrations/logs/route.ts:59-73` (`// Simulate a retry`, `statusCode: 200`, random durationMs).
- `[MED][SECURITY]` Webhook signing secret returned plaintext (no masking, eye-toggle in UI) — `integrations/route.ts:71-85`.
- `[MED]` "Connected" = config-presence, not health (`page:199-208`).

**payment-gateways — FULLY WIRED**
- `[MED][CROSS-MODULE]` Only Razorpay/Stripe move money; 7 providers (PhonePe/Paytm/Cashfree/CCAvenue/PayU/PayPal/Instamojo) have real test adapters but no execution path — `payments/payment-link/route.ts:409-410`, `payment-service.ts:293-306` → "connected" gateway can silently never be used for checkout.
- `[LOW][POSITIVE]` IP-allowlist validation + masked round-trip + audit on save.

**sms-gateway — FULLY WIRED** — real balance-check, real send via 5 real senders. `[MED][DATA MODEL]` No DLR entity/callback — "sent" = HTTP acceptance; delivery untracked end-to-end (`integrations/send/route.ts:43-63`).

**email-gateway — FULLY WIRED** — 5 real providers + nodemailer SMTP. `[LOW][SECURITY]` `/api/smtp-profiles` GET returns password plaintext (`smtp-profiles/route.ts:10-13`).

**whatsapp-push — FULLY WIRED** — Cloud API/Twilio/Gupshup/FCM/OneSignal real test+send. `[MED][CROSS-MODULE]` This page holds the platform's only REAL WhatsApp send path — yet WA Bot/churn/retention never call it (capability exists, routing doesn't).

**webhooks — FULLY WIRED** — HMAC `t=…,v1=…` signed test-fire, WebhookDelivery rows, retry_delivery, real event emitters in subscribers/complaints/payments routes. `[MED][SECURITY]` SSRF: server-side `fetch(hook.url)` with no host validation — `integrations/route.ts:362,433`, `webhook-service.ts:45`. `[MED]` No auto retry/backoff — single 15s attempt; retry manual only.

**integration-logs — FULLY WIRED** — honest read-only explorer. `[LOW]` Stats computed from latest FETCH_LIMIT rows only.

**alert-center — FULLY WIRED** — ack/resolve+note/escalate/comments all real; analytics + MTTR real. `[MED]` GET fetches all NetworkAlerts unpaged + JS dedup (`alerts/route.ts:129-167`).

**network-alerts (Live) — PARTIAL**
- `[HIGH][WORKFLOW]` "Auto"-escalation only runs while a human has the page open (useEffect) — no cron/worker calls `/api/alerts/auto-escalate` — `network-alerts-page.tsx:546-566` → a 2 AM CRITICAL alert never escalates.
- `[LOW]` Bulk-ack hardcodes `acknowledgedBy: "Bulk Acknowledge"` — `alerts/route.ts:349`.

**alert-rules — PARTIAL**
- `[HIGH][CROSS-MODULE]` `notifyChannels` stored, displayed as chips, **never dispatched** — `trigger-alert` creates the alert with zero notification calls; no consumer of notifyChannels outside CRUD — `alerts/route.ts:275,644-711`.
- `[MED]` Rule `condition` is free text — no evaluation engine parses it; alerts enter via manual test-fire only (which honestly enforces suppression → maintenance → dedup, `route.ts:654-696`).

**alert-suppressions — FULLY WIRED** — Suppression windows genuinely gate generation; maintenance windows checked; GET hides suppressed; create/lift/extend/cleanup real — best-wired page in the domain.

**alert-history — FULLY WIRED** — paginated, date-range, durations, CSV, real analytics.

**notification-rules — PARTIAL**
- `[HIGH][CROSS-MODULE]` Rules never fire on real events — `db.notificationRule` read only inside its own routes; no emitter (billing/payments/complaints/alerts) evaluates `triggerEvent` — grep → "invoice.paid → WhatsApp" routes nothing.
- `[MED][DEAD UI]` PUSH test is fake success (`details.success = true` + note, no adapter call) — `notification-rules/route.ts:102-105` (IN_APP/EMAIL/SMS tests real).

**ai-advisor — FULLY WIRED** — real KPI aggregation → ZAI server-side; honest 500s; rate-limited. `[LOW]` Conversations localStorage-only (no insight persistence).

**ai-diagnosis — FULLY WIRED** — genuine context (RADIUS sessions, UsageLog, complaints, overdue, device tree) + LLM; LLM failure falls back to **clearly-labeled** rule-based output; baselines persist.

**churn-alerts — PARTIAL** — Real 5-factor-ish scoring, batched queries, audit. `[MED]` "Marked as being retained" bookmarks localStorage-only (parallel to server ChurnTracking); `[MED]` Churn workflows save to ispSettings — nothing executes them.

**churn-prediction — FULLY WIRED (engine) with fake dispatch**
- `[HIGH][FAKE DISPATCH]` Retention SMS/EMAIL/WA recorded `SENT` with no gateway call — `churn/retention/route.ts:101-112` → customer never receives; reports show sent.
- `[MED]` DISCOUNT action stores `"PERCENTAGE: 10%"` — no ChargeOverride linkage → promised discounts never hit invoices.

**competitor-intel — STUB/STATIC**
- `[HIGH][DEAD UI]` "AI Analysis" POSTs `/api/ai` — endpoint doesn't exist → 404 every click — `competitor-intel-page.tsx:387-390`.
- `[HIGH][STATIC]` 12-month "Price Trends" = `699 + Math.round(Math.sin(i*0.5)*25)` persisted to localStorage, while real `CompetitorPriceHistory` feeds only a small dialog — `:113-135,251-266,363-365`.
- `[MED][STATIC]` Market-share subscriber counts invented from Mbps/₹ heuristic; `ourSubscribers=2500/totalMarketSize=10000` defaults — `:177-199,228-229,437-444`.

**competitor-analysis — PARTIAL**
- Three genuinely real analytics APIs (comparison/market-share/pricing-intelligence with actionable recommendations).
- `[HIGH][CRASH]` Win/Loss tab: API returns `{records, summary}`; page treats response as `WinLossRecord[]` → `.filter` on object → TypeError whenever data exists — `win-loss/route.ts:44-56` vs `competitor-analysis-page.tsx:118-120,908`.
- `[MED][DATA MODEL]` `result` hardcoded `"LOSS"` on the only write path; wins structurally impossible from UI — `win-loss/route.ts:25`.

**whatsapp-bot — STUB/STATIC (daemon context)**
- `[HIGH][FAKE DISPATCH]` Conversation send writes `status:"SENT"` Notification with no provider call + success toast; schedule "send_now" same; broadcast queues PENDING rows ("will receive shortly") with no in-repo worker — `whatsapp/conversations/route.ts:73-98`, `schedule/route.ts:97-118`, `broadcast/route.ts:40-55` → page shows live countdown for messages nothing will send.
- `[HIGH][SECURITY]` Unauthenticated plaintext WhatsApp Business token — `whatsapp/config/route.ts:7-9,30` (no requireAuth; contrast masked integrations GET).
- `[MED][STATIC]` Analytics self-derived (autoResolved = delivered/today; 1 synthetic message per notification; hardcoded 09:00-21:00 hours).

**Missing (integrations/alerts/AI):** SMS/Email DLR + provider message id; provider template registry sync; alert escalation-chain/on-call entity; webhook retry backoff fields; NotificationRule audience/targeting; AI conversation persistence; Competitor WIN write path + subscriber FK; per-provider payment execution config.

---

## 4. Security Gap Register (consolidated)

### 4.1 Unauthenticated routes (add `requireAuth` — 1-line fixes each)

| Route | Exposure | Domain |
|-------|----------|--------|
| `/api/vpp` (GET/POST/PUT/DELETE) | BNG dataplane rebuild, CoA, policy CRUD | D |
| `/api/api-keys` POST (`optionalAuth` + proceed) + `/api/api-keys/[id]` PATCH | Anonymous key minting + rotation | H |
| `/api/whatsapp/config` GET | Plaintext WhatsApp Business token | I |
| `/api/enterprise-auth/*` (6 files) | LDAP config incl. bindPassword, CRUD | G |
| `/api/wifi-offload/*` (10 files) | Session tamper, quota grants, Gy/Gx/SWa proxy | G |
| `/api/coa-events` (GET/POST) | CoA history + status spoofing | G |
| `/api/ip-mac-history` (GET/POST) | Subscriber PII + MAC mutation | E |
| `/api/time-access-policies` | Policy CRUD | F |
| `/api/dashboard-widgets` (GET/POST) | Any user's widget config | H |
| `/api/metrics` | Prometheus process/DB metrics | H |
| `/api/leads` GET + `[id]` GET (+CSV) | Sales pipeline PII, 9999-row export | C |
| `/api/reseller` GET | Bank accounts/IFSC, subscriber PII | C |
| `/api/plans/[id]` GET | Plan internals | C |
| `/api/installations/[id]` GET | Subscriber PII + technician contact | C |
| `/api/vouchers/stats` (explicit swallow) | Voucher financials | A |
| `/api/charge-override` (legacy twin, all methods) | Price-override manipulation | A |

### 4.2 Plaintext secrets in responses / storage

- Device SSH password + SNMPv3 auth/priv keys — `api/devices/[id]/route.ts:14-34` (D)
- Localhost NAS RADIUS secret plaintext — `api/nas-clients/route.ts:157` (D)
- WireGuard server PrivateKey on every config fetch — `vpn-server/route.ts:129-136` (F)
- LDAP bindPassword — `enterprise-auth/route.ts:85`, `[id]/route.ts:122,138` (G); LdapConfig in isp-profile audit previousValues (H)
- SMTP passwords — `/api/smtp-profiles` GET (I); isp-profile PUT raw response (H)
- Webhook signing secrets — `integrations/route.ts:71-85` (I)
- API keys plaintext at rest + re-served — ApiKey has no hash column (H)
- MikroTik/SSH/SNMP credentials in browser localStorage (G)
- Grafana API key plaintext in IspSettings (E)

### 4.3 Auth-swallow / fail-open pattern

`catch` blocks that continue on non-AuthError (or swallow entirely): `subscribers/online-count` (fail-open + fake zeros), `bw-reports` (GET/POST/DELETE), `grafana-dashboards` (+SSRF via user URLs), `ndpi`, `hotspot` GET, `vouchers/stats`, `diagnostic-tools` client catches. Fix: rethrow non-AuthError.

### 4.4 Injection-shaped patterns

- Raw SQL string interpolation of ids — `captive-portal/route.ts:51,54-58` (also the CAST-int bug)
- Quote-doubling interpolation — `freeradius/route.ts:295,379`, `radius-users/route.ts:6-90`, `plans/migrate/route.ts:96-130`
- SSH allowlist prefix-only (no metachar filter) — `ssh-device-manager/route.ts:61`
- Webhook URL SSRF — `integrations/route.ts:362,433`, `webhook-service.ts:45`
- TR-069 NBI resource passthrough — `tr069-acs/route.ts:222`

### 4.5 Broken security *controls*

- 2FA flag with no TOTP verification anywhere (H)
- Audit trail mutable/forgable by any authenticated user (H)
- API keys with no enforcement point (H)
- DB Role/Permission tables dormant — static ROLE_PERMISSIONS map governs (H)
- Firewall match-everything DROP via dropped match fields (F)

---

## 5. Runtime-Broken Endpoint Register (500/404/405 with data present)

| Endpoint | Bug | Evidence |
|----------|-----|----------|
| `GET /api/ipam` | include `IpAddress` vs read `sn.ipAddresses` → TypeError once ≥1 subnet | `api/ipam/route.ts:45` vs `:111` |
| `GET /api/captive-portal` | `CAST(cp."id" AS int)` on uuid String id → pg error once ≥1 portal | `api/captive-portal/route.ts:54-58` |
| `GET /api/technicians/[id]` | invalid include `installations` (+ nested areasManaged) → 500 every call | `technicians/[id]/route.ts:26-47` |
| `POST /api/complaints/[id]/auto-assign` | invalid include `assignedTo` → 500 every call (bug documented as fixed in sibling route) | `complaints/[id]/auto-assign/route.ts:25-29` |
| `POST /api/ai` (from competitor-intel) | endpoint doesn't exist → 404 every "AI Analysis" click | `competitor-intel-page.tsx:387` |
| `GET /api/aaa/auth-log/export` | route doesn't exist → 404 on export | `auth-log-page.tsx:302-304` |
| `POST /api/radius-proxy/servers/[id]/test` | route doesn't exist → every connectivity test fails | `radius-proxy-page.tsx:262` |
| `PUT/DELETE /api/pppoe/[...]` (edit/delete/disconnect) | dynamic routes don't exist; API's nested-path parser unreachable → 404 | `pppoe-server-page.tsx:435,448,472` |
| `PUT /api/add-on-services/[id]` + `GET /api/add-on-services/subscriptions` | routes don't exist → 405/404 | `add-on-services-page.tsx:121,176-179` |
| `PATCH/DELETE /api/top-ups` | no handlers → 405 | `api/top-ups/route.ts:434-440` |
| `GET/PATCH /api/automation-jobs` → `/api/jobs` (Next origin) | sidecar-only (:3004), absent from pm2 → 404 bare deploys | `automation-jobs-page.tsx:298` |
| `/api/syslog/configs*` (from nat-logs Syslog tab) | gateway-only routes hit on Next origin → 404 | `nat-logs-page.tsx:1388,1442-1481` |
| `/api/ddos/counters`, `/api/ddos/quick-rule`, `/api/security/features|logs`, `/api/ddos/monitor|nftables` | gateway routes don't exist → 404 (silently swallowed) | `ddos-protection-page.tsx:540-548,660-675`, `security-page.tsx` |
| `GET /api/grace-periods` PATCH/DELETE | no handlers → 405/404 | `api/grace-periods/route.ts:223,246` |
| Win/Loss tab | `{records,summary}` used as array → TypeError crash | `win-loss/route.ts:44-56` vs page:908 |

---

## 6. Data-Model Gap Register (missing entities/fields, by domain)

| Domain | Missing |
|--------|---------|
| Billing | Payment.idempotencyKey (unique) + gateway fee/settlement; Invoice dunning state + reminder history, placeOfSupply, round-off; InvoiceLineItem tax breakup; CreditNote number + APPLIED/VOID lifecycle; SubscriberTopUp/SubscriberAddOn → paymentId/invoiceId FK; Voucher batch + redemption linkage; TaxRate/slab model; RecurringInvoiceTemplate runner |
| Finance | TaxFilingPeriod/GstrFiling; Ledger/Journal; Expense approval fields (status/approvedBy/receipt); CommissionRule (collections→payout); ScheduledMessage dispatcher state |
| CRM | KYC/SubscriberDocument (type/expiry/verification trail); Port-In/Out; AnnouncementDelivery records; scheduled-job backing ("job-007"); provisioning per-row results; transactional reseller counters |
| Network | Onu (serial/auth-list/PON binding/last-seen); FiberRoute/cable plant + splitter cascade; DhcpV6Lease/PD runtime; OLT/ONU performance samples; device-config backup artifacts; CGNAT→dataplane binding; portal applied-version; IPAM exhaustion alert config |
| Monitoring | SpeedTestResult; NetFlow/sFlow or per-protocol writer for NdpiAppUsage; SlaBreach/MTTR persistence; IpMacHistory producer; UsageLog↔NasSession quota linkage; retention-policy config |
| Security | Geo-IP rule entity; firewall/IPS rule versioning+rollback; SecurityIncident workflow (alert→incident→complaint+SLA); 2FA/MFA policy; IP-reputation feed; VPN peer/user registry; IPS config persistence; 7d/30d IpsBlockDuration values |
| Services | SNMP OID-template/poll-config + scheduler; CoA outbox/dispatcher linkage; FreeRADIUS proxy.conf generation record |
| Partners/Settings | PartnerCommission + settlement invoices; PartnerUserSession (portal login); NotificationTemplate + channel preferences; ApiKey hash column; real backup schedule; DB Role/Permission wiring |
| Integrations/AI | SMS/Email DLR + provider message id; provider template registry sync; alert escalation-chain/on-call rota; webhook retry-backoff fields; NotificationRule audience; AI conversation/insight persistence; Competitor WIN path + subscriberId FK; non-Razorpay/Stripe execution config |

---

## 7. Prioritized Remediation Backlog

### P0 — Security & outage-class (do first; mostly small diffs)
1. **Add `requireAuth` to the 16 unauth route families** (§4.1) — ~1 day mechanical work; biggest risk-reduction per hour in the repo. Rework the auth-swallow pattern (rethrow non-AuthError) in the 7 surfaces listed in §4.3.
2. **Fix the firewall create path** — require `matchCriteria` server-side (reject empty), add IP/CIDR/port validation, never auto-apply on create without explicit apply — §3.F firewall.
3. **API keys**: hash at rest (store sha256, return once), require `requireAuth` + admin permission on create/PATCH, then build the enforcement middleware or mark keys non-functional in UI — §3.H.
4. **Audit-log immutability**: remove delete/purge/forge for non-admins (gate by `settings.update` or dedicated `audit.manage` permission; POST ingest only from server) — §3.H.
5. **PII strip**: Aadhaar/PAN from 360 response; SSH/SNMP/LDAP/SMTP/webhook secrets masked everywhere (follow isp-profile SENSITIVE_FIELDS pattern); remove WhatsApp token from unauth GET — §4.2.
6. **Runtime-500 fixes** (§5): ipam include rename, captive-portal CAST removal (use Prisma count instead of raw SQL), technicians/[id] + complaints auto-assign include corrections, competitor win-loss envelope, missing sub-routes (auth-log/export, radius-proxy test, pppoe dynamic routes or body-id convention).
7. **Negative payments**: validate `amount > 0` + enum-validate paymentMode/discountType server-side; fix `"none"`/`"__none__"` enum garbage; make pro-rata parse boolean properly — §3.A.

### P1 — Revenue integrity & dead workflows (the no-leak program)
1. **Ledger wiring**: top-up purchases → create Payment/Invoice (or bill-at-next-cycle) with FKs; add-on subscriptions → billing hooks (one-time + PER_MONTH); voucher redemption endpoint + accounting; charge-override consulted by all 3 invoice-generation paths; delete the unauth legacy override API.
2. **Invoice lifecycle**: overdue sweep must exclude CANCELLED/CREDIT_NOTE; manual invoices get correct balanceAmount; discount-before-tax; refund single-effect (wallet XOR invoice re-open, per mode); idempotency-key on payment capture; auto-unblock subscriber on settle (CoA/RADIUS reactivation hook).
3. **Real dispatch for the last mile**: WhatsApp/retention/scheduled reminders route through the existing real adapters (whatsapp-push page proves the senders work); wire `ScheduledMessage` dispatcher into billing-cron; Announcement channels fan-out; AlertRule.notifyChannels + NotificationRule emitters; auto-escalation into cron; replace fabricated "Retry successful" with real re-execution.
4. **CoA pipeline**: plan-change/complaint-suspend/kill → `mini-services/radius-service` radclient CoA/POD (the sender exists, has zero callers); make CoaEvent an outbox with producer+worker.
5. **Lead→subscriber + installation→activation cascades**: convert creates Subscriber (+plan/installation hand-off), installation COMPLETED triggers activation + first invoice; batch-provisioning writes real per-row results or is labeled non-operational.
6. **Un-fake the dashboards**: latency-monitor/qos-monitor/enterprise-auth/due-recovery agent metric/zone-budgets/action-history/grace-periods/KP analytics/backup health → honest empty states (the repo's own bw-reports/ipam-cgnat "honest zero" pattern is the house style to copy).

### P2 — Contract reconciliation & polish
1. **Envelope unification** for the 19 mismatched surfaces (§1.2-1): standardize `{success, data}` + field names; prefer fixing the page side (backend envelopes are consistent); add a shared typed `apiFetch` response parser.
2. **Enforcement glue**: CGNAT → nft map generation in gateway-service; captive-portal Apply button calling the existing gateway endpoint; DHCPv6 → gateway handlers or descope to "config generator" label; MultiWAN FailoverRule read by monitor; policy-compiler called from plan/subscriber change paths; radius attributes → radcheck/radreply sync; RADIUS proxy.conf generation.
3. **Schema additions** (§6) in dependency order: DLR, Onu, SpeedTestResult, KYC documents, Expense approvals, TaxFilingPeriod, partner commissions.
4. **Retention jobs** in billing-cron: syslog, nat-logs (legal 90d), bandwidth logs, uptime checks, radpostauth pruning; move uptime scheduler out of the Next process.
5. **Validation pass**: zod on POST bodies across finance/billing/security; pagination on leads/partners/alerts/audit; unbounded-query fixes (uptime incidents, voucher stats, expiry watchlist).
6. **Orphan decision**: wire the 4 AAA pages into nav (they're the best RADIUS CRUD in the repo) or merge into existing pages; delete dead code (bw-reports demo generators, `/api/bandwidth-mgmt` orphan route, `extended-pages.tsx` AAA map).
7. **Zombie-fake removal**: batch-provisioning simulation, integrations mock txn logs, KB localStorage analytics, dashboard-widgets theater, zone-budgets demo — replace with real reads (APIs mostly exist).

### Effort estimates (single-dev, focused)
- P0: 2–3 days · P1: 8–12 days · P2: 10–15 days.
- Quick wins with disproportionate impact: §P0.1 (auth sweep, ~1 day), §P0.6 (runtime-500s, ~half day), §P1.1 first two items (top-ups/add-ons invoicing, ~1 day), §P1.3 WA dispatch rerouting (~1 day, senders already built).

---

## 8. What Is Genuinely Good (audit balance)

For an honest audit, the strengths matter — they define the house patterns to replicate:

- **Payments module** (A): status-transition matrix, duplicate-UTR guard, maker-checker verification, receipts with collector attribution, leak radar, audit logging — production-grade.
- **Collection/due-recovery** (B): per-action RBAC, payment plans + installments, SLA pause/resume, real legal-notice generation, real CSV streaming.
- **GST engine** (B): GSTR-1/3B/9, HSN, TDS from real invoice aggregates.
- **isp-profile settings route** (H): SENSITIVE_FIELDS masking + audit — the model for every other settings route.
- **Alert suppressions** (I): suppression windows, maintenance windows, dedup — genuinely enforced.
- **Webhooks** (I): HMAC-signed deliveries, history, real emitters.
- **Provider adapters** (I): 24 test adapters + 17 real senders, masked round-trips.
- **Interfaces/DHCP/DNS/dynamic-routing** (D): real OS actions (`ip`, KEA, dnsmasq, vtysh) with injection-safe argv execution.
- **TR-069 ACS** (G): real GenieACS lifecycle. **Equipment** (H): full depot cycle. **Selfcare** (C): fully wired portal.
- **Data honesty where done right**: bw-reports, uptime-monitor, ai-diagnosis return honest zeros/labeled fallbacks — this is the standard the 13 fabricating surfaces should adopt.

---

## 9. Audit Provenance

- Agents: AUDIT-A…AUDIT-I (9 parallel Explore agents), full per-page work logs appended to `worklog.md` under those Task IDs.
- Coverage: 9/9 nav domains, 95+ pages, every fetch URL traced, money/security routes read, enforcement paths traced into mini-services.
- Known blind spots: browser-level E2E not performed (static analysis only); runtime behavior of the 6 intentionally-stopped daemons assumed per sandbox doctrine; performance/load not audited beyond noted unbounded queries.

*End of report.*
