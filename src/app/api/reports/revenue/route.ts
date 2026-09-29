import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    try {
      try {
        await requireAuth(req as unknown as import("next/server").NextRequest);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = req.nextUrl;
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const detailed = searchParams.get("detailed") === "true";

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const startDate = startDateStr ? new Date(startDateStr) : new Date(currentYear, currentMonth, 1);
    const endDate = endDateStr ? new Date(endDateStr) : new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

    // Previous period for comparison
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevEnd = new Date(startDate.getTime() - 1);

    // ── Total Revenue (paid invoices) ──
    const paidInvoices = await db.invoice.findMany({
      where: { status: "PAID", paidAt: { gte: startDate, lte: endDate } },
      select: { grandTotal: true, subtotal: true, totalTax: true },
    });
    const totalRevenue = paidInvoices.reduce((s, i) => s + i.grandTotal, 0);
    const totalSubtotal = paidInvoices.reduce((s, i) => s + i.subtotal, 0);
    const totalTax = paidInvoices.reduce((s, i) => s + i.totalTax, 0);

    // ── Previous period revenue ──
    const prevInvoices = await db.invoice.findMany({
      where: { status: "PAID", paidAt: { gte: prevStart, lte: prevEnd } },
      select: { grandTotal: true },
    });
    const prevRevenue = prevInvoices.reduce((s, i) => s + i.grandTotal, 0);
    const revenueChange = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0;

    // ── ARPU ──
    const activeSubscribers = await db.subscriber.count({ where: { status: "ACTIVE" } });
    const arpu = activeSubscribers > 0 ? Math.round(totalRevenue / activeSubscribers) : 0;

    // ── Collection Efficiency ──
    const allInvoices = await db.invoice.findMany({
      where: { issueDate: { gte: startDate, lte: endDate } },
      select: { grandTotal: true, paidAmount: true },
    });
    const totalBilled = allInvoices.reduce((s, i) => s + i.grandTotal, 0);
    const totalPaid = allInvoices.reduce((s, i) => s + i.paidAmount, 0);
    const collectionEfficiency = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;

    // ── Monthly Revenue Trend (last 12 months) ──
    const monthlyTrend: Array<{ month: string; revenue: number }> = [];
    for (let m = 11; m >= 0; m--) {
      const mStart = new Date(currentYear, currentMonth - m, 1);
      const mEnd = new Date(currentYear, currentMonth - m + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleString("en-IN", { month: "short", year: "2-digit" });

      const mInvoices = await db.invoice.findMany({
        where: { status: "PAID", paidAt: { gte: mStart, lte: mEnd } },
        select: { grandTotal: true },
      });
      monthlyTrend.push({
        month: label,
        revenue: Math.round(mInvoices.reduce((s, i) => s + i.grandTotal, 0)),
      });
    }

    // ── Subscriber Growth Trend (last 12 months) ──
    const subscriberGrowth: Array<{ month: string; newSubs: number; churned: number; net: number }> = [];
    for (let m = 11; m >= 0; m--) {
      const mStart = new Date(currentYear, currentMonth - m, 1);
      const mEnd = new Date(currentYear, currentMonth - m + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleString("en-IN", { month: "short", year: "2-digit" });

      const newSubs = await db.subscriber.count({
        where: { createdAt: { gte: mStart, lte: mEnd } },
      });
      const churnedSubs = await db.subscriber.count({
        where: { status: "DISCONNECTED", updatedAt: { gte: mStart, lte: mEnd } },
      });

      subscriberGrowth.push({
        month: label,
        newSubs,
        churned: churnedSubs,
        net: newSubs - churnedSubs,
      });
    }

    // ── Churn Impact on Revenue ──
    const churnImpact: Array<{ month: string; churnedCount: number; lostRevenue: number }> = [];
    for (let m = 11; m >= 0; m--) {
      const mStart = new Date(currentYear, currentMonth - m, 1);
      const mEnd = new Date(currentYear, currentMonth - m + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleString("en-IN", { month: "short", year: "2-digit" });

      const churned = await db.subscriber.findMany({
        where: { status: "DISCONNECTED", updatedAt: { gte: mStart, lte: mEnd } },
        select: { id: true },
      });
      const churnedIds = churned.map((s) => s.id);
      let lostRevenue = 0;
      if (churnedIds.length > 0) {
        const churnedPayments = await db.invoice.findMany({
          where: {
            subscriberId: { in: churnedIds },
            paidAt: { gte: mStart, lte: mEnd },
          },
          select: { grandTotal: true },
        });
        lostRevenue = churnedPayments.reduce((s, i) => s + i.grandTotal, 0);
      }

      churnImpact.push({
        month: label,
        churnedCount: churnedIds.length,
        lostRevenue: Math.round(lostRevenue),
      });
    }

    // ── Revenue Forecast (linear projection based on last 3 months) ──
    const revenueForecast: Array<{ month: string; revenue: number; projected: boolean }> = [];
    const last3 = monthlyTrend.slice(-3);
    if (last3.length === 3) {
      const avgGrowth = ((last3[2].revenue - last3[0].revenue) / 2);
      for (let i = 1; i <= 3; i++) {
        const projDate = new Date(currentYear, currentMonth + i, 1);
        const label = projDate.toLocaleString("en-IN", { month: "short", year: "2-digit" });
        const projected = Math.round(last3[2].revenue + avgGrowth * i);
        revenueForecast.push({ month: label, revenue: Math.max(0, projected), projected: true });
      }
    }

    // ── Invoice Aging Report ──
    const allOverdue = await db.invoice.findMany({
      where: { balanceAmount: { gt: 0 } },
      select: { dueDate: true, balanceAmount: true, grandTotal: true, paidAmount: true },
    });

    let bucket0to30 = 0, count0to30 = 0;
    let bucket31to60 = 0, count31to60 = 0;
    let bucket61to90 = 0, count61to90 = 0;
    let bucket90plus = 0, count90plus = 0;

    for (const inv of allOverdue) {
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000));
      const balance = inv.balanceAmount || (inv.grandTotal - inv.paidAmount);
      if (daysOverdue <= 30) { bucket0to30 += balance; count0to30++; }
      else if (daysOverdue <= 60) { bucket31to60 += balance; count31to60++; }
      else if (daysOverdue <= 90) { bucket61to90 += balance; count61to90++; }
      else { bucket90plus += balance; count90plus++; }
    }

    const invoiceAging = [
      { bucket: "0-30 days", amount: Math.round(bucket0to30), count: count0to30 },
      { bucket: "31-60 days", amount: Math.round(bucket31to60), count: count31to60 },
      { bucket: "61-90 days", amount: Math.round(bucket61to90), count: count61to90 },
      { bucket: "90+ days", amount: Math.round(bucket90plus), count: count90plus },
    ];

    // ── Area-wise Revenue ──
    const areaRevenueData = await db.invoice.findMany({
      where: { status: "PAID", paidAt: { gte: startDate, lte: endDate } },
      include: { Subscriber: { select: { areaId: true } } },
    });

    const areaMap: Record<string, number> = {};
    for (const inv of areaRevenueData) {
      const areaId = inv.Subscriber.areaId;
      if (areaId) {
        areaMap[areaId] = (areaMap[areaId] || 0) + inv.grandTotal;
      }
    }

    const areaWiseRevenue: Array<{ area: string; revenue: number }> = [];
    for (const [areaId, rev] of Object.entries(areaMap)) {
      const area = await db.area.findUnique({ where: { id: areaId }, select: { name: true } });
      if (area) {
        areaWiseRevenue.push({ area: area.name, revenue: Math.round(rev) });
      }
    }
    areaWiseRevenue.sort((a, b) => b.revenue - a.revenue);

    // ── Plan-wise Revenue ──
    const planRevenueData = await db.invoice.findMany({
      where: { status: "PAID", paidAt: { gte: startDate, lte: endDate } },
      include: { Plan: { select: { name: true } } },
    });

    const planMap: Record<string, { revenue: number; count: number }> = {};
    for (const inv of planRevenueData) {
      const planName = inv.Plan?.name || "No Plan";
      if (!planMap[planName]) planMap[planName] = { revenue: 0, count: 0 };
      planMap[planName].revenue += inv.grandTotal;
      planMap[planName].count += 1;
    }

    const planWiseRevenue = Object.entries(planMap)
      .map(([plan, data]) => ({ plan, revenue: Math.round(data.revenue), count: data.count }))
      .sort((a, b) => b.revenue - a.revenue);

    // ── Payment Mode Breakdown ──
    const payments = await db.payment.findMany({
      where: { status: "VERIFIED", createdAt: { gte: startDate, lte: endDate } },
      select: { amount: true, paymentMode: true },
    });

    const modeMap: Record<string, number> = {};
    for (const p of payments) {
      modeMap[p.paymentMode] = (modeMap[p.paymentMode] || 0) + p.amount;
    }
    const paymentModes = Object.entries(modeMap)
      .map(([mode, amount]) => ({ mode, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount);

    // ── Invoice Status Breakdown ──
    const invoiceStatuses = await db.invoice.groupBy({
      by: ["status"],
      where: { issueDate: { gte: startDate, lte: endDate } },
      _count: { id: true },
      _sum: { grandTotal: true },
    });
    const statusBreakdown = invoiceStatuses.map((s) => ({
      status: s.status,
      count: s._count.id,
      amount: Math.round(s._sum.grandTotal || 0),
    }));

    const topAreas = areaWiseRevenue.slice(0, 10);

    const totalInvoices = allInvoices.length;
    const paidCount = paidInvoices.length;
    const overdueCount = allInvoices.filter((i) => i.paidAmount < i.grandTotal).length;

    // ── KPI Targets (from saved settings or computed defaults) ──
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    let savedKpiTargets: { metric: string; target: number; period: string }[] = [];
    try { savedKpiTargets = settings?.kpiTargets ? JSON.parse(settings.kpiTargets) : []; } catch { savedKpiTargets = []; }

    const actuals: Record<string, number> = {
      "Monthly Revenue": Math.round(totalRevenue),
      "Collection Efficiency": collectionEfficiency,
      "ARPU": arpu,
      "Active Subscribers": activeSubscribers,
      "Total Invoices": totalInvoices,
      "Paid Invoices": paidCount,
      "Net Profit": Math.round(totalRevenue) - 0, // expenses fetched separately on client
    };

    const defaultTargets: Record<string, number> = {
      "Monthly Revenue": Math.round(prevRevenue * 1.1),
      "Collection Efficiency": 90,
      "ARPU": arpu > 0 ? Math.round(arpu * 1.05) : 500,
      "Active Subscribers": activeSubscribers + 10,
      "Total Invoices": totalInvoices + 5,
      "Paid Invoices": paidCount + 3,
      "Net Profit": Math.round(totalRevenue * 0.4),
    };

    const kpiTargets = savedKpiTargets.length > 0
      ? savedKpiTargets.map((t) => {
          const actual = actuals[t.metric] ?? 0;
          const target = t.target;
          const percent = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
          return { metric: t.metric, target, actual, percent };
        })
      : [
          { metric: "Monthly Revenue", target: defaultTargets["Monthly Revenue"], actual: actuals["Monthly Revenue"], percent: prevRevenue > 0 ? Math.round((totalRevenue / (prevRevenue * 1.1)) * 100) : 0 },
          { metric: "Collection Efficiency", target: 90, actual: collectionEfficiency, percent: collectionEfficiency },
          { metric: "ARPU", target: defaultTargets["ARPU"], actual: arpu, percent: arpu > 0 ? Math.round((arpu / defaultTargets["ARPU"]) * 100) : 0 },
          { metric: "Active Subscribers", target: activeSubscribers + 10, actual: activeSubscribers, percent: 95 },
        ];

    // ── Daily Revenue ──
    let dailyRevenue: { date: string; revenue: number; count: number }[] = [];
    if (detailed) {
      const daysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
      const maxDays = Math.min(daysInRange, 90);
      for (let d = 0; d < maxDays; d++) {
        const dayStart = new Date(startDate.getTime() + d * 86400000);
        const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
        const dayInvoices = await db.invoice.findMany({
          where: { status: "PAID", paidAt: { gte: dayStart, lte: dayEnd } },
          select: { grandTotal: true },
        });
        dailyRevenue.push({
          date: dayStart.toISOString().split("T")[0],
          revenue: Math.round(dayInvoices.reduce((s, i) => s + i.grandTotal, 0)),
          count: dayInvoices.length,
        });
      }
    }

    // ── Agent-wise Revenue ──
    let agentWiseRevenue: { agent: string; revenue: number; count: number }[] = [];
    if (detailed) {
      const agentPayments = await db.payment.findMany({
        where: { status: "VERIFIED", createdAt: { gte: startDate, lte: endDate } },
        select: { amount: true, collectedById: true },
      });
      const agentMap: Record<string, { revenue: number; count: number }> = {};
      for (const p of agentPayments) {
        if (p.collectedById) {
          if (!agentMap[p.collectedById]) agentMap[p.collectedById] = { revenue: 0, count: 0 };
          agentMap[p.collectedById].revenue += p.amount;
          agentMap[p.collectedById].count++;
        }
      }
      const agentIds = Object.keys(agentMap);
      for (const agentId of agentIds) {
        const user = await db.user.findUnique({ where: { id: agentId }, select: { name: true } });
        if (user) {
          agentWiseRevenue.push({
            agent: user.name,
            revenue: Math.round(agentMap[agentId].revenue),
            count: agentMap[agentId].count,
          });
        }
      }
      agentWiseRevenue.sort((a, b) => b.revenue - a.revenue);
    }

    return NextResponse.json({
      period: { startDate, endDate },
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalSubtotal: Math.round(totalSubtotal),
        totalTax: Math.round(totalTax),
        prevRevenue: Math.round(prevRevenue),
        revenueChange,
        arpu,
        collectionEfficiency,
        activeSubscribers,
        totalInvoices,
        paidCount,
        overdueCount,
      },
      monthlyTrend,
      subscriberGrowth,
      churnImpact,
      revenueForecast,
      invoiceAging,
      areaWiseRevenue,
      planWiseRevenue,
      paymentModes,
      statusBreakdown,
      topAreas,
      kpiTargets,
      dailyRevenue,
      agentWiseRevenue,
    });
  } catch (error) {
    console.error("Revenue Reports API error:", error);
    return NextResponse.json({ error: "Failed to fetch revenue report" }, { status: 500 });
  }
}
