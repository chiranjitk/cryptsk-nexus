import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Surfing Quota Policy by id (POL-ENGINE-1) ────────────────────

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const existing = await db.surfingQuotaPolicy.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

    const num = (v: unknown) => (v === null || v === undefined || v === "" || v === "UNLIMITED" ? null : Number(v) || null);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.quotaType !== undefined) data.quotaType = body.quotaType === "RATEBASED" ? "RATEBASED" : "ABSOLUTE";
    if (body.allottedHours !== undefined) data.allottedMinutes = num(body.allottedHours) !== null ? Math.round(Number(body.allottedHours) * 60) : null;
    if (body.sessionPulseMin !== undefined) data.sessionPulseMin = Math.max(1, Number(body.sessionPulseMin) || 1);
    if (body.expiryDays !== undefined) data.expiryDays = num(body.expiryDays);
    if (body.cycleType !== undefined) data.cycleType = ["DAILY", "WEEKLY", "MONTHLY"].includes(String(body.cycleType)) ? body.cycleType : "NONE";
    if (body.cycleAllottedHours !== undefined) {
      const ct = (data.cycleType as string) || existing.cycleType;
      data.cycleAllottedMinutes = ct !== "NONE" && num(body.cycleAllottedHours) !== null ? Math.round(Number(body.cycleAllottedHours) * 60) : null;
    }
    if (body.description !== undefined) data.description = String(body.description);
    if (body.enabled !== undefined) data.enabled = !!body.enabled;

    const policy = await db.surfingQuotaPolicy.update({ where: { id }, data });
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Surfing quota PATCH error:", error);
    return NextResponse.json({ error: "Failed to update surfing quota policy" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const planCount = await db.plan.count({ where: { surfingQuotaPolicyId: id } });
    if (planCount > 0) {
      return NextResponse.json({ error: `Policy is bound to ${planCount} plan(s) — unbind it first` }, { status: 409 });
    }
    await db.surfingQuotaPolicy.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Surfing quota DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete surfing quota policy" }, { status: 500 });
  }
}
