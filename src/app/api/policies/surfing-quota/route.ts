import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Surfing Quota Policies (POL-ENGINE-1) ────────────────────────
// time-quota policies: Absolute (fixed hours) or
// Ratebased (postpaid), optional expiry window + per-cycle reset.

type QuotaType = "ABSOLUTE" | "RATEBASED";
type CycleType = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";

function normalize(body: Record<string, unknown>) {
  const quotaType: QuotaType = body.quotaType === "RATEBASED" ? "RATEBASED" : "ABSOLUTE";
  const cycleType: CycleType = ["DAILY", "WEEKLY", "MONTHLY"].includes(String(body.cycleType))
    ? (body.cycleType as CycleType)
    : "NONE";
  const num = (v: unknown) => (v === null || v === undefined || v === "" || v === "UNLIMITED" ? null : Number(v) || null);
  return {
    name: String(body.name || "").trim(),
    quotaType,
    allottedMinutes: num(body.allottedHours) !== null ? Math.round(Number(body.allottedHours) * 60) : null,
    sessionPulseMin: Math.max(1, Number(body.sessionPulseMin) || 1),
    expiryDays: num(body.expiryDays),
    cycleType,
    cycleAllottedMinutes:
      cycleType !== "NONE" && num(body.cycleAllottedHours) !== null
        ? Math.round(Number(body.cycleAllottedHours) * 60)
        : null,
    description: String(body.description || ""),
    enabled: body.enabled === undefined ? true : !!body.enabled,
  };
}

// ─── GET: list policies with plan usage counts ────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const policies = await db.surfingQuotaPolicy.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { Plan: true } } },
    });
    return NextResponse.json({
      policies: policies.map((p) => ({ ...p, planCount: p._count.Plan })),
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Surfing quota GET error:", error);
    return NextResponse.json({ error: "Failed to fetch surfing quota policies" }, { status: 500 });
  }
}

// ─── POST: create policy ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const data = normalize(body);
    if (!data.name) return NextResponse.json({ error: "Policy name is required" }, { status: 400 });
    if (data.quotaType === "ABSOLUTE" && data.allottedMinutes === null && data.expiryDays === null && data.cycleType === "NONE") {
      return NextResponse.json({ error: "Absolute policy needs allotted time, expiry or a cycle" }, { status: 400 });
    }
    const exists = await db.surfingQuotaPolicy.findUnique({ where: { name: data.name } });
    if (exists) return NextResponse.json({ error: "A policy with this name already exists" }, { status: 409 });
    const policy = await db.surfingQuotaPolicy.create({ data });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Surfing quota POST error:", error);
    return NextResponse.json({ error: "Failed to create surfing quota policy" }, { status: 500 });
  }
}
