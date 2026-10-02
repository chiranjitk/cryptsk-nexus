import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── CORS ──
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── GET /api/compliance/audit-report ────────────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // ── 1. User sessions (login activity, bounded) ──
    const sessions = await db.userSession.findMany({
      where: { loginAt: { gte: since } },
      select: {
        id: true,
        userId: true,
        ipAddress: true,
        loginAt: true,
        logoutAt: true,
        status: true,
        User: { select: { name: true, email: true, role: true } },
      },
      orderBy: { loginAt: "desc" },
      take: 50000,
    });

    // Logins per day
    const loginsByDay: Record<string, number> = {};
    const activeUsersByDay: Record<string, Set<string>> = {};

    for (const s of sessions) {
      const day = s.loginAt.toISOString().split("T")[0];
      loginsByDay[day] = (loginsByDay[day] || 0) + 1;
      if (!activeUsersByDay[day]) activeUsersByDay[day] = new Set();
      activeUsersByDay[day].add(s.userId);
    }

    const dailyLoginActivity = Object.entries(loginsByDay)
      .map(([date, count]) => ({
        date,
        logins: count,
        activeUsers: activeUsersByDay[date]?.size || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalLogins = sessions.length;
    const uniqueActiveUsers = new Set(sessions.map((s) => s.userId)).size;
    const avgDailyLogins = dailyLoginActivity.length > 0
      ? Math.round((totalLogins / dailyLoginActivity.length) * 10) / 10
      : 0;

    // Failed login detection: sessions with status "failed" or very short duration
    const failedSessions = sessions.filter(
      (s) => s.status === "failed" || s.logoutAt === null
    );
    const failedLoginCount = failedSessions.length;

    // ── 2. Audit logs (bounded) ──
    const auditLogs = await db.auditLog.findMany({
      where: { timestamp: { gte: since } },
      select: {
        id: true,
        userId: true,
        userName: true,
        action: true,
        entity: true,
        entityId: true,
        details: true,
        endpoint: true,
        method: true,
        ipAddress: true,
        timestamp: true,
      },
      orderBy: { timestamp: "desc" },
      take: 50000,
    });

    // Data access patterns: most accessed resources
    const resourceAccess: Record<string, number> = {};
    for (const log of auditLogs) {
      const key = log.entity || log.endpoint || "unknown";
      resourceAccess[key] = (resourceAccess[key] || 0) + 1;
    }

    const mostAccessedResources = Object.entries(resourceAccess)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([resource, count]) => ({ resource, count }));

    // ── 3. Security events ──
    const securityEvents: Array<{
      id: string;
      type: string;
      userName: string;
      ipAddress: string;
      timestamp: string;
      details: string;
      severity: "LOW" | "MEDIUM" | "HIGH";
    }> = [];

    // Unusual login times (2 AM - 6 AM)
    for (const s of sessions) {
      const hour = s.loginAt.getHours();
      if (hour >= 2 && hour < 6) {
        securityEvents.push({
          id: s.id,
          type: "Unusual Login Time",
          userName: s.User?.name || "Unknown",
          ipAddress: s.ipAddress,
          timestamp: s.loginAt.toISOString(),
          details: `Login at ${s.loginAt.toLocaleTimeString()} (${s.User?.role || "unknown"} role)`,
          severity: "LOW",
        });
      }
    }

    // Multiple failed attempts from same IP
    const ipFailCounts: Record<string, number> = {};
    for (const s of failedSessions) {
      ipFailCounts[s.ipAddress] = (ipFailCounts[s.ipAddress] || 0) + 1;
    }

    for (const [ip, count] of Object.entries(ipFailCounts)) {
      if (count >= 3) {
        securityEvents.push({
          id: `brute-${ip}`,
          type: "Multiple Failed Attempts",
          userName: "Unknown",
          ipAddress: ip,
          timestamp: now.toISOString(),
          details: `${count} failed attempts from ${ip}`,
          severity: count >= 10 ? "HIGH" : "MEDIUM",
        });
      }
    }

    // Unusual IP addresses in audit logs (non-standard IPs or rapid access)
    const auditIpCounts: Record<string, number> = {};
    for (const log of auditLogs) {
      if (log.ipAddress) {
        auditIpCounts[log.ipAddress] = (auditIpCounts[log.ipAddress] || 0) + 1;
      }
    }

    for (const [ip, count] of Object.entries(auditIpCounts)) {
      if (count > 200) {
        securityEvents.push({
          id: `excessive-${ip}`,
          type: "Excessive API Access",
          userName: "System",
          ipAddress: ip,
          timestamp: now.toISOString(),
          details: `${count} actions from ${ip} in the last ${days} days`,
          severity: "MEDIUM",
        });
      }
    }

    securityEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // ── 4. Configuration changes ──
    const configActions = ["update", "delete", "create", "UPDATE", "DELETE", "CREATE"];
    const configChanges = auditLogs.filter((log) =>
      configActions.some((a) => log.action.toLowerCase().includes(a.toLowerCase()))
    );

    const configTimeline: Array<{
      id: string;
      userName: string;
      action: string;
      entity: string;
      entityId: string;
      ipAddress: string;
      timestamp: string;
      details: Record<string, unknown> | null;
    }> = configChanges.map((log) => ({
      id: log.id,
      userName: log.userName,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      ipAddress: log.ipAddress,
      timestamp: log.timestamp.toISOString(),
      details: log.details as Record<string, unknown> | null,
    }));

    // ── 5. Financial audit (bounded) ──
    const invoicesInPeriod = await db.invoice.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        discountAmount: true,
        lateFee: true,
        createdAt: true,
        updatedAt: true,
        Subscriber: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50000,
    });

    const creditNotesInPeriod = await db.creditNote.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        amount: true,
        reason: true,
        status: true,
        createdAt: true,
        Invoice: { select: { invoiceNumber: true, Subscriber: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const refundsInPeriod = await db.refund.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        amount: true,
        reason: true,
        status: true,
        createdAt: true,
        Payment: { select: { Subscriber: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const totalInvoiced = invoicesInPeriod.reduce((s, i) => s + i.totalAmount, 0);
    const totalDiscounts = invoicesInPeriod.reduce((s, i) => s + i.discountAmount, 0);
    const totalLateFees = invoicesInPeriod.reduce((s, i) => s + i.lateFee, 0);
    const totalCreditNotes = creditNotesInPeriod.reduce((s, c) => s + c.amount, 0);
    const totalRefunds = refundsInPeriod.reduce((s, r) => s + r.amount, 0);

    const cancelledInvoices = invoicesInPeriod.filter((i) => i.status === "CANCELLED").length;
    const creditNoteCount = creditNotesInPeriod.length;
    const refundCount = refundsInPeriod.length;

    // Financial audit log entries
    const financialAuditEntries = auditLogs.filter(
      (log) =>
        log.entity?.toLowerCase().includes("invoice") ||
        log.entity?.toLowerCase().includes("payment") ||
        log.entity?.toLowerCase().includes("credit") ||
        log.entity?.toLowerCase().includes("refund")
    );

    return NextResponse.json(
      {
        period: { days, from: since.toISOString(), to: now.toISOString() },
        userActivity: {
          totalLogins,
          uniqueActiveUsers,
          avgDailyLogins,
          failedLoginCount,
          dailyLoginActivity,
          peakLoginDay: dailyLoginActivity.length > 0
            ? dailyLoginActivity.reduce((max, d) => (d.logins > max.logins ? d : max), dailyLoginActivity[0])
            : null,
        },
        dataAccess: {
          totalActions: auditLogs.length,
          mostAccessedResources,
          uniqueIps: Object.keys(auditIpCounts).length,
        },
        securityEvents: {
          total: securityEvents.length,
          events: securityEvents.slice(0, 50),
          highSeverityCount: securityEvents.filter((e) => e.severity === "HIGH").length,
          mediumSeverityCount: securityEvents.filter((e) => e.severity === "MEDIUM").length,
        },
        configChanges: {
          total: configTimeline.length,
          timeline: configTimeline.slice(0, 100),
          createActionCount: configTimeline.filter((c) => c.action.toLowerCase().includes("create")).length,
      updateActionCount: configTimeline.filter((c) => c.action.toLowerCase().includes("update")).length,
      deleteActionCount: configTimeline.filter((c) => c.action.toLowerCase().includes("delete")).length,
    },
    financialAudit: {
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
      totalLateFees: Math.round(totalLateFees * 100) / 100,
      totalCreditNotes: Math.round(totalCreditNotes * 100) / 100,
      totalRefunds: Math.round(totalRefunds * 100) / 100,
      invoicesProcessed: invoicesInPeriod.length,
      cancelledInvoices,
      creditNoteCount,
      refundCount,
      financialLogEntries: financialAuditEntries.length,
      creditNotes: creditNotesInPeriod.slice(0, 20),
      refunds: refundsInPeriod.slice(0, 20),
    },
  },
  { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Audit report API failed:", error);
    return NextResponse.json(
      { error: "Failed to generate audit report" },
      { status: 500, headers: corsHeaders }
    );
  }
}
