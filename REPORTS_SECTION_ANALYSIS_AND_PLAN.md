# Reports Section — Analysis & Build Plan
**CryptSK Nexus ISP Platform** · Task IDs RPT-A/B/C · 2026-10-02
Status: **PLAN APPROVED-FOR-BUILD** (Phase 1 starts on coordinator go)

---

## 1. ANALYSIS — what exists today (evidence-based)

### 1.1 Report-like surfaces already in the UI (17 pages + widgets)

| Surface | File | Shows | Export today | Maturity |
|---|---|---|---|---|
| Reports (9-tab hub) | `pages/reports-page.tsx` (1506L) | Financial, Subscriber, Usage, Revenue, Network, Health, RADIUS/Accounting, Ops + **Custom builder** | per-tab client CSV | REAL |
| Revenue Reports | `pages/revenue-reports-page.tsx` (1095L) | Revenue summary/compare, TDS/TCS, KPI targets, expenses | print window | REAL |
| Partner Reports | `pages/partner-reports-page.tsx` (601L) | Partner + distribution-hub consolidated stats | ❌ none | REAL |
| BW Reports | `pages/bw-reports-page.tsx` (1824L) | Bandwidth timeseries/pools/top users | ❌ (dead icon) | PARTIAL (leftover Math.random generators) |
| Data Export | `pages/data-export-page.tsx` (692L) | Filtered bulk CSV: subs/invoices/payments/complaints | server CSV | REAL |
| Revenue Leakage | `pages/revenue-leakage-page.tsx` (1066L) | Expired vouchers, underpaid/high-discount invoices | ❌ | REAL |
| Revenue Forecast | `pages/revenue-forecast-page.tsx` (844L) | Forecast + cashflow | ❌ | REAL (derived) |
| GST & Tax | `pages/gst-tax-page.tsx` (655L) | GSTR-1/3B, HSN, TDS/TCS, reverse-charge | client CSV | REAL |
| Reseller Analytics | `pages/reseller-analytics-page.tsx` (1257L) | Performance, commissions, credit | ❌ | REAL |
| Churn Prediction | `pages/churn-prediction-page.tsx` (943L) | Churn-risk list + retention | client CSV | REAL |
| Competitor Analysis | `pages/competitor-analysis-page.tsx` (1105L) | Market share, pricing, win/loss | ❌ | REAL |
| Technician Performance | `pages/technician-performance-page.tsx` (1112L) | Leaderboard, dispatch, SLA | ❌ | REAL |
| Compliance & SLA | `pages/compliance-sla-page.tsx` (1350L) | SLA + regulatory + audit report | JSON only | REAL |
| Collection | `pages/collection-page.tsx` (837L) | Summary/targets/reconcile/refunds | receipt print | REAL |
| Smart Collections | `pages/smart-collections-page.tsx` (1244L) | Runs + analytics + schedule | ❌ | REAL |
| Due Recovery | `pages/due-recovery-page.tsx` (2602L) | Payment plans, escalations, legal, SLA | client CSV | REAL |
| Audit Log | `pages/audit-log-page.tsx` (3135L) | Audit trail + stats | ❌ | REAL |

Plus: dashboard **Download Report** (CSV) + **Advanced Insights** (16 lazy widgets: InvoiceAging, ChurnRisk, PaymentAnalytics, SubscriberLifecycle, RevenueForecast, CollectionPerformance…), payments-page **Aging tab**, subscriber-360 billing/activity tabs, invoices/billing CSV exports.

### 1.2 Backend report APIs
- `/api/reports` (1280L route; 8 tabs) + `/api/reports/{custom,revenue,tds-tcs,kpi-targets,expenses}` — all Prisma-real
- `/api/dashboard/*` — 17 analytics subroutes (stats, growth, churn, aging, lifecycle, payment-analytics, plan-comparison, area-distribution…)
- `/api/export/{subscribers,invoices,payments,complaints}` — the only 4 routes using shared `csvResponse`
- **20+ hand-rolled CSV routes** (payments/invoices/billing/complaints/devices/technicians/agents/users/alerts/incidents/sessions/radius-users/hotspot/bandwidth/ipam/multiwan/ftth-olts/equipment-PO/leads/audit-log…) — duplicate logic, most miss UTF-8 BOM, only 2/24 call `auditExport`
- Orphans: `/api/revenue/aging-enhanced` (274L) consumed by **nothing**
- **Zero server-side PDF. Zero real XLSX.** All "PDF" = `window.print()` of inline HTML (7 pages)

