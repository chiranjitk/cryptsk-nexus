import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── CORS Headers ────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── Types ──────────────────────────────────────────────────────────

interface SmartSubscriber {
  subscriberId: string;
  subscriberName: string;
  phone: string;
  email: string;
  planName: string;
  totalOutstanding: number;
  daysOverdue: number;
  collectionProbability: number;
  probabilityLabel: string;
  avgDaysToPay: number;
  bestChannel: string;
  bestChannelLabel: string;
  bestTime: string;
  invoiceCount: number;
  collectionPriority: number; // amount * probability — higher = more important
}

interface SmartCollectionResponse {
  subscribers: SmartSubscriber[];
  summary: {
    totalOverdueAmount: number;
    totalOverdueSubscribers: number;
    avgDaysOverdue: number;
    avgCollectionProbability: number;
    highProbabilityCount: number;
    mediumProbabilityCount: number;
    lowProbabilityCount: number;
    veryLowProbabilityCount: number;
    totalRecoverableEstimate: number;
  };
  timestamp: string;
}

// ── Helper: Determine collection probability ──────────────────────

function getCollectionProbability(avgDaysToPay: number): { probability: number; label: string } {
  if (avgDaysToPay <= 0) return { probability: 15, label: "VERY LOW" };
  if (avgDaysToPay <= 7) return { probability: 85, label: "HIGH" };
  if (avgDaysToPay <= 14) return { probability: 65, label: "MEDIUM" };
  if (avgDaysToPay <= 30) return { probability: 35, label: "LOW" };
  return { probability: 15, label: "VERY LOW" };
}

// ── Helper: Map payment mode to best contact channel ───────────────

function getBestChannel(modeCounts: Record<string, number>): { channel: string; label: string } {
  if (!modeCounts || Object.keys(modeCounts).length === 0) {
    return { channel: "SMS", label: "SMS" };
  }

  const channelMap: Record<string, string> = {
    UPI: "WhatsApp",
    ONLINE: "Email",
    BANK_TRANSFER: "Email",
    CASH: "SMS",
    CHEQUE: "SMS",
    WALLET: "WhatsApp",
  };

  const sortedModes = Object.entries(modeCounts).sort(([, a], [, b]) => b - a);
  const topMode = sortedModes[0][0];

  // If UPI or WALLET is the most used, they probably have WhatsApp
  if ((modeCounts["UPI"] || 0) + (modeCounts["WALLET"] || 0) > (modeCounts["CASH"] || 0)) {
    return { channel: "WhatsApp", label: "WhatsApp" };
  }
  if ((modeCounts["ONLINE"] || 0) + (modeCounts["BANK_TRANSFER"] || 0) > (modeCounts["CASH"] || 0)) {
    return { channel: "Email", label: "Email" };
  }

  return { channel: channelMap[topMode] || "SMS", label: channelMap[topMode] || "SMS" };
}

// ── Helper: Determine best contact time ────────────────────────────

function getBestTime(Payment: { createdAt: Date }[]): string {
  if (payments.length === 0) return "10:00 AM";

  // Count by hour of day
  const hourCounts: Record<number, number> = {};
  for (const p of payments) {
    const hour = new Date(p.createdAt).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }

  // Find the peak hour
  let peakHour = 10;
  let maxCount = 0;
  for (const [hour, count] of Object.entries(hourCounts)) {
    if (count > maxCount) {
      maxCount = count;
      peakHour = parseInt(hour, 10);
    }
  }

  // Convert to readable time
  if (peakHour === 0) return "12:00 AM";
  if (peakHour < 12) return `${peakHour}:00 AM`;
  if (peakHour === 12) return "12:00 PM";
  return `${peakHour - 12}:00 PM`;
}

