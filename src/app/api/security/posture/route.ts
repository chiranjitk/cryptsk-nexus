import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

/**
 * GET /api/security/posture
 *
 * Aggregated security telemetry for the dashboard Security Posture widget:
 *  - Active login sessions (UserSession, status = active) with user, device, IP
 *  - Session stats: active count, distinct users, revoked in last 7 days
 *  - Auth event stats: logins 24h, failed logins 7d (from AuditLog)
 *  - Account risk: LOCKED / SUSPENDED / INACTIVE staff users
 *  - Recent security-relevant audit events (LOGIN/LOGOUT/LOGIN_FAILED/PASSWORD_CHANGE)
 *
 * Auth: requireAuth (staff). Credential-like fields are NEVER returned
 * (no tokenHash, no password hashes) — safe by construction.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Session rows with status='active' but loginAt older than the 7-day cookie
    // lifetime can never be used again (cookie expired) — reap them so the
    // posture widget doesn't inflate the active-session count with orphans.
    const reaped = await db.userSession.updateMany({
      where: { status: "active", loginAt: { lt: weekAgo } },
      data: { status: "expired", logoutAt: now },
    });

    const [
      activeSessionsRaw,
      activeSessionCount,
      distinctActiveUsers,
      revokedLast7d,
      loginsLast24h,
      failedLogins7d,
      lockedUsers,
      suspendedUsers,
      inactiveUsers,
      totalStaffUsers,
      recentEvents,
    ] = await Promise.all([
      // ── Active sessions within the cookie validity window (most recent 8) ──
      db.userSession.findMany({
        where: { status: "active", loginAt: { gte: weekAgo } },
        orderBy: { loginAt: "desc" },
        take: 8,
        include: {
          User: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      db.userSession.count({ where: { status: "active", loginAt: { gte: weekAgo } } }),
      db.userSession.groupBy({
        by: ["userId"],
        where: { status: "active", loginAt: { gte: weekAgo } },
      }),
      db.userSession.count({
        where: { status: { in: ["logged_out", "revoked"] }, logoutAt: { gte: weekAgo } },
      }),
      db.auditLog.count({ where: { action: "LOGIN", timestamp: { gte: dayAgo } } }),
      db.auditLog.count({ where: { action: "LOGIN_FAILED", timestamp: { gte: weekAgo } } }),
      db.user.count({ where: { status: "LOCKED" } }),
      db.user.count({ where: { status: "SUSPENDED" } }),
      db.user.count({ where: { status: "INACTIVE" } }),
      db.user.count({ where: { role: { not: "CUSTOMER" } } }),
      // ── Recent auth/security audit events ──
      db.auditLog.findMany({
        where: {
          action: { in: ["LOGIN", "LOGOUT", "LOGIN_FAILED", "PASSWORD_CHANGE", "API_KEY_ROTATE"] },
        },
        orderBy: { timestamp: "desc" },
        take: 10,
        select: {
          id: true,
          action: true,
          userName: true,
          entityId: true,
          ipAddress: true,
          timestamp: true,
          details: true,
        },
      }),
    ]);

    return NextResponse.json({
      stats: {
        activeSessions: activeSessionCount,
        distinctUsers: distinctActiveUsers.length,
        revokedLast7d,
        staleReaped: reaped.count,
        loginsLast24h,
        failedLogins7d,
        lockedUsers,
        suspendedUsers,
        inactiveUsers,
        totalStaffUsers,
      },
      sessions: activeSessionsRaw.map((s) => ({
        id: s.id,
        userName: s.User?.name ?? "Unknown",
        userEmail: s.User?.email ?? "",
        role: s.User?.role ?? "VIEWER",
        device: s.device || "Unknown device",
        browser: s.browser || "",
        ipAddress: s.ipAddress || "—",
        location: s.location || "",
        loginAt: s.loginAt.toISOString(),
      })),
      events: recentEvents.map((e) => ({
        id: e.id,
        action: e.action,
        userName: e.userName,
        userId: e.entityId,
        ipAddress: e.ipAddress,
        timestamp: e.timestamp.toISOString(),
        // details may carry { email } for login events — safe subset only
        email:
          e.details && typeof e.details === "string"
            ? (() => {
                try {
                  const d = JSON.parse(e.details);
                  return typeof d?.email === "string" ? d.email : null;
                } catch {
                  return null;
                }
              })()
            : null,
      })),
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Security posture fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch security posture" }, { status: 500 });
  }
}
