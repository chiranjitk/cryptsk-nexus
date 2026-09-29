import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// PUT /api/captive-portal/voucher-pools/[id] — Update voucher pool
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.portalVoucherPool.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Voucher pool not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    const allowedFields = [
      "name", "voucherPrefix", "maxUsesPerVoucher", "maxTotalActivations",
      "speedDownKbps", "speedUpKbps", "dataLimitMb", "sessionTimeoutMin", "enabled",
    ] as const;
    for (const key of allowedFields) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (body.validFrom !== undefined) data.validFrom = body.validFrom ? new Date(body.validFrom) : null;
    if (body.validUntil !== undefined) data.validUntil = body.validUntil ? new Date(body.validUntil) : null;

    const pool = await db.portalVoucherPool.update({
      where: { id },
      data,
    });

    return NextResponse.json({ pool });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal VoucherPools] PUT [id] error:", error);
    return NextResponse.json({ error: "Failed to update voucher pool" }, { status: 500 });
  }
}

// DELETE /api/captive-portal/voucher-pools/[id] — Delete voucher pool
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_req);
    const { id } = await params;

    const existing = await db.portalVoucherPool.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Voucher pool not found" }, { status: 404 });
    }

    await db.portalVoucherPool.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal VoucherPools] DELETE [id] error:", error);
    return NextResponse.json({ error: "Failed to delete voucher pool" }, { status: 500 });
  }
}
