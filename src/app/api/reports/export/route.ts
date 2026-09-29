import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreate } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — GET /api/reports/export?type=…&limit=…
// Data Export (Reports & Analytics module, spec Menu §11.6).
// Streams real rows as CSV (Excel-safe: BOM + quoted escaping).
//   types: subscribers | invoices | payments | tickets |
//          installations | inventory | sessions
// Cap: max 20 000 rows per export (spec: heavy exports belong in
// async jobs; dataset is far below cap, hard cap is the guardrail).
// Every export is audit-logged (action report.export).
// ============================================================

export const dynamic = "force-dynamic";

function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

const EXPORT_TYPES = ["subscribers", "invoices", "payments", "tickets", "installations", "inventory", "sessions"] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

const MAX_ROWS = 20000;

// RFC 4180: wrap in quotes, double embedded quotes, strip CR/LF
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  s = s.replace(/\r?\n/g, " ");
  if (/[",;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // UTF-8 BOM so Excel opens non-ASCII (₹, Hindi names) correctly
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

function csvFilename(type: ExportType): string {
  const d = new Date().toISOString().slice(0, 10);
  return `cryptsk-nexus-${type}-${d}.csv`;
}

export async function GET(req: NextRequest) {
  let exportType: ExportType = "subscribers";
  try {
    await requirePermission("report", "export");

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "").toLowerCase();
    if (!EXPORT_TYPES.includes(type as ExportType)) {
      return NextResponse.json({ error: `Unknown export type. Valid: ${EXPORT_TYPES.join(", ")}` }, { status: 400 });
    }
    exportType = type as ExportType;

    let headers: string[] = [];
    let rows: Array<Array<unknown>> = [];

    switch (exportType) {
      case "subscribers": {
        const data = await db.subscriber.findMany({
          take: MAX_ROWS,
          orderBy: { createdAt: "desc" },
          include: { customer: { select: { displayName: true, customerCode: true } }, plan: { select: { name: true } } },
        });
        headers = ["Subscriber Code", "Customer", "Customer Code", "RADIUS Username", "Full Name", "Email", "Mobile", "Plan", "Status", "Static IP", "VLAN", "Activated At", "Expires At", "Created At"];
        rows = data.map((s) => [s.subscriberCode, s.customer.displayName, s.customer.customerCode, s.radiusUsername, s.fullName, s.email, s.mobile, s.plan?.name, s.status, s.staticIp, s.vlanId, s.activatedAt, s.expiresAt, s.createdAt]);
        break;
      }
      case "invoices": {
        const data = await db.invoice.findMany({
          take: MAX_ROWS,
          orderBy: { issueDate: "desc" },
          include: { customer: { select: { displayName: true, customerCode: true } } },
        });
        headers = ["Invoice #", "Customer", "Customer Code", "Issue Date", "Due Date", "Subtotal", "Discount", "Taxable", "Tax", "Total", "Paid", "Balance Due", "Status", "Payment Status"];
        rows = data.map((i) => [i.invoiceNumber, i.customer.displayName, i.customer.customerCode, i.issueDate, i.dueDate, i.subtotal, i.discountAmount, i.taxableAmount, i.taxAmount, i.total, i.paidAmount, i.balanceDue, i.status, i.paymentStatus]);
        break;
      }
      case "payments": {
        const data = await db.payment.findMany({
          take: MAX_ROWS,
          orderBy: { receivedAt: "desc" },
          include: {
            customer: { select: { displayName: true, customerCode: true } },
            invoice: { select: { invoiceNumber: true } },
          },
        });
        headers = ["Payment #", "Customer", "Customer Code", "Invoice #", "Amount", "Currency", "Method", "Status", "Transaction ID", "Received At", "Paid At"];
        rows = data.map((p) => [p.paymentNumber, p.customer.displayName, p.customer.customerCode, p.invoice?.invoiceNumber, p.amount, p.currency, p.method, p.status, p.transactionId, p.receivedAt, p.paidAt]);
        break;
      }
      case "tickets": {
        const data = await db.ticket.findMany({
          take: MAX_ROWS,
          orderBy: { createdAt: "desc" },
          include: {
            customer: { select: { displayName: true, customerCode: true } },
            assignee: { select: { name: true, email: true } },
          },
        });
        headers = ["Ticket #", "Subject", "Category", "Priority", "Status", "Customer", "Assignee", "SLA Due", "Resolved At", "Closed At", "Created At"];
        rows = data.map((t) => [t.ticketNumber, t.subject, t.category, t.priority, t.status, t.customer?.displayName, t.assignee?.name || t.assignee?.email, t.slaDueAt, t.resolvedAt, t.closedAt, t.createdAt]);
        break;
      }
      case "installations": {
        const data = await db.installation.findMany({
          take: MAX_ROWS,
          orderBy: { scheduledAt: "desc" },
          include: {
            customer: { select: { displayName: true, customerCode: true } },
            subscriber: { select: { subscriberCode: true } },
          },
        });
        headers = ["Install #", "Customer", "Customer Code", "Subscriber", "Type", "Status", "Technician", "Scheduled At", "Completed At", "Address", "Notes"];
        rows = data.map((i) => [i.installNumber, i.customer?.displayName, i.customer?.customerCode, i.subscriber?.subscriberCode, i.type, i.status, i.technicianName, i.scheduledAt, i.completedAt, i.address, i.notes]);
        break;
      }
      case "inventory": {
        const data = await db.inventoryItem.findMany({
          take: MAX_ROWS,
          orderBy: { updatedAt: "desc" },
        });
        headers = ["SKU", "Name", "Category", "Quantity", "Min Quantity", "Unit Price", "Stock Value", "Location", "Updated At"];
        rows = data.map((i) => [i.sku, i.name, i.category, i.quantity, i.minQuantity, i.unitPrice, i.quantity * (i.unitPrice || 0), i.location, i.updatedAt]);
        break;
      }
      case "sessions": {
        const data = await db.$queryRaw<Array<{
          username: string; nasipaddress: string; acctstarttime: Date | null; acctstoptime: Date | null;
          acctsessiontime: bigint | null; acctinputoctets: bigint | null; acctoutputoctets: bigint | null;
          framedipaddress: string; acctterminatecause: string | null;
        }>>`
          SELECT username, nasipaddress, acctstarttime, acctstoptime,
                 acctsessiontime, acctinputoctets, acctoutputoctets,
                 framedipaddress, acctterminatecause
          FROM radacct
          ORDER BY acctstarttime DESC
          LIMIT ${MAX_ROWS}`;
        headers = ["Username", "NAS IP", "Session Start", "Session Stop", "Duration (s)", "Upload (bytes)", "Download (bytes)", "Framed IP", "Terminate Cause"];
        rows = data.map((r) => [
          r.username, r.nasipaddress, r.acctstarttime, r.acctstoptime,
          r.acctsessiontime !== null ? Number(r.acctsessiontime) : null,
          r.acctinputoctets !== null ? Number(r.acctinputoctets) : null,
          r.acctoutputoctets !== null ? Number(r.acctoutputoctets) : null,
          r.framedipaddress, r.acctterminatecause,
        ]);
        break;
      }
    }

    const csv = toCsv(headers, rows);

    // Audit: real compliance trail for every data egress
    await auditCreate({
      action: "create",
      resource: "report",
      resourceId: exportType,
      resourceName: `data-export:${exportType}`,
      result: "success",
      metadata: { rows: rows.length, format: "csv" },
    }).catch(() => undefined);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(exportType)}"`,
        "Cache-Control": "no-store",
        "X-Export-Rows": String(rows.length),
      },
    });
  } catch (err) {
    if (isRedirectError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await auditCreate({
      action: "create",
      resource: "report",
      resourceId: exportType,
      resourceName: `data-export:${exportType}`,
      result: "failure",
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => undefined);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
