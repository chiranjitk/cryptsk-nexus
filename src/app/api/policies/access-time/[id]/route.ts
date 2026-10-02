import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Access Time Policy by id (POL-ENGINE-1) ──────────────────────
// PATCH replaces the slot grid wholesale (simple + idempotent).

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const existing = await db.accessTimePolicy.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.defaultStrategy !== undefined) data.defaultStrategy = body.defaultStrategy === "DISALLOW" ? "DISALLOW" : "ALLOW";
    if (body.description !== undefined) data.description = String(body.description);
    if (body.enabled !== undefined) data.enabled = !!body.enabled;

    const policy = await db.accessTimePolicy.update({ where: { id }, data });

    if (Array.isArray(body.slots)) {
      const s = body.slots as Record<string, unknown>[];
      const hhmmToMin = (v: unknown): number => {
        const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
        return m ? Math.min(1439, Math.max(0, Number(m[1]) * 60 + Number(m[2]))) : 0;
      };
      const slots = s
        .map((raw) => {
          const day = Number(raw.dayOfWeek);
          if (!Number.isInteger(day) || day < 0 || day > 6) return null;
          const fromMin = hhmmToMin(raw.from);
          const tillMin = hhmmToMin(raw.till);
          if (tillMin === fromMin) return null;
          return {
            dayOfWeek: day, fromMin, tillMin,
            disallow: raw.pricingFactorPct === undefined || raw.pricingFactorPct === null || raw.pricingFactorPct === "",
            pricingFactorPct: raw.pricingFactorPct === undefined || raw.pricingFactorPct === null || raw.pricingFactorPct === "" ? null : Number(raw.pricingFactorPct),
          };
        })
        .filter(Boolean) as { dayOfWeek: number; fromMin: number; tillMin: number; disallow: boolean; pricingFactorPct: number | null }[];
      await db.accessTimeSlot.deleteMany({ where: { policyId: id } });
      if (slots.length) await db.accessTimeSlot.createMany({ data: slots.map((x) => ({ ...x, policyId: id })) });
    }

    const fresh = await db.accessTimePolicy.findUnique({ where: { id }, include: { slots: { orderBy: [{ dayOfWeek: "asc" }, { fromMin: "asc" }] } } });
    return NextResponse.json({ policy: fresh ?? policy });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Access time PATCH error:", error);
    return NextResponse.json({ error: "Failed to update access time policy" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const planCount = await db.plan.count({ where: { accessTimePolicyId: id } });
    if (planCount > 0) {
      return NextResponse.json({ error: `Policy is bound to ${planCount} plan(s) — unbind it first` }, { status: 409 });
    }
    await db.accessTimePolicy.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Access time DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete access time policy" }, { status: 500 });
  }
}
