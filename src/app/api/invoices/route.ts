import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, permissionFor, AuthError } from "@/lib/api-auth";
import { nextInvoiceNumber } from "@/lib/invoice-number";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status");
    const subscriberId = searchParams.get("subscriberId");
    const areaId = searchParams.get("areaId");
    const planId = searchParams.get("planId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "25");
    const countsOnly = searchParams.get("countsOnly") === "true";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const where: Record<string, unknown> = {};

    if (status && status !== "ALL") {
      where.status = status;
    }
    if (subscriberId) {
      where.subscriberId = subscriberId;
    }
    if (areaId) {
      where.Subscriber = { ...where.Subscriber as Record<string, unknown>, areaId };
    }
    if (planId) {
      where.planId = planId;
    }

    if (startDate && endDate) {
      where.issueDate = { gte: new Date(startDate), lte: new Date(endDate) };
    } else if (startDate) {
      where.issueDate = { gte: new Date(startDate) };
    } else if (endDate) {
      where.issueDate = { lte: new Date(endDate) };
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
        { Subscriber: { phone: { contains: search } } },
      ];
    }

    // Auto-mark overdue invoices
    const now = new Date();
    await db.invoice.updateMany({
      where: {
        dueDate: { lt: now },
        status: { notIn: ["PAID", "OVERDUE"] },
      },
      data: { status: "OVERDUE" },
    });

    // Global status counts (unfiltered by search but after overdue update)
    const statusGroups = await db.invoice.groupBy({
      by: ["status"],
      _count: { status: true },
    });
    const globalCounts: Record<string, number> = {
      DRAFT: 0, SENT: 0, PAID: 0, PARTIALLY_PAID: 0, OVERDUE: 0, CANCELLED: 0,
    };
    for (const sg of statusGroups) {
      globalCounts[sg.status] = sg._count.status;
    }

    // Global aggregate totals
    const globalTotals = await db.invoice.aggregate({
      _sum: { grandTotal: true, paidAmount: true, balanceAmount: true },
    });

    if (countsOnly) {
      return NextResponse.json({
        statusCounts: globalCounts,
        totalInvoices: Object.values(globalCounts).reduce((a, b) => a + b, 0),
        totalRevenue: Math.round(globalTotals._sum.grandTotal || 0),
        totalCollected: Math.round(globalTotals._sum.paidAmount || 0),
        totalOutstanding: Math.round(globalTotals._sum.balanceAmount || 0),
      });
    }

    // Build orderBy
    const allowedSortFields = ["invoiceNumber", "issueDate", "dueDate", "grandTotal", "createdAt", "status", "balanceAmount"];
    const field = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = sortOrder === "asc" ? "asc" : "desc";
    const orderBy = { [field]: order };

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where,
        include: {
          Subscriber: {
            select: { id: true, name: true, code: true, phone: true, Area: { select: { id: true, name: true } } },
          },
          Plan: { select: { id: true, name: true } },
          Payment: { select: { id: true, amount: true, status: true, paymentMode: true, createdAt: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.invoice.count({ where }),
    ]);

    return NextResponse.json({
      invoices: invoices.map((inv) => ({
        ...inv,
        subscriber: inv.Subscriber ? {
          ...inv.Subscriber,
          area: inv.Subscriber.Area,
          Area: undefined,
        } : null,
        plan: inv.Plan,
        payments: inv.Payment,
        Subscriber: undefined,
        Plan: undefined,
        Payment: undefined,
      })),
      total, page, limit,
      totalPages: Math.ceil(total / limit),
      statusCounts: globalCounts,
      totalRevenue: Math.round(globalTotals._sum.grandTotal || 0),
      totalCollected: Math.round(globalTotals._sum.paidAmount || 0),
      totalOutstanding: Math.round(globalTotals._sum.balanceAmount || 0),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Invoices GET error:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

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
    // [AUDIT-FIX F-20] Creating invoices is a billing action — viewers/agents cannot
    await permissionFor(userId, 'invoices.create');
    const body = await req.json();
    const { subscriberId, planId, issueDate, dueDate, periodStart, periodEnd, billingPeriodStart, billingPeriodEnd, description, discountType, discountValue, lateFee, advanceAdjustment, notes, status: requestedStatus, isProRata, lineItems, items, cgstRate: cgstRateOverride, sgstRate: sgstRateOverride, igstRate: igstRateOverride, reverseCharge } = body;

    // Accept 'items' as alias for 'lineItems'
    const effectiveLineItems = (lineItems && Array.isArray(lineItems) && lineItems.length > 0)
      ? lineItems
      : (items && Array.isArray(items) && items.length > 0 ? items : null);

    // Auto-fill periodStart/periodEnd if not provided
    const effectiveIssueDate = issueDate || new Date().toISOString().split('T')[0];
    const effectiveDueDate = dueDate || new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const effectivePeriodStart = periodStart || billingPeriodStart || effectiveIssueDate;
    const effectivePeriodEnd = periodEnd || billingPeriodEnd || new Date(new Date(effectiveIssueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (!subscriberId) {
      return NextResponse.json({ error: "Missing required field: subscriberId" }, { status: 400 });
    }

    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      include: { Plan: true },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const effectivePlanId = planId || subscriber.planId;
    let plan: any = null;
    if (effectivePlanId) {
      plan = await db.plan.findUnique({ where: { id: effectivePlanId } });
    }

    let subtotal = plan ? plan.priceMonthly : 0;
    const proRataDays = isProRata ? calculateProRataDays(subscriber) : 0;

    if (isProRata && proRataDays > 0 && plan) {
      const fullDays = plan.validityDays || 30;
      subtotal = Math.round((plan.priceMonthly * proRataDays) / fullDays);
    }

    // Add line items amounts
    if (effectiveLineItems && effectiveLineItems.length > 0) {
      const lineItemsTotal = effectiveLineItems.reduce((sum: number, item: { amount?: number; quantity?: number; rate?: number }) => {
        return sum + (item.amount || (item.quantity || 1) * (item.rate || 0));
      }, 0);
      subtotal += lineItemsTotal;
    }

    // Use per-invoice tax rate overrides if provided, otherwise fall back to plan defaults
    const cgstPercent = cgstRateOverride !== undefined && cgstRateOverride !== null && cgstRateOverride !== '' ? parseFloat(cgstRateOverride) : (plan ? plan.cgstPercent : 9);
    const sgstPercent = sgstRateOverride !== undefined && sgstRateOverride !== null && sgstRateOverride !== '' ? parseFloat(sgstRateOverride) : (plan ? plan.sgstPercent : 9);
    const igstPercent = igstRateOverride !== undefined && igstRateOverride !== null && igstRateOverride !== '' ? parseFloat(igstRateOverride) : (plan ? plan.igstPercent : 0);

    const cgstAmount = Math.round(subtotal * cgstPercent) / 100;
    const sgstAmount = Math.round(subtotal * sgstPercent) / 100;
    const igstAmount = Math.round(subtotal * igstPercent) / 100;
    const totalTax = cgstAmount + sgstAmount + igstAmount;

    let discountAmount = 0;
    if (discountType === "PERCENTAGE" && discountValue > 0) {
      discountAmount = Math.round((subtotal * discountValue) / 100);
    } else if (discountType === "FLAT" && discountValue > 0) {
      discountAmount = discountValue;
    }

    const totalAmount = subtotal + totalTax;
    const grandTotal = Math.round((totalAmount - discountAmount + (lateFee || 0) - (advanceAdjustment || 0)) * 100) / 100;

    // Generate invoice number with retry for concurrent safety
    let invoiceNumber = '';
    let invoice: any = null;
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // [AUDIT-FIX F-12] Shared allocator — scans ALL historic INV-<digits> numbers
      // (previously only the latest row was inspected, which missed older formats).
      invoiceNumber = await nextInvoiceNumber();
      try {
        invoice = await db.invoice.create({
          data: {
            invoiceNumber,
            subscriberId,
            planId: effectivePlanId,
            issueDate: new Date(effectiveIssueDate),
            dueDate: new Date(effectiveDueDate),
            periodStart: new Date(effectivePeriodStart),
            periodEnd: new Date(effectivePeriodEnd),
            description: description || `Invoice for ${subscriber.name}`,
            subtotal,
            cgstAmount,
            sgstAmount,
            igstAmount,
            totalTax,
            totalAmount,
            discountType: discountType || null,
            discountValue: discountValue || 0,
            discountAmount,
            lateFee: lateFee || 0,
            advanceAdjustment: advanceAdjustment || 0,
            grandTotal: Math.max(0, grandTotal),
            status: requestedStatus || "DRAFT",
            notes: notes || "",
            isProRata: !!isProRata,
            proRataDays,
            cgstRate: cgstPercent,
            sgstRate: sgstPercent,
            igstRate: igstPercent,
            reverseCharge: !!reverseCharge,
            InvoiceLineItem: effectiveLineItems && effectiveLineItems.length > 0 ? {
              create: effectiveLineItems.map((item: { description?: string; quantity?: number; rate?: number; amount?: number }, idx: number) => ({
                description: item.description || "",
                quantity: item.quantity || 1,
                rate: item.rate || 0,
                amount: item.amount || (item.quantity || 1) * (item.rate || 0),
                sortOrder: idx,
              })),
            } : undefined,
          },
          include: {
            Subscriber: { select: { id: true, name: true, code: true, phone: true } },
            Plan: { select: { id: true, name: true } },
            InvoiceLineItem: true,
          },
        });
        break; // success
      } catch (createError: any) {
        // If unique constraint violation on invoiceNumber, retry
        if (createError?.code === 'P2002' && attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
          continue;
        }
        throw createError;
      }
    }

    await auditCreate(req, "Invoice", invoice.id, { invoiceNumber, subscriberId, grandTotal }, { userId });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Invoices POST error:", error);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}

function calculateProRataDays(subscriber: { activationDate?: Date | null; billingStartDate?: Date | null }): number {
  const refDate = subscriber.billingStartDate || subscriber.activationDate;
  if (!refDate) return 0;
  const now = new Date();
  const activation = new Date(refDate);
  if (activation > now) return 0;
  const diffMs = now.getTime() - activation.getTime();
  const daysSinceActivation = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const daysInMonth = 30;
  const remainingDays = daysInMonth - (daysSinceActivation % daysInMonth);
  return remainingDays > 0 ? remainingDays : daysInMonth;
}
