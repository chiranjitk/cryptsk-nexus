import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startOfDay = new Date(currentYear, currentMonth, now.getDate());
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

    // ── Today's Collection ──
    const todayPayments = await db.payment.findMany({
      where: { createdAt: { gte: startOfDay, lte: now } },
      select: { amount: true },
    });
    const collectedToday = todayPayments.reduce((s, p) => s + p.amount, 0);

    // ── Monthly Collection ──
    const monthPayments = await db.payment.findMany({
      where: { createdAt: { gte: startOfMonth, lte: now }, status: "VERIFIED" },
      select: { amount: true },
    });
    const collectedMonth = monthPayments.reduce((s, p) => s + p.amount, 0);

    // ── Today's Target (monthly target / 30) ──
    const lastMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const lastMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);
    const lastMonthPaid = await db.invoice.findMany({
      where: { status: "PAID", paidAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      select: { grandTotal: true },
    });
    const lastMonthRevenue = lastMonthPaid.reduce((s, i) => s + i.grandTotal, 0);
    const monthlyTarget = Math.round(lastMonthRevenue * 1.1) || 100000;
    const dailyTarget = Math.round(monthlyTarget / 30);
    const pendingToday = Math.max(0, dailyTarget - collectedToday);

    // ── Pending Amount (unpaid invoices) ──
    const pendingInvoices = await db.invoice.findMany({
      where: { status: { in: ["DRAFT", "SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { grandTotal: true, paidAmount: true },
    });
    const totalPending = pendingInvoices.reduce((s, i) => s + (i.grandTotal - i.paidAmount), 0);

    // ── Overdue Subscribers ──
    const overdueInvoices = await db.invoice.findMany({
      where: {
        status: { in: ["OVERDUE", "PARTIALLY_PAID"] },
        dueDate: { lt: now },
      },
      include: {
        Subscriber: {
          select: { id: true, name: true, code: true, phone: true, Area: { select: { name: true } } },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    });

    // ── Agent-wise Collection ──
    const allAgents = await db.user.findMany({
      where: { role: { in: ["AGENT", "OPERATOR", "ADMIN"] }, status: "ACTIVE" },
      select: { id: true, name: true },
    });

    const agentBreakdown: Array<{ agentId: string; agentName: string; totalCollected: number; todayCollected: number; paymentCount: number }> = [];
    for (const agent of allAgents) {
      const agentPayments = await db.payment.findMany({
        where: {
          collectedById: agent.id,
          createdAt: { gte: startOfMonth, lte: now },
          status: "VERIFIED",
        },
        select: { amount: true },
      });

      const agentToday = await db.payment.findMany({
        where: {
          collectedById: agent.id,
          createdAt: { gte: startOfDay, lte: now },
          status: "VERIFIED",
        },
        select: { amount: true },
      });

      const total = agentPayments.reduce((s, p) => s + p.amount, 0);
      const today = agentToday.reduce((s, p) => s + p.amount, 0);

      if (total > 0 || today > 0) {
        agentBreakdown.push({
          agentId: agent.id,
          agentName: agent.name,
          totalCollected: Math.round(total),
          todayCollected: Math.round(today),
          paymentCount: agentPayments.length,
        });
      }
    }
    agentBreakdown.sort((a, b) => b.totalCollected - a.totalCollected);

    // ── Payment Mode Breakdown (today) ──
    const todayAllPayments = await db.payment.findMany({
      where: { createdAt: { gte: startOfDay, lte: now } },
      select: { amount: true, paymentMode: true },
    });

    const modeBreakdown: Record<string, number> = {};
    for (const p of todayAllPayments) {
      modeBreakdown[p.paymentMode] = (modeBreakdown[p.paymentMode] || 0) + p.amount;
    }

    // ── Collection by day this month ──
    const dailyCollection: Array<{ day: number; amount: number }> = [];
    const daysInMonth = now.getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = new Date(currentYear, currentMonth, d);
      const dayEnd = new Date(currentYear, currentMonth, d, 23, 59, 59);
      const dayPayments = await db.payment.findMany({
        where: { createdAt: { gte: dayStart, lte: dayEnd }, status: "VERIFIED" },
        select: { amount: true },
      });
      dailyCollection.push({
        day: d,
        amount: Math.round(dayPayments.reduce((s, p) => s + p.amount, 0)),
      });
    }

    // ── Collection Efficiency Trend (last 30 days) ──
    const efficiencyTrend: Array<{ date: string; efficiency: number }> = [];
    for (let d = 29; d >= 0; d--) {
      const dayStart = new Date(currentYear, currentMonth, now.getDate() - d);
      const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), 23, 59, 59);
      const dateStr = dayStart.toISOString().split("T")[0];

      const dayCollected = await db.payment.findMany({
        where: { createdAt: { gte: dayStart, lte: dayEnd }, status: "VERIFIED" },
        select: { amount: true },
      });
      const dayCollectedAmount = dayCollected.reduce((s, p) => s + p.amount, 0);
      const efficiency = dailyTarget > 0 ? Math.min(100, Math.round((dayCollectedAmount / dailyTarget) * 100)) : 0;

      efficiencyTrend.push({ date: dateStr, efficiency });
    }

    // ── Weekly Efficiency Trend (last 12 weeks) ──
    const weeklyEfficiencyTrend: Array<{ week: string; efficiency: number }> = [];
    const weeklyTarget = dailyTarget * 7;
    for (let w = 11; w >= 0; w--) {
      const weekEnd = new Date(currentYear, currentMonth, now.getDate() - w * 7);
      const weekStart = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate() - 6);
      const label = `W${12 - w} (${weekStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })})`;

      const weekCollected = await db.payment.findMany({
        where: { createdAt: { gte: weekStart, lte: new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59) }, status: "VERIFIED" },
        select: { amount: true },
      });
      const weekAmount = weekCollected.reduce((s, p) => s + p.amount, 0);
      const weekEff = weeklyTarget > 0 ? Math.min(100, Math.round((weekAmount / weeklyTarget) * 100)) : 0;
      weeklyEfficiencyTrend.push({ week: label, efficiency: weekEff });
    }

    // ── Monthly Efficiency Trend (last 12 months) ──
    const monthlyEfficiencyTrend: Array<{ month: string; efficiency: number }> = [];
    for (let m = 11; m >= 0; m--) {
      const mStart = new Date(currentYear, currentMonth - m, 1);
      const mEnd = new Date(currentYear, currentMonth - m + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleString("en-IN", { month: "short", year: "2-digit" });

      const mCollected = await db.payment.findMany({
        where: { createdAt: { gte: mStart, lte: mEnd }, status: "VERIFIED" },
        select: { amount: true },
      });
      const mAmount = mCollected.reduce((s, p) => s + p.amount, 0);

      const mTarget = Math.round(lastMonthRevenue * 1.1) || 100000;
      const mEff = mTarget > 0 ? Math.min(100, Math.round((mAmount / mTarget) * 100)) : 0;
      monthlyEfficiencyTrend.push({ month: label, efficiency: mEff });
    }

    return NextResponse.json({
      today: {
        collected: Math.round(collectedToday),
        target: dailyTarget,
        pending: Math.round(pendingToday),
        percent: dailyTarget > 0 ? Math.round((collectedToday / dailyTarget) * 100) : 0,
      },
      month: {
        collected: Math.round(collectedMonth),
        target: monthlyTarget,
        pending: Math.round(totalPending),
        percent: monthlyTarget > 0 ? Math.round((collectedMonth / monthlyTarget) * 100) : 0,
      },
      overdueInvoices: overdueInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        subscriberName: inv.Subscriber.name,
        subscriberCode: inv.Subscriber.code,
        phone: inv.Subscriber.phone,
        area: inv.Subscriber.Area?.name || "N/A",
        dueDate: inv.dueDate,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount,
        balanceAmount: inv.grandTotal - inv.paidAmount,
      })),
      agentBreakdown,
      modeBreakdown,
      dailyCollection,
      efficiencyTrend,
      weeklyEfficiencyTrend,
      monthlyEfficiencyTrend,
    });
  } catch (error) {
    console.error("Collection Summary API error:", error);
    return NextResponse.json({ error: "Failed to fetch collection summary" }, { status: 500 });
  }
}
