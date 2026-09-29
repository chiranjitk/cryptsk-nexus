# T6-b — full-stack-developer (frontend) — Customer portal auth UI

Task: (A) Self-Care portal detects real customer sessions and switches to true self-service mode, (B) Portal Access management card in Customer 360, (C) login-card customer hint. Backend T6-a built in parallel; frontend coded against the agreed contract shapes only.

## Files edited
- `src/components/selfcare/selfcare-portal.tsx` — customer-session mode (ctx union, header identity, banner/picker removal, six-tab query rewiring), defensive loading/unlinked states, Loader2 import
- `src/components/admin/customer-360-dialog.tsx` — PortalAccessSection card + PortalUserDialog + ResetPortalPasswordDialog + shared PortalPasswordField + generatePassword(); imports: Switch, AlertDialog*, Copy, Check
- `src/components/auth/login-card.tsx` — additive customer sign-in hint line only

## Mode-switch logic (selfcare-portal)
- `isCustomer = sessionStatus !== "loading" && (session.user as any).userType === "customer"`; `sessionCustomerId`/`sessionCustomerName` from the same cast (contract: customer sessions carry customerId + customerName).
- `SelfcareCtx`: `{mode:"customer", customerId, subscriberId:null}` vs `{mode:"staff", customerId: overview-derived, subscriberId: picker}`.
- Six tabs: overview/usage/profile/plans send NO `subscriberId` param in customer mode (backend auto-picks first subscriber, 404 on foreign); billing/support use session `customerId` directly (enabled before overview resolves). Customer query keys: `["selfcare", tab, "self", id/days...]` — never collide with staff keys; staff flow byte-identical (same keys/URLs/props).
- sessionStorage `selfcare.subscriberId` never overrides customer mode; `/api/subscribers` picker query disabled for customers (`enabled: !isCustomer`).
- Chrome: customer sees name + emerald "Customer" badge (no Select), NO amber staff-preview banner / "Back to Admin" (both `{!isCustomer && …}`), logo stays in portal (`/?view=selfcare`). Onboarding card only for staff without selection. Defensive: session-loading spinner; "Account not linked yet" card (unreachable per contract).

## Portal Access card (customer-360)
- `GET /api/portal-users?customerId=` key `["portal-users", customerId]`; rows: mono email, name, status badge (active=emerald/disabled=slate), lastLogin relTime + lastLoginIp or "never"; actions: Switch → PATCH `{status}` (per-row pending), KeyRound → reset dialog (PATCH `{password}`), Trash2 → AlertDialog confirm → DELETE. Skeleton/inline-retry/real empty state; aria-labels everywhere.
- Create dialog: email validation, optional name, password prefilled `generatePassword()` (12-char base62 via crypto.getRandomValues, rejection-sampled), regenerate + copy buttons, amber "shown only once" note; POST 201 → toast + invalidate; 409 handled via `{error}`.
- POST `/api/portal-users` `{customerId,email,password,name?}`; PATCH `/api/portal-users/[id]` `{status?|password?|name?}`; DELETE `/api/portal-users/[id]` — shapes exactly per T6-a contract.

## Verification
- `bun run lint` exit 0. `bunx tsc --noEmit`: 0 errors in all of `src/` (pre-existing errors only in other agent's skills/examples folders).
- Dev server left running (not restarted, no build, no commit). E2E of /api/portal-users UI pending T6-a routes.

## Notes for integrator
- Customer session landing on `/` without `?view=selfcare` still renders admin shell — suggest app-shell redirect for `userType==="customer"` post-T6.
