import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { db } from "@/lib/db";

// ============================================================
// CRYPTSK Nexus — Self-Care portal session scoping
// Per: docs/architecture/11_FINAL_MENU_NAVIGATION_SPECIFICATION.md §18
//
// Single guard for every /api/selfcare/** route. Two session kinds:
//   • customer (portal_users login) — customerId is FORCED from the
//     session; query params can NEVER widen the scope. A query
//     customerId that differs → 404 (don't leak that it exists).
//     A subscriberId outside the customer → 404. No subscriberId →
//     the customer's first subscriber (createdAt asc) is auto-picked.
//     The portal user's DB status is re-checked (disabled → 403).
//   • staff (users login) — requires subscriber.list and uses the
//     query params as before (admin preview per-subscriber); when
//     both customerId + subscriberId are given their ownership is
//     validated (mismatch → 404).
// Throws Response (401/403/404) — routes' catch passes `instanceof
// Response` through, matching the established pattern.
// ============================================================

export type SelfcareContext = {
  mode: "staff" | "customer";
  customerId: string;
  subscriberId: string | null;
};

function throwHttp(status: number, message: string): never {
  throw new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requireSelfcareAccess(opts: {
  subscriberId?: string | null;
  customerId?: string | null;
}): Promise<SelfcareContext> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;

  // Not authenticated — same 401 body the routes produce for
  // NEXT_REDIRECT today.
  if (!sessionUser?.id) {
    throwHttp(401, "Unauthorized");
  }

  if (sessionUser.userType === "customer") {
    const portalUserId = String(sessionUser.id);
    const sessionCustomerId =
      typeof sessionUser.customerId === "string" ? sessionUser.customerId : null;
    if (!sessionCustomerId) {
      // Malformed session — refuse without leaking anything
      throwHttp(403, "Forbidden");
    }

    // Guard against accounts disabled after login (JWT is stateless,
    // so the DB status is re-checked on every request)
    const portalUser = await db.portalUser.findUnique({
      where: { id: portalUserId },
      select: { status: true, customerId: true },
    });
    if (!portalUser || portalUser.status !== "active" || portalUser.customerId !== sessionCustomerId) {
      throwHttp(403, "Forbidden");
    }

    // Query params can never WIDEN the scope — a differing customerId
    // 404s instead of 403 so it looks like "not found" (no leak)
    if (opts.customerId && opts.customerId !== sessionCustomerId) {
      throwHttp(404, "Customer not found");
    }

    // Subscriber ownership
    let subscriberId: string | null = null;
    if (opts.subscriberId) {
      const subscriber = await db.subscriber.findUnique({
        where: { id: opts.subscriberId },
        select: { id: true, customerId: true },
      });
      if (!subscriber || subscriber.customerId !== sessionCustomerId) {
        throwHttp(404, "Subscriber not found");
      }
      subscriberId = subscriber.id;
    } else {
      // Auto-pick the customer's first subscriber (may be null)
      const first = await db.subscriber.findFirst({
        where: { customerId: sessionCustomerId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      subscriberId = first?.id ?? null;
    }

    return { mode: "customer", customerId: sessionCustomerId, subscriberId };
  }

  // Staff — established RBAC path (throws 403 Response when denied,
  // NEXT_REDIRECT → 401 when unauthenticated)
  await requirePermission("subscriber", "list");

  // Validate subscriber ↔ customer ownership when both are given
  if (opts.subscriberId && opts.customerId) {
    const subscriber = await db.subscriber.findUnique({
      where: { id: opts.subscriberId },
      select: { id: true, customerId: true },
    });
    if (!subscriber || subscriber.customerId !== opts.customerId) {
      throwHttp(404, "Subscriber not found");
    }
  }

  return {
    mode: "staff",
    customerId: opts.customerId ?? "",
    subscriberId: opts.subscriberId ?? null,
  };
}
