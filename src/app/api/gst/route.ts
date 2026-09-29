import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = request.nextUrl;
    const report = searchParams.get("report") || "summary";

    const now = new Date();

    // ─── Tax Summary ───
    if (report === "summary") {
      const invoices = await db.invoice.findMany({
        where: { status: { not: "CANCELLED" }, NOT: { status: "CREDIT_NOTE" } },
        select: {
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          totalTax: true,
          issueDate: true,
          grandTotal: true,
          subtotal: true,
        },
        orderBy: { issueDate: "desc" },
      });

      const totalTax = invoices.reduce((s, i) => s + (i.cgstAmount || 0) + (i.sgstAmount || 0) + (i.igstAmount || 0), 0);
      const totalCgst = invoices.reduce((s, i) => s + (i.cgstAmount || 0), 0);
      const totalSgst = invoices.reduce((s, i) => s + (i.sgstAmount || 0), 0);
      const totalIgst = invoices.reduce((s, i) => s + (i.igstAmount || 0), 0);

      // This month
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthTax = invoices
        .filter((i) => new Date(i.issueDate) >= thisMonthStart)
        .reduce((s, i) => s + (i.cgstAmount || 0) + (i.sgstAmount || 0) + (i.igstAmount || 0), 0);

      // This quarter
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
      const quarterTax = invoices
        .filter((i) => new Date(i.issueDate) >= quarterStart)
        .reduce((s, i) => s + (i.cgstAmount || 0) + (i.sgstAmount || 0) + (i.igstAmount || 0), 0);

      // Monthly breakdown (last 12 months)
      const monthlyBreakdown: Record<string, { month: string; revenue: number; cgst: number; sgst: number; igst: number; totalTax: number; invoiceCount: number }> = {};
      for (const inv of invoices) {
        const d = new Date(inv.issueDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthName = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
        if (!monthlyBreakdown[key]) {
          monthlyBreakdown[key] = { month: monthName, revenue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, invoiceCount: 0 };
        }
        monthlyBreakdown[key].revenue += inv.subtotal || 0;
        monthlyBreakdown[key].cgst += inv.cgstAmount || 0;
        monthlyBreakdown[key].sgst += inv.sgstAmount || 0;
        monthlyBreakdown[key].igst += inv.igstAmount || 0;
        monthlyBreakdown[key].totalTax += (inv.cgstAmount || 0) + (inv.sgstAmount || 0) + (inv.igstAmount || 0);
        monthlyBreakdown[key].invoiceCount++;
      }

      const months = Object.entries(monthlyBreakdown)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 12)
        .map(([, v]) => v);

      return NextResponse.json({
        stats: {
          totalTax: Math.round(totalTax),
          thisMonthTax: Math.round(thisMonthTax),
          quarterTax: Math.round(quarterTax),
          invoiceCount: invoices.length,
        },
        totalCgst: Math.round(totalCgst),
        totalSgst: Math.round(totalSgst),
        totalIgst: Math.round(totalIgst),
        monthlyBreakdown: months,
      });
    }

    // ─── GSTR-1 Report ───
    if (report === "gstr1") {
      const b2bInvoices = await db.invoice.findMany({
        where: { status: { not: "CANCELLED" }, NOT: { status: "CREDIT_NOTE" } },
        include: {
          Subscriber: {
            select: { name: true, code: true, gstin: true, panNumber: true },
          },
          Plan: { select: { name: true } },
        },
        orderBy: { issueDate: "desc" },
        take: 200,
      });

      // Get ISP state from settings
      const ispSettings = await db.ispSettings.findFirst({ select: { state: true } });

      return NextResponse.json({
        b2bInvoices: b2bInvoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          subscriberName: inv.Subscriber.name,
          gstin: inv.Subscriber.gstin || "-",
          pan: inv.Subscriber.panNumber || "-",
          invoiceValue: Math.round(inv.grandTotal * 100) / 100,
          taxAmount: Math.round(inv.totalTax * 100) / 100,
          cgst: Math.round(inv.cgstAmount * 100) / 100,
          sgst: Math.round(inv.sgstAmount * 100) / 100,
          igst: Math.round(inv.igstAmount * 100) / 100,
          placeOfSupply: ispSettings?.state || "Maharashtra",
          issueDate: inv.issueDate,
        })),
      });
    }

    // ─── GSTR-3B Report ───
    if (report === "gstr3b") {
      const now2 = new Date();
      const thisMonthStart2 = new Date(now2.getFullYear(), now2.getMonth(), 1);

      const thisMonthInvoices = await db.invoice.findMany({
        where: { status: { not: "CANCELLED" }, NOT: { status: "CREDIT_NOTE" }, issueDate: { gte: thisMonthStart2 } },
        select: { cgstAmount: true, sgstAmount: true, igstAmount: true, totalTax: true, grandTotal: true, subtotal: true },
      });

      const outwardSupply = thisMonthInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
      const taxableValue = thisMonthInvoices.reduce((s, i) => s + (i.subtotal || 0), 0);
      const cgstPayable = thisMonthInvoices.reduce((s, i) => s + (i.cgstAmount || 0), 0);
      const sgstPayable = thisMonthInvoices.reduce((s, i) => s + (i.sgstAmount || 0), 0);
      const igstPayable = thisMonthInvoices.reduce((s, i) => s + (i.igstAmount || 0), 0);
      const totalTaxPayable = cgstPayable + sgstPayable + igstPayable;

      // Quarterly summary
      const quarterMonth2 = Math.floor(now2.getMonth() / 3) * 3;
      const quarterStart2 = new Date(now2.getFullYear(), quarterMonth2, 1);
      const quarterInvoices = await db.invoice.findMany({
        where: { status: { not: "CANCELLED" }, NOT: { status: "CREDIT_NOTE" }, issueDate: { gte: quarterStart2 } },
        select: { cgstAmount: true, sgstAmount: true, igstAmount: true, totalTax: true, grandTotal: true, subtotal: true, issueDate: true },
      });

      const quarterMonthly: Record<string, { month: string; tax: number; count: number }> = {};
      for (const inv of quarterInvoices) {
        const d = new Date(inv.issueDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthName = d.toLocaleDateString("en-IN", { month: "short" });
        if (!quarterMonthly[key]) quarterMonthly[key] = { month: monthName, tax: 0, count: 0 };
        quarterMonthly[key].tax += inv.totalTax || 0;
        quarterMonthly[key].count++;
      }

      return NextResponse.json({
        outwardSupply: Math.round(outwardSupply),
        taxableValue: Math.round(taxableValue),
        inputTaxCredit: 0,
        cgstPayable: Math.round(cgstPayable),
        sgstPayable: Math.round(sgstPayable),
        igstPayable: Math.round(igstPayable),
        totalTaxPayable: Math.round(totalTaxPayable),
        quarterBreakdown: Object.entries(quarterMonthly).map(([, v]) => v),
      });
    }

    // ─── HSN/SAC Codes ───
    if (report === "hsn") {
      // Group by plan name as a proxy for HSN/SAC codes
      const plans = await db.plan.findMany({
        select: {
          id: true,
          name: true,
          category: true,
          priceMonthly: true,
          cgstPercent: true,
          sgstPercent: true,
          igstPercent: true,
          _count: { select: { Invoice: true } },
        },
      });

      const invoiceAgg = await db.invoice.groupBy({
        by: ["planId"],
        where: { status: { not: "CANCELLED" } },
        _sum: { grandTotal: true, totalTax: true },
      });

      const aggMap = new Map(invoiceAgg.map((a) => [a.planId, a]));

      const hsnCodes = [
        { code: "998311", description: "Internet broadband services (FTTH)", taxRate: 18, plans: plans.filter((p) => p.category === "FTTH") },
        { code: "998311", description: "Internet broadband services (Wireless)", taxRate: 18, plans: plans.filter((p) => p.category === "WIRELESS") },
        { code: "998312", description: "Internet access services (Leased Line)", taxRate: 18, plans: plans.filter((p) => p.category === "LEASED_LINE") },
        { code: "998313", description: "ISP - Cable TV / Combo services", taxRate: 18, plans: plans.filter((p) => p.category === "CABLE" || p.category === "COMBO") },
        { code: "998314", description: "Hotspot / WiFi services", taxRate: 18, plans: plans.filter((p) => p.category === "HOTSPOT") },
      ];

      const enrichedHsn: Array<{
        code: string; description: string; taxRate: number; plans: typeof plans;
        totalInvoices: number; totalValue: number; planNames: string[];
      }> = [];
      for (const h of hsnCodes) {
        if (h.plans.length === 0) continue;
        let totalInvoices = 0, totalValue = 0;
        for (const p of h.plans) {
          const agg = aggMap.get(p.id);
          if (agg) {
            totalInvoices += (agg as Record<string, unknown>)._count ? ((agg as Record<string, unknown>)._count as Record<string, number>).planId || 0 : 0;
            totalValue += agg._sum?.grandTotal || 0;
          }
        }
        enrichedHsn.push({ ...h, totalInvoices, totalValue: Math.round(totalValue), planNames: h.plans.map((p) => p.name) });
      }

      // Also add generic if no plan-based data
      if (enrichedHsn.length === 0) {
        enrichedHsn.push(
          { code: "998311", description: "Internet broadband services", taxRate: 18, plans: [], totalInvoices: 0, totalValue: 0, planNames: [] },
        );
      }

      return NextResponse.json({ hsnCodes: enrichedHsn });
    }

    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  } catch (error) {
    console.error("GST API error:", error);
    return NextResponse.json({ error: "Failed to fetch GST data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request as unknown as import("next/server").NextRequest);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await request.json();
    const { action, code, description, taxRate } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    if (action === "add_hsn" || action === "edit_hsn") {
      if (!code || !description) {
        return NextResponse.json({ error: "HSN code and description are required" }, { status: 400 });
      }

      const settings = await db.ispSettings.findFirst({ where: { id: "default" } });
      let customCodes: Array<{ code: string; description: string; taxRate: number }> = [];
      try {
        customCodes = settings?.hsnCodes ? JSON.parse(settings.hsnCodes) : [];
      } catch { customCodes = []; }

      if (action === "add_hsn") {
        const exists = customCodes.find((c) => c.code === code);
        if (exists) {
          return NextResponse.json({ error: "HSN/SAC code already exists" }, { status: 400 });
        }
        customCodes.push({ code, description, taxRate: Number(taxRate) || 18 });
      } else {
        const idx = customCodes.findIndex((c) => c.code === code);
        if (idx === -1) {
          return NextResponse.json({ error: "HSN/SAC code not found" }, { status: 404 });
        }
        customCodes[idx] = { ...customCodes[idx], description, taxRate: Number(taxRate) || 18 };
      }

      await db.ispSettings.upsert({
        where: { id: "default" },
        update: { hsnCodes: JSON.stringify(customCodes) },
        create: { id: "default", hsnCodes: JSON.stringify(customCodes) },
      });

      await auditLog(request, "CONFIG_CHANGE", "GST", "hsn_codes", { code, description, taxRate });
      return NextResponse.json({ success: true, message: `HSN/SAC code ${action === "add_hsn" ? "added" : "updated"}` });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("GST API POST error:", error);
    return NextResponse.json({ error: "Failed to process GST request" }, { status: 500 });
  }
}
