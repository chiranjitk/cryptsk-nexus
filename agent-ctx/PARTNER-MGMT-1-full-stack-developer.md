# PARTNER-MGMT-1 — full-stack-developer — Partner Management Module

Task: Build Partner Management module — 12 API routes + 4 UI pages + nav registration + seed data.

## Files created (16 new + 3 edited)

### API Routes (12 files)
1. `src/app/api/distribution-hubs/route.ts` — GET (list w/ partner count) + POST (create)
2. `src/app/api/distribution-hubs/[id]/route.ts` — GET (single w/ partners) + PUT + DELETE (soft → INACTIVE)
3. `src/app/api/partners/route.ts` — GET (filter by hub/status/search) + POST (under a hub)
4. `src/app/api/partners/[id]/route.ts` — GET (w/ IP pools, portal mappings, counts) + PUT + DELETE (soft)
5. `src/app/api/partner-users/route.ts` — GET (filter by partnerId/role) + POST (bcryptjs hash, role, partnerId)
6. `src/app/api/partner-users/[id]/route.ts` — GET (w/ permissions) + PUT (name/phone/role/status/password?) + DELETE
7. `src/app/api/partner-permissions/route.ts` — GET (grouped by category) + POST (key/description/category)
8. `src/app/api/partner-users/[id]/permissions/route.ts` — GET (assigned list) + POST (assign partnerPermissionId) + DELETE (revoke by query)
9. `src/app/api/partner-reports/[id]/route.ts` — GET partner stats: subscriber counts by status, billing summary (revenue/outstanding/collected this month), session stats (active sessions via radacct raw SQL with username = ANY array), IP pool utilization, recent 5 subscribers
10. `src/app/api/distribution-hub-reports/[id]/route.ts` — GET consolidated per-partner breakdown + totals
11. `src/app/api/partner-ip-pools/route.ts` — GET (filter by partnerId) + POST (partnerId/poolType/startIp/endIp/subnetId?/description)
12. `src/app/api/partner-portal-mappings/route.ts` — GET (filter by partnerId) + POST (partnerId/captivePortalId?/portalTemplate)

### UI Pages (4 files, all `'use client'`)
1. `src/components/pages/distribution-hub-page.tsx` — Stat cards (total/active hubs/total partners), search, table with partner count per hub, create/edit Dialog (name/code/description), AlertDialog deactivate confirmation. TanStack Query + sonner.
2. `src/components/pages/partner-page.tsx` — Filter by hub + status + search, table with sub/user/IP-pool counts per partner, create/edit Dialog with full contact fields, partner-detail Dialog (counts + IP pools + portal mappings), AlertDialog deactivate.
3. `src/components/pages/partner-users-page.tsx` — Filter by partner + role + search, table with role badge/status badge/permission count, create Dialog (email/password/name/phone/partner/role), edit (password optional), permissions-management Dialog (grouped checkboxes with assign/revoke on toggle).
4. `src/components/pages/partner-reports-page.tsx` — Two-tab layout: Per Partner (with inner Tabs: Subscribers / Billing / Sessions / IP Pools) + Per Hub (totals + per-partner breakdown table). Stat cards + recent subscribers table + IP pool table.

### Edited files (3)
1. `src/lib/nav-config.ts` — Added "PARTNER MANAGEMENT" group (before SETTINGS) with 4 items using already-imported Building2 / Handshake / UserCircle / BarChart3 icons. `defaultOpen: true`.
2. `src/lib/page-loaders.ts` — Added 4 lazy page imports in a new "PARTNER MANAGEMENT" section.
3. `prisma/seed.ts` — Added step 7b after invoices:
   - 1 Distribution Hub: "Kolkata Central" (KOL-CENTRAL)
   - 2 Partners: "ABC Cable" (ABC-CBL), "XYZ Network" (XYZ-NET)
   - 2 Partner Users: admin@abccable.com / Partner@2026 (PARTNER_ADMIN), billing@xyznet.com / Billing@2026 (BILLING_USER) — passwords hashed with bcryptjs @ 12 rounds
   - 10 Partner Permissions: subscriber.{view,create,update,suspend}, billing.{view,invoice,payment}, session.{view,disconnect}, report.view — `isSystem: true`
   - Idempotent: skipped if any distribution hub already exists

## Pattern conformance

- All API routes wrap in `try { requireAuth(request); ... } catch (error) { if (error instanceof AuthError) {...}; logger.error(...); return 500 }`.
- `auditCreate` / `auditUpdate` / `auditDelete` from `@/lib/services/audit-service` on every mutation, with `{ userId }` override.
- `logger.error` from `@/lib/logger` for error logging.
- `NextResponse.json({ ... }, { status: ... })` for all responses.
- DELETE on hubs and partners is soft (`status: "INACTIVE"`); DELETE on partner users and partner-role-permissions is hard (per task wording).
- Dynamic `[id]` routes use `params: Promise<{ id: string }>` + `await params` (Next.js 16 convention).

## Deviations from spec

- Task said use `bcrypt` for PartnerUser password hashing. Project has only `bcryptjs` installed (same API, pure JS, no native binding). Used `bcryptjs` `hash(password, 12)` to match existing pattern (reseller/admin uses bcryptjs too). Documented in code comments.
- Task said "DELETE: revoke permission from partner user (partnerPermissionId in query)" — implemented as `DELETE /api/partner-users/[id]/permissions?partnerPermissionId=...`. Returns 404 if assignment not found.
- For `partner-reports/[id]` active-session count: subscriber's `serviceUsername` is matched against `radacct.username` (no FK available — `radacct.subscriber_id` is often NULL). Uses raw SQL `WHERE acctstoptime IS NULL AND username = ANY($1::text[])` parameterized to avoid injection.

## Verification

- `bun run lint` → 0 errors (4 pre-existing warnings in unrelated files: backup/route.ts, ssh-device-manager/route.ts, reports-page.tsx, session-history-page.tsx).
- `bunx tsc --noEmit` → 0 errors in partner-related files (had to extend the `Partner` interface in partner-page.tsx with optional `ipPools?` and `portalMappings?` fields to satisfy the detail-Dialog type checks; done).
- No dev.log file present yet (dev server not currently running) — could not smoke-test endpoints. Routes are syntactically valid; will be exercised when next.js dev server starts up.
- `bun run db:push` was NOT run (only seed was edited — schema already contains the 7 partner models per task description). If orchestrator runs `bun run db:seed`, the new step 7b will execute.

## Files NOT modified (per task constraints)

- All existing source files except nav-config.ts, page-loaders.ts, seed.ts.
- No git commits, no deployments.
- No mini-services created (all routes are Next.js API routes — no websocket needed).

## Notes for integrator / orchestrator

- The 7 partner models (DistributionHub, Partner, PartnerUser, PartnerPermission, PartnerRolePermission, PartnerIpPool, PartnerPortalMapping) are already in `prisma/schema.prisma` (lines 3472-3595) per task description. Schema was not modified.
- The `Subscriber` model already has a `partnerId` relation (line 3854). The partner-reports endpoint joins on this.
- `PartnerPortalMapping.captivePortalId` FK → `CaptivePortal.id` (SetNull) — verified in schema line 3592.
- `PartnerIpPool.subnetId` is `String?` with no FK constraint (just a string) — the API still validates existence via `db.subnet.findUnique` if provided.
- The seed script step 7b is idempotent on `prisma.distributionHub.count() === 0`; existing seeded databases will skip.
- For end-user testing: login as admin@cryptsk.com / Admin@2026, navigate to PARTNER MANAGEMENT group in the sidebar.
