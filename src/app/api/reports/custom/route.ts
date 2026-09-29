import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditExport } from "@/lib/services/audit-service";

// Column definitions per data source
const COLUMN_MAP: Record<string, { label: string; field: string }[]> = {
  subscribers: [
    { label: "Code", field: "code" },
    { label: "Name", field: "name" },
    { label: "Email", field: "email" },
    { label: "Phone", field: "phone" },
    { label: "Status", field: "status" },
    { label: "Plan", field: "plan.name" },
    { label: "Area", field: "area.name" },
    { label: "Connection Type", field: "connectionType" },
    { label: "Created At", field: "createdAt" },
    { label: "Balance", field: "balance" },
  ],
  payments: [
    { label: "ID", field: "id" },
    { label: "Subscriber", field: "subscriber.name" },
    { label: "Amount", field: "amount" },
    { label: "Mode", field: "paymentMode" },
    { label: "Status", field: "status" },
    { label: "Transaction Ref", field: "transactionRef" },
    { label: "Receipt #", field: "receiptNumber" },
    { label: "Created At", field: "createdAt" },
  ],
  invoices: [
    { label: "Invoice #", field: "invoiceNumber" },
    { label: "Subscriber", field: "subscriber.name" },
    { label: "Plan", field: "plan.name" },
    { label: "Grand Total", field: "grandTotal" },
    { label: "Paid Amount", field: "paidAmount" },
    { label: "Balance", field: "balanceAmount" },
    { label: "Status", field: "status" },
    { label: "Issue Date", field: "issueDate" },
    { label: "Due Date", field: "dueDate" },
  ],
  complaints: [
    { label: "Ticket #", field: "ticketNumber" },
    { label: "Subscriber", field: "subscriber.name" },
    { label: "Type", field: "type" },
    { label: "Priority", field: "priority" },
    { label: "Status", field: "status" },
    { label: "Description", field: "description" },
    { label: "Assigned To", field: "assignedTo.name" },
    { label: "Created At", field: "createdAt" },
    { label: "Resolved At", field: "resolvedAt" },
    { label: "SLA Hours", field: "slaHours" },
  ],
};

// Filter fields per data source
const FILTER_MAP: Record<string, { label: string; field: string; type: "text" | "select"; options?: string[] }[]> = {
  subscribers: [
    { label: "Status", field: "status", type: "select", options: ["ACTIVE", "SUSPENDED", "DISCONNECTED", "TRIAL", "PENDING_ACTIVATION"] },
    { label: "Connection Type", field: "connectionType", type: "select", options: ["FTTH", "WIRELESS", "CABLE", "LEASED_LINE", "ETHERNET"] },
    { label: "Area", field: "areaId", type: "text" },
    { label: "Name", field: "name", type: "text" },
    { label: "Phone", field: "phone", type: "text" },
  ],
  payments: [
    { label: "Status", field: "status", type: "select", options: ["PENDING", "VERIFIED", "FAILED", "REFUNDED"] },
    { label: "Payment Mode", field: "paymentMode", type: "select", options: ["CASH", "UPI", "ONLINE", "BANK_TRANSFER", "CHEQUE", "WALLET"] },
    { label: "Min Amount", field: "minAmount", type: "text" },
  ],
  invoices: [
    { label: "Status", field: "status", type: "select", options: ["DRAFT", "SENT", "PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED"] },
    { label: "Min Total", field: "minTotal", type: "text" },
  ],
  complaints: [
    { label: "Status", field: "status", type: "select", options: ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"] },
    { label: "Priority", field: "priority", type: "select", options: ["P1_CRITICAL", "P2_HIGH", "P3_MEDIUM", "P4_LOW"] },
    { label: "Type", field: "type", type: "select", options: ["NO_INTERNET", "SLOW_SPEED", "CABLE_CUT", "WIFI_ISSUE", "PLAN_CHANGE", "BILLING_QUERY", "VOIP_ISSUE", "IPTV_ISSUE", "NEW_CONNECTION", "OTHER"] },
  ],
};

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return "";
    }
  }
  if (current === null || current === undefined) return "";
  if (current instanceof Date) return current.toISOString().split("T")[0];
  return String(current);
}

