import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Types ──────────────────────────────────────────────────

interface RiskFactors {
  paymentScore: number;
  paymentDetails: string[];
  complaintScore: number;
  complaintDetails: string[];
  tenureScore: number;
  tenureDetails: string[];
  engagementScore: number;
  engagementDetails: string[];
  balanceScore: number;
  balanceDetails: string[];
}

interface PredictedSubscriber {
  id: string;
  name: string;
  email: string;
  phone: string;
  planName: string;
  areaName: string;
  riskScore: number;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  factors: RiskFactors;
}

// ─── GET /api/churn/predict ─────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // Fetch all active subscribers with plan and area
    const subscribers = await db.subscriber.findMany({
      where: { status: "ACTIVE" },
      include: {
        Plan: { select: { id: true, name: true, priceMonthly: true, downloadSpeed: true, uploadSpeed: true } },
        Area: { select: { id: true, name: true } },
      },
    });

    if (subscribers.length === 0) {
      return NextResponse.json({
        subscribers: [],
        summary: { high: 0, medium: 0, low: 0, avgScore: 0 },
      });
    }

    // Batch fetch all invoices, payments, complaints for active subscribers
    const subscriberIds = subscribers.map((s) => s.id);

    const [overdueInvoices, failedPayments, recentComplaints, unresolvedComplaints, recentVerifiedPayments] =
      await Promise.all([
        // Overdue/DRAFT/SENT invoices with due dates in last 90 days
        db.invoice.findMany({
          where: {
            subscriberId: { in: subscriberIds },
            status: { in: ["OVERDUE", "DRAFT", "SENT"] },
            dueDate: { lt: now, gte: ninetyDaysAgo },
          },
          select: { subscriberId: true, id: true, balanceAmount: true, dueDate: true, grandTotal: true },
          orderBy: { dueDate: "asc" },
        }),

        // Failed payments in last 90 days
        db.payment.findMany({
          where: {
            subscriberId: { in: subscriberIds },
            status: "FAILED",
            createdAt: { gte: ninetyDaysAgo },
          },
          select: { subscriberId: true, id: true },
        }),

        // Complaints in last 90 days
        db.complaint.findMany({
          where: {
            subscriberId: { in: subscriberIds },
            createdAt: { gte: ninetyDaysAgo },
          },
          select: { subscriberId: true, id: true, status: true, priority: true },
        }),

        // Unresolved complaints (not CLOSED)
        db.complaint.findMany({
          where: {
            subscriberId: { in: subscriberIds },
            status: { not: "CLOSED" },
          },
          select: { subscriberId: true, id: true },
        }),

        // Last verified payment per subscriber
        db.payment.findMany({
          where: {
            subscriberId: { in: subscriberIds },
            status: "VERIFIED",
          },
          select: { subscriberId: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    // Build lookup maps for performance
    const overdueMap = new Map<string, typeof overdueInvoices>();
    for (const inv of overdueInvoices) {
      const arr = overdueMap.get(inv.subscriberId) || [];
      arr.push(inv);
      overdueMap.set(inv.subscriberId, arr);
    }

    const failedPayMap = new Map<string, number>();
    for (const p of failedPayments) {
      failedPayMap.set(p.subscriberId, (failedPayMap.get(p.subscriberId) || 0) + 1);
    }

    const recentComplaintsMap = new Map<string, typeof recentComplaints>();
    for (const c of recentComplaints) {
      const arr = recentComplaintsMap.get(c.subscriberId) || [];
      arr.push(c);
      recentComplaintsMap.set(c.subscriberId, arr);
    }

    const unresolvedMap = new Map<string, number>();
    for (const c of unresolvedComplaints) {
      unresolvedMap.set(c.subscriberId, (unresolvedMap.get(c.subscriberId) || 0) + 1);
    }

    // Last verified payment per subscriber (take first since ordered desc)
    const lastPaymentMap = new Map<string, Date>();
    for (const p of recentVerifiedPayments) {
      if (!lastPaymentMap.has(p.subscriberId)) {
        lastPaymentMap.set(p.subscriberId, new Date(p.createdAt));
      }
    }

    // Calculate risk scores
    const predicted: PredictedSubscriber[] = subscribers.map((sub) => {
      const factors: RiskFactors = {
        paymentScore: 0,
        paymentDetails: [],
        complaintScore: 0,
        complaintDetails: [],
        tenureScore: 0,
        tenureDetails: [],
        engagementScore: 0,
        engagementDetails: [],
        balanceScore: 0,
        balanceDetails: [],
      };

      // ── Factor 1: Payment Behavior (30%) ──
      const overdueInvs = overdueMap.get(sub.id) || [];
      const failedCount = failedPayMap.get(sub.id) || 0;

      if (overdueInvs.length >= 3) {
        factors.paymentScore = 30;
        factors.paymentDetails.push(`${overdueInvs.length} overdue invoices in 90 days`);
      } else if (overdueInvs.length === 2) {
        factors.paymentScore = 22;
        factors.paymentDetails.push("2 overdue invoices");
      } else if (overdueInvs.length === 1) {
        factors.paymentScore = 12;
        factors.paymentDetails.push("1 overdue invoice");
      }

      // Check days overdue for the oldest invoice
      if (overdueInvs.length > 0) {
        const oldestDue = new Date(overdueInvs[0].dueDate);
        const daysOverdue = Math.floor((now.getTime() - oldestDue.getTime()) / 86400000);
        if (daysOverdue > 30 && factors.paymentScore < 25) {
          factors.paymentScore = Math.max(factors.paymentScore, 18);
          factors.paymentDetails.push(`Oldest invoice ${daysOverdue} days overdue`);
        } else if (daysOverdue > 15 && factors.paymentScore < 15) {
          factors.paymentScore = Math.max(factors.paymentScore, 10);
          factors.paymentDetails.push(`Invoice ${daysOverdue} days overdue`);
        }
      }

      // Failed payments increase risk
      if (failedCount >= 3) {
        factors.paymentScore = 30;
        factors.paymentDetails.push(`${failedCount} failed payments`);
      } else if (failedCount >= 1) {
        factors.paymentScore = Math.min(30, factors.paymentScore + 8);
        factors.paymentDetails.push(`${failedCount} failed payment(s)`);
      }

      // Payment regularity: days since last verified payment
      const lastPay = lastPaymentMap.get(sub.id);
      if (lastPay) {
        const daysSincePay = Math.floor((now.getTime() - lastPay.getTime()) / 86400000);
        if (daysSincePay > 60) {
          factors.paymentScore = 30;
          factors.paymentDetails.push(`No payment in ${daysSincePay} days`);
        } else if (daysSincePay > 45) {
          factors.paymentScore = Math.min(30, Math.max(factors.paymentScore, 20));
          factors.paymentDetails.push(`No payment in ${daysSincePay} days`);
        } else if (daysSincePay > 30) {
          factors.paymentScore = Math.min(30, Math.max(factors.paymentScore, 15));
          factors.paymentDetails.push(`No payment in ${daysSincePay} days`);
        }
      } else {
        factors.paymentScore = 30;
        factors.paymentDetails.push("No verified payment history");
      }

      // ── Factor 2: Complaint Frequency (25%) ──
      const complaints90 = recentComplaintsMap.get(sub.id) || [];
      const unresolvedCount = unresolvedMap.get(sub.id) || 0;
      const unresolvedIn90 = complaints90.filter((c) => c.status !== "CLOSED").length;

      if (complaints90.length >= 5) {
        factors.complaintScore = 25;
        factors.complaintDetails.push(`${complaints90.length} complaints in 90 days`);
      } else if (complaints90.length >= 3) {
        factors.complaintScore = 20;
        factors.complaintDetails.push(`${complaints90.length} complaints in 90 days`);
      } else if (complaints90.length >= 1) {
        factors.complaintScore = 10;
        factors.complaintDetails.push(`${complaints90.length} complaint(s) in 90 days`);
      }

      // Unresolved complaints weight higher
      if (unresolvedIn90 >= 3) {
        factors.complaintScore = 25;
        factors.complaintDetails.push(`${unresolvedIn90} unresolved complaints`);
      } else if (unresolvedIn90 >= 2) {
        factors.complaintScore = Math.max(factors.complaintScore, 18);
        if (!factors.complaintDetails.includes(`${unresolvedIn90} unresolved complaints`)) {
          factors.complaintDetails.push(`${unresolvedIn90} unresolved complaints`);
        }
      } else if (unresolvedIn90 >= 1 && factors.complaintScore < 15) {
        factors.complaintScore = Math.max(factors.complaintScore, 12);
        if (!factors.complaintDetails.includes(`${unresolvedIn90} unresolved complaints`)) {
          factors.complaintDetails.push(`${unresolvedIn90} unresolved complaint(s)`);
        }
      }

      // High priority complaints increase risk
      const highPriorityCount = complaints90.filter((c) => c.priority === "P1_CRITICAL" || c.priority === "P2_HIGH").length;
      if (highPriorityCount >= 2 && factors.complaintScore < 22) {
        factors.complaintScore = 22;
        factors.complaintDetails.push(`${highPriorityCount} high-priority complaint(s)`);
      } else if (highPriorityCount >= 1 && factors.complaintScore < 15) {
        factors.complaintScore = Math.max(factors.complaintScore, 15);
        factors.complaintDetails.push("High-priority complaint");
      }

      // ── Factor 3: Tenure (15%) ──
      const activationDate = sub.activationDate ? new Date(sub.activationDate) : new Date(sub.createdAt);
      const tenureMonths = Math.floor((now.getTime() - activationDate.getTime()) / (30.44 * 86400000));

      if (tenureMonths < 1) {
        factors.tenureScore = 15;
        factors.tenureDetails.push("New subscriber (< 1 month)");
      } else if (tenureMonths < 3) {
        factors.tenureScore = 12;
        factors.tenureDetails.push(`Short tenure (${tenureMonths} month${tenureMonths > 1 ? "s" : ""})`);
      } else if (tenureMonths < 6) {
        factors.tenureScore = 7;
        factors.tenureDetails.push(`Tenure: ${tenureMonths} months`);
      } else if (tenureMonths < 12) {
        factors.tenureScore = 3;
        factors.tenureDetails.push(`Tenure: ${tenureMonths} months`);
      } else {
        factors.tenureScore = 0;
        factors.tenureDetails.push(`Loyal subscriber (${tenureMonths} months)`);
      }

      // ── Factor 4: Usage Engagement (15%) ──
      if (sub.lastAuthAt) {
        const daysSinceAuth = Math.floor((now.getTime() - new Date(sub.lastAuthAt).getTime()) / 86400000);
        if (daysSinceAuth > 30) {
          factors.engagementScore = 15;
          factors.engagementDetails.push(`No activity for ${daysSinceAuth} days`);
        } else if (daysSinceAuth > 14) {
          factors.engagementScore = 10;
          factors.engagementDetails.push(`Inactive for ${daysSinceAuth} days`);
        } else if (daysSinceAuth > 7) {
          factors.engagementScore = 5;
          factors.engagementDetails.push(`Last active ${daysSinceAuth} days ago`);
        } else {
          factors.engagementScore = 0;
          factors.engagementDetails.push(`Active (${daysSinceAuth}d ago)`);
        }
      } else {
        factors.engagementScore = 15;
        factors.engagementDetails.push("No RADIUS auth recorded");
      }

      // ── Factor 5: Balance Trend (15%) ──
      if (sub.balance < -2000) {
        factors.balanceScore = 15;
        factors.balanceDetails.push(`High negative balance (${formatBalance(sub.balance)})`);
      } else if (sub.balance < -1000) {
        factors.balanceScore = 12;
        factors.balanceDetails.push(`Negative balance (${formatBalance(sub.balance)})`);
      } else if (sub.balance < -500) {
        factors.balanceScore = 8;
        factors.balanceDetails.push(`Outstanding (${formatBalance(sub.balance)})`);
      } else if (sub.balance < 0) {
        factors.balanceScore = 4;
        factors.balanceDetails.push(`Slight outstanding (${formatBalance(sub.balance)})`);
      } else {
        factors.balanceScore = 0;
        factors.balanceDetails.push(`Healthy balance (${formatBalance(sub.balance)})`);
      }

      // Calculate weighted total
      const riskScore = Math.min(
        100,
        Math.round(
          factors.paymentScore +
          factors.complaintScore +
          factors.tenureScore +
          factors.engagementScore +
          factors.balanceScore
        )
      );

      // Determine risk level
      let riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      if (riskScore >= 75) riskLevel = "CRITICAL";
      else if (riskScore >= 60) riskLevel = "HIGH";
      else if (riskScore >= 40) riskLevel = "MEDIUM";
      else riskLevel = "LOW";

      return {
        id: sub.id,
        name: sub.name,
        email: sub.email,
        phone: sub.phone,
        planName: sub.Plan?.name || "No Plan",
        areaName: sub.Area?.name || "Unknown",
        riskScore,
        riskLevel,
        factors,
      };
    });

    // Sort by risk score descending
    predicted.sort((a, b) => b.riskScore - a.riskScore);

    // Summary
    const critical = predicted.filter((s) => s.riskLevel === "CRITICAL").length;
    const high = predicted.filter((s) => s.riskLevel === "HIGH").length;
    const medium = predicted.filter((s) => s.riskLevel === "MEDIUM").length;
    const low = predicted.filter((s) => s.riskLevel === "LOW").length;
    const avgScore = predicted.length > 0
      ? Math.round(predicted.reduce((sum, s) => sum + s.riskScore, 0) / predicted.length)
      : 0;

    return NextResponse.json({
      subscribers: predicted,
      summary: {
        critical,
        high,
        medium,
        low,
        avgScore,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Churn prediction API error:", error);
    return NextResponse.json(
      { error: "Failed to predict churn risk" },
      { status: 500 }
    );
  }
}

function formatBalance(balance: number): string {
  const prefix = balance < 0 ? "-" : "+";
  return `${prefix}₹${Math.abs(Math.round(balance)).toLocaleString("en-IN")}`;
}