### 1.3 Export infrastructure (RPT-B)
- `xlsx@0.18.5` **installed but 100% unused** → free to adopt server-side
- No jspdf/pdfmake/exceljs/file-saver/papaparse anywhere
- Shared `src/lib/export-utils.ts` (escapeCsvValue, buildCsvString, csvResponse+BOM+Content-Disposition, fmtINR/fmtDate) — used by only 5 consumers; 25 pages copy-paste their own blob CSV builder
- `export-manager.tsx` client registry: **4 of 12 targets broken** (`/api/reports?export=csv` no handler, `/api/audit-log?export=csv` wrong param, `/api/collection/export` 404, `/api/plans` raw JSON)
- All exports build full in-memory strings — OOM risk on big tables (sessions/audit/bandwidth)

### 1.4 Menu mechanics (RPT-C) — the 4-touchpoint checklist for any new page
1. `src/lib/nav-config.ts` — NavGroup `{id,label,items[]}` + NavItem `{label,href,icon}`; sections ordered by array position
2. `src/lib/page-loaders.ts` — `PAGE_LOADERS['<ExactLabel>'] = () => import(...)` keyed by **exact nav label**
3. `src/lib/modules/registry.ts` — `{label, section:"REPORTS"}` in a `MODULES[].pages` entry, else `isPageEnabled` hides it from BOTH sidebars
4. Optional: `PAGE_SHORTCUT_MAP` / `SIDEBAR_SHORTCUT_MAP` in keyboard-shortcuts-help.tsx (manual numbering)

**Hard constraints:** hash deep-links are **single-level only** (client-app.tsx:92 whole-string lookup) → no `#/reports/invoices`; label collisions break the hash index (first-wins) → new pages need distinct labels; `globals.css` is a frozen artifact → new utility classes must be hand-appended.