export const GET = async (req: NextRequest) => {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;

    // Return column/filter metadata
    if (searchParams.get("meta") === "true") {
      const source = searchParams.get("source");
      if (source && COLUMN_MAP[source]) {
        return NextResponse.json({
          columns: COLUMN_MAP[source],
          filters: FILTER_MAP[source] || [],
        });
      }
      return NextResponse.json({ columns: [], filters: [] });
    }

    const source = searchParams.get("source") || "subscribers";
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const selectedColumns = searchParams.get("columns") ? searchParams.get("columns")!.split(",") : COLUMN_MAP[source]?.map((c) => c.field) || [];
    const format = searchParams.get("format") || "json";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");

    if (!COLUMN_MAP[source]) {
      return NextResponse.json({ error: "Invalid data source" }, { status: 400 });
    }

    // Build where clause
    const where: Record<string, unknown> = {};
    if (startDateStr && endDateStr) {
      where.createdAt = { gte: new Date(startDateStr), lte: new Date(endDateStr) };
    }

    // Apply filters from query params
    const filtersParam = searchParams.get("filters");
    if (filtersParam) {
      try {
        const filters = JSON.parse(filtersParam) as Record<string, string>;
        for (const [key, value] of Object.entries(filters)) {
          if (!value) continue;
          if (["status", "connectionType", "paymentMode", "priority", "type"].includes(key)) {
            where[key] = value;
          } else if (key === "areaId" || key === "name" || key === "phone") {
            where[key] = { contains: value };
          }
        }
      } catch { /* ignore */ }
    }

    // Build include based on selected columns
    const needsSubscriber = selectedColumns.some((c) => c.startsWith("subscriber."));
    const needsPlan = selectedColumns.some((c) => c.startsWith("plan."));
    const needsArea = selectedColumns.some((c) => c.startsWith("area."));
    const needsAssignedTo = selectedColumns.some((c) => c.startsWith("assignedTo."));

    const include: Record<string, unknown> = {};
    if (needsSubscriber) include.Subscriber = { select: { name: true } };
    if (needsPlan) include.Plan = { select: { name: true } };
    if (needsArea) include.Area = { select: { name: true } };
    if (needsAssignedTo) include.assignedTo = { select: { name: true } };

    let rows: Record<string, unknown>[] = [];
    let total = 0;

    const prismaModel = db[source as keyof typeof db] as unknown as { findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>; count: (args?: Record<string, unknown>) => Promise<number> };

    try {
      const [results, count] = await Promise.all([
        prismaModel.findMany({
          where: Object.keys(where).length > 0 ? where : undefined,
          include: Object.keys(include).length > 0 ? include : undefined,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prismaModel.count({
          where: Object.keys(where).length > 0 ? where : undefined,
        }),
      ]);
      rows = results;
      total = count;
    } catch {
      return NextResponse.json({ error: "Failed to query data source" }, { status: 400 });
    }

    // Map to selected columns
    const headers = selectedColumns
      .map((field) => {
        const col = COLUMN_MAP[source]?.find((c) => c.field === field);
        return col ? col.label : field;
      });

    const mappedRows = rows.map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const field of selectedColumns) {
        const col = COLUMN_MAP[source]?.find((c) => c.field === field);
        const label = col ? col.label : field;
        mapped[label] = getNestedValue(row, field);
      }
      return mapped;
    });

    // CSV export
    if (format === "csv") {
      await auditExport(req, "Report", "csv", mappedRows.length);
      const csvHeaders = headers.join(",");
      const csvRows = mappedRows.map((row) =>
        headers.map((h) => {
          const val = String(row[h] ?? "");
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(",")
      );
      const csv = [csvHeaders, ...csvRows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv;charset=utf-8;",
          "Content-Disposition": `attachment; filename="custom-report-${source}-${Date.now()}.csv"`,
        },
      });
    }

    await auditExport(req, "Report", "json", mappedRows.length);
    return NextResponse.json({
      rows: mappedRows,
      headers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Custom report error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
};
