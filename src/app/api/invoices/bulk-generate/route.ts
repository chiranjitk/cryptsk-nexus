import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      userId = await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const body = await req.json();
    const { areaId, planId, filterType, issueDate, dueDate, periodStart, periodEnd, billingPeriodStart, billingPeriodEnd, status: requestedStatus } = body;

    // Accept billingPeriodStart/billingPeriodEnd as aliases for periodStart/periodEnd
    const effectivePeriodStart = periodStart || billingPeriodStart;
    const effectivePeriodEnd = periodEnd || billingPeriodEnd;

    // Build subscriber query
    const subWhere: Record<string, unknown> = { status: "ACTIVE" };
    if (areaId) subWhere.areaId = areaId;
    if (planId) subWhere.planId = planId;

    const subscribers = await db.subscriber.findMany({
      where: subWhere,
      include: { Plan: true },
    });

    if (subscribers.length === 0) {
      return NextResponse.json({ error: "No active subscribers found matching criteria", created: 0 }, { status: 400 });
    }

    const results: { invoiceNumber: string; subscriberId: string; subscriberName: string; error?: string }[] = [];
    const today = new Date();
    const issue = issueDate ? new Date(issueDate) : today;
    const due = dueDate ? new Date(dueDate) : new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);
    const pStart = effectivePeriodStart ? new Date(effectivePeriodStart) : today;
    const pEnd = effectivePeriodEnd ? new Date(effectivePeriodEnd) : new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Duplicate period prevention: reject if invoices already exist for this exact period
    const existingPeriodInvoices = await db.invoice.count({
      where: {
        periodStart: pStart,
        periodEnd: pEnd,
      },
    });
    if (existingPeriodInvoices > 0) {
      return NextResponse.json({
        error: `Invoices already exist for period ${effectivePeriodStart || pStart.toISOString().split('T')[0]} to ${effectivePeriodEnd || pEnd.toISOString().split('T')[0]}. ${existingPeriodInvoices} invoice(s) found.`,
        existingCount: existingPeriodInvoices,
      }, { status: 409 });
    }

    const count = await db.invoice.count();

    // Use timestamp-based prefix to prevent race condition duplicates
    const baseNumber = count + 1;
    const prefix = `INV-${Date.now().toString(36).toUpperCase()}-`;

    for (const sub of subscribers) {
      try {
        const plan = sub.Plan;
        const subtotal = plan ? plan.priceMonthly : 0;
        const cgstPercent = plan ? plan.cgstPercent : 9;
        const sgstPercent = plan ? plan.sgstPercent : 9;
        const igstPercent = plan ? plan.igstPercent : 0;

        const cgstAmount = Math.round(subtotal * cgstPercent) / 100;
        const sgstAmount = Math.round(subtotal * sgstPercent) / 100;
        const igstAmount = Math.round(subtotal * igstPercent) / 100;
        const totalTax = cgstAmount + sgstAmount + igstAmount;
        const grandTotal = Math.max(0, Math.round((subtotal + totalTax) * 100) / 100);

        const successIndex = results.filter(r => !r.error).length;
        const invoiceNumber = `${prefix}${String(baseNumber + successIndex).padStart(5, "0")}`;

        await db.invoice.create({
          data: {
            invoiceNumber,
            subscriberId: sub.id,
            planId: sub.planId,
            issueDate: issue,
            dueDate: due,
            periodStart: pStart,
            periodEnd: pEnd,
            description: `Invoice for ${sub.name}`,
            subtotal,
            cgstAmount,
            sgstAmount,
            igstAmount,
            totalTax,
            totalAmount: subtotal + totalTax,
            grandTotal,
            balanceAmount: grandTotal,
            status: requestedStatus || "DRAFT",
            notes: `Bulk generated - ${filterType || "all active"}`,
          },
        });

        results.push({ invoiceNumber, subscriberId: sub.id, subscriberName: sub.name });
      } catch (err: unknown) {
        console.error("[Bulk Generate] Invoice error for subscriber:", sub.id, err);
        results.push({ invoiceNumber: "", subscriberId: sub.id, subscriberName: sub.name, error: "Failed to generate invoice" });
      }
    }

    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;

    return NextResponse.json({
      message: `Bulk generation complete`,
      created: successCount,
      failed: errorCount,
      results,
    });
  } catch (error) {
    console.error("Bulk generate error:", error);
    return NextResponse.json({ error: "Failed to bulk generate invoices" }, { status: 500 });
  }
}
