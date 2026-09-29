import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import {
  csvResponse,
  generateExportFilename,
  fmtDate,
  fmtINR,
} from "@/lib/export-utils";

// GET /api/export/invoices — CSV/JSON export with filters
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "csv";
    const status = searchParams.get("status") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const areaId = searchParams.get("areaId") || "";
    const planId = searchParams.get("planId") || "";
    const search = searchParams.get("search") || "";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status && status !== "ALL") where.status = status;
    if (planId) where.planId = planId;

    // Subscriber area filter
    if (areaId) {
      where.Subscriber = { ...where.Subscriber as Record<string, unknown>, areaId };
    }

    // Date filtering on issueDate
    if (dateFrom || dateTo) {
      where.issueDate = {};
      if (dateFrom) (where.issueDate as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.issueDate as Record<string, unknown>).lte = new Date(dateTo);
    }

    // Search
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
      ];
    }

    const invoices = await db.invoice.findMany({
      where,
      include: {
        Subscriber: {
          select: { id: true, name: true, code: true, phone: true, Area: { select: { name: true } } },
        },
        Plan: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    // CSV headers
    const headers = [
      "Invoice#",
      "Subscriber Name",
      "Plan",
      "Issue Date",
      "Due Date",
      "Subtotal",
      "Tax",
      "Total",
      "Status",
      "Paid Amount",
      "Balance",
    ];

    const rows = invoices.map((inv) => [
      inv.invoiceNumber,
      inv.Subscriber?.name || "",
      inv.Plan?.name || "",
      fmtDate(inv.issueDate),
      fmtDate(inv.dueDate),
      String(inv.subtotal),
      String(inv.totalTax),
      String(inv.grandTotal),
      inv.status,
      String(inv.paidAmount),
      String(inv.balanceAmount),
    ]);

    // JSON format
    if (format === "json") {
      return NextResponse.json({
        total: invoices.length,
        data: invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          subscriberName: inv.Subscriber?.name,
          plan: inv.Plan?.name,
          issueDate: fmtDate(inv.issueDate),
          dueDate: fmtDate(inv.dueDate),
          subtotal: inv.subtotal,
          tax: inv.totalTax,
          total: inv.grandTotal,
          status: inv.status,
          paidAmount: inv.paidAmount,
          balance: inv.balanceAmount,
        })),
      });
    }

    // CSV format (default)
    const filename = generateExportFilename("invoices");
    return csvResponse(headers, rows, filename);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Export invoices error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to export invoices" },
      { status: 500 }
    );
  }
}
