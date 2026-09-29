import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/captive-portal/analytics — Summary stats
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Summary stats via raw SQL
    const summaryRaw = await db.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*) FROM "CaptivePortal") as totalPortals,
        (SELECT COUNT(*) FROM "CaptivePortal" WHERE enabled = 1) as activePortals,
        (SELECT COUNT(*) FROM "PortalSession" WHERE "status" = 'ACTIVE') as activeSessions,
        (SELECT COUNT(*) FROM "PortalSession") as totalSessions,
        (SELECT COALESCE(SUM(CAST("downloadBytes" AS int)), 0) FROM "PortalSession") as totalDataDownloaded,
        (SELECT COALESCE(SUM(CAST("uploadBytes" AS int)), 0) FROM "PortalSession") as totalDataUploaded
    `);
    const summary = (summaryRaw as any[])[0] || {};

    // Sessions today/week/month
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sessionsTimeRaw = await db.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*) FROM "PortalSession" WHERE DATE("startTime") = DATE($1)) as sessionsToday,
        (SELECT COUNT(*) FROM "PortalSession" WHERE "startTime" >= $2) as sessionsThisWeek,
        (SELECT COUNT(*) FROM "PortalSession" WHERE "startTime" >= $3) as sessionsThisMonth
    `, todayStr, weekAgo, monthAgo);
    const sessionsTime = (sessionsTimeRaw as any[])[0] || {};

    // Auth method breakdown
    const authMethodRaw = await db.$queryRawUnsafe(`
      SELECT "loginMethod" as method, COUNT(*) as count
      FROM "PortalSession"
      GROUP BY "loginMethod"
      ORDER BY count DESC
    `);
    const authMethodBreakdown = (authMethodRaw as any[]).map((r) => ({
      method: r.method,
      count: Number(r.count),
    }));

    // Top portals
    const topPortalsRaw = await db.$queryRawUnsafe(`
      SELECT
        cp."id" as portalId,
        cp."name" as portalName,
        CAST(COUNT(ps."id") AS int) as sessionCount,
        CAST(SUM(CASE WHEN ps."status" = 'ACTIVE' THEN 1 ELSE 0 END) AS int) as activeSessions
      FROM "CaptivePortal" cp
      LEFT JOIN "PortalSession" ps ON ps."portalId" = cp."id"
      GROUP BY cp."id", cp."name"
      ORDER BY sessionCount DESC
      LIMIT 10
    `);
    const topPortals = (topPortalsRaw as any[]).map((r) => ({
      portalId: r.portalId,
      portalName: r.portalName,
      sessionCount: Number(r.sessionCount),
      activeSessions: Number(r.activeSessions),
    }));

    // Venue type breakdown
    const venueRaw = await db.$queryRawUnsafe(`
      SELECT "venueType", COUNT(*) as count
      FROM "CaptivePortal"
      WHERE "venueType" IS NOT NULL AND "venueType" != ''
      GROUP BY "venueType"
      ORDER BY count DESC
    `);
    const venueTypeBreakdown = (venueRaw as any[]).map((r) => ({
      venueType: r.venueType,
      count: Number(r.count),
    }));

    return NextResponse.json({
      summary: {
        totalPortals: Number(summary.totalPortals || 0),
        activePortals: Number(summary.activePortals || 0),
        activeSessions: Number(summary.activeSessions || 0),
        totalSessions: Number(summary.totalSessions || 0),
        totalDataDownloaded: Number(summary.totalDataDownloaded || 0),
        totalDataUploaded: Number(summary.totalDataUploaded || 0),
      },
      sessionsToday: Number(sessionsTime.sessionsToday || 0),
      sessionsThisWeek: Number(sessionsTime.sessionsThisWeek || 0),
      sessionsThisMonth: Number(sessionsTime.sessionsThisMonth || 0),
      authMethodBreakdown,
      topPortals,
      venueTypeBreakdown,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Analytics] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
