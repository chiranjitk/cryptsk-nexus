import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Fair Access Policy by id (POL-ENGINE-1) ──────────────────────

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const existing = await db.fairAccessPolicy.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.fapType !== undefined) data.fapType = body.fapType === "NON_RESET" ? "NON_RESET" : "RESET";
    if (body.resetType !== undefined) data.resetType = ["DAILY", "WEEKLY", "MONTHLY"].includes(String(body.resetType)) ? body.resetType : "MONTHLY";
    if (body.resetMultiplier !== undefined) data.resetMultiplier = Math.max(1, Number(body.resetMultiplier) || 1);
    if (body.resetTime !== undefined) data.resetTime = /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(body.resetTime)) ? String(body.resetTime) : existing.resetTime;
    if (body.dataOn !== undefined) data.dataOn = ["UPLOAD", "DOWNLOAD", "TOTAL"].includes(String(body.dataOn)) ? body.dataOn : "TOTAL";
    if (body.limitMb !== undefined) data.limitMb = Math.max(0, Number(body.limitMb) || 0);
    if (body.switchOverBandwidthPolicyId !== undefined) {
      const swId = body.switchOverBandwidthPolicyId ? String(body.switchOverBandwidthPolicyId) : null;
      if (swId) {
        const bw = await db.bandwidthPolicy.findUnique({ where: { id: swId } });
        if (!bw) return NextResponse.json({ error: "Switch-over bandwidth policy not found" }, { status: 400 });
      }
      data.switchOverBandwidthPolicyId = swId;
    }
    if (body.description !== undefined) data.description = String(body.description);
    if (body.enabled !== undefined) data.enabled = !!body.enabled;

    const policy = await db.fairAccessPolicy.update({
      where: { id },
      data,
      include: { switchOverBandwidthPolicy: { select: { id: true, name: true, downloadKbps: true, uploadKbps: true } } },
    });
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("FAP PATCH error:", error);
    return NextResponse.json({ error: "Failed to update fair access policy" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const planCount = await db.plan.count({ where: { fairAccessPolicyId: id } });
    if (planCount > 0) {
      return NextResponse.json({ error: `Policy is bound to ${planCount} plan(s) — unbind it first` }, { status: 409 });
    }
    await db.fairAccessPolicy.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("FAP DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete fair access policy" }, { status: 500 });
  }
}
