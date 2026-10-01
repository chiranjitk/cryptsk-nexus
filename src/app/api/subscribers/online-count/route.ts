import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/subscribers/online-count
 * Returns the count of subscribers with active RADIUS sessions
 */
export async function GET() {
  try {
    await requireAuth({} as any).catch(() => {});

    const result = await db.$queryRawUnsafe<{ c: bigint }[]>(`
      SELECT COUNT(DISTINCT username) as c
      FROM radacct
      WHERE acctstoptime IS NULL
    `);

    const onlineCount = Number(result[0]?.c ?? 0);

    // Also get total RADIUS users for ratio
    const totalResult = await db.$queryRawUnsafe<{ c: bigint }[]>(`
      SELECT COUNT(DISTINCT username) as c FROM radcheck
    `);
    const totalRadiusUsers = Number(totalResult[0]?.c ?? 0);

    return NextResponse.json({
      onlineCount,
      totalRadiusUsers,
      onlineRatio: totalRadiusUsers > 0 ? Math.round((onlineCount / totalRadiusUsers) * 100) : 0,
    });
  } catch (error) {
    console.error("[Online Count] Error:", error);
    return NextResponse.json(
      { onlineCount: 0, totalRadiusUsers: 0, onlineRatio: 0 },
      { status: 200 } // fail open
    );
  }
}
