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
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── Collection Trend (last 7 days) ──
    const collectionTrend: Array<{ date: string; label: string; total: number; count: number; agentBreakdown: Record<string, number> }> = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfDay);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayPayments = await db.payment.findMany({
        where: {
          status: "VERIFIED",
          collectedById: { not: null },
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        select: { amount: true, collectedById: true },
      });

      const total = dayPayments.reduce((sum, p) => sum + p.amount, 0);

      // Per-agent breakdown
      const agentMap = new Map<string, number>();
      for (const p of dayPayments) {
        if (p.collectedById) {
          agentMap.set(p.collectedById, (agentMap.get(p.collectedById) || 0) + p.amount);
        }
      }

      collectionTrend.push({
        date: dayStart.toISOString().split("T")[0],
        label: dayStart.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
        total,
        count: dayPayments.length,
        agentBreakdown: Object.fromEntries(agentMap),
      });
    }

    // ── All agents with monthly stats ──
    const agents = await db.collectionAgent.findMany({
      include: {
        User: { select: { id: true, email: true, status: true, lastLoginAt: true } },
        areasAssigned: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Calculate real monthly collection for each agent
    const agentMonthlyData = await Promise.all(
      agents.map(async (agent) => {
        const monthPayments = await db.payment.findMany({
          where: {
            collectedById: agent.userId,
            status: "VERIFIED",
            createdAt: { gte: startOfMonth },
          },
          select: { amount: true },
        });
        const monthCollected = monthPayments.reduce((sum, p) => sum + p.amount, 0);
        return {
          id: agent.id,
          name: agent.name,
          phone: agent.phone,
          monthlyTarget: agent.monthlyTarget,
          monthlyCollected: monthCollected,
          commissionRate: agent.commissionRate,
          commission: monthCollected * (agent.commissionRate / 100),
          monthlyTargetPercent: agent.monthlyTarget > 0
            ? Math.round((monthCollected / agent.monthlyTarget) * 100)
            : 0,
        };
      })
    );

    // Sort by monthly collection for top agents chart
    const topAgents = [...agentMonthlyData].sort((a, b) => b.monthlyCollected - a.monthlyCollected);

    // ── Commission pie chart data ──
    const commissionData = agentMonthlyData
      .filter((a) => a.commission > 0)
      .map((a) => ({
        name: a.name,
        value: Math.round(a.commission),
      }));

    // ── Summary stats ──
    const totalAgents = agents.length;
    const activeAgents = agents.filter((a) => a.User?.status === "ACTIVE").length;
    const totalMonthlyTarget = agents.reduce((s, a) => s + a.monthlyTarget, 0);
    const totalMonthlyCollected = agentMonthlyData.reduce((s, a) => s + a.monthlyCollected, 0);
    const totalCommission = agentMonthlyData.reduce((s, a) => s + a.commission, 0);
    const avgTargetPercent = totalMonthlyTarget > 0
      ? Math.round((totalMonthlyCollected / totalMonthlyTarget) * 100)
      : 0;

    return NextResponse.json({
      collectionTrend,
      topAgents,
      commissionData,
      agents: agentMonthlyData,
      summary: {
        totalAgents,
        activeAgents,
        totalMonthlyTarget,
        totalMonthlyCollected,
        totalCommission,
        avgTargetPercent,
      },
    });
  } catch (error) {
    console.error("Agents analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch agent analytics" }, { status: 500 });
  }
}
