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
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const subscribers = await db.subscriber.findMany({
      where: { status: "ACTIVE" },
      include: {
        Plan: { select: { name: true, priceMonthly: true } },
        Area: { select: { name: true } },
        Payment: {
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { amount: true, createdAt: true, status: true },
          orderBy: { createdAt: "desc" },
        },
        Complaint: {
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { id: true },
        },
        Invoice: {
          where: { status: "OVERDUE" },
          select: { id: true, grandTotal: true },
        },
      },
    });

    const churnAnalysis = subscribers.map((sub) => {
      let score = 0;
      const reasons: string[] = [];

      // 1. Payment pattern (30%)
      const recentPayments = sub.payments.filter((p) => p.status === "VERIFIED");
      const daysSinceLastPayment = recentPayments.length > 0
        ? Math.floor((now.getTime() - new Date(recentPayments[0].createdAt).getTime()) / 86400000)
        : 999;
      if (daysSinceLastPayment > 30) { score += 30; reasons.push("No payment in 30+ days"); }
      else if (daysSinceLastPayment > 20) { score += 20; reasons.push("No payment in 20+ days"); }
      else if (daysSinceLastPayment > 10) { score += 10; reasons.push("No recent payment"); }

      // 2. Complaints (20%)
      if (sub.complaints.length >= 3) { score += 20; reasons.push(`${sub.complaints.length} complaints this month`); }
      else if (sub.complaints.length >= 2) { score += 15; reasons.push("Multiple complaints"); }
      else if (sub.complaints.length >= 1) { score += 5; reasons.push("1 complaint this month"); }

      // 3. Balance (25%)
      if (sub.balance < -1000) { score += 25; reasons.push(`High outstanding: ₹${Math.round(sub.balance)}`); }
      else if (sub.balance < -500) { score += 15; reasons.push(`Outstanding balance: ₹${Math.round(sub.balance)}`); }
      else if (sub.balance < 0) { score += 5; reasons.push("Negative balance"); }

      // 4. Overdue invoices (15%)
      if (sub.invoices.length >= 2) { score += 15; reasons.push(`${sub.invoices.length} overdue invoices`); }
      else if (sub.invoices.length >= 1) { score += 8; reasons.push("Overdue invoice"); }

      // 5. Account age (10%)
      const accountAge = Math.floor((now.getTime() - new Date(sub.createdAt).getTime()) / (30 * 86400000));
      if (accountAge < 3) { score += 10; reasons.push("New customer (high early churn risk)"); }
      else if (accountAge < 6) { score += 5; }

      const level = score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
      return {
        id: sub.id,
        name: sub.name,
        code: sub.code,
        phone: sub.phone,
        planName: sub.Plan?.name || "No Plan",
        areaName: sub.Area?.name || "Unknown",
        balance: sub.balance,
        score: Math.min(100, score),
        level,
        reasons,
        lastPayment: daysSinceLastPayment,
        complaints: sub.complaints.length,
        overdueInvoices: sub.invoices.length,
      };
    });

    churnAnalysis.sort((a, b) => b.score - a.score);

    const high = churnAnalysis.filter((c) => c.level === "HIGH");
    const medium = churnAnalysis.filter((c) => c.level === "MEDIUM");
    const low = churnAnalysis.filter((c) => c.level === "LOW");

    const reasonCounts: Record<string, number> = {};
    churnAnalysis.forEach((c) => c.reasons.forEach((r) => { reasonCounts[r] = (reasonCounts[r] || 0) + 1; }));
    const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return NextResponse.json({
      highRisk: high,
      mediumRisk: medium,
      lowRisk: low,
      totalCustomers: subscribers.length,
      topReasons,
      insights: {
        highRiskPercent: subscribers.length > 0 ? Math.round((high.length / subscribers.length) * 100) : 0,
        avgRiskScore: churnAnalysis.length > 0 ? Math.round(churnAnalysis.reduce((s, c) => s + c.score, 0) / churnAnalysis.length) : 0,
      },
    });
  } catch (error) {
    console.error("Churn analysis error:", error);
    return NextResponse.json({ error: "Churn analysis failed" }, { status: 500 });
  }
}
