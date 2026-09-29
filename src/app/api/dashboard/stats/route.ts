import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/stats — lightweight stats for SystemAlertBanner
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const now = new Date();

    const [openComplaints, criticalCount, onlineDevices, totalDevices, overdueCount, slaBreaches, warningDevices, activeSubscribers] =
      await Promise.all([
        db.complaint.count({
          where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] } },
        }),
        db.complaint.count({
          where: {
            status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
            priority: { in: ["P1_CRITICAL", "P2_HIGH"] },
          },
        }),
        db.networkDevice.count({ where: { status: "ONLINE" } }),
        db.networkDevice.count(),
        db.invoice.count({
          where: {
            status: { in: ["SENT", "OVERDUE"] },
            dueDate: { lt: now },
            balanceAmount: { gt: 0 },
          },
        }),
        db.complaint.count({
          where: {
            status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
            slaDeadline: { not: null, lte: now },
          },
        }),
        db.networkDevice.count({ where: { status: "WARNING" } }),
        db.subscriber.count({ where: { status: "ACTIVE" } }),
      ]);

    // MRR from active subscriber plans
    let mrr = 0;
    if (activeSubscribers > 0) {
      const activeSubsWithPlans = await db.subscriber.findMany({
        where: { status: "ACTIVE", planId: { not: null } },
        select: { planId: true },
      });
      if (activeSubsWithPlans.length > 0) {
        const planIds = [...new Set(activeSubsWithPlans.map((s) => s.planId!))];
        const plans = await db.plan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, priceMonthly: true },
        });
        const planPriceMap = new Map(plans.map((p) => [p.id, p.priceMonthly]));
        for (const sub of activeSubsWithPlans) {
          mrr += planPriceMap.get(sub.planId!) || 0;
        }
      }
    }
    mrr = Math.round(mrr);

    // Network uptime
    const networkUptime =
      totalDevices > 0
        ? Math.round(((onlineDevices + warningDevices) / totalDevices) * 1000) / 10
        : 100;

    return NextResponse.json({
      openComplaints,
      criticalCount,
      onlineDevices,
      totalDevices,
      overdueInvoices: overdueCount,
      slaBreaches,
      mrr,
      networkUptime,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Dashboard stats API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