// ── GET /api/collections/smart ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();

    // 1. Fetch all overdue invoices with subscriber and plan info
    const overdueInvoices = await db.invoice.findMany({
      where: {
        status: "OVERDUE",
        balanceAmount: { gt: 0 },
      },
      select: {
        id: true,
        subscriberId: true,
        totalAmount: true,
        balanceAmount: true,
        dueDate: true,
        issueDate: true,
        invoiceNumber: true,
        Subscriber: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            Plan: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    if (overdueInvoices.length === 0) {
      return NextResponse.json(
        {
          subscribers: [],
          summary: {
            totalOverdueAmount: 0,
            totalOverdueSubscribers: 0,
            avgDaysOverdue: 0,
            avgCollectionProbability: 0,
            highProbabilityCount: 0,
            mediumProbabilityCount: 0,
            lowProbabilityCount: 0,
            veryLowProbabilityCount: 0,
            totalRecoverableEstimate: 0,
          },
          timestamp: now.toISOString(),
        },
        { headers: corsHeaders }
      );
    }

    // 2. Group invoices by subscriberId
    const subscriberMap = new Map<string, typeof overdueInvoices>();
    for (const inv of overdueInvoices) {
      const existing = subscriberMap.get(inv.subscriberId) || [];
      existing.push(inv);
      subscriberMap.set(inv.subscriberId, existing);
    }

    // 3. Fetch payment history for all overdue subscribers
    const subscriberIds = Array.from(subscriberMap.keys());
    const allPayments = await db.payment.findMany({
      where: {
        subscriberId: { in: subscriberIds },
        status: "VERIFIED",
        invoiceId: { not: null },
      },
      select: {
        subscriberId: true,
        amount: true,
        paymentMode: true,
        createdAt: true,
        invoiceId: true,
        Invoice: {
          select: {
            issueDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 4. Group payments by subscriber
    const paymentMap = new Map<string, typeof allPayments>();
    for (const p of allPayments) {
      const existing = paymentMap.get(p.subscriberId) || [];
      existing.push(p);
      paymentMap.set(p.subscriberId, existing);
    }

    // 5. Build smart collection data for each subscriber
    const smartSubscribers: SmartSubscriber[] = [];
    let totalOverdueAmount = 0;
    let totalProbabilitySum = 0;
    let totalDaysOverdueSum = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let veryLowCount = 0;

    for (const [subId, invoices] of subscriberMap) {
      const sub = invoices[0].Subscriber;
      const payments = paymentMap.get(subId) || [];

      // Total outstanding amount
      const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);

      // Max days overdue (worst case)
      const maxDaysOverdue = Math.max(
        ...invoices.map((inv) => Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))))
      );

      // Average days to pay (from issueDate to payment createdAt)
      const paymentsWithIssue = payments.filter((p) => p.Invoice?.issueDate);
      let avgDaysToPay = 30; // default
      if (paymentsWithIssue.length > 0) {
        const totalDays = paymentsWithIssue.reduce((sum, p) => {
          const issueDate = new Date(p.invoice!.issueDate);
          const payDate = new Date(p.createdAt);
          const days = Math.max(0, Math.floor((payDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)));
          return sum + days;
        }, 0);
        avgDaysToPay = totalDays / paymentsWithIssue.length;
      }

      // Collection probability
      const { probability, label } = getCollectionProbability(avgDaysToPay);

      // Payment mode counts
      const modeCounts: Record<string, number> = {};
      for (const p of payments) {
        modeCounts[p.paymentMode] = (modeCounts[p.paymentMode] || 0) + 1;
      }
      const bestChannel = getBestChannel(modeCounts);

      // Best contact time
      const bestTime = getBestTime(payments);

      // Collection priority score: amount * probability (weighted)
      const collectionPriority = totalOutstanding * (probability / 100);

      // Tally summary stats
      totalOverdueAmount += totalOutstanding;
      totalProbabilitySum += probability;
      totalDaysOverdueSum += maxDaysOverdue;

      if (label === "HIGH") highCount++;
      else if (label === "MEDIUM") mediumCount++;
      else if (label === "LOW") lowCount++;
      else veryLowCount++;

      smartSubscribers.push({
        subscriberId: sub.id,
        subscriberName: sub.name,
        phone: sub.phone,
        email: sub.email,
        planName: sub.Plan?.name || "N/A",
        totalOutstanding,
        daysOverdue: maxDaysOverdue,
        collectionProbability: probability,
        probabilityLabel: label,
        avgDaysToPay: Math.round(avgDaysToPay),
        bestChannel: bestChannel.channel,
        bestChannelLabel: bestChannel.label,
        bestTime,
        invoiceCount: invoices.length,
        collectionPriority: Math.round(collectionPriority * 100) / 100,
      });
    }

    // 6. Sort by collection priority (highest first)
    smartSubscribers.sort((a, b) => b.collectionPriority - a.collectionPriority);

    // 7. Build response
    const subCount = smartSubscribers.length;
    const response: SmartCollectionResponse = {
      subscribers: smartSubscribers,
      summary: {
        totalOverdueAmount: Math.round(totalOverdueAmount * 100) / 100,
        totalOverdueSubscribers: subCount,
        avgDaysOverdue: subCount > 0 ? Math.round(totalDaysOverdueSum / subCount) : 0,
        avgCollectionProbability: subCount > 0 ? Math.round(totalProbabilitySum / subCount) : 0,
        highProbabilityCount: highCount,
        mediumProbabilityCount: mediumCount,
        lowProbabilityCount: lowCount,
        veryLowProbabilityCount: veryLowCount,
        totalRecoverableEstimate: Math.round(totalOverdueAmount * (totalProbabilitySum / subCount / 100) * 100) / 100,
      },
      timestamp: now.toISOString(),
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Smart collection analysis failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch smart collection analysis" },
      { status: 500, headers: corsHeaders }
    );
  }
}
