import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate, auditUpdate, auditDelete } from "@/lib/services/audit-service";

const PAGE_SIZE = 15;

function calculateCommission(method: string, rate: number, subscriberCount: number, totalRevenue: number, flatAmount?: number): number {
  switch (method) {
    case "PERCENTAGE": return Math.round(totalRevenue * (rate / 100));
    case "FLAT": return Math.round((flatAmount || 0) * subscriberCount);
    case "SLAB": {
      if (subscriberCount < 50) return Math.round(totalRevenue * (10 / 100));
      if (subscriberCount < 100) return Math.round(totalRevenue * (12 / 100));
      if (subscriberCount < 500) return Math.round(totalRevenue * (15 / 100));
      return Math.round(totalRevenue * (18 / 100));
    }
    default: return Math.round(totalRevenue * (rate / 100));
  }
}

// GET /api/reseller
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const type = searchParams.get("type") || "resellers";
    const page = type === "resellers" || type === "commission" ? Math.max(1, parseInt(searchParams.get("page") || "1", 10)) : 1;
    const resellerId = searchParams.get("resellerId") || "";

    if (type === "stats") {
      const [totalResellers, activeResellers] = await Promise.all([db.reseller.count(), db.reseller.count({ where: { status: "ACTIVE" } })]);
      const commissionAgg = await db.reseller.aggregate({ _sum: { totalCommission: true } });
      return NextResponse.json({ totalResellers, activeResellers, commissionPaid: commissionAgg._sum.totalCommission || 0 });
    }

    // Commission Settings (global ISP config)
    if (type === "commission-settings") {
      const ispSettings = await db.ispSettings.findUnique({ where: { id: "default" } });
      let config = { defaultRate: 12, slab1: { max: 50, rate: 10 }, slab2: { min: 50, max: 100, rate: 12 }, slab3: { min: 100, max: 500, rate: 15 }, slab4: { min: 500, rate: 18 }, cycle: "Monthly", minPayout: 5000 };
      if (ispSettings?.commissionConfig) {
        try { config = { ...config, ...JSON.parse(ispSettings.commissionConfig) }; } catch { /* ignore */ }
      }
      return NextResponse.json({ settings: config });
    }

    // Subscribers per reseller
    if (type === "subscribers" && resellerId) {
      const reseller = await db.reseller.findUnique({ where: { id: resellerId } });
      if (!reseller) return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
      let areaIds: string[] = [];
      try { areaIds = JSON.parse(reseller.areaIds) as string[]; } catch { /* ignore */ }
      const subscribers = areaIds.length > 0
        ? await db.subscriber.findMany({ where: { areaId: { in: areaIds } }, select: { id: true, name: true, phone: true, email: true, status: true, balance: true, createdAt: true, Plan: { select: { name: true, priceMonthly: true } } }, orderBy: { createdAt: "desc" }, take: 100 })
        : await db.subscriber.findMany({ select: { id: true, name: true, phone: true, email: true, status: true, balance: true, createdAt: true, Plan: { select: { name: true, priceMonthly: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
      return NextResponse.json({ subscribers });
    }

    // Complaints/tickets for reseller
    if (type === "tickets" && resellerId) {
      const reseller = await db.reseller.findUnique({ where: { id: resellerId } });
      if (!reseller) return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
      let areaIds: string[] = [];
      try { areaIds = JSON.parse(reseller.areaIds) as string[]; } catch { /* ignore */ }
      const tickets = areaIds.length > 0
        ? await db.complaint.findMany({ where: { areaId: { in: areaIds } }, include: { Subscriber: { select: { id: true, name: true } }, Area: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 50 })
        : [];
      return NextResponse.json({ tickets });
    }

    // Activity / Audit log
    if (type === "activity" && resellerId) {
      const logs = await db.auditLog.findMany({ where: { entity: "Reseller", entityId: resellerId }, orderBy: { timestamp: "desc" }, take: 50 });
      return NextResponse.json({ logs: logs.map((l) => ({ ...l, createdAt: l.timestamp.toISOString() })) });
    }

    // Sub-resellers (children)
    if (type === "sub-resellers" && resellerId) {
      const children = await db.reseller.findMany({
        where: { parentId: resellerId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const allAreaIds = children.flatMap((r) => { try { return JSON.parse(r.areaIds) as string[]; } catch { return []; } });
      const areas = allAreaIds.length > 0 ? await db.area.findMany({ where: { id: { in: allAreaIds } }, select: { id: true, name: true } }) : [];
      const mapped = children.map((r) => {
        let areaName = "";
        try { const ids = JSON.parse(r.areaIds) as string[]; areaName = ids.map((id) => areas.find((a) => a.id === id)?.name).filter(Boolean).join(", ") || ""; } catch { /* ignore */ }
        return {
          id: r.id, name: r.name, phone: r.phone, email: r.email, status: r.status,
          subscriberCount: r.totalSubscribers, commissionEarned: r.totalCommission,
          assignedArea: areaName, joinedDate: r.createdAt.toISOString().split("T")[0],
        };
      });
      return NextResponse.json({ subResellers: mapped });
    }

    // Calculate Commission
    if (type === "calculate-commission" && resellerId) {
      const reseller = await db.reseller.findUnique({ where: { id: resellerId } });
      if (!reseller) return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let areaIds: string[] = [];
      try { areaIds = JSON.parse(reseller.areaIds) as string[]; } catch { /* ignore */ }
      const invoiceWhere: Record<string, unknown> = { status: "PAID", paidAt: { gte: thirtyDaysAgo } };
      if (areaIds.length > 0) invoiceWhere.Subscriber = { areaId: { in: areaIds } };
      const revenueData = await db.invoice.aggregate({ where: invoiceWhere, _sum: { grandTotal: true } });
      const totalRevenue = revenueData._sum.grandTotal || 0;
      const commissionAmount = calculateCommission(reseller.commissionCalculationMethod, reseller.commissionRate, reseller.totalSubscribers, totalRevenue);

      // Create CommissionPayout record
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const existing = await db.resellerCommissionPayout.findFirst({ where: { resellerId, period } });
      if (!existing) {
        await db.resellerCommissionPayout.create({
          data: { resellerId, period, subscriberCount: reseller.totalSubscribers, revenue: totalRevenue, commissionRate: reseller.commissionRate, commissionAmount, status: "PENDING" },
        });
      }

      return NextResponse.json({ subscriberCount: reseller.totalSubscribers, totalRevenue, method: reseller.commissionCalculationMethod, rate: reseller.commissionRate, commissionAmount, period, payoutCreated: !existing });
    }

    // Commission payout history
    if (type === "payouts" && resellerId) {
      const payouts = await db.resellerCommissionPayout.findMany({ where: { resellerId }, orderBy: { createdAt: "desc" }, take: 50 });
      return NextResponse.json({ payouts });
    }

    // Areas list
    if (type === "areas") {
      const areas = await db.area.findMany({ select: { id: true, name: true, code: true, status: true }, orderBy: { name: "asc" } });
      return NextResponse.json({ areas });
    }

    // Commission endpoint
    if (type === "commission") {
      const resellers = await db.reseller.findMany({ orderBy: { totalCommission: "desc" } });
      const total = resellers.length;
      const paged = resellers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const arpuData = await db.invoice.groupBy({ by: ["subscriberId"], where: { status: "PAID", paidAt: { gte: thirtyDaysAgo } }, _sum: { grandTotal: true } });
      const avgArpu = arpuData.length > 0 ? Math.round(arpuData.reduce((sum, d) => sum + (d._sum.grandTotal || 0), 0) / arpuData.length) : 1500;
      const ledger = paged.map((r) => {
        const commissionAmount = Math.round(r.totalSubscribers * avgArpu * (r.commissionRate / 100));
        return { id: r.id, resellerName: r.name, month: thisMonth, subscriberCount: r.totalSubscribers, revenue: r.totalSubscribers * avgArpu, commissionRate: r.commissionRate, commissionAmount, paymentStatus: r.totalCommission > 0 ? "Pending" : "Paid", paymentDate: "" };
      });
      return NextResponse.json({ ledger, total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
    }

    // Plans endpoint
    if (type === "plans") {
      const plans = await db.plan.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, priceMonthly: true, category: true }, orderBy: { sortOrder: "asc" } });
      return NextResponse.json({ plans: plans.map((p) => ({ id: p.id, planName: p.name, basePrice: p.priceMonthly, resellerPrice: Math.round(p.priceMonthly * 0.9), margin: 10, category: p.category })) });
    }

    // Default: reseller list with hierarchy support
    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;
    if (search) where.OR = [{ name: { contains: search } }, { code: { contains: search } }, { phone: { contains: search } }, { email: { contains: search } }];

    const [resellers, total] = await Promise.all([db.reseller.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }), db.reseller.count({ where })]);

    const allAreaIds = resellers.flatMap((r) => { try { return JSON.parse(r.areaIds) as string[]; } catch { return []; } });
    const areas = allAreaIds.length > 0 ? await db.area.findMany({ where: { id: { in: allAreaIds } }, select: { id: true, name: true } }) : [];

    // Get parent names for hierarchy display
    const parentIds = resellers.map((r) => r.parentId).filter(Boolean) as string[];
    const parentNames: Record<string, string> = {};
    if (parentIds.length > 0) {
      const parents = await db.reseller.findMany({ where: { id: { in: parentIds } }, select: { id: true, name: true } });
      for (const p of parents) parentNames[p.id] = p.name;
    }

    const resellerList = resellers.map((r) => {
      let areaName = "";
      try { const ids = JSON.parse(r.areaIds) as string[]; areaName = ids.map((id) => areas.find((a) => a.id === id)?.name).filter(Boolean).join(", ") || ""; } catch { /* ignore */ }
      return {
        id: r.id, businessName: r.name, code: r.code, contactPerson: r.name, phone: r.phone, email: r.email,
        address: r.address, assignedArea: areaName, areaIds: r.areaIds,
        commissionRate: r.commissionRate, commissionCalculationMethod: r.commissionCalculationMethod,
        status: r.status, subscriberCount: r.totalSubscribers, commissionEarned: r.totalCommission,
        creditLimit: r.creditLimit, currentCreditUsed: r.currentCreditUsed,
        bankName: r.bankName, bankAccountName: r.bankAccountName, bankAccount: r.bankAccount,
        bankIfsc: r.bankIfsc, bankBranch: r.bankBranch,
        parentId: r.parentId, parentName: r.parentId ? parentNames[r.parentId] || null : null,
        logoUrl: r.logoUrl, primaryColor: r.primaryColor, secondaryColor: r.secondaryColor,
        customDomain: r.customDomain, emailTemplate: r.emailTemplate, upiId: r.upiId,
        joinedDate: r.createdAt.toISOString().split("T")[0], updatedAt: r.updatedAt.toISOString().split("T")[0],
      };
    });

    return NextResponse.json({ resellers: resellerList, total, page, totalPages: Math.ceil(total / PAGE_SIZE), cities: [...new Set(areas.map((a) => a.name))] });
  } catch (error) {
    console.error("Reseller API error:", error);
    return NextResponse.json({ error: "Failed to fetch reseller data" }, { status: 500 });
  }
}

// POST /api/reseller
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      if (!body.name || !body.phone) return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
      const code = body.code || `RSL-${Date.now().toString(36).toUpperCase()}`;
      const reseller = await db.reseller.create({
        data: {
          name: body.name, code, phone: body.phone || "", email: body.email || "",
          address: body.address || "", areaIds: body.areaIds || "[]",
          status: body.status || "TRIAL", commissionRate: body.commissionRate ?? 10,
          commissionCalculationMethod: body.commissionCalculationMethod || "PERCENTAGE",
          monthlyTarget: body.monthlyTarget ?? 0, creditLimit: body.creditLimit ?? 0, currentCreditUsed: 0,
          bankName: body.bankName || "", bankAccountName: body.bankAccountName || "",
          bankAccount: body.bankAccount || "",
          bankIfsc: body.bankIfsc || "", bankBranch: body.bankBranch || "", ifscCode: body.ifscCode || "",
          parentId: body.parentId || null,
          logoUrl: body.logoUrl || "", primaryColor: body.primaryColor || "",
          secondaryColor: body.secondaryColor || "", customDomain: body.customDomain || "",
          emailTemplate: body.emailTemplate || "", upiId: body.upiId || "",
        },
      });
      await auditCreate(request, "Reseller", reseller.id, { name: reseller.name, phone: reseller.phone, status: reseller.status }, { userId });
      return NextResponse.json({ success: true, message: "Reseller created successfully", reseller });
    }

    if (action === "update") {
      if (!body.id) return NextResponse.json({ error: "Reseller ID required" }, { status: 400 });
      const existing = await db.reseller.findUnique({ where: { id: body.id } });
      if (!existing) return NextResponse.json({ error: "Reseller not found" }, { status: 404 });

      // Check credit limit block: if currentCreditUsed > new creditLimit, block
      if (body.creditLimit !== undefined && body.creditLimit < existing.currentCreditUsed) {
        return NextResponse.json({ error: `Cannot set credit limit below current usage (${existing.currentCreditUsed})`, creditBlocked: true }, { status: 400 });
      }

      const reseller = await db.reseller.update({
        where: { id: body.id },
        data: {
          name: body.name, phone: body.phone, email: body.email, address: body.address,
          areaIds: body.areaIds, status: body.status, commissionRate: body.commissionRate,
          commissionCalculationMethod: body.commissionCalculationMethod,
          monthlyTarget: body.monthlyTarget, creditLimit: body.creditLimit,
          currentCreditUsed: body.currentCreditUsed,
          bankName: body.bankName, bankAccountName: body.bankAccountName,
          bankAccount: body.bankAccount,
          bankIfsc: body.bankIfsc, bankBranch: body.bankBranch, ifscCode: body.ifscCode,
          parentId: body.parentId, logoUrl: body.logoUrl, primaryColor: body.primaryColor,
          secondaryColor: body.secondaryColor, customDomain: body.customDomain,
          emailTemplate: body.emailTemplate, upiId: body.upiId,
        },
      });
      await auditUpdate(request, "Reseller", body.id, { name: body.name, status: body.status, commissionRate: body.commissionRate }, existing as unknown as Record<string, unknown>, { userId });
      return NextResponse.json({ success: true, message: "Reseller updated", reseller });
    }

    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: "Reseller ID required" }, { status: 400 });
      const existing = await db.reseller.findUnique({ where: { id: body.id } });
      await auditDelete(request, "Reseller", body.id, existing as unknown as Record<string, unknown>, { userId });
      await db.reseller.delete({ where: { id: body.id } });
      return NextResponse.json({ success: true, message: "Reseller deleted" });
    }

    if (action === "save-settings") {
      const { settings } = body;
      if (!settings) return NextResponse.json({ error: "settings required" }, { status: 400 });
      const ispSettings = await db.ispSettings.upsert({
        where: { id: "default" },
        update: { commissionConfig: JSON.stringify(settings) },
        create: { commissionConfig: JSON.stringify(settings) },
      });
      await auditUpdate(request, "IspSettings", "default", { commissionConfig: settings }, {}, { userId });
      return NextResponse.json({ success: true, message: "Commission settings saved" });
    }

    if (action === "save-branding") {
      const { resellerId, logoUrl, primaryColor, secondaryColor, customDomain, emailTemplate } = body;
      if (!resellerId) return NextResponse.json({ error: "resellerId required" }, { status: 400 });
      const existing = await db.reseller.findUnique({ where: { id: resellerId } });
      if (!existing) return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
      const updated = await db.reseller.update({
        where: { id: resellerId },
        data: {
          logoUrl: logoUrl ?? undefined,
          primaryColor: primaryColor ?? undefined,
          secondaryColor: secondaryColor ?? undefined,
          customDomain: customDomain ?? undefined,
          emailTemplate: emailTemplate ?? undefined,
        },
      });
      await auditUpdate(request, "Reseller", resellerId, { branding: { logoUrl, primaryColor, secondaryColor, customDomain } }, existing as unknown as Record<string, unknown>, { userId });
      return NextResponse.json({ success: true, message: "Branding updated", reseller: updated });
    }

    if (action === "assign-areas") {
      const { resellerId, areaIds } = body;
      if (!resellerId || !Array.isArray(areaIds)) return NextResponse.json({ error: "resellerId and areaIds required" }, { status: 400 });
      const existing = await db.reseller.findUnique({ where: { id: resellerId } });
      if (!existing) return NextResponse.json({ error: "Reseller not found" }, { status: 404 });
      const updated = await db.reseller.update({
        where: { id: resellerId },
        data: { areaIds: JSON.stringify(areaIds) },
      });
      await auditUpdate(request, "Reseller", resellerId, { areaIds }, existing as unknown as Record<string, unknown>, { userId });
      return NextResponse.json({ success: true, message: `Assigned ${areaIds.length} areas`, reseller: updated });
    }

    if (action === "mark-paid") {
      if (body.id) {
        const existing = await db.reseller.findUnique({ where: { id: body.id } });
        await db.reseller.update({ where: { id: body.id }, data: { totalCommission: 0 } });
        await auditUpdate(request, "Reseller", body.id, { totalCommission: 0 }, existing as unknown as Record<string, unknown>, { userId });
      }
      return NextResponse.json({ success: true, message: "Commission marked as paid" });
    }

    if (action === "mark-payout-paid") {
      const { payoutId } = body;
      if (!payoutId) return NextResponse.json({ error: "payoutId required" }, { status: 400 });
      await db.resellerCommissionPayout.update({ where: { id: payoutId }, data: { status: "PAID", paidOn: new Date(), approvedBy: userId } });
      return NextResponse.json({ success: true, message: "Payout marked as paid" });
    }

    if (action === "assign-plans") {
      const { resellerId, planIds } = body;
      if (!resellerId || !Array.isArray(planIds)) return NextResponse.json({ error: "resellerId and planIds required" }, { status: 400 });
      const updated = await db.reseller.update({ where: { id: resellerId }, data: { assignedPlanIds: JSON.stringify(planIds) } });
      await auditUpdate(request, "Reseller", resellerId, { assignedPlanIds: planIds }, undefined, { userId });
      return NextResponse.json({ success: true, message: `Assigned ${planIds.length} plans`, reseller: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Reseller POST error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
