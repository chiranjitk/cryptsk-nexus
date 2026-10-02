import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Bandwidth Policy by id (POL-ENGINE-1) ────────────────────────

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const existing = await db.bandwidthPolicy.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

    const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || null);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.policyFor !== undefined) data.policyFor = body.policyFor === "POOL" ? "POOL" : "USER";
    if (body.policyType !== undefined) data.policyType = body.policyType === "COMMITTED" ? "COMMITTED" : "STRICT";
    if (body.priority !== undefined) data.priority = Math.min(7, Math.max(0, Number(body.priority ?? 5)));
    if (body.uploadKbps !== undefined) data.uploadKbps = Math.max(0, Number(body.uploadKbps) || 0);
    if (body.downloadKbps !== undefined) data.downloadKbps = Math.max(0, Number(body.downloadKbps) || 0);
    if (body.totalKbps !== undefined) data.totalKbps = numOrNull(body.totalKbps);
    if (body.shared !== undefined) data.shared = !!body.shared;
    if (body.description !== undefined) data.description = String(body.description);
    if (body.enabled !== undefined) data.enabled = !!body.enabled;

    const policy = await db.bandwidthPolicy.update({ where: { id }, data });
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Bandwidth policy PATCH error:", error);
    return NextResponse.json({ error: "Failed to update bandwidth policy" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const [planCount, fapCount] = await Promise.all([
      db.plan.count({ where: { bandwidthPolicyId: id } }),
      db.fairAccessPolicy.count({ where: { switchOverBandwidthPolicyId: id } }),
    ]);
    if (planCount > 0 || fapCount > 0) {
      const parts: string[] = [];
      if (planCount) parts.push(`${planCount} plan(s)`);
      if (fapCount) parts.push(`${fapCount} FAP switch-over(s)`);
      return NextResponse.json({ error: `Policy is used by ${parts.join(" and ")} — unbind first` }, { status: 409 });
    }
    await db.bandwidthPolicy.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Bandwidth policy DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete bandwidth policy" }, { status: 500 });
  }
}
