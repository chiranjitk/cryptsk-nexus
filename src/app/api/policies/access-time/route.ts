import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Access Time Policies (POL-ENGINE-1) ──────────────────────────
// 24online-parity: weekday time slots; members are either disallowed
// or get a pricing factor during a slot; default strategy applies
// outside all slots.

type Strategy = "ALLOW" | "DISALLOW";

function hhmmToMin(v: unknown): number {
  const s = String(v || "");
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Math.min(1439, Math.max(0, Number(m[1]) * 60 + Number(m[2])));
}

function normalizeSlots(slots: unknown) {
  if (!Array.isArray(slots)) return [];
  return slots
    .map((raw) => {
      const s = raw as Record<string, unknown>;
      const day = Number(s.dayOfWeek);
      if (!Number.isInteger(day) || day < 0 || day > 6) return null;
      const fromMin = hhmmToMin(s.from);
      let tillMin = hhmmToMin(s.till);
      if (tillMin === fromMin) return null; // zero-length slot
      return {
        dayOfWeek: day,
        fromMin,
        tillMin,
        disallow: s.pricingFactorPct === undefined || s.pricingFactorPct === null || s.pricingFactorPct === "",
        pricingFactorPct:
          s.pricingFactorPct === undefined || s.pricingFactorPct === null || s.pricingFactorPct === "" ? null : Number(s.pricingFactorPct),
      };
    })
    .filter(Boolean) as { dayOfWeek: number; fromMin: number; tillMin: number; disallow: boolean; pricingFactorPct: number | null }[];
}

// ─── GET: list policies with slots + plan usage ───────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const policies = await db.accessTimePolicy.findMany({
      orderBy: { createdAt: "desc" },
      include: { slots: { orderBy: [{ dayOfWeek: "asc" }, { fromMin: "asc" }] }, _count: { select: { Plan: true } } },
    });
    return NextResponse.json({
      policies: policies.map((p) => ({
        id: p.id, name: p.name, defaultStrategy: p.defaultStrategy, description: p.description,
        enabled: p.enabled, createdAt: p.createdAt,
        slots: p.slots.map((s) => ({
          id: s.id, dayOfWeek: s.dayOfWeek, from: `${String(Math.floor(s.fromMin / 60)).padStart(2, "0")}:${String(s.fromMin % 60).padStart(2, "0")}`,
          till: `${String(Math.floor(s.tillMin / 60)).padStart(2, "0")}:${String(s.tillMin % 60).padStart(2, "0")}`,
          disallow: s.disallow, pricingFactorPct: s.pricingFactorPct,
        })),
        planCount: p._count.Plan,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Access time GET error:", error);
    return NextResponse.json({ error: "Failed to fetch access time policies" }, { status: 500 });
  }
}

// ─── POST: create policy (optionally with slots) ──────────────────
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Policy name is required" }, { status: 400 });
    const defaultStrategy: Strategy = body.defaultStrategy === "DISALLOW" ? "DISALLOW" : "ALLOW";
    const slots = normalizeSlots(body.slots);
    const exists = await db.accessTimePolicy.findUnique({ where: { name } });
    if (exists) return NextResponse.json({ error: "A policy with this name already exists" }, { status: 409 });

    const policy = await db.accessTimePolicy.create({
      data: {
        name,
        defaultStrategy,
        description: String(body.description || ""),
        enabled: body.enabled === undefined ? true : !!body.enabled,
        slots: { create: slots },
      },
      include: { slots: true },
    });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Access time POST error:", error);
    return NextResponse.json({ error: "Failed to create access time policy" }, { status: 500 });
  }
}
