import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ============================================================
// CRYPTSK Nexus — /api/auth/reset-requests (STAFF, T10-a)
// Helpdesk view of password reset requests (tokens).
//   GET → last 50, pending first, then newest first.
//   Rows: { id, actorType, email, accountName, accountCode,
//           createdAt, expiresAt, usedAt, deliveredAt, status }
//   status = used → expired → delivered → pending (derived —
//   never stored). Read-only.
// RBAC: user.list (same as GET /api/users).
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export const dynamic = "force-dynamic";

const STATUS_PRIORITY: Record<string, number> = { pending: 0, delivered: 1, used: 2, expired: 3 };

export async function GET(req: NextRequest) {
  try {
    await requirePermission("user", "list");

    // Status is derived (usedAt / expiresAt / deliveredAt), so we pull a
    // recent window, sort pending-first in memory and cut to 50 — keeps
    // actionable requests visible even when older used/expired rows exist.
    const rows = await db.passwordResetToken.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        actorType: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        deliveredAt: true,
        user: { select: { email: true, name: true, username: true } },
        portalUser: {
          select: {
            email: true,
            name: true,
            customer: { select: { customerCode: true, displayName: true } },
          },
        },
      },
    });

    const now = Date.now();
    const statusOf = (usedAt: Date | null, expiresAt: Date, deliveredAt: Date | null) =>
      usedAt ? "used" : expiresAt.getTime() <= now ? "expired" : deliveredAt ? "delivered" : "pending";

    const requests = rows
      .map((r) => {
        const isStaff = r.actorType === "staff";
        return {
          id: r.id,
          actorType: r.actorType,
          email: isStaff ? r.user?.email ?? null : r.portalUser?.email ?? null,
          accountName: isStaff
            ? r.user?.name || r.user?.username || null
            : r.portalUser?.name || r.portalUser?.customer?.displayName || null,
          accountCode: isStaff ? r.user?.username ?? null : r.portalUser?.customer?.customerCode ?? null,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          usedAt: r.usedAt,
          deliveredAt: r.deliveredAt,
          status: statusOf(r.usedAt, r.expiresAt, r.deliveredAt),
        };
      })
      .sort((a, b) => {
        const byStatus = (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9);
        if (byStatus !== 0) return byStatus;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice(0, 50);

    return NextResponse.json({ requests });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/auth/reset-requests] GET failed:", err);
    return NextResponse.json({ error: "Failed to load reset requests" }, { status: 500 });
  }
}
