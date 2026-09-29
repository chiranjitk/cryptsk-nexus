import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// Default SLA days by overdue amount tier
function getDefaultSlaDays(amount: number): number {
  if (amount < 5000) return 15;
  if (amount <= 25000) return 30;
  return 45;
}

function getEffectiveSlaDays(record: { customSlaDays: number | null; targetDays: number }, balanceAmount: number): number {
  if (record.customSlaDays != null && record.customSlaDays > 0) return record.customSlaDays;
  return record.targetDays || getDefaultSlaDays(balanceAmount);
}

function getEffectiveDueDate(
  record: { slaDueDate: Date | null; createdAt: Date; customSlaDays: number | null; targetDays: number; slaPaused: boolean; slaPausedAt: Date | null; slaPausedTotalMs: number },
  balanceAmount: number,
): Date | null {
  if (record.slaDueDate) return record.slaDueDate;
  const slaDays = record.customSlaDays ?? record.targetDays ?? getDefaultSlaDays(balanceAmount);
  const due = new Date(record.createdAt);
  due.setDate(due.getDate() + slaDays);
  if (record.slaPausedTotalMs > 0) due.setTime(due.getTime() + record.slaPausedTotalMs);
  return due;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();

    // Fetch all SLA records with related data
    const slaRecords = await db.recoverySla.findMany({
      include: {
        Invoice: {
          select: {
            invoiceNumber: true,
            balanceAmount: true,
            dueDate: true,
            grandTotal: true,
            paidAmount: true,
            status: true,
            Subscriber: {
              select: { Area: { select: { name: true } } },
            },
          },
        },
        Subscriber: {
          select: { name: true, code: true, phone: true, Area: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Compute effective SLA values
    const enriched = slaRecords.map((sla) => {
      const balanceAmount = sla.Invoice.balanceAmount || (sla.Invoice.grandTotal - sla.Invoice.paidAmount);
      const effectiveDays = getEffectiveSlaDays(sla, balanceAmount);
      const effectiveDue = getEffectiveDueDate(sla, balanceAmount);

      let daysElapsed = 0;
      let daysRemaining = effectiveDays;
      let slaCategory: "on_track" | "at_risk" | "overdue" = "on_track";

      if (effectiveDue) {
        daysElapsed = Math.max(0, Math.floor((now.getTime() - new Date(sla.createdAt).getTime()) / 86400000));

        if (sla.slaPaused && sla.slaPausedAt) {
          const pausedMs = now.getTime() - new Date(sla.slaPausedAt).getTime();
          daysElapsed = Math.max(0, Math.floor((now.getTime() - new Date(sla.createdAt).getTime() - (sla.slaPausedTotalMs + pausedMs)) / 86400000));
        } else if (sla.slaPausedTotalMs > 0) {
          daysElapsed = Math.max(0, Math.floor((now.getTime() - new Date(sla.createdAt).getTime() - sla.slaPausedTotalMs) / 86400000));
        }

        daysRemaining = Math.max(0, effectiveDays - daysElapsed);

        if (now > effectiveDue) {
          daysElapsed = Math.floor((now.getTime() - effectiveDue.getTime()) / 86400000) + effectiveDays;
          daysRemaining = 0;
          slaCategory = "overdue";
        } else if (daysRemaining <= 3) {
          slaCategory = "at_risk";
        }
      }

      return {
        ...sla,
        balanceAmount,
        effectiveDays,
        effectiveDue: effectiveDue?.toISOString() || null,
        daysElapsed,
        daysRemaining,
        slaCategory,
        defaultSlaDays: getDefaultSlaDays(balanceAmount),
        isCustomSla: sla.customSlaDays != null && sla.customSlaDays > 0,
      };
    });

    // ── Stat cards ──
    const openRecords = enriched.filter((r) => r.status === "OPEN" || r.status === "ESCALATED");
    const overdueCount = openRecords.filter((r) => r.slaCategory === "overdue").length;
    const atRiskCount = openRecords.filter((r) => r.slaCategory === "at_risk").length;
    const onTrackCount = openRecords.filter((r) => r.slaCategory === "on_track").length;

    const resolvedRecords = enriched.filter((r) => r.status === "MET");
    const avgRecoveryDays = resolvedRecords.length > 0
      ? Math.round(resolvedRecords.reduce((sum, r) => sum + r.actualDays, 0) / resolvedRecords.length * 10) / 10
      : 0;

    // ── SLA Compliance Rate ──
    const totalSla = enriched.length;
    const metCount = enriched.filter((r) => r.status === "MET").length;
    const breachedCount = enriched.filter((r) => r.status === "BREACHED").length;
    const complianceRate = totalSla > 0 ? Math.round((metCount / totalSla) * 100) : 0;

    // ── Aging by SLA buckets ──
    const buckets = [
      { label: "0-7 days", minDays: 0, maxDays: 7, amount: 0, count: 0 },
      { label: "8-15 days", minDays: 8, maxDays: 15, amount: 0, count: 0 },
      { label: "16-30 days", minDays: 16, maxDays: 30, amount: 0, count: 0 },
      { label: "31-45 days", minDays: 31, maxDays: 45, amount: 0, count: 0 },
      { label: "45+ days", minDays: 46, maxDays: 99999, amount: 0, count: 0 },
    ];
    for (const r of openRecords) {
      for (const b of buckets) {
        if (r.daysElapsed >= b.minDays && r.daysElapsed <= b.maxDays) {
          b.amount += r.balanceAmount;
          b.count++;
          break;
        }
      }
    }

    // ── Agent-wise SLA performance ──
    const agents = await db.collectionAgent.findMany({
      include: { User: { select: { name: true } } },
    });

    const agentPerformance = await Promise.all(
      agents.map(async (agent) => {
        const agentOverdueInvoices = await db.invoice.findMany({
          where: {
            OR: [{ status: "OVERDUE" as const }, { status: "PARTIALLY_PAID" as const }],
            Subscriber: { internalNotes: { contains: agent.id } },
          },
          select: { id: true, dueDate: true, paidAmount: true, grandTotal: true, balanceAmount: true },
        });

        const agentSlaRecords = await db.recoverySla.findMany({
          where: {
            invoiceId: { in: agentOverdueInvoices.map((i) => i.id) },
          },
          select: { status: true, actualDays: true, targetDays: true },
        });

        const metCount = agentSlaRecords.filter((s) => s.status === "MET").length;
        const total = agentSlaRecords.length;
        const agentCompliance = total > 0 ? Math.round((metCount / total) * 100) : 0;
        const avgDays = total > 0
          ? Math.round(agentSlaRecords.filter((s) => s.status === "MET").reduce((sum, s) => sum + s.actualDays, 0) / Math.max(metCount, 1) * 10) / 10
          : 0;

        return {
          agentId: agent.id,
          agentName: agent.name || agent.User?.name || `Agent ${agent.id.slice(0, 6)}`,
          totalAssigned: agentOverdueInvoices.length,
          slaTotal: total,
          slaMet: metCount,
          slaBreached: agentSlaRecords.filter((s) => s.status === "BREACHED").length,
          complianceRate: agentCompliance,
          avgRecoveryDays: avgDays,
        };
      })
    );

    // ── Monthly SLA trend (last 6 months) ──
    const monthlyTrend: Array<{ month: string; total: number; met: number; breached: number; complianceRate: number; avgRecoveryDays: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = monthStart.toLocaleString("en-IN", { month: "short", year: "2-digit" });

      const monthRecords = await db.recoverySla.findMany({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      });

      const monthMet = monthRecords.filter((r) => r.status === "MET").length;
      const monthBreached = monthRecords.filter((r) => r.status === "BREACHED").length;
      const monthTotal = monthRecords.length;
      const monthResolved = monthRecords.filter((r) => r.resolvedAt && new Date(r.resolvedAt) >= monthStart && new Date(r.resolvedAt) <= monthEnd).length;
      const monthAvgDays = monthResolved > 0
        ? Math.round(monthRecords.filter((r) => r.status === "MET").reduce((s, r) => s + r.actualDays, 0) / Math.max(monthResolved, 1) * 10) / 10
        : 0;

      monthlyTrend.push({
        month: label,
        total: monthTotal,
        met: monthMet,
        breached: monthBreached,
        complianceRate: monthTotal > 0 ? Math.round((monthMet / monthTotal) * 100) : 0,
        avgRecoveryDays: monthAvgDays,
      });
    }

    // ── SLA Configuration defaults ──
    const slaConfig = {
      tiers: [
        { label: "Below \u20B95,000", min: 0, max: 5000, slaDays: 15 },
        { label: "\u20B95,000 \u2013 \u20B925,000", min: 5000, max: 25000, slaDays: 30 },
        { label: "Above \u20B925,000", min: 25000, max: Infinity, slaDays: 45 },
      ],
    };

    return NextResponse.json({
      stats: {
        overdueCount,
        atRiskCount,
        onTrackCount,
        avgRecoveryDays,
        complianceRate,
        totalSla,
        metCount,
        breachedCount,
      },
      records: enriched,
      agingBuckets: buckets,
      agentPerformance,
      monthlyTrend,
      slaConfig,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("SLA Dashboard API error:", error);
    return NextResponse.json({ error: "Failed to fetch SLA dashboard data" }, { status: 500 });
  }
}
