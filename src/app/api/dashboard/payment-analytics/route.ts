import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/payment-analytics — Payment collection analytics
export async function GET(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const NOW = new Date();
    const todayStart = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    const monthStart = new Date(NOW.getFullYear(), NOW.getMonth(), 1);

    const whereVerified = { status: "VERIFIED" as const };

    // ── Today's collection ──
    const todayPayments = await db.payment.findMany({
      where: { ...whereVerified, createdAt: { gte: todayStart } },
      select: { amount: true, paymentMode: true, collectedById: true },
    });

    const todayCollection = todayPayments.reduce((sum, p) => sum + p.amount, 0);

    // ── This week's collection ──
    const weekPayments = await db.payment.aggregate({
      _sum: { amount: true },
      where: { ...whereVerified, createdAt: { gte: weekStart } },
    });
    const weekCollection = weekPayments._sum.amount || 0;

    // ── This month's collection ──
    const monthPayments = await db.payment.aggregate({
      _sum: { amount: true },
      where: { ...whereVerified, createdAt: { gte: monthStart } },
    });
    const monthCollection = monthPayments._sum.amount || 0;

    // ── Payment mode breakdown (this month) ──
    const modeBreakdownRaw = await db.payment.groupBy({
      by: ["paymentMode"],
      where: { ...whereVerified, createdAt: { gte: monthStart } },
      _count: { paymentMode: true },
      _sum: { amount: true },
    });
    const paymentModeBreakdown = modeBreakdownRaw
      .map((m) => ({
        mode: m.paymentMode,
        count: m._count.paymentMode,
        total: m._sum.amount || 0,
      }))
      .sort((a, b) => b.total - a.total);

    // ── Top collectors (this month) ──
    const collectorPayments = todayPayments.filter((p) => p.collectedById);
    const collectorMap = new Map<string, { collected: number; count: number; name: string }>();

    if (collectorPayments.length > 0) {
      const collectorIds = [...new Set(collectorPayments.map((p) => p.collectedById!))];
      const collectors = await db.user.findMany({
        where: { id: { in: collectorIds } },
        select: { id: true, name: true },
      });
      const nameMap = new Map(collectors.map((c) => [c.id, c.name]));

      // Also get all verified payments this month for collector aggregation
      const monthCollectorPayments = await db.payment.findMany({
        where: { ...whereVerified, createdAt: { gte: monthStart }, collectedById: { not: null } },
        select: { amount: true, collectedById: true },
      });

      for (const p of monthCollectorPayments) {
        if (!p.collectedById) continue;
        const existing = collectorMap.get(p.collectedById);
        if (existing) {
          existing.collected += p.amount;
          existing.count += 1;
        } else {
          collectorMap.set(p.collectedById, {
            collected: p.amount,
            count: 1,
            name: nameMap.get(p.collectedById) || "Unknown",
          });
        }
      }
    }

    const topCollectors = [...collectorMap.values()]
      .sort((a, b) => b.collected - a.collected)
      .slice(0, 5);

    // ── Overdue invoices ──
    const overdueInvoices = await db.invoice.findMany({
      where: {
        status: { in: ["OVERDUE", "PARTIALLY_PAID"] },
        balanceAmount: { gt: 0 },
        dueDate: { lt: NOW },
      },
      select: { balanceAmount: true },
    });
    const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);
    const overdueCount = overdueInvoices.length;

    // ── Average payment amount (this month) ──
    const avgPaymentResult = await db.payment.aggregate({
      _avg: { amount: true },
      where: { ...whereVerified, createdAt: { gte: monthStart } },
    });
    const avgPaymentAmount = avgPaymentResult._avg.amount
      ? Math.round(avgPaymentResult._avg.amount)
      : 0;

    // ── Targets (from ISP settings or defaults) ──
    const ispSettings = await db.ispSettings.findUnique({
      where: { id: "default" },
      select: { kpiTargets: true },
    });

    let todayTarget = 500;
    let monthTarget = 15000;
    if (ispSettings?.kpiTargets) {
      try {
        const targets = typeof ispSettings.kpiTargets === "string"
          ? JSON.parse(ispSettings.kpiTargets)
          : ispSettings.kpiTargets;
        if (targets.dailyCollectionTarget) todayTarget = targets.dailyCollectionTarget;
        if (targets.monthlyCollectionTarget) monthTarget = targets.monthlyCollectionTarget;
      } catch {
        // Use defaults
      }
    }

    const todayPercentage = todayTarget > 0 ? Math.round((todayCollection / todayTarget) * 100) : 0;
    const monthPercentage = monthTarget > 0 ? Math.round((monthCollection / monthTarget) * 100) : 0;

    const response = NextResponse.json({
      todayCollection: Math.round(todayCollection),
      todayTarget,
      todayPercentage,
      weekCollection: Math.round(weekCollection),
      monthCollection: Math.round(monthCollection),
      monthTarget,
      monthPercentage,
      paymentModeBreakdown,
      topCollectors,
      overdueAmount: Math.round(overdueAmount),
      overdueCount,
      avgPaymentAmount,
    });

    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return response;
  } catch (error) {
    console.error("[GET /api/dashboard/payment-analytics]", error);
    return NextResponse.json(
      { error: "Failed to fetch payment analytics" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
