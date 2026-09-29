import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditLog } from "@/lib/services/audit-service";
import { requireAuth } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const complaint = await db.complaint.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, email: true, code: true, address: true, Area: { select: { name: true } } } },
        Area: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { id: true, name: true, phone: true, email: true, status: true, rating: true, skills: true } },
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

    // Auto-escalation check (runs on every GET of a complaint)
    const escalated = await checkAndEscalate(complaint);

    return NextResponse.json({
      Complaint: {
        ...Complaint,
        isRepeatCaller,
        repeatCallerCount,
        escalated,
        _commentCount: await db.complaintComment.count({ where: { complaintId: id } }),
      },
    });
  } catch (error) {
    console.error("Complaint GET by ID error:", error);
    return NextResponse.json({ error: "Failed to fetch complaint" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const existing = await db.complaint.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) updateData.status = body.status;
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

    // Auto-set resolvedAt when status changes to RESOLVED
    if (body.status === "RESOLVED" && !existing.resolvedAt) {
      updateData.resolvedAt = new Date();
    }

    // Auto-set SLA deadline if assigning and SLA exists
    if (body.status === "ASSIGNED" && !existing.slaDeadline && existing.slaHours) {
      updateData.slaDeadline = new Date(existing.createdAt.getTime() + existing.slaHours * 60 * 60 * 1000);
    }

    // Update technician stats when complaint is resolved
    if (body.status === "RESOLVED" && existing.assignedToId) {
      await db.technician.update({
        where: { id: existing.assignedToId },
        data: { totalResolved: { increment: 1 } },
      });
    }

    const complaint = await db.complaint.update({
      where: { id },
      data: updateData,
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, code: true } },
        Area: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { id: true, name: true, phone: true, status: true } },
      },
    });

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

const PRIORITY_ESCALATION_ORDER: Record<string, string> = {
  P4_LOW: "P3_MEDIUM",
  P3_MEDIUM: "P2_HIGH",
  P2_HIGH: "P1_CRITICAL",
};

async function checkAndEscalate(Complaint: {
  id: string;
  ticketNumber: string;
  status: string;
  priority: string;
  escalationLevel: number;
  slaDeadline: Date | null;
  isSlaPaused: boolean;
  createdAt: Date;
}): Promise<boolean> {
  // Only check OPEN, ASSIGNED, IN_PROGRESS complaints
  const eligibleStatuses = ["OPEN", "ASSIGNED", "IN_PROGRESS"];
  if (!eligibleStatuses.includes(complaint.status)) return false;
  if (complaint.isSlaPaused) return false;
  if (!complaint.slaDeadline) return false;

  // Get escalation settings
  const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
  if (!settings?.complaintEscalationEnabled) return false;

  const now = Date.now();
  const deadline = new Date(complaint.slaDeadline).getTime();
  const created = new Date(complaint.createdAt).getTime();
  const totalSlaMs = Math.max(deadline - created, 1);
  const elapsedMs = now - created;
  const elapsedPercent = (elapsedMs / totalSlaMs) * 100;

  let escalated = false;
  let newLevel = complaint.escalationLevel;
  let newPriority: string | null = null;

  const level1Percent = settings.complaintEscalationLevel1Percent || 75;
  const level2Percent = settings.complaintEscalationLevel2Percent || 100;

  // Check if we need to escalate to Level 1 (Manager)
  if (elapsedPercent >= level1Percent && complaint.escalationLevel < 1) {
    newLevel = 1;
    escalated = true;
  }

  // Check if we need to escalate to Level 2 (Admin)
  if (elapsedPercent >= level2Percent && complaint.escalationLevel < 2) {
    newLevel = 2;
    escalated = true;
  }

  // Auto-change priority when SLA timer has breached (elapsedPercent >= 100)
  if (elapsedPercent >= 100 && PRIORITY_ESCALATION_ORDER[complaint.priority]) {
    newPriority = PRIORITY_ESCALATION_ORDER[complaint.priority];
  }

  if (escalated || newPriority) {
    const updateData: Record<string, unknown> = { escalationLevel: newLevel };
    if (newPriority) updateData.priority = newPriority;

    await db.complaint.update({
      where: { id: complaint.id },
      data: updateData,
    });

    await db.auditLog.create({
      data: {
        action: "AUTO_ESCALATION",
        entity: "Complaint",
        entityId: complaint.id,
        details: JSON.stringify({
          ticketNumber: complaint.ticketNumber,
          fromLevel: complaint.escalationLevel,
          toLevel: newLevel,
          fromPriority: complaint.priority,
          toPriority: newPriority || complaint.priority,
          toRole: newLevel === 1
            ? (settings.complaintEscalationRole1 || "MANAGER")
            : (settings.complaintEscalationRole2 || "ADMIN"),
          elapsedPercent: Math.round(elapsedPercent * 10) / 10,
          slaHoursRemaining: Math.max(0, (deadline - now) / 3600000).toFixed(1),
          priorityAutoChanged: !!newPriority,
        }),
        userName: "System",
      },
    });
  }

  return escalated || !!newPriority;
}
