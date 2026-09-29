import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate, auditDelete } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — PATCH/DELETE /api/installations/[id]
// Installation workflow:
//   scheduled → in_progress | completed | failed | rescheduled
//   in_progress → completed | failed | rescheduled
//   rescheduled → in_progress | completed | failed
//   failed → rescheduled | scheduled   ·   completed is terminal
// completed sets completedAt; delete allowed only while
// scheduled / rescheduled / failed.
// ============================================================

const INSTALL_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["in_progress", "completed", "failed", "rescheduled"],
  in_progress: ["completed", "failed", "rescheduled"],
  completed: [],
  failed: ["rescheduled", "scheduled"],
  rescheduled: ["in_progress", "completed", "failed", "scheduled"],
};

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

// PATCH /api/installations/[id] — status + field updates
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("installation", "update");
    const { id } = await params;
    const body = await req.json();
    const { status, scheduledAt, technicianName, notes } = body;

    const current = await db.installation.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Installation not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (status && status !== current.status) {
      const allowed = INSTALL_TRANSITIONS[current.status] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status transition: ${current.status} → ${status}` },
          { status: 400 }
        );
      }
      data.status = status;
      if (status === "completed") {
        data.completedAt = new Date();
      } else {
        data.completedAt = null;
      }
    }

    if (scheduledAt !== undefined) {
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
      }
      data.scheduledAt = d;
    }
    if (technicianName !== undefined) data.technicianName = technicianName?.trim() || null;
    if (notes !== undefined) data.notes = notes?.trim() || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const installation = await db.installation.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, displayName: true, customerCode: true } },
        subscriber: { select: { id: true, radiusUsername: true } },
      },
    });

    await auditUpdate({
      userId: user.id, action: "update", resource: "installation",
      resourceId: installation.id, resourceName: installation.installNumber,
      before: { status: current.status, scheduledAt: current.scheduledAt, technicianName: current.technicianName },
      after: { status: installation.status, scheduledAt: installation.scheduledAt, technicianName: installation.technicianName },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ installation });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/installations/[id]] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update installation" }, { status: 500 });
  }
}

// DELETE /api/installations/[id] — only unscheduled/failed jobs
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("installation", "delete");
    const { id } = await params;

    const installation = await db.installation.findUnique({ where: { id } });
    if (!installation) {
      return NextResponse.json({ error: "Installation not found" }, { status: 404 });
    }
    if (!["scheduled", "rescheduled", "failed"].includes(installation.status)) {
      return NextResponse.json(
        { error: `Installations in status "${installation.status}" cannot be deleted — only scheduled, rescheduled or failed jobs.` },
        { status: 409 }
      );
    }

    await db.installation.delete({ where: { id } });

    await auditDelete({
      userId: user.id, action: "delete", resource: "installation",
      resourceId: id, resourceName: installation.installNumber,
      before: { installNumber: installation.installNumber, status: installation.status },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/installations/[id]] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete installation" }, { status: 500 });
  }
}
