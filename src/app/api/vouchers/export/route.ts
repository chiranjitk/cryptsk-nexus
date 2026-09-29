import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreate } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — GET /api/vouchers/export
// CSV export of the prepaid voucher stock for batch handout
// (Billing module).
// STATIC segment — Next resolves /api/vouchers/export here before
// the dynamic /api/vouchers/[id] sibling; that sibling only exports
// PATCH, so there is no handler conflict for GET.
// RBAC: billing.invoice.read — the same permission as GET
// /api/vouchers.
// Filters: ?batchNumber= (exact match) and ?status=
// (unused/used/expired/cancelled) — both OPTIONAL; an invalid status
// value is IGNORED (not a 400) so a stale UI link still produces an
// honest unfiltered export.
// Order: code asc. Hard cap 5000 rows (batch handout size).
// Output: text/csv — header row
//   code,batch,face_value,currency,status,expires_at,used_at,generated_at
// one row per voucher; ISO timestamps or empty string; face_value a
// plain number. Header-only file when nothing matches (honest).
// Audit: AuditAction supports "export" and auditCreate passes a
// provided action straight through (unlike the wrapper helpers, which
// force their own action) — so this uses auditCreate directly with
// action "export".
// ============================================================

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["unused", "used", "expired", "cancelled"];
const MAX_ROWS = 5000;

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

// CSV field escape — quote only when the value contains ", comma,
// newline or carriage return
function csvField(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ISO timestamp or empty string for null
function isoOrNull(d: Date | null | undefined): string {
  return d ? d.toISOString() : "";
}

// GET /api/vouchers/export — CSV download for batch handout
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission("billing.invoice", "read");

    const { searchParams } = new URL(req.url);
    const batchNumber = (searchParams.get("batchNumber") || "").trim();
    const statusParam = (searchParams.get("status") || "").trim();

    const where: Record<string, unknown> = {};
    if (batchNumber) where.batchNumber = batchNumber;
    if (statusParam && VALID_STATUSES.includes(statusParam)) where.status = statusParam;
    // invalid status values are ignored (no 400) — see header note

    const vouchers = await db.voucher.findMany({
      where,
      orderBy: { code: "asc" },
      take: MAX_ROWS,
      select: {
        code: true,
        batchNumber: true,
        faceValue: true,
        currency: true,
        status: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    });

    const csv =
      [
        "code,batch,face_value,currency,status,expires_at,used_at,generated_at",
        ...vouchers.map((v) =>
          [
            csvField(v.code),
            csvField(v.batchNumber),
            csvField(v.faceValue),
            csvField(v.currency),
            csvField(v.status),
            csvField(isoOrNull(v.expiresAt)),
            csvField(isoOrNull(v.usedAt)),
            csvField(isoOrNull(v.createdAt)),
          ].join(",")
        ),
      ].join("\n") + "\n";

    // Content-Disposition filename — batch numbers are VCH-2026-####
    // internally, but the query param is caller-controlled, so strip
    // anything that could break the header before embedding it.
    const safeBatch = batchNumber.replace(/[^A-Za-z0-9._-]/g, "");
    const fileBatch = safeBatch || "all";
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    await auditCreate({
      userId: user.id,
      action: "export",
      resource: "voucher",
      resourceName: batchNumber || "+all",
      after: { count: vouchers.length },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vouchers-${fileBatch}-${today}.csv"`,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/vouchers/export] GET failed:", err);
    return NextResponse.json({ error: "Failed to export vouchers" }, { status: 500 });
  }
}
