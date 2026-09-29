import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — PATCH /api/vouchers/[id]
// Voucher lifecycle action (Billing module).
// RBAC: billing.invoice.update — the update-side sibling of the
// invoices routes' billing.invoice permission so billing staff
// manage the voucher stock.
// PATCH { action: "cancel" } — only UNUSED vouchers can be
// cancelled (used/expired/cancelled are immutable states).
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

// PATCH /api/vouchers/[id] — cancel an unused voucher
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("billing.invoice", "update");
    const { id } = await params; // Next 16 — params is a Promise

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || body.action !== "cancel") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const voucher = await db.voucher.findUnique({ where: { id } });
    if (!voucher) {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }
    if (voucher.status !== "unused") {
      return NextResponse.json(
        { error: "Only unused vouchers can be cancelled" },
        { status: 400 }
      );
    }

    const updated = await db.voucher.update({
      where: { id },
      data: { status: "cancelled" },
    });

    await auditUpdate({
      userId: user.id,
      action: "update",
      resource: "voucher",
      resourceId: updated.id,
      resourceName: updated.code,
      before: { status: voucher.status, batchNumber: voucher.batchNumber },
      after: { status: updated.status, batchNumber: updated.batchNumber },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ voucher: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/vouchers/[id]] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 });
  }
}