### 1.5 Data model readiness (schema.prisma, 5933L)
- **Ready:** Invoice(+LineItem, 7 statuses incl CANCELLED/CREDIT_NOTE), Payment(+Refund+CreditNote+TdsEntry), Subscriber(5 statuses, activationDate, KYC fields), Plan, NasSession(radacct-like: octets BigInt, terminateCause), radacct, SessionEvent, DataUsage(daily unique sub+date), UserBillingCycle, TopUpProduct/SubscriberTopUp, Voucher(+Template), AddOnService/SubscriberAddOn, Complaint(SLA fields, rating), Installation, Technician, Reseller(+CommissionPayout), Equipment/Warehouse/StockAdjustment/StockTransfer, AuditLog, UserSession(login history)
- **Gaps (design around, don't block):** no SubscriberLifecycleLog (derive from AuditLog entity="Subscriber" + SessionEvent + status+activationDate); no gateway↔Payment reconciliation entity; no TaxReport rollup (compute from Invoice tax fields); **side revenue (top-ups/vouchers/add-ons) has no ledger link** → union-of-sources in report SQL (aligns with audit finding "revenue leak")

---

## 2. GAP ANALYSIS vs standard ISP MIS suite

| Standard ISP report | Status today |
|---|---|
| Invoice Register (all invoices, filters) | ❌ missing (only invoices-page list + export-all) |
| **AR Aging** (0-30/31-60/61-90/90+ buckets, per subscriber + summary) | ⚠️ widget + payments tab only; orphan API exists unused |
| **Subscriber Statement of Account** (per-sub ledger: invoices+payments+topups+addons, running balance) | ❌ missing (360 view is closest but not statement-grade) |
| **Subscriber Lifecycle** (activations/renewals/suspensions/disconnections/churn per period, plan/area-wise) | ⚠️ dashboard widget only; no dedicated report |
| Collection Register / Daily Cash Book (by mode/collector) | ⚠️ collection summary only |
| Expiry & Renewal (expiring 7/15/30d, expired, renewal conversion %) | ⚠️ expiring widget only |
| Side Revenue Report (top-ups+vouchers+add-ons) | ❌ missing (leakage page detects loss but no revenue register) |
| Plan-wise / Area-wise MIS (subs, revenue, ARPU, growth) | ⚠️ scattered widgets |
| Session & Usage MIS (top consumers, per-plan usage) | ⚠️ bw-reports PARTIAL (mock leftovers) |
| Complaint/SLA MIS consolidated register | ⚠️ split across 2 pages |
| Scheduled/emailed reports | ❌ none |
| True PDF / XLSX export | ❌ none |

---

## 3. TARGET ARCHITECTURE

### 3.1 Information architecture
New top-level sidebar section **REPORTS** (placed right after DASHBOARD for prominence). Flat items only (single-level slug constraint):

**Re-homed (existing pages, labels unchanged → zero hash/loader breakage):**
Reports Hub, Revenue Reports, GST & Tax, Partner Reports, BW Reports, Data Export, Revenue Leakage, Revenue Forecast, Churn Prediction, Competitor Analysis, Technician Performance, Compliance & SLA, Collection, Smart Collections, Due Recovery, Audit Log, Reseller Analytics

**New pages (Phase 1 → 2):**
| # | Page label (distinct!) | slug | API | Phase |
|---|---|---|---|---|
| 1 | Invoice Register | `/invoice-register` | `/api/reports/invoice-register` | 1 |
| 2 | AR Aging | `/ar-aging` | `/api/reports/ar-aging` (adopts orphan aging-enhanced logic) | 1 |
| 3 | Subscriber Lifecycle Report | `/subscriber-lifecycle-report` | `/api/reports/lifecycle` | 1 |
| 4 | Statement of Account | `/statement-of-account` | `/api/reports/statement` | 2 |
| 5 | Collection Register | `/collection-register` | `/api/reports/collection-register` | 2 |
| 6 | Expiry & Renewal Report | `/expiry-renewal-report` | `/api/reports/expiry` | 2 |
| 7 | Side Revenue Report | `/side-revenue-report` | `/api/reports/side-revenue` | 2 |
| 8 | Plan & Area MIS | `/plan-area-mis` | `/api/reports/plan-area` | 2 |
| 9 | Session & Usage MIS | `/session-usage-mis` | fold into bw-reports cleanup | 2 |

### 3.2 Unified export layer (the "everything exportable" answer)
**Client** — new `src/lib/report-export.ts` (single source, kills the 25× copy-paste):
- `downloadCsv(filename, headers, rows)` — reuses isomorphic `buildCsvString` from `export-utils.ts` (BOM-safe)
- `printReport({title, subtitle, meta, columns, rows, totals})` — opens a styled A4 print window (company header, period, generated-at, page footer, zebra rows) → **PDF via browser "Save as PDF"** — zero new deps, OOM-safe
- `downloadJson(filename, data)`

**Server** — every NEW `/api/reports/*` route:
- `requireAuth` + `auditExport(actor, entity, format, count)` on ALL exports (fixes the 2/24 compliance gap)
- `?format=csv` support via shared `csvResponse` (BOM + Content-Disposition)
- Row caps + pagination guards (OOM discipline)
- Phase 2: server-side XLSX via the already-installed dead `xlsx` dep for the 3 heaviest registers; Phase 3 (stretch): server PDF (pdfmake) evaluation — print-to-PDF remains the default path
- Fix `export-manager.tsx` 4 broken targets → point at unified catalog

### 3.3 Data/logic rules (from audit findings — non-negotiable)
- CANCELLED invoices excluded from all revenue/aging totals
- Side revenue = union-of-sources (SubscriberTopUp + Voucher.usedAt + SubscriberAddOn) until ledger wiring (P1) lands
- Lifecycle derivations: AuditLog(entity="Subscriber") + SessionEvent + status/activationDate — no schema change in Phase 1
- BigInt octets → Number() at API edge
- All money via `fmtINR`, dates via `fmtDate` (single formatting truth)

---

## 4. BUILD PHASES

### Phase 1 — Foundation + 3 flagship reports (this wave)
1. `src/lib/report-export.ts` unified client export helpers
2. Nav: add REPORTS section to `nav-config.ts` (re-home 17 pages + 3 new items)
3. Registry + loaders for 3 new pages (4-touchpoint checklist)
4. APIs: `/api/reports/invoice-register`, `/api/reports/ar-aging`, `/api/reports/lifecycle` (all requireAuth + auditExport + ?format=csv)
5. Pages: Invoice Register, AR Aging, Subscriber Lifecycle Report (filters, KPI header, table, CSV + print-PDF buttons)
6. globals.css hand-append of any new utility classes; agent-browser verification; commit+push

### Phase 2 — Complete the MIS suite
Statement of Account, Collection Register, Expiry & Renewal, Side Revenue, Plan & Area MIS + their APIs; XLSX server export (xlsx dep); export-manager catalog fix; bw-reports mock-purge

### Phase 3 — Stretch
Scheduled reports (billing-cron job → stored snapshots), server PDF evaluation, drill-down cross-links (report row → subscriber 360)

**Effort:** Phase 1 ≈ 1 session · Phase 2 ≈ 2 sessions · Phase 3 = stretch goals.
