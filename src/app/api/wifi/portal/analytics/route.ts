import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { Prisma } from '@prisma/client';

// GET /api/wifi/portal/analytics — Real WiFi portal analytics from DB
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'today'; // today, week, month
// REMOVED:     const tenantId = user.tenantId;

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    let prevStartDate: Date;
    let prevEndDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        prevEndDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevEndDate = startDate;
        break;
      default: // today
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        prevStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
        prevEndDate = startDate;
    }

    // Current period where clause for WiFiSession
    const where: Prisma.WiFiSessionWhereInput = {
// REMOVED:       tenantId,
      startTime: { gte: startDate },
    };

    // Previous period where clause (for growth comparison)
    const prevWhere: Prisma.WiFiSessionWhereInput = {
// REMOVED:       tenantId,
      startTime: { gte: prevStartDate, lt: prevEndDate },
    };

    // Run all queries with individual error handling — never fail the entire response
    // Each query has its own try/catch so partial data is always returned
    const [
      totalSessions,
      activeSessions,
      totalPrevSessions,
      authMethodStats,
      peakHourData,
      completedSessions,
      totalDataUsedResult,
      uniqueDeviceResult,
      voucherUsedCount,
    ] = await Promise.all([
      // 1. Total sessions in the selected period
      db.wiFiSession.count({ where }).catch(() => 0),

      // 2. Currently active sessions
      db.wiFiSession.count({
        where: { ...where, status: 'active' },
      }).catch(() => 0),

      // 3. Previous period session count (for growth %)
      db.wiFiSession.count({ where: prevWhere }).catch(() => 0),

      // 4. Auth method distribution
      db.wiFiSession.groupBy({
        by: ['authMethod'],
        where,
        _count: { id: true },
      }).catch(() => []),

      // 5. Peak usage hours (sessions per hour of day)
      db.$queryRaw<Array<{ hour: number; count: bigint }>>`
        SELECT
          EXTRACT(HOUR FROM "startTime" AT TIME ZONE 'UTC')::int as hour,
          COUNT(*)::bigint as count
        FROM "WiFiSession"
// REMOVED:         WHERE "tenantId" = ${tenantId}::uuid
          AND "startTime" >= ${startDate}
        GROUP BY hour
        ORDER BY hour
      `.catch(() => []),

      // 6. Completed sessions for duration calculation
      db.wiFiSession.findMany({
        where: {
          ...where,
          status: { in: ['disconnected', 'expired'] },
          duration: { gt: 0 },
        },
        select: { duration: true },
        take: 500,
      }).catch(() => []),

      // 7. Total data used (download + upload combined as dataUsed)
      db.wiFiSession.aggregate({
        where,
        _sum: { dataUsed: true },
      }).catch(() => ({ _sum: { dataUsed: BigInt(0) } })),

      // 8. Unique devices (distinct MAC addresses)
      db.wiFiSession.groupBy({
        by: ['macAddress'],
        where: {
          ...where,
          macAddress: { not: '' },
        },
        _count: { id: true },
      }).catch(() => []),

      // 9. Vouchers used in the period
      db.wiFiVoucher.count({
        where: {
// REMOVED:           tenantId,
          isUsed: true,
          usedAt: { gte: startDate },
        },
      }).catch(() => 0),
    ]);

    // Calculate average session duration in minutes
    const avgDurationMin = completedSessions.length > 0
      ? Math.round(completedSessions.reduce((sum, s) => sum + s.duration, 0) / completedSessions.length / 60)
      : 0;

    // Build peak hours array (0-23)
    const peakHours = Array.from({ length: 24 }, (_, h) => {
      const found = peakHourData.find(p => p.hour === h);
      return { hour: h, sessions: Number(found?.count || 0) };
    });

    // Format data used — WiFiSession.dataUsed is stored in MB
    const totalDataUsedMB = Number(totalDataUsedResult._sum.dataUsed || BigInt(0));

    // Auth method distribution with percentages
    const totalAuthSessions = authMethodStats.reduce((sum, am) => sum + am._count.id, 0);
    const authDistribution = authMethodStats.map(am => ({
      method: am.authMethod || 'unknown',
      count: am._count.id,
      pct: totalAuthSessions > 0 ? Math.round((am._count.id / totalAuthSessions) * 100) : 0,
    }));

    // Unique device count
    const uniqueDeviceCount = uniqueDeviceResult.length;

    // Calculate growth percentage vs previous period
    const growthPercent = totalPrevSessions > 0
      ? Math.round(((totalSessions - totalPrevSessions) / totalPrevSessions) * 100)
      : totalSessions > 0 ? 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        period,
        summary: {
          totalSessions,
          activeSessions,
          uniqueDevices: uniqueDeviceCount,
          avgDurationMin,
          growthPercent,
          totalDataMB: totalDataUsedMB,
          totalVouchersUsed: voucherUsedCount,
        },
        authDistribution,
        peakHours,
      },
    });
  } catch (error) {
    console.error('[Portal Analytics API] Error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Failed to load analytics data' } },
      { status: 500 }
    );
  }
}
