import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Fair Access Policies (POL-ENGINE-1) ──────────────────────────
// FAP: when a subscriber crosses the data limit the
// switch-over Bandwidth Policy throttles them. Reset type re-grants
// the full quota every cycle (D/W/M × multiplier at reset time).

function normalize(body: Record<string, unknown>) {
  const resetType = ["DAILY", "WEEKLY", "MONTHLY"].includes(String(body.resetType)) ? (body.resetType as string) : "MONTHLY";
  const resetTime = /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(body.resetTime || "")) ? String(body.resetTime) : "23:59:59";
  return {
    name: String(body.name || "").trim(),
    fapType: body.fapType === "NON_RESET" ? "NON_RESET" : "RESET",
    resetType,
    resetMultiplier: Math.max(1, Number(body.resetMultiplier) || 1),
    resetTime,
    dataOn: ["UPLOAD", "DOWNLOAD", "TOTAL"].includes(String(body.dataOn)) ? (body.dataOn as string) : "TOTAL",
    limitMb: Math.max(0, Number(body.limitMb) || 0),
    switchOverBandwidthPolicyId: body.switchOverBandwidthPolicyId ? String(body.switchOverBandwidthPolicyId) : null,
    description: String(body.description || ""),
    enabled: body.enabled === undefined ? true : !!body.enabled,
  };
}

// ─── GET: list FAPs with switch-over policy + plan usage ──────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const policies = await db.fairAccessPolicy.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        switchOverBandwidthPolicy: { select: { id: true, name: true, downloadKbps: true, uploadKbps: true } },
        _count: { select: { Plan: true } },
      },
    });
    return NextResponse.json({
      policies: policies.map((p) => ({
        id: p.id, name: p.name, fapType: p.fapType, resetType: p.resetType, resetMultiplier: p.resetMultiplier,
        resetTime: p.resetTime, dataOn: p.dataOn, limitMb: p.limitMb,
        switchOverBandwidthPolicy: p.switchOverBandwidthPolicy, description: p.description, enabled: p.enabled,
        createdAt: p.createdAt, planCount: p._count.Plan,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("FAP GET error:", error);
    return NextResponse.json({ error: "Failed to fetch fair access policies" }, { status: 500 });
  }
}

// ─── POST: create FAP ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const data = normalize(body);
    if (!data.name) return NextResponse.json({ error: "Policy name is required" }, { status: 400 });
    if (data.limitMb <= 0) return NextResponse.json({ error: "Data transfer limit must be greater than 0" }, { status: 400 });
    if (data.switchOverBandwidthPolicyId) {
      const bw = await db.bandwidthPolicy.findUnique({ where: { id: data.switchOverBandwidthPolicyId } });
      if (!bw) return NextResponse.json({ error: "Switch-over bandwidth policy not found" }, { status: 400 });
    }
    const exists = await db.fairAccessPolicy.findUnique({ where: { name: data.name } });
    if (exists) return NextResponse.json({ error: "A policy with this name already exists" }, { status: 409 });
    const policy = await db.fairAccessPolicy.create({ data });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("FAP POST error:", error);
    return NextResponse.json({ error: "Failed to create fair access policy" }, { status: 500 });
  }
}
