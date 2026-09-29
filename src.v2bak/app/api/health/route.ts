import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { db } from "@/lib/db";

// ============================================================
// CRYPTSK Nexus — GET /api/health
// Authenticated system health probe: live DB counts + uptime.
// Used by the header health indicator (30s poll), sidebar badges
// (activeSessions, openTickets) and ops tooling.
// ============================================================

export const dynamic = "force-dynamic";

export async function GET() {
  // Auth gate — requireAuth returns AuthUser or throws redirect.
  // For an API surface, answer unauthorized calls with JSON 401
  // (never a redirect, which fetch consumers cannot interpret).
  try {
    await requireAuth();
  } catch {
    return NextResponse.json(
      { status: "unhealthy", db: "error", error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const [
      users,
      customers,
      subscribers,
      activeSessions,
      unreadNotifications,
      nasTotal,
      nasUp,
      openTickets,
      upcomingInstallations,
    ] = await Promise.all([
      db.user.count(),
      db.customer.count(),
      db.subscriber.count(),
      // Active sessions = accounting records with no stop time
      db.radAcct.count({ where: { acctstoptime: null } }),
      db.notification.count({ where: { readAt: null } }),
      db.nas.count(),
      // NAS model has no `status` field — `isActive` is the liveness flag
      db.nas.count({ where: { isActive: true } }),
      // Operations & Support — open support tickets (sidebar badge)
      db.ticket.count({ where: { status: "open" } }),
      // Scheduled installations still pending (scheduledAt in the future)
      db.installation.count({ where: { status: "scheduled", scheduledAt: { gte: new Date() } } }),
    ]);

    return NextResponse.json({
      status: "healthy",
      db: "connected",
      counts: {
        users,
        customers,
        subscribers,
        activeSessions,
        unreadNotifications,
        nas: { total: nasTotal, up: nasUp },
        openTickets,
        upcomingInstallations,
      },
      serverTime: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
    });
  } catch (error) {
    console.error("[/api/health] DB health check failed:", error);
    return NextResponse.json(
      { status: "unhealthy", db: "error" },
      { status: 503 }
    );
  }
}
