import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ============================================================
// CRYPTSK Nexus — GET /api/monitoring/probes?hours=24&service=
// History of real service probe runs (service_probe_logs):
// platform service health checks + user-run diagnostics
// (service = "diagnostic:<tool>"). Newest first, max 200 rows.
// RBAC: monitoring.list
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("monitoring", "list");

    const { searchParams } = new URL(req.url);
    let hours = Number(searchParams.get("hours"));
    if (!Number.isFinite(hours) || hours <= 0) hours = 24;
    hours = Math.min(Math.round(hours), 168);
    const service = (searchParams.get("service") || "").trim();

    const probes = await db.serviceProbeLog.findMany({
      where: {
        checkedAt: { gte: new Date(Date.now() - hours * 3600 * 1000) },
        ...(service ? { service } : {}),
      },
      orderBy: { checkedAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      probes: probes.map((p) => ({
        id: p.id.toString(),
        service: p.service,
        status: p.status,
        latencyMs: p.latencyMs,
        detail: p.detail,
        checkedAt: p.checkedAt,
      })),
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/monitoring/probes] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch probe history" }, { status: 500 });
  }
}
