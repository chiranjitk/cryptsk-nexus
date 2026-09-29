import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/ipam/trends - IP usage trend data over last 6 months
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const months: { month: string; allocated: number; free: number }[] = [];
    let dataAvailable = false;

    // Current real IP counts
    const totalIps = await db.ipAddress.count();
    const usedIps = await db.ipAddress.count({
      where: { status: { in: ["used", "reserved"] } },
    });

    // Always include current month with real data
    const currentLabel = now.toLocaleString("default", { month: "short", year: "numeric" });
    months.push({
      month: currentLabel,
      allocated: usedIps,
      free: totalIps - usedIps,
    });

    // Query real historical assignment data from IpAssignmentHistory for past months
    for (let i = 1; i <= 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      // Count IPs that were assigned during this month (have assignedAt within the month)
      const assignedInMonth = await db.ipAssignmentHistory.count({
        where: {
          assignedAt: { gte: start, lt: end },
        },
      });

      // Count IPs that remained assigned through this month
      // (assigned before end of month and not released before start of next month)
      const stillAssignedInMonth = await db.ipAssignmentHistory.count({
        where: {
          assignedAt: { lt: end },
          OR: [
            { releasedAt: null },
            { releasedAt: { gte: end } },
          ],
        },
      });

      if (assignedInMonth > 0 || stillAssignedInMonth > 0) {
        dataAvailable = true;
        const monthLabel = d.toLocaleString("default", { month: "short", year: "numeric" });
        months.push({
          month: monthLabel,
          allocated: stillAssignedInMonth,
          free: Math.max(0, totalIps - stillAssignedInMonth),
        });
      }
    }

    months.sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({ months, dataAvailable });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch trends" }, { status: 500 });
  }
}
