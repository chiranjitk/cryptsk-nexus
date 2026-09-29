# T1-d — full-stack-developer

**Task:** Firewall/WAN/VPN/DHCP-reservations APIs + complete network panel tabs (Cryptsk Nexus)

## What was done

1. **Context loaded**: worklog tail, `prisma/schema.prisma` (exact Phase 8 fields), `src/lib/rbac.ts` + `src/lib/audit.ts`, style reference `src/app/api/customers/route.ts` + `users/[id]/route.ts`, full `network-panel.tsx`.

2. **API routes created (9 files)** — all match customers-route style (`requirePermission` + `err instanceof Response` catch + audit):
   - `src/app/api/firewall/rules/route.ts` — GET (priority asc; `?action ?enabled ?search`) / POST (enum-validated action/direction, protocol whitelist, unique ruleName).
   - `src/app/api/firewall/rules/[id]/route.ts` — PATCH (fields + isActive; `auditConfigChange`) / DELETE (`auditDelete`).
   - `src/app/api/wan/links/route.ts` + `[id]/route.ts` — CRUD; status validated vs `WanLinkStatus`; BigInt counters → Number.
   - `src/app/api/vpn/tunnels/route.ts` + `[id]/route.ts` — CRUD; **list/PATCH never return `psk`** (return `hasPsk`); single GET returns psk only with `network.device.manage`; type whitelist ipsec/wireguard/openvpn.
   - `src/app/api/dhcp/reservations/route.ts` + `[id]/route.ts` — GET (`?subnetId`, includes subnet) / POST (MAC regex `^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$`, normalized uppercase-colon; global mac+ip uniqueness per schema `@unique`) / PATCH (isActive toggle) / DELETE.
   - `src/app/api/dns/records/[id]/route.ts` — DELETE (perm `dns.delete`).
   - Permission mapping: firewall/wan/vpn → `network.device`; dhcp → `dhcp`; dns → `dns`.

3. **`src/components/admin/network-panel.tsx` rewritten** (existing structure/tone kept, `PlaceholderTab` removed):
   - Firewall: stat chips (total/enabled/per-action from fetched list), search + action filter via API params, color-coded action badges (accept=emerald, drop=red, reject=orange, masquerade=violet, redirect=amber, log=slate), enabled Switch → PATCH, delete w/ AlertDialog, New Rule dialog w/ validation.
   - Multi-WAN: count pills (All/Up/Down/Degraded/Backup), table w/ status badges (up=green/down=red/degraded=amber/backup=slate), isPrimary Switch, Add Link dialog.
   - VPN: status count pills, type badges, PSK masked `••••••` + copy button (single GET → clipboard → toast), enabled Switch, create dialog with ipsec-only IKE/enc/hash/DH fields.
   - NEW DHCP Reservations tab (Pin icon): table + create dialog (subnet select from `/api/dhcp/subnets`, MAC regex validation).
   - DNS Records: delete buttons wired to `DELETE /api/dns/records/[id]`.
   - Shared: `apiRequest`, `TableSkeleton`, `StatChip`, `StatusFilterBar`, `DeleteRowButton`; refetchInterval 15s/30s; empty states; aria labels.

## Key decisions
- Schema has no `WanLink.enabled`/`priority` → mapped to `isPrimary` (Switch) + `weight` (column). VPN "enabled" → `isActive`.
- Firewall rule updates audited as `config_change`; deletes as `delete`; creates via `auditCreateEntity`.
- BigInt (`rxBytes` etc.) converted to Number before `NextResponse.json` (JSON.stringify throws on BigInt).

## Verification
- `bun run lint` → **PASS (exit 0, no output)**, re-run after final edit.
- `tsc --noEmit` → **zero errors in T1-d files** except Prisma-client staleness (below).
- ⚠️ **Env blocker (pre-existing)**: `node_modules/.prisma/client` is stale — missing ALL Phase 8 models/enums (also breaks existing Phase 8 routes + seed.ts identically). Per hard rules no prisma CLI was run. **A `prisma generate` at build/deploy is required** for the new routes + panel to serve data.
