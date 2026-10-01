# CAPTIVE-PORTAL-COPY — Main Agent Worklog

## Task
Copy StaySuite captive portal engine to CRYPTSK Nexus platform.

## Step 1 — DB Schema (DONE)
- Read existing CRYPTSK `prisma/schema.prisma` (100+ models).
- StaySuite uses `Property`/`propertyId`/`Tenant`/`tenantId`; CRYPTSK has `Partner` model + `CollectionAgent`. CRYPTSK is single-tenant.
- **Mapping decisions:**
  - `propertyId` → `partnerId` (string, optional, no FK — keeps things simple)
  - `tenantId` + `Tenant` relations — **removed** everywhere
  - Existing CRYPTSK `CaptivePortal` model **extended** with StaySuite fields: `listenIp`, `listenPort`, `useSsl`, `sslCertPath`, `sslKeyPath`, `isDefault`, `autoAuthEnabled`, `maxConcurrent`, `sessionTimeout`, `idleTimeout`, `failMessage`, `slug` (unique), `roamingMode`, `allowsRoamingFrom`, `authMethod`, `maxBandwidthDown`, `maxBandwidthUp`, `bandwidthPolicy`, `nasIdentifier`, `ssidList`, `captchaEnabled`, `captchaSiteKey`, `captchaSecretKey`
  - Added new relations on CaptivePortal: `PortalAuthentication[]`, `PortalMapping[]`, `PortalMappingFallback[]`, `PortalPage[]`, `PortalABTest[]`, `PortalDnsRecord[]`
- **Model renames to avoid CRYPTSK conflicts:**
  - StaySuite `PortalTemplate` (model) → `PortalDesignTemplate` (CRYPTSK already has `PortalTemplate` ENUM)
  - StaySuite `DnsZone` → `PortalDnsZone` (CRYPTSK has unrelated DnsRecord)
  - StaySuite `DnsRecord` → `PortalDnsRecord`
  - StaySuite `DnsRedirectRule` → `PortalDnsRedirect`
- **New models added:** `PortalAuthentication`, `PortalMapping` (with `fallbackPortalId` self-relation `PortalMappingFallback`), `PortalPage`, `PortalDesignHistory`, `PortalDesignTemplate`, `PortalWhitelist`, `PortalABTest`, `PortalAdCampaign`, `WiFiSession`, `WiFiVoucher`, `PortalDnsZone`, `PortalDnsRecord`, `PortalDnsRedirect`, `PortalWalledGarden`
- DB pushed via `bun run db:push` — **SUCCESS**. Prisma client regenerated.

## Step 2 — Captive-Redirect Mini-Service (DONE)
- Copied `mini-services/captive-redirect/index.ts` (1305 lines) + `mini-services/shared/logger.ts`
- Renamed SQL table `"DnsRedirectRule"` → `"PortalDnsRedirect"` (line 174)
- Renamed package to `cryptsk-captive-redirect`
- WISPr location name → "CRYPTSK Hotspot"
- DB URL via env (uses `process.env.DATABASE_URL`, so no hardcode)
- Added to `ecosystem.config.cjs` as PM2 service #14 on port 8888 (HTTPS 8443). DB URL = `postgresql://cryptsknexus:nexus_pg_2026@127.0.0.1:5432/cryptsknexus`
- Bun build check: passes (193KB bundle)

## Step 3 — API Routes (TODO)
- Need to copy 20+ route files from StaySuite to CRYPTSK `/api/wifi/portal/` etc.
- Apply sed transforms: `db.portalTemplate` → `db.portalDesignTemplate`; `db.dnsZone` → `db.portalDnsZone`; `db.dnsRecord` (only in dns-records route) → `db.portalDnsRecord`; `db.dnsRedirectRule` → `db.portalDnsRedirect`; `db.property` → `db.partner`; `propertyId` → `partnerId`; strip `tenantId` from queries.

## Step 4 — UI Components (TODO)
- Replace `src/components/pages/captive-portal-page.tsx` (1555 lines) with StaySuite `portal-page.tsx` (7288 lines)
- Create `src/components/wifi/portal/` sub-components
- Adapt imports: `@/lib/utils/format` → `@/lib/format-utils`; `@/lib/utils` is fine
- Replace property selectors → hardcoded "default" partner

## Step 5 — Splash Page /connect (TODO)
- Copy `src/app/connect/` directory

## Step 6 — Nav wiring (DONE — already exists)
- CRYPTSK `src/lib/nav-config.ts` line 135 already has `{ label: "Captive Portal", href: "/captive-portal", icon: Lock }` under NETWORK group
- Page loader at `src/lib/page-loaders.ts` line 36: `'Captive Portal': () => import('@/components/pages/captive-portal-page')`
- Page import at `src/components/extended-pages.tsx` line 14: `import CaptivePortalPage from '@/components/pages/captive-portal-page';`
- No nav edits needed — replacing the page file will auto-propagate.

## Notes / Gotchas
- DB was initially unreachable; had to initialize StaySuite-bundled PostgreSQL 17 (`/tmp/StaySuite-HospitalityOS/pgsql-runtime/`) and create DB `cryptsknexus` owned by user `cryptsknexus`. Started on port 5432.
- CRYPTSK `CaptivePortal.partnerId` field is a String? that originally FK'd to `CollectionAgent` (not Partner). Left untouched to avoid breaking existing CRYPTSK code. StaySuite UI treats `partnerId` as just a string identifier — runtime default "default" works.
