import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ============================================================
// CRYPTSK Nexus — Self-Care Portal shared helpers
// Per: docs/architecture/11_FINAL_MENU_NAVIGATION_SPECIFICATION.md §18
// The portal is subscriber/customer-facing. Session scoping lives in
// src/lib/portal-auth.ts (requireSelfcareAccess): customer logins are
// forced to their own customer/subscriber; staff preview per-subscriber
// via ?subscriberId= (RBAC: subscriber.list).
// PRIVACY: routes here only ever return self-safe fields —
// internal notes, credentials and other tenants' data never leave.
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
export function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

/**
 * Resolve the subscriber being previewed in the Self-Care portal.
 * Returns null when subscriberId is missing or unknown — the caller
 * maps that to 400 / 404 respectively.
 */
export async function resolveSelfcareSubscriber(subscriberId: string | null) {
  if (!subscriberId) return null;
  return db.subscriber.findUnique({
    where: { id: subscriberId },
    include: {
      plan: {
        select: { id: true, name: true, basePrice: true, billingCycle: true, taxRate: true, dataLimitGb: true },
      },
      customer: { select: { id: true, customerCode: true, displayName: true, email: true, phone: true } },
    },
  });
}

/**
 * radacct rows belong to a subscriber either through the Cryptsk-extended
 * "subscriberId" column (stamped by the session engine) or, for rows written
 * by plain FreeRADIUS before/without that column, through the RADIUS username.
 * Match both — same dual attribution as the sessions/reports routes.
 */
export function radAcctSubscriberWhere(sub: { id: string; radiusUsername: string }): Prisma.RadAcctWhereInput {
  return { OR: [{ subscriberId: sub.id }, { username: sub.radiusUsername }] };
}

/** NAS friendly name: shortname when set, else the nasname itself (monitoring convention). */
export function nasDisplayName(nas: { nasname: string; shortname: string | null }): string {
  return nas.shortname || nas.nasname;
}
