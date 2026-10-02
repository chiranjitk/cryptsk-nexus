import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Data Transfer Policies (POL-ENGINE-1) ────────────────────────
// 24online-parity volume quota: Absolute (capped) or Ratebased
// (postpaid), rates on Total or Individual Up/Down, MB limits,
// optional cycle reset + expiry window.

function normalize(body: Record<string, unknown>) {
  const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" || v === "UNLIMITED" ? null : Number(v) || null);
  const cycleType = ["DAILY", "WEEKLY", "MONTHLY"].includes(String(body.cycleType)) ? (body.cycleType as string) : "NONE";
  return {
    name: String(body.name || "").trim(),
    scheme: body.scheme === "RATEBASED" ? "RATEBASED" : "ABSOLUTE",
    ratesOn: body.ratesOn === "INDIVIDUAL" ? "INDIVIDUAL" : "TOTAL",
    uploadLimitMb: numOrNull(body.uploadLimitMb),
    downloadLimitMb: numOrNull(body.downloadLimitMb),
    totalLimitMb: numOrNull(body.totalLimitMb),
    cycleType,
    cycleLimitMb: cycleType !== "NONE" ? numOrNull(body.cycleLimitMb) : null,
    expiryDays: numOrNull(body.expiryDays),
    description: String(body.description || ""),
    enabled: body.enabled === undefined ? true : !!body.enabled,
  };
}

// ─── GET: list policies with plan usage ───────────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const policies = await db.dataTransferPolicy.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { Plan: true } } },
    });
    return NextResponse.json({
      policies: policies.map((p) => ({ ...p, planCount: p._count.Plan })),
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Data transfer GET error:", error);
    return NextResponse.json({ error: "Failed to fetch data transfer policies" }, { status: 500 });
  }
}

// ─── POST: create policy ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const data = normalize(body);
    if (!data.name) return NextResponse.json({ error: "Policy name is required" }, { status: 400 });
    if (data.scheme === "ABSOLUTE" && data.uploadLimitMb === null && data.downloadLimitMb === null && data.totalLimitMb === null) {
      return NextResponse.json({ error: "Absolute policy needs at least one data limit" }, { status: 400 });
    }
    const exists = await db.dataTransferPolicy.findUnique({ where: { name: data.name } });
    if (exists) return NextResponse.json({ error: "A policy with this name already exists" }, { status: 409 });
    const policy = await db.dataTransferPolicy.create({ data });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Data transfer POST error:", error);
    return NextResponse.json({ error: "Failed to create data transfer policy" }, { status: 500 });
  }
}
