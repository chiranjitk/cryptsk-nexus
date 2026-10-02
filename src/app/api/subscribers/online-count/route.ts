import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/subscribers/online-count
 * Returns the count of subscribers with active sessions.
 * Counts from BOTH:
 *   1. radacct (FreeRADIUS accounting — real NAS Accounting-Start packets)
 *   2. NasSession (session-engine managed — VPP transactional login flow)
 */
export async function GET() {
  try {
    await requireAuth({} as any).catch(() => {});

    // Count from NasSession table using Prisma tagged template (safe quoting)
    let nasSessionCount = 0;
    let nasSessionError = "";
    try {
      const result = await db.$queryRaw`SELECT COUNT(*)::int as c FROM "NasSession" WHERE status = 'ACTIVE'`;
      nasSessionCount = (result[0] as any)?.c || 0;
    } catch (e: any) {
      nasSessionError = String(e?.message || e).slice(0, 200);
      console.error("[Online Count] NasSession query:", nasSessionError);
    }

    // Also count from radacct (FreeRADIUS accounting — for NAS that send Accounting-Start)
    let radacctCount = 0;
    try {
      const result = await db.$queryRawUnsafe<{ c: bigint }[]>(`
        SELECT COUNT(DISTINCT username) as c
        FROM radacct
        WHERE acctstoptime IS NULL
      `);
      radacctCount = Number(result[0]?.c ?? 0);
    } catch {
      // radacct table might not exist — ignore
    }

    // Take the max (to avoid double-counting — one source may be 0)
    const onlineCount = Math.max(nasSessionCount, radacctCount);

    // Total RADIUS users (from radcheck)
    let totalRadiusUsers = 0;
    try {
      const totalResult = await db.$queryRawUnsafe<{ c: bigint }[]>(`
        SELECT COUNT(DISTINCT username) as c FROM radcheck
      `);
      totalRadiusUsers = Number(totalResult[0]?.c ?? 0);
    } catch {
      // Fallback: count from Subscriber table
      totalRadiusUsers = await db.subscriber.count({
        where: { status: "ACTIVE", radiusEnabled: true },
      });
    }

    return NextResponse.json({
      onlineCount,
      totalRadiusUsers,
      onlineRatio: totalRadiusUsers > 0 ? Math.round((onlineCount / totalRadiusUsers) * 100) : 0,
      nasSessionCount,
      radacctCount,
      nasSessionError: nasSessionError || undefined,
    });
  } catch (error) {
    console.error("[Online Count] Error:", error);
    return NextResponse.json(
      { onlineCount: 0, totalRadiusUsers: 0, onlineRatio: 0 },
      { status: 200 } // fail open
    );
  }
}
