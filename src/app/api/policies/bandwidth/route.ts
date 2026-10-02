import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Bandwidth Policies (POL-ENGINE-1) ────────────────────────────
// speed policies on the existing BandwidthPolicy
// model: Pool/User base, Strict/Committed, priority 0-7, per-user or
// shared usage, up/down/total Kbps. Consumed by Plans and by FAP
// switch-over.

function normalize(body: Record<string, unknown>) {
  const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) || null);
  return {
    name: String(body.name || "").trim(),
    policyFor: body.policyFor === "POOL" ? "POOL" : "USER",
    policyType: body.policyType === "COMMITTED" ? "COMMITTED" : "STRICT",
    priority: Math.min(7, Math.max(0, Number(body.priority ?? 5))),
    uploadKbps: Math.max(0, Number(body.uploadKbps) || 0),
    downloadKbps: Math.max(0, Number(body.downloadKbps) || 0),
    totalKbps: numOrNull(body.totalKbps),
    shared: !!body.shared,
    description: String(body.description || ""),
    enabled: body.enabled === undefined ? true : !!body.enabled,
  };
}

// ─── GET: list bandwidth policies with plan + FAP usage ───────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const policies = await db.bandwidthPolicy.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { Plan: true, FairAccessPolicy: true } } },
    });
    return NextResponse.json({
      policies: policies.map((p) => ({
        id: p.id, name: p.name, policyFor: p.policyFor, policyType: p.policyType, priority: p.priority,
        uploadKbps: p.uploadKbps, downloadKbps: p.downloadKbps, totalKbps: p.totalKbps, shared: p.shared,
        description: p.description, enabled: p.enabled, createdAt: p.createdAt,
        planCount: p._count.Plan, fapCount: p._count.FairAccessPolicy,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Bandwidth policy GET error:", error);
    return NextResponse.json({ error: "Failed to fetch bandwidth policies" }, { status: 500 });
  }
}

// ─── POST: create bandwidth policy ────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = (await request.json()) as Record<string, unknown>;
    const data = normalize(body);
    if (!data.name) return NextResponse.json({ error: "Policy name is required" }, { status: 400 });
    if (data.uploadKbps === 0 && data.downloadKbps === 0 && data.totalKbps === null) {
      return NextResponse.json({ error: "Provide upload, download or total bandwidth" }, { status: 400 });
    }
    const exists = await db.bandwidthPolicy.findFirst({ where: { name: data.name } });
    if (exists) return NextResponse.json({ error: "A policy with this name already exists" }, { status: 409 });
    const policy = await db.bandwidthPolicy.create({ data });
    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Bandwidth policy POST error:", error);
    return NextResponse.json({ error: "Failed to create bandwidth policy" }, { status: 500 });
  }
}
