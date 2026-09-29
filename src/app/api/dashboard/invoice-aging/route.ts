import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/invoice-aging — Invoice aging buckets, DSO, collection efficiency
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 30 days ago for DSO calculation
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch invoices with subscriber info (limited to prevent memory issues)
    const invoices = await db.invoice.findMany({
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        grandTotal: true,
        paidAmount: true,
        balanceAmount: true,
        status: true,
        paidAt: true,
        Subscriber: {
          select: {
            name: true,
          },
        },
      },
      take: 50000,
      orderBy: { createdAt: "desc" },
    });

    // ── Aging bucket computation ──

    const bucketDefs = [
      { label: "Current", daysMin: 0, daysMax: 0, statuses: ["SENT", "DRAFT"] as string[] },
      { label: "1-30 Days", daysMin: 1, daysMax: 30, statuses: ["OVERDUE"] as string[] },
      { label: "31-60 Days", daysMin: 31, daysMax: 60, statuses: ["OVERDUE"] as string[] },
      { label: "61-90 Days", daysMin: 61, daysMax: 90, statuses: ["OVERDUE"] as string[] },
      { label: "90+ Days", daysMin: 91, daysMax: Infinity, statuses: ["OVERDUE"] as string[] },
    ];

    type BucketResult = {
      label: string;
      daysMin: number;
      daysMax: number;
      count: number;
      totalAmount: number;
      totalBalance: number;
    };

    const buckets: BucketResult[] = bucketDefs.map((def) => ({
      ...def,
      count: 0,
      totalAmount: 0,
      totalBalance: 0,
    }));

    // Top overdue invoices (sorted by balance desc)
    const overdueInvoices: {
      invoiceNumber: string;
      subscriberName: string;
      balance: number;
      dueDate: Date;
      daysOverdue: number;
    }[] = [];

    let totalPaidAmount = 0;
    let totalInvoiceAmount = 0;
    let totalOutstanding = 0;
    let paidLast30Days = 0;

    for (const inv of invoices) {
      // Accumulate totals across all invoices
      totalPaidAmount += inv.paidAmount;
      totalInvoiceAmount += inv.grandTotal;

      // Paid in last 30 days (for DSO denominator)
      if (inv.paidAt && inv.paidAt >= thirtyDaysAgo && inv.paidAmount > 0) {
        paidLast30Days += inv.paidAmount;
      }

      const dueDate = new Date(inv.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const isOverdue = dueDate <= today;
      const daysOverdue = isOverdue
        ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

      // Classify into aging buckets
      for (const bucket of buckets) {
        if (bucket.label === "Current") {
          // Current: not yet due AND status is SENT or DRAFT
          if (!isOverdue && bucket.statuses.includes(inv.status)) {
            bucket.count += 1;
            bucket.totalAmount += inv.grandTotal;
            bucket.totalBalance += inv.balanceAmount;
          }
        } else {
          // Overdue buckets: status must be OVERDUE and days overdue falls in range
          if (
            inv.status === "OVERDUE" &&
            daysOverdue >= bucket.daysMin &&
            daysOverdue <= bucket.daysMax
          ) {
            bucket.count += 1;
            bucket.totalAmount += inv.grandTotal;
            bucket.totalBalance += inv.balanceAmount;
          }
        }
      }

      // Track outstanding amounts
      if (isOverdue && (inv.status === "OVERDUE" || inv.status === "PARTIALLY_PAID")) {
        totalOutstanding += inv.balanceAmount;
      }

      // Collect overdue invoices for top 5
      if (inv.status === "OVERDUE" && inv.balanceAmount > 0) {
        overdueInvoices.push({
          invoiceNumber: inv.invoiceNumber,
          subscriberName: inv.Subscriber?.name ?? "Unknown",
          balance: inv.balanceAmount,
          dueDate: inv.dueDate,
          daysOverdue,
        });
      }
    }

    // Also add current bucket balance to total outstanding
    const currentBucket = buckets[0];
    totalOutstanding += currentBucket.totalBalance;

    // Sort overdue invoices by balance descending and take top 5
    overdueInvoices.sort((a, b) => b.balance - a.balance);
    const topOverdue = overdueInvoices.slice(0, 5);

    // ── DSO Calculation ──
    // DSO = totalAccountsReceivable / (totalRevenueLast30Days / 30)
    const dailyRevenue = paidLast30Days > 0 ? paidLast30Days / 30 : 0;
    const dso = dailyRevenue > 0 ? Math.round(totalOutstanding / dailyRevenue) : 0;

    // ── Collection Efficiency ──
    const collectionEfficiency =
      totalInvoiceAmount > 0
        ? Math.round((totalPaidAmount / totalInvoiceAmount) * 1000) / 10
        : 0;

    return NextResponse.json({
      buckets,
      dso: {
        days: dso,
        trend: "neutral" as const,
      },
      collectionEfficiency,
      totalOutstanding,
      topOverdue: topOverdue.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        subscriberName: inv.subscriberName,
        balance: inv.balance,
        dueDate: inv.dueDate,
        daysOverdue: inv.daysOverdue,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[GET /api/dashboard/invoice-aging]", error);
    return NextResponse.json(
      { error: "Failed to fetch invoice aging data" },
      { status: 500 }
    );
  }
}
