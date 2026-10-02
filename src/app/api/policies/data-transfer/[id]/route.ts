import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Data Transfer Policy by id (POL-ENGINE-1) ────────────────────

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const existing = await db.dataTransferPolicy.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

    const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" || v === "UNLIMITED" ? null : Number(v) || null);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.scheme !== undefined) data.scheme = body.scheme === "RATEBASED" ? "RATEBASED" : "ABSOLUTE";
    if (body.ratesOn !== undefined) data.ratesOn = body.ratesOn === "INDIVIDUAL" ? "INDIVIDUAL" : "TOTAL";
    if (body.uploadLimitMb !== undefined) data.uploadLimitMb = numOrNull(body.uploadLimitMb);
    if (body.downloadLimitMb !== undefined) data.downloadLimitMb = numOrNull(body.downloadLimitMb);
    if (body.totalLimitMb !== undefined) data.totalLimitMb = numOrNull(body.totalLimitMb);
    if (body.cycleType !== undefined) data.cycleType = ["DAILY", "WEEKLY", "MONTHLY"].includes(String(body.cycleType)) ? body.cycleType : "NONE";
    if (body.cycleLimitMb !== undefined) {
      const ct = (data.cycleType as string) || existing.cycleType;
      data.cycleLimitMb = ct !== "NONE" ? numOrNull(body.cycleLimitMb) : null;
    }
    if (body.expiryDays !== undefined) data.expiryDays = numOrNull(body.expiryDays);
    if (body.description !== undefined) data.description = String(body.description);
    if (body.enabled !== undefined) data.enabled = !!body.enabled;

    const policy = await db.dataTransferPolicy.update({ where: { id }, data });
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Data transfer PATCH error:", error);
    return NextResponse.json({ error: "Failed to update data transfer policy" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const planCount = await db.plan.count({ where: { dataTransferPolicyId: id } });
    if (planCount > 0) {
      return NextResponse.json({ error: `Policy is bound to ${planCount} plan(s) — unbind it first` }, { status: 409 });
    }
    await db.dataTransferPolicy.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Data transfer DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete data transfer policy" }, { status: 500 });
  }
}
