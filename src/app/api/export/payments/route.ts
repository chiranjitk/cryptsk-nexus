import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import {
  csvResponse,
  generateExportFilename,
  fmtDateTime,
} from "@/lib/export-utils";

// GET /api/export/payments — CSV/JSON export with filters
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "csv";
    const status = searchParams.get("status") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const mode = searchParams.get("mode") || "";
    const search = searchParams.get("search") || "";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (mode) where.paymentMode = mode;

    // Date filtering on createdAt
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo + "T23:59:59.999Z");
    }

    // Search
    if (search) {
      where.OR = [
        { receiptNumber: { contains: search } },
        { transactionRef: { contains: search } },
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
      ];
    }

    const payments = await db.payment.findMany({
      where,
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Invoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    // CSV headers
    const headers = [
      "Receipt#",
      "Subscriber Name",
      "Amount",
      "Mode",
      "Transaction Ref",
      "Status",
      "Date",
      "Invoice#",
      "Notes",
    ];

    const rows = payments.map((p) => [
      p.receiptNumber || "",
      p.Subscriber?.name || "",
      String(p.amount),
      p.paymentMode,
      p.transactionRef || "",
      p.status,
      fmtDateTime(p.createdAt),
      p.Invoice?.invoiceNumber || "",
      (p.notes || ""),
    ]);

    // JSON format
    if (format === "json") {
      return NextResponse.json({
        total: payments.length,
        data: payments.map((p) => ({
          receiptNumber: p.receiptNumber,
          subscriberName: p.Subscriber?.name,
          amount: p.amount,
          mode: p.paymentMode,
          transactionRef: p.transactionRef,
          status: p.status,
          date: fmtDateTime(p.createdAt),
          invoice: p.Invoice?.invoiceNumber,
        })),
      });
    }

    // CSV format (default)
    const filename = generateExportFilename("payments");
    return csvResponse(headers, rows, filename);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Export payments error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to export payments" },
      { status: 500 }
    );
  }
}
