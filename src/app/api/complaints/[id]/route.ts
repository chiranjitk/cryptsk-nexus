import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditLog } from "@/lib/services/audit-service";
import { requireAuth, permissionFor, AuthError } from "@/lib/api-auth";

// [AUDIT-FIX F-23] Legal status-transition matrix for complaints.
// Previously ANY status string was accepted (including invented ones),
// OPEN→RESOLVED was possible without anyone being assigned, and resolvedAt
// handling was inconsistent. REFUNDED-style terminal states prevent SLA gaming.
const VALID_COMPLAINT_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"];

const COMPLAINT_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "RESOLVED", "OPEN", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "ASSIGNED", "OPEN", "CLOSED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"],
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req); // [AUDIT-FIX F-07] complaint detail leaks subscriber PII (phone/email/address)
    const { id } = await params;

    const complaint = await db.complaint.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, email: true, code: true, address: true, Area: { select: { name: true } } } },
        Area: { select: { id: true, name: true, code: true } },
        Technician: { select: { id: true, name: true, phone: true, email: true, status: true, rating: true, skills: true } },
      },
    });

    if (!complaint) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    // Repeat caller detection: count complaints for same subscriber in last 30 days
    let isRepeatCaller = false;
    let repeatCallerCount = 0;
    if (complaint.subscriberId) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      repeatCallerCount = await db.complaint.count({
        where: {
          subscriberId: complaint.subscriberId,
          createdAt: { gte: thirtyDaysAgo },
        },
      });
      isRepeatCaller = repeatCallerCount >= 3;
    }

    // Calculate effective SLA deadline accounting for paused time
    let effectiveDeadline = complaint.slaDeadline;
    if (complaint.isSlaPaused && complaint.slaPausedAt && complaint.slaDeadline) {
      // When paused, the deadline stays at whatever it was — timer frozen
      effectiveDeadline = complaint.slaDeadline;
    } else if (complaint.slaPausedTotalMs > 0 && complaint.slaDeadline) {
      // Resume: the deadline has been extended by the paused total
      effectiveDeadline = complaint.slaDeadline;
    }

    // [AUDIT-FIX F-16] SLA escalation no longer mutates state inside a GET read
    // path (side effects in reads made metrics depend on who browsed the UI and
    // are enforced by the scheduled job-007 SLA sweep in billing-cron instead).
    const isSlaBreached =
      !complaint.isSlaPaused &&
      !!complaint.slaDeadline &&
      ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"].includes(complaint.status) &&
      Date.now() > new Date(complaint.slaDeadline).getTime();

    const { Technician: tech, ...rest } = complaint;
    return NextResponse.json({
      Complaint: {
        ...rest,
        // [BUGFIX] include was `assignedTo` — not a valid relation (schema relation
        // is `Technician`); the invalid include made this endpoint 500 forever.
        assignedTo: tech,
        isRepeatCaller,
        repeatCallerCount,
        isSlaBreached,
        _commentCount: await db.complaintComment.count({ where: { complaintId: id } }),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Complaint GET by ID error:", error);
    return NextResponse.json({ error: "Failed to fetch complaint" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    // [AUDIT-FIX F-20] Complaint workflow changes require complaints.update
    await permissionFor(userId, "complaints.update");
    const { id } = await params;
    const body = await req.json();

    const existing = await db.complaint.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    // ── [AUDIT-FIX F-23] Status state machine ──
    if (body.status !== undefined) {
      const newStatus = String(body.status);
      if (!VALID_COMPLAINT_STATUSES.includes(newStatus)) {
        return NextResponse.json(
          { error: `Invalid status "${newStatus}". Must be one of: ${VALID_COMPLAINT_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      if (newStatus === existing.status) {
        return NextResponse.json(
          { error: `Complaint is already ${newStatus}. No transition performed.` },
          { status: 409 }
        );
      }
      if (!COMPLAINT_TRANSITIONS[existing.status]?.includes(newStatus)) {
        return NextResponse.json(
          { error: `Illegal transition ${existing.status} → ${newStatus}. Allowed: ${COMPLAINT_TRANSITIONS[existing.status]?.join(", ") || "none (terminal)"}` },
          { status: 409 }
        );
      }
      // A complaint cannot be resolved unless someone owns it — unowned
      // resolutions destroy accountability and corrupt technician metrics.
      const effectiveAssignee = body.assignedToId !== undefined ? body.assignedToId : existing.assignedToId;
      if (newStatus === "RESOLVED" && !effectiveAssignee) {
        return NextResponse.json(
          { error: "Cannot resolve an unassigned complaint. Assign a technician first." },
          { status: 400 }
        );
      }
      updateData.status = newStatus;
    }

    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.assignedToId !== undefined) updateData.assignedToId = body.assignedToId || null;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.resolutionNotes !== undefined) updateData.resolutionNotes = body.resolutionNotes;
    if (body.customerRating !== undefined) updateData.customerRating = body.customerRating;
    if (body.customerFeedback !== undefined) updateData.customerFeedback = body.customerFeedback;
    if (body.slaHours !== undefined) {
      updateData.slaHours = body.slaHours;
      const hours = body.slaHours;
      updateData.slaDeadline = new Date(existing.createdAt.getTime() + hours * 60 * 60 * 1000);
    }

    // Handle SLA Pause
    if (body.isSlaPaused !== undefined && body.isSlaPaused === true && !existing.isSlaPaused) {
      updateData.isSlaPaused = true;
      updateData.slaPausedAt = new Date();
      updateData.slaPauseReason = (body.slaPauseReason as string) || "";
      // Audit log for SLA pause
      await auditLog(req, "SLA_PAUSED", "Complaint", id, {
        details: { ticketNumber: existing.ticketNumber, reason: body.slaPauseReason || "No reason provided" },
        userId,
      });
    }

    // Handle SLA Resume
    if (body.isSlaPaused !== undefined && body.isSlaPaused === false && existing.isSlaPaused) {
      const pausedDuration = existing.slaPausedAt
        ? Date.now() - new Date(existing.slaPausedAt).getTime()
        : 0;
      updateData.isSlaPaused = false;
      updateData.slaPausedTotalMs = (existing.slaPausedTotalMs || 0) + pausedDuration;
      // Clear pause reason on resume
      updateData.slaPauseReason = "";
      // Extend the SLA deadline by the paused duration
      if (existing.slaDeadline) {
        updateData.slaDeadline = new Date(new Date(existing.slaDeadline).getTime() + pausedDuration);
      }
      // Audit log for SLA resume
      await auditLog(req, "SLA_RESUMED", "Complaint", id, {
        details: {
          ticketNumber: existing.ticketNumber,
          pausedDurationMs: pausedDuration,
          pausedDurationMins: Math.round(pausedDuration / 60000),
          newDeadline: updateData.slaDeadline,
        },
        userId,
      });
    }

    // Handle manual escalation
    if (body.escalationLevel !== undefined) {
      updateData.escalationLevel = body.escalationLevel;
      const levelLabels: Record<number, string> = { 0: "none", 1: "MANAGER", 2: "ADMIN" };
      await auditLog(req, "ESCALATION", "Complaint", id, {
        details: {
          ticketNumber: existing.ticketNumber,
          fromLevel: existing.escalationLevel,
          toLevel: body.escalationLevel,
          toRole: levelLabels[body.escalationLevel] || "unknown",
          manual: true,
        },
        userId,
      });
    }

    // Auto-set resolvedAt when the transition lands on RESOLVED (once — the
    // state machine above guarantees the transition is legal and non-repeat)
    if (updateData.status === "RESOLVED" && !existing.resolvedAt) {
      updateData.resolvedAt = new Date();
    }
    // Reopening clears resolution bookkeeping
    if (updateData.status === "REOPENED") {
      updateData.resolvedAt = null;
    }

    // Auto-set SLA deadline if assigning and SLA exists — ONLY on the first
    // assignment. Re-emitting ASSIGNED must not restart the SLA clock
    // (previously every ASSIGNED write reset the timer, gaming SLA metrics).
    if (body.assignedToId !== undefined && body.assignedToId && !existing.assignedToId && !existing.slaDeadline && existing.slaHours) {
      updateData.slaDeadline = new Date(existing.createdAt.getTime() + existing.slaHours * 60 * 60 * 1000);
    }

    // Update technician stats when the complaint legally transitions to RESOLVED
    if (updateData.status === "RESOLVED" && existing.assignedToId) {
      await db.technician.update({
        where: { id: existing.assignedToId },
        data: { totalResolved: { increment: 1 } },
      });
    }

    const updated = await db.complaint.update({
      where: { id },
      data: updateData,
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, code: true } },
        Area: { select: { id: true, name: true, code: true } },
        Technician: { select: { id: true, name: true, phone: true, status: true } },
      },
    });

    const { Technician: tech2, ...rest2 } = updated;
    const complaint = { ...rest2, assignedTo: tech2 };

    await auditUpdate(req, "Complaint", id, updateData, existing, { userId });

    // Log a dedicated STATUS_CHANGE audit entry when status changes
    if (body.status !== undefined && body.status !== existing.status) {
      await auditLog(req, "STATUS_CHANGE", "Complaint", id, {
        details: {
          from: existing.status,
          to: body.status,
          ticketNumber: existing.ticketNumber,
        },
        userId,
      });
    }

    return NextResponse.json({ complaint });
  } catch (error) {
    console.error("Complaint PUT error:", error);
    return NextResponse.json({ error: "Failed to update complaint" }, { status: 500 });
  }
}

// ─── Auto-Escalation Helper ─────────────────────────────────
// [AUDIT-FIX F-16] checkAndEscalate() was removed from the GET read path and
// its logic now lives in the scheduled job-007 SLA sweep (billing-cron), so
// escalation runs on the clock instead of whenever someone browsed the page.
