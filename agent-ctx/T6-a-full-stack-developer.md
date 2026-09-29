# T6-a — full-stack-developer (backend) — Work Record

Task: Customer portal auth end-to-end — PortalUser model, NextAuth extension, selfcare session scoping, portal-user provisioning APIs. All additive; staff auth unchanged.

## Files created
- `src/lib/portal-auth.ts` — `requireSelfcareAccess()` session-scoping guard (`SelfcareContext = { mode: "staff" | "customer"; customerId: string; subscriberId: string | null }`)
- `src/app/api/portal-users/route.ts` — GET (list per customer) + POST (provision)
- `src/app/api/portal-users/[id]/route.ts` — PATCH (status/password/name) + DELETE

## Files edited
- `prisma/schema.prisma` — `enum PortalUserStatus {active disabled}` + `model PortalUser` (`@@map("portal_users")`, mapped snake_case cols, FK→Customer cascade, idx customerId+status) + `Customer.portalUsers PortalUser[]`
- `src/lib/auth.ts` — portal branch inside existing `if (!user)` of authorize() (status→lockedUntil→bcrypt→5-fails/15min lockout→auditLogin userId:null); staff return + additive `userType:"staff"`; jwt/session callbacks branch on userType; legacy tokens default staff
- `src/lib/rbac.ts` — requirePermission denied-audit wrapped in try/catch (portal-user id would FK-fail on audit_events.user_id → 403 must not become 500)
- `src/app/api/selfcare/common.ts` — header comment only (exports unchanged)
- 6 selfcare routes (overview/usage/plans/profile/billing/support) — `requireSelfcareAccess` replaces `requirePermission` + manual param handling; response shapes/status byte-identical; privacy filters untouched

## DB
- `bun run db:push` synced (PG18 localhost:5432) + `db:generate` (client 6.19.2)
- Temp bun round-trip (create customer+portalUser → select include → delete → 0 residual) OK; script removed

## Session shapes (contract for T6-b)
- staff: `user.{id, email, name, userType:"staff", roles[], permissions[]}` — identical to before + additive userType
- customer: `user.{id=portalUser.id, email, name, userType:"customer", customerId, customerName}` — roles/permissions never present

## Scoping rules (requireSelfcareAccess)
- customer mode: customerId FORCED from session; query customerId differing → 404 "Customer not found" (no leak); foreign/unknown subscriberId → 404 "Subscriber not found"; no subscriberId → auto-pick first subscriber (createdAt asc); zero subscribers → routes 404; portal status re-checked in DB each request → disabled = 403
- staff mode: `requirePermission("subscriber","list")` + query params as before; both customerId+subscriberId given → ownership cross-check 404
- throws `Response` 401/403/404; routes' `err instanceof Response` passthrough handles it

## Portal-users API (staff-only, `subscriber.update`, audited resource `portal_user`)
- GET `/api/portal-users?customerId=` → 400 missing / 404 unknown customer / `{portalUsers:[{id,email,name,status,lastLoginAt,lastLoginIp,createdAt}]}` createdAt asc — passwordHash never returned
- POST `{customerId,email,password,name?}` → 201 `{portalUser:{id,email,name,status,createdAt}}`; 400 invalid email/<8 chars; 404 customer; 409 "Portal account already exists for this email" (incl. P2002 race); bcrypt hashSync cost 10
- PATCH `[id]` `{status?,password?,name?}` → ≥1 field else 400; status enum validated; password reset zeroes loginAttempts/lockedUntil; auditUpdate before/after w/o hashes (`passwordChanged` flag); returns safe fields
- DELETE `[id]` → 404 unknown → `{ok:true}` + auditDelete

## Verification
- tsc --noEmit: 0 errors in my files (pre-existing errors only in examples/, gateway/, prisma/seed.ts, skills/)
- bun run lint: clean
- Staff-login regression: re-read auth.ts diff line-by-line — staff authorize/jwt/session paths byte-identical except additive `userType:"staff"`; session maxAge 8h + cookie config untouched
- dev.log healthy (200s); did not start/restart dev server, no build, no commit
