import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { auditLog } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Fetch all active subscribers (bounded)
    const activeSubscribers = await db.subscriber.findMany({
      where: { status: "ACTIVE" },
      include: {
        Plan: { select: { name: true, priceMonthly: true } },
        Area: { select: { name: true } },
        _count: { select: { Complaint: true } },
      },
      take: 5000,
    });

    if (activeSubscribers.length === 0) {
      return NextResponse.json({ summary: { totalAtRisk: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0, contacted: 0, saved: 0 }, subscribers: [] });
    }

    const subscriberIds = activeSubscribers.map((s) => s.id);

    // ═══════════════════════════════════════════════════════════
    // BATCH all queries BEFORE the loop (eliminates N+1)
    // ═══════════════════════════════════════════════════════════

    // Step 1: Batch fetch all overdue invoices
    const allOverdue = await db.invoice.findMany({
      where: {
        subscriberId: { in: subscriberIds },
        status: { in: ["OVERDUE", "DRAFT", "SENT"] },
        dueDate: { lt: new Date() },
      },
      select: { subscriberId: true, grandTotal: true, paidAmount: true, balanceAmount: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 50000,
    });
    const overdueBySub = new Map<string, typeof allOverdue>();
    for (const inv of allOverdue) {
      const arr = overdueBySub.get(inv.subscriberId) || [];
      arr.push(inv);
      overdueBySub.set(inv.subscriberId, arr);
    }

    // Step 2: Batch complaint counts (last 30 days, not closed)
    const complaintCounts = await db.complaint.groupBy({
      by: ["subscriberId"],
      where: { subscriberId: { in: subscriberIds }, createdAt: { gte: thirtyDaysAgo }, status: { not: "CLOSED" } },
      _count: { id: true },
    });
    const complaintMap = new Map(complaintCounts.map((c) => [c.subscriberId, c._count.id]));

    // Step 3: Batch pending payment counts (last 30 days)
    const pendingPaymentCounts = await db.payment.groupBy({
      by: ["subscriberId"],
      where: { subscriberId: { in: subscriberIds }, createdAt: { gte: thirtyDaysAgo }, status: "PENDING" },
      _count: { id: true },
    });
    const pendingPaymentMap = new Map(pendingPaymentCounts.map((c) => [c.subscriberId, c._count.id]));

    // Step 4: Batch last verified payment per subscriber
    const lastPayments = await db.payment.findMany({
      where: { subscriberId: { in: subscriberIds }, status: "VERIFIED" },
      select: { subscriberId: true, createdAt: true, amount: true },
      orderBy: { createdAt: "desc" },
      distinct: ["subscriberId"],
      take: 5000,
    });
    const lastPaymentMap = new Map(lastPayments.map((p) => [p.subscriberId, { createdAt: p.createdAt, amount: p.amount }]));

    // Step 5: Batch declining payment pattern (60-30 days ago vs last 30 days)
    const prevMonthPayments = await db.payment.groupBy({
      by: ["subscriberId"],
      where: { subscriberId: { in: subscriberIds }, status: "VERIFIED", createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      _count: { id: true },
    });
    const currMonthPayments = await db.payment.groupBy({
      by: ["subscriberId"],
      where: { subscriberId: { in: subscriberIds }, status: "VERIFIED", createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    });
    const prevPayMap = new Map(prevMonthPayments.map((c) => [c.subscriberId, c._count.id]));
    const currPayMap = new Map(currMonthPayments.map((c) => [c.subscriberId, c._count.id]));

    // ═══════════════════════════════════════════════════════════
    // Loop through subscribers using Maps for O(1) lookups
    // ═══════════════════════════════════════════════════════════

    const churnAlerts: {
      id: string;
      subscriberId: string;
      subscriberName: string;
      phone: string;
      plan: string;
      riskScore: number;
      riskLevel: "HIGH" | "MEDIUM" | "LOW";
      reasons: string[];
      lastPaymentDate: string | null;
      overdueAmount: number;
      complaintsCount: number;
      status: string;
    }[] = [];

    for (const sub of activeSubscribers) {
      let riskScore = 0;
      const reasons: string[] = [];

      // 1. Check overdue invoices (from batched map)
      const overdueInvoices = overdueBySub.get(sub.id) || [];

      if (overdueInvoices.length > 0) {
        const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);
        if (overdueInvoices.length >= 3) {
          riskScore += 40;
          reasons.push("3+ overdue invoices");
        } else if (overdueInvoices.length >= 2) {
          riskScore += 25;
          reasons.push("2 overdue invoices");
        } else {
          riskScore += 15;
          reasons.push("1 overdue invoice");
        }

        const oldestOverdue = overdueInvoices[0];
        const daysOverdue = Math.floor((Date.now() - oldestOverdue.dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 30) {
          riskScore += 20;
          reasons.push(`Overdue ${daysOverdue}+ days`);
        } else if (daysOverdue > 15) {
          riskScore += 10;
          reasons.push(`Overdue ${daysOverdue} days`);
        }

        // Large overdue amounts increase risk
        if (totalOverdue > 3000) {
          riskScore += 10;
          reasons.push(`₹${Math.round(totalOverdue).toLocaleString("en-IN")} overdue`);
        }
      }

      // 2. Check complaints frequency (from batched map)
      const recentComplaints = complaintMap.get(sub.id) || 0;

      if (recentComplaints >= 3) {
        riskScore += 25;
        reasons.push("3+ open complaints");
      } else if (recentComplaints >= 1) {
        riskScore += 10;
        reasons.push(`${recentComplaints} open complaint(s)`);
      }

      // 3. Check pending payments (from batched map)
      const pendingPayments = pendingPaymentMap.get(sub.id) || 0;

      if (pendingPayments > 0) {
        riskScore += 10;
        reasons.push("Pending payments");
      }

      // 4. Check payment regularity (from batched map)
      const lastVerifiedPayment = lastPaymentMap.get(sub.id) || null;

      if (lastVerifiedPayment) {
        const daysSincePayment = Math.floor((Date.now() - lastVerifiedPayment.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSincePayment > 60) {
          riskScore += 20;
          reasons.push(`No payment in ${daysSincePayment} days`);
        } else if (daysSincePayment > 45) {
          riskScore += 10;
          reasons.push(`No payment in ${daysSincePayment} days`);
        }
      } else {
        // Never had a verified payment
        riskScore += 15;
        reasons.push("No verified payment history");
      }

      // 5. Check declining payment pattern (from batched maps)
      const payments60DaysAgo = prevPayMap.get(sub.id) || 0;
      const payments30DaysAgo = currPayMap.get(sub.id) || 0;

      if (payments60DaysAgo > 0 && payments30DaysAgo === 0) {
        riskScore += 15;
        reasons.push("Payment frequency declining");
      }

      // Only include subscribers with risk score > 20
      if (riskScore > 20) {
        const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);

        let riskLevel: "HIGH" | "MEDIUM" | "LOW" = "LOW";
        if (riskScore >= 50) riskLevel = "HIGH";
        else if (riskScore >= 35) riskLevel = "MEDIUM";

        churnAlerts.push({
          id: sub.id,
          subscriberId: sub.id,
          subscriberName: sub.name,
          phone: sub.phone,
          plan: sub.Plan?.name || "No Plan",
          riskScore: Math.min(riskScore, 100),
          riskLevel,
          reasons,
          lastPaymentDate: lastVerifiedPayment?.createdAt?.toISOString() || null,
          overdueAmount,
          complaintsCount: sub._count.Complaint,
          status: sub.status,
        });
      }
    }

    // Sort by risk score descending
    churnAlerts.sort((a, b) => b.riskScore - a.riskScore);

    // Count contacted subscribers (have audit log CHURN_ACTION entries)
    const contactedIds = await db.auditLog.findMany({
      where: {
        action: "CHURN_ACTION",
        entity: "Subscriber",
        entityId: { in: churnAlerts.map((a) => a.subscriberId) },
      },
      select: { entityId: true },
      distinct: ["entityId"],
    });
    const contactedCount = contactedIds.length;

    // Count saved subscribers (were at risk but became healthy — no longer in alert list)
    const allChurnActionEntityIds = await db.auditLog.findMany({
      where: {
        action: "CHURN_ACTION",
        entity: "Subscriber",
        timestamp: { gte: thirtyDaysAgo },
      },
      select: { entityId: true },
      distinct: ["entityId"],
    });
    const currentRiskIds = new Set(churnAlerts.map((a) => a.subscriberId));
    const savedCount = allChurnActionEntityIds.filter(
      (e) => !currentRiskIds.has(e.entityId)
    ).length;

    const summary = {
      totalAtRisk: churnAlerts.length,
      highRisk: churnAlerts.filter((a) => a.riskLevel === "HIGH").length,
      mediumRisk: churnAlerts.filter((a) => a.riskLevel === "MEDIUM").length,
      lowRisk: churnAlerts.filter((a) => a.riskLevel === "LOW").length,
      contacted: contactedCount,
      saved: savedCount,
    };

    return NextResponse.json({ summary, subscribers: churnAlerts });
  } catch (error) {
    console.error("Churn alerts error:", error);
    return NextResponse.json({ error: "Failed to fetch churn alerts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { subscriberId, action, note } = await request.json();

    if (!subscriberId || !action) {
      return NextResponse.json({ error: "Subscriber ID and action are required" }, { status: 400 });
    }

    // Log the action as an audit trail
    await auditLog(request, "CHURN_ACTION", "Subscriber", subscriberId, { note });

    // Create notification for the subscriber
    let title = "";
    let message = "";

    if (action === "reminder") {
      title = "Payment Reminder";
      message = "This is a friendly reminder about your pending bill. Please pay at your earliest convenience to avoid service disruption.";
    } else if (action === "discount") {
      title = "Special Discount Offer";
      message = "As a valued customer, we're offering you a special discount on your next bill. Contact us for details!";
    } else if (action === "call") {
      title = "Scheduled Follow-up Call";
      message = "Our team will call you shortly to discuss your experience and any concerns.";
    }

    await db.notification.create({
      data: {
        subscriberId,
        type: "IN_APP",
        category: "OTHER",
        title,
        message,
        status: "SENT",
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, message: `${action} action completed for subscriber ${subscriberId}` });
  } catch (error) {
    console.error("Churn action error:", error);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
