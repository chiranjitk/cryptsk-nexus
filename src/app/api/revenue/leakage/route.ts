import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── Types ──────────────────────────────────────────────────────────

interface LeakageItem {
  id: string;
  type: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  subscriberId: string;
  subscriberName: string;
  amount: number;
  description: string;
  date: string;
  referenceId: string;
  referenceNumber: string;
  autoFixable: boolean;
}

interface LeakageCategory {
  count: number;
  amount: number;
  severity: string;
  description: string;
}

// ── GET /api/revenue/leakage ───────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const now = new Date();
    const leakageItems: LeakageItem[] = [];
    const categories: Record<string, LeakageCategory> = {};

    // ══════════════════════════════════════════════════════════════
    // 1. UNREDEEMED VOUCHERS: ACTIVE vouchers past their validity period
    // ══════════════════════════════════════════════════════════════
    const activeVouchers = await db.voucher.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        code: true,
        denomination: true,
        validityDays: true,
        createdAt: true,
        usedBySubscriberId: true,
      },
    });

    for (const v of activeVouchers) {
      const expiryDate = new Date(v.createdAt.getTime() + v.validityDays * 24 * 60 * 60 * 1000);
      if (expiryDate < now) {
        const subscriber = v.usedBySubscriberId
          ? await db.subscriber.findUnique({ where: { id: v.usedBySubscriberId }, select: { name: true } })
          : null;

        leakageItems.push({
          id: `voucher-${v.id}`,
          type: "UNREDEEMED_VOUCHER",
          category: "Unredeemed Vouchers",
          severity: "MEDIUM",
          subscriberId: v.usedBySubscriberId || "",
          subscriberName: subscriber?.name || "Unassigned",
          amount: v.denomination,
          description: `Voucher ${v.code} (₹${v.denomination}) expired on ${expiryDate.toLocaleDateString("en-IN")} but still marked ACTIVE`,
          date: v.createdAt.toISOString(),
          referenceId: v.id,
          referenceNumber: v.code,
          autoFixable: true,
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // 2. UNUSED CREDITS: Credit notes not fully applied (status != USED)
    // ══════════════════════════════════════════════════════════════
    const creditNotes = await db.creditNote.findMany({
      where: {
        status: { not: "USED" },
      },
      select: {
        id: true,
        amount: true,
        reason: true,
        status: true,
        createdAt: true,
        invoiceId: true,
        Invoice: {
          select: {
            subscriberId: true,
            invoiceNumber: true,
            Subscriber: { select: { name: true } },
          },
        },
      },
    });

    for (const cn of creditNotes) {
      const severity = cn.amount >= 1000 ? "HIGH" : cn.amount >= 500 ? "MEDIUM" : "LOW";
      leakageItems.push({
        id: `credit-${cn.id}`,
        type: "UNUSED_CREDIT",
        category: "Unused Credits",
        severity: severity as LeakageItem["severity"],
        subscriberId: cn.Invoice.subscriberId,
        subscriberName: cn.Invoice.Subscriber.name,
        amount: cn.amount,
        description: `Credit note of ₹${cn.amount} (${cn.status}) — ${cn.reason || "No reason provided"}`,
        date: cn.createdAt.toISOString(),
        referenceId: cn.id,
        referenceNumber: cn.Invoice.invoiceNumber,
        autoFixable: false,
      });
    }

    // ══════════════════════════════════════════════════════════════
    // 3. OVERPAYMENT DETECTION: Payments > invoice totalAmount
    // ══════════════════════════════════════════════════════════════
    const paymentsWithInvoice = await db.payment.findMany({
      where: {
        invoiceId: { not: null },
        status: { in: ["PENDING", "VERIFIED"] },
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        invoiceId: true,
        subscriberId: true,
        Invoice: {
          select: {
            totalAmount: true,
            invoiceNumber: true,
            Subscriber: { select: { name: true } },
          },
        },
        Subscriber: { select: { name: true } },
      },
    });

    for (const p of paymentsWithInvoice) {
      if (p.Invoice && p.amount > p.Invoice.totalAmount && p.Invoice.totalAmount > 0) {
        const overpayment = p.amount - p.Invoice.totalAmount;
        leakageItems.push({
          id: `overpay-${p.id}`,
          type: "OVERPAYMENT",
          category: "Overpayment Detection",
          severity: overpayment >= 500 ? "HIGH" : "MEDIUM",
          subscriberId: p.subscriberId,
          subscriberName: p.Invoice.Subscriber.name,
          amount: overpayment,
          description: `Payment of ₹${p.amount} exceeds invoice ${p.Invoice.invoiceNumber} total of ₹${p.Invoice.totalAmount} by ₹${overpayment.toFixed(2)}`,
          date: p.createdAt.toISOString(),
          referenceId: p.id,
          referenceNumber: p.Invoice.invoiceNumber,
          autoFixable: false,
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // 4. UNDERPAYMENT TRACKING: Partial payments on OVERDUE invoices
    // ══════════════════════════════════════════════════════════════
    const underpaidInvoices = await db.invoice.findMany({
      where: {
        status: "OVERDUE",
        paidAmount: { gt: 0 },
        balanceAmount: { gt: 0 },
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        dueDate: true,
        issueDate: true,
        subscriberId: true,
        Subscriber: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    for (const inv of underpaidInvoices) {
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)));
      const severity = daysOverdue > 60 ? "CRITICAL" : daysOverdue > 30 ? "HIGH" : "MEDIUM";
      leakageItems.push({
        id: `underpay-${inv.id}`,
        type: "UNDERPAYMENT",
        category: "Underpayment Tracking",
        severity: severity as LeakageItem["severity"],
        subscriberId: inv.subscriberId,
        subscriberName: inv.Subscriber.name,
        amount: inv.balanceAmount,
        description: `Invoice ${inv.invoiceNumber}: ₹${inv.paidAmount} paid of ₹${inv.totalAmount}, balance ₹${inv.balanceAmount} — ${daysOverdue} days overdue`,
        date: inv.dueDate.toISOString(),
        referenceId: inv.id,
        referenceNumber: inv.invoiceNumber,
        autoFixable: false,
      });
    }

    // ══════════════════════════════════════════════════════════════
    // 5. DUPLICATE INVOICE RISK: Same subscriber, overlapping periods
    // ══════════════════════════════════════════════════════════════
    const allInvoices = await db.invoice.findMany({
      where: {
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        subscriberId: true,
        periodStart: true,
        periodEnd: true,
        Subscriber: { select: { name: true } },
      },
      orderBy: { issueDate: "desc" },
    });

    // Group by subscriber
    const subInvoiceMap = new Map<string, typeof allInvoices>();
    for (const inv of allInvoices) {
      const list = subInvoiceMap.get(inv.subscriberId) || [];
      list.push(inv);
      subInvoiceMap.set(inv.subscriberId, list);
    }

    const duplicateSet = new Set<string>();
    for (const [, invoices] of subInvoiceMap) {
      for (let i = 0; i < invoices.length; i++) {
        for (let j = i + 1; j < invoices.length; j++) {
          const a = invoices[i];
          const b = invoices[j];
          const aStart = new Date(a.periodStart).getTime();
          const aEnd = new Date(a.periodEnd).getTime();
          const bStart = new Date(b.periodStart).getTime();
          const bEnd = new Date(b.periodEnd).getTime();
          // Check overlap
          if (aStart <= bEnd && bStart <= aEnd) {
            const key = [a.id, b.id].sort().join("-");
            if (!duplicateSet.has(key)) {
              duplicateSet.add(key);
              leakageItems.push({
                id: `duplicate-${key}`,
                type: "DUPLICATE_INVOICE_RISK",
                category: "Duplicate Invoice Risk",
                severity: "HIGH",
                subscriberId: a.subscriberId,
                subscriberName: a.Subscriber.name,
                amount: Math.min(a.totalAmount, b.totalAmount),
                description: `Possible duplicate: ${a.invoiceNumber} and ${b.invoiceNumber} have overlapping billing periods (${new Date(a.periodStart).toLocaleDateString("en-IN")} → ${new Date(a.periodEnd).toLocaleDateString("en-IN")})`,
                date: now.toISOString(),
                referenceId: key,
                referenceNumber: `${a.invoiceNumber} / ${b.invoiceNumber}`,
                autoFixable: false,
              });
            }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // 6. DISCOUNT LEAKAGE: discountAmount > 20% of subtotal
    // ══════════════════════════════════════════════════════════════
    const highDiscountInvoices = await db.invoice.findMany({
      where: {
        subtotal: { gt: 0 },
        discountAmount: { gt: 0 },
      },
      select: {
        id: true,
        invoiceNumber: true,
        subtotal: true,
        discountAmount: true,
        totalAmount: true,
        issueDate: true,
        subscriberId: true,
        Subscriber: { select: { name: true } },
      },
    });

    for (const inv of highDiscountInvoices) {
      const discountPct = (inv.discountAmount / inv.subtotal) * 100;
      if (discountPct > 20) {
        leakageItems.push({
          id: `discount-${inv.id}`,
          type: "DISCOUNT_LEAKAGE",
          category: "Discount Leakage",
          severity: discountPct > 50 ? "CRITICAL" : discountPct > 35 ? "HIGH" : "MEDIUM",
          subscriberId: inv.subscriberId,
          subscriberName: inv.Subscriber.name,
          amount: inv.discountAmount,
          description: `Invoice ${inv.invoiceNumber}: ${discountPct.toFixed(1)}% discount (₹${inv.discountAmount} off ₹${inv.subtotal} subtotal) exceeds 20% threshold`,
          date: inv.issueDate.toISOString(),
          referenceId: inv.id,
          referenceNumber: inv.invoiceNumber,
          autoFixable: false,
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // 7. ZERO/LOW VALUE INVOICES: Active subscribers with very low invoices
    // ══════════════════════════════════════════════════════════════
    const activeSubscribers = await db.subscriber.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        planId: true,
        Plan: { select: { priceMonthly: true, name: true } },
        Invoice: {
          where: {
            status: { not: "CANCELLED" },
          },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            issueDate: true,
          },
          orderBy: { issueDate: "desc" },
          take: 1,
        },
      },
    });

    for (const sub of activeSubscribers) {
      if (!sub.Plan || sub.Plan.priceMonthly <= 0) continue;
      const latestInv = sub.invoices[0];
      if (!latestInv) continue;

      const halfPlan = sub.Plan.priceMonthly * 0.5;
      if (latestInv.totalAmount === 0 || latestInv.totalAmount < halfPlan) {
        leakageItems.push({
          id: `lowval-${latestInv.id}`,
          type: "ZERO_LOW_VALUE",
          category: "Zero/Low Value Invoices",
          severity: latestInv.totalAmount === 0 ? "CRITICAL" : "HIGH",
          subscriberId: sub.id,
          subscriberName: sub.name,
          amount: sub.Plan.priceMonthly - latestInv.totalAmount,
          description: `Latest invoice ${latestInv.invoiceNumber} is ₹${latestInv.totalAmount} — expected ≥₹${halfPlan.toFixed(0)} (50% of plan ₹${sub.Plan.priceMonthly})`,
          date: latestInv.issueDate.toISOString(),
          referenceId: latestInv.id,
          referenceNumber: latestInv.invoiceNumber,
          autoFixable: false,
        });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // 8. UNCOLLECTED PAYMENTS: PENDING > 30 days
    // ══════════════════════════════════════════════════════════════
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const uncollectedPayments = await db.payment.findMany({
      where: {
        status: "PENDING",
        createdAt: { lt: thirtyDaysAgo },
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        subscriberId: true,
        transactionRef: true,
        paymentMode: true,
        Subscriber: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    for (const p of uncollectedPayments) {
      const daysPending = Math.floor((now.getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const severity = daysPending > 90 ? "CRITICAL" : daysPending > 60 ? "HIGH" : "MEDIUM";
      leakageItems.push({
        id: `uncollected-${p.id}`,
        type: "UNCOLLECTED_PAYMENT",
        category: "Uncollected Payments",
        severity: severity as LeakageItem["severity"],
        subscriberId: p.subscriberId,
        subscriberName: p.Subscriber.name,
        amount: p.amount,
        description: `Payment of ₹${p.amount} (${p.paymentMode}) pending for ${daysPending} days — ${p.transactionRef || "No reference"}`,
        date: p.createdAt.toISOString(),
        referenceId: p.id,
        referenceNumber: p.transactionRef || p.id.slice(0, 8),
        autoFixable: false,
      });
    }

    // ══════════════════════════════════════════════════════════════
    // Build category summaries
    // ══════════════════════════════════════════════════════════════
    const categoryDescriptions: Record<string, string> = {
      "Unredeemed Vouchers": "Active vouchers past their validity period",
      "Unused Credits": "Credit notes issued but not applied",
      "Overpayment Detection": "Payments exceeding invoice totals",
      "Underpayment Tracking": "Partial payments on overdue invoices",
      "Duplicate Invoice Risk": "Overlapping billing periods detected",
      "Discount Leakage": "Discounts exceeding 20% threshold",
      "Zero/Low Value Invoices": "Invoices below 50% of plan price",
      "Uncollected Payments": "Pending payments older than 30 days",
    };

    for (const item of leakageItems) {
      if (!categories[item.category]) {
        categories[item.category] = {
          count: 0,
          amount: 0,
          severity: item.severity,
          description: categoryDescriptions[item.category] || "",
        };
      }
      categories[item.category].count += 1;
      categories[item.category].amount += item.amount;
      // Upgrade severity if this item is worse
      const severityOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      if (severityOrder.indexOf(item.severity) > severityOrder.indexOf(categories[item.category].severity)) {
        categories[item.category].severity = item.severity;
      }
    }

    const totalLeakage = leakageItems.reduce((sum, item) => sum + item.amount, 0);
    const criticalCount = leakageItems.filter((i) => i.severity === "CRITICAL").length;
    const highCount = leakageItems.filter((i) => i.severity === "HIGH").length;
    const autoFixableCount = leakageItems.filter((i) => i.autoFixable).length;
    const writeOffCandidates = leakageItems.filter(
      (i) => i.type === "UNDERPAYMENT" && i.severity === "CRITICAL"
    ).length;

    return NextResponse.json(
      {
        leakageItems,
        totalLeakage: Math.round(totalLeakage * 100) / 100,
        categories,
        summary: {
          totalItems: leakageItems.length,
          totalLeakage: Math.round(totalLeakage * 100) / 100,
          criticalCount,
          highCount,
          mediumCount: leakageItems.filter((i) => i.severity === "MEDIUM").length,
          lowCount: leakageItems.filter((i) => i.severity === "LOW").length,
          autoFixableCount,
          writeOffCandidates,
        },
        timestamp: now.toISOString(),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Revenue leakage detection failed:", error);
    return NextResponse.json(
      { error: "Failed to detect revenue leakage" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ── POST: Auto-fix simple items (expired vouchers) ─────────────────

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { itemIds } = body as { itemIds: string[] };

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json(
        { error: "itemIds must be a non-empty array" },
        { status: 400, headers: corsHeaders }
      );
    }

    let fixedCount = 0;
    for (const itemId of itemIds) {
      if (itemId.startsWith("voucher-")) {
        const voucherId = itemId.replace("voucher-", "");
        await db.voucher.update({
          where: { id: voucherId },
          data: { status: "EXPIRED" },
        });
        fixedCount++;
      }
    }

    return NextResponse.json(
      { success: true, fixedCount, message: `Fixed ${fixedCount} item(s)` },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Auto-fix failed:", error);
    return NextResponse.json(
      { error: "Failed to auto-fix items" },
      { status: 500, headers: corsHeaders }
    );
  }
}
