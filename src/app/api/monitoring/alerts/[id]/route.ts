import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — PATCH /api/monitoring/alerts/[id]
// Acknowledge / un-acknowledge a monitoring alert.
// Body: { isAcknowledged: true | false } — acknowledging stamps
// the session user email + timestamp; un-acknowledging clears both.
// RBAC: monitoring.update
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("monitoring", "update");
    const { id } = await params;

    let alertId: bigint;
    try {
      alertId = BigInt(id);
    } catch {
      return NextResponse.json({ error: "Invalid alert id" }, { status: 400 });
    }

    const body = await req.json();
    if (typeof body.isAcknowledged !== "boolean") {
      return NextResponse.json({ error: "isAcknowledged must be a boolean" }, { status: 400 });
    }

    const existing = await db.monitoringAlert.findUnique({ where: { id: alertId } });
    if (!existing) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    const data = body.isAcknowledged
      ? { isAcknowledged: true, acknowledgedBy: user.email, acknowledgedAt: new Date() }
      : { isAcknowledged: false, acknowledgedBy: null, acknowledgedAt: null };

    const alert = await db.monitoringAlert.update({ where: { id: alertId }, data });

    await auditUpdate({
      userId: user.id,
      action: "update",
      resource: "monitoring",
      resourceId: alert.id.toString(),
      resourceName: alert.alertKey,
      before: { isAcknowledged: existing.isAcknowledged, acknowledgedBy: existing.acknowledgedBy },
      after: { isAcknowledged: alert.isAcknowledged, acknowledgedBy: alert.acknowledgedBy },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({
      alert: {
        id: alert.id.toString(),
        alertKey: alert.alertKey,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        source: alert.source,
        isAcknowledged: alert.isAcknowledged,
        acknowledgedBy: alert.acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt,
        firstSeenAt: alert.firstSeenAt,
        lastSeenAt: alert.lastSeenAt,
        resolvedAt: alert.resolvedAt,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/monitoring/alerts/[id]] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update alert" }, { status: 500 });
  }
}
