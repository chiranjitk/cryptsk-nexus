import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { fireEventAsync } from "@/lib/services/webhook-service";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, permissionFor, AuthError } from "@/lib/api-auth";

const PRIORITY_SLA: Record<string, number> = {
  P1_CRITICAL: 4,
  P2_HIGH: 8,
  P3_MEDIUM: 24,
  P4_LOW: 48,
};

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const type = searchParams.get("type");
    const areaId = searchParams.get("areaId");
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (areaId) where.areaId = areaId;

    // Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo + "T23:59:59.999Z");
    }

    // Search filter
    if (search) {
      where.OR = [
        { ticketNumber: { contains: search } },
        { description: { contains: search } },
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
        { Subscriber: { phone: { contains: search } } },
        { walkInName: { contains: search } },
      ];
    }

    // Validate sort fields
    const allowedSortFields = ["createdAt", "updatedAt", "priority", "status", "ticketNumber", "slaDeadline", "escalationLevel"];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const validSortOrder = sortOrder === "asc" ? "asc" : "desc";

    const [complaints, total] = await Promise.all([
      db.complaint.findMany({
        where,
        include: {
          Subscriber: { select: { id: true, name: true, phone: true, code: true } },
          Area: { select: { id: true, name: true, code: true } },
          Technician: { select: { id: true, name: true, phone: true, status: true } },
        },
        orderBy: { [validSortBy]: validSortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.complaint.count({ where }),
    ]);

    const stats = await db.complaint.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {};
    for (const s of stats) {
      statusCounts[s.status] = s._count.id;
    }

    // Repeat caller detection: find subscriberIds with 3+ complaints in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const repeatCallers = await db.complaint.groupBy({
      by: ["subscriberId"],
      where: {
        subscriberId: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: { id: true },
      having: {
        id: { _count: { gte: 3 } },
      },
    });
    const repeatCallerIds = new Set(repeatCallers.map((r) => r.subscriberId));

    // Get comment counts for all complaints in this batch
    const complaintIds = complaints.map((c) => c.id);
    const commentCounts = await db.complaintComment.groupBy({
      by: ["complaintId"],
      where: { complaintId: { in: complaintIds } },
      _count: { id: true },
    });
    const commentCountMap: Record<string, number> = {};
    for (const cc of commentCounts) {
      commentCountMap[cc.complaintId] = cc._count.id;
    }

    // Auto-escalation check for active complaints
    const escalationSettings = await db.ispSettings.findUnique({ where: { id: "default" } });
    if (escalationSettings?.complaintEscalationEnabled) {
      const activeComplaints = complaints.filter((c) =>
        ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(c.status) &&
        !c.isSlaPaused &&
        c.slaDeadline &&
        c.escalationLevel < 2
      );

      for (const c of activeComplaints) {
        const now = Date.now();
        const deadline = new Date(c.slaDeadline!).getTime();
        const created = new Date(c.createdAt).getTime();
        const totalSlaMs = Math.max(deadline - created, 1);
        const elapsedMs = now - created;
        const elapsedPercent = (elapsedMs / totalSlaMs) * 100;

        let newLevel = c.escalationLevel;
        const level1Percent = escalationSettings.complaintEscalationLevel1Percent || 75;
        const level2Percent = escalationSettings.complaintEscalationLevel2Percent || 100;

        if (elapsedPercent >= level2Percent && c.escalationLevel < 2) {
          newLevel = 2;
        } else if (elapsedPercent >= level1Percent && c.escalationLevel < 1) {
          newLevel = 1;
        }

        if (newLevel !== c.escalationLevel) {
          await db.complaint.update({
            where: { id: c.id },
            data: { escalationLevel: newLevel },
          });
          await db.auditLog.create({
            data: {
              action: "AUTO_ESCALATION",
              entity: "Complaint",
              entityId: c.id,
              details: JSON.stringify({
                ticketNumber: c.ticketNumber,
                fromLevel: c.escalationLevel,
                toLevel: newLevel,
                toRole: newLevel === 1
                  ? (escalationSettings.complaintEscalationRole1 || "MANAGER")
                  : (escalationSettings.complaintEscalationRole2 || "ADMIN"),
                elapsedPercent: Math.round(elapsedPercent * 10) / 10,
              }),
              userName: "System",
            },
          });
          // Update in-memory object
          (c as Record<string, unknown>).escalationLevel = newLevel;
        }
      }
    }

    // Mark complaints with repeat caller flag and add comment counts
    // [AUDIT-FIX F-16] The GET-side auto-escalation sweep was REMOVED — side
    // effects in a read path meant escalation depended on who happened to open
    // the complaints page. job-007 (billing-cron SLA sweep, runs hourly) now
    // owns escalation; this handler enriches rows with a read-only breach flag.
    const nowMs = Date.now();
    const complaintsWithRepeat = complaints.map((c) => ({
      ...c,
      isSlaBreached:
        !c.isSlaPaused &&
        !!c.slaDeadline &&
        ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"].includes(c.status) &&
        nowMs > new Date(c.slaDeadline).getTime(),
      isRepeatCaller: c.subscriberId ? repeatCallerIds.has(c.subscriberId) : false,
      repeatCallerCount: c.subscriberId
        ? repeatCallers.find((r) => r.subscriberId === c.subscriberId)?._count.id || 0
        : 0,
      _commentCount: commentCountMap[c.id] || 0,
    }));

    // Prisma relation keys are capitalized (Subscriber/Area/Technician) but the
    // client contract is lowercase (subscriber/area/assignedTo) — remap per row
    // and drop the capitalized keys (computed repeat-caller fields survive).
    const mappedComplaints = complaintsWithRepeat.map((c) => {
      const { Subscriber, Area, Technician, ...rest } = c;
      return {
        ...rest,
        subscriber: Subscriber ?? null,
        area: Area ?? null,
        assignedTo: Technician ?? null,
      };
    });

    return NextResponse.json({
      complaints: mappedComplaints,
      statusCounts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Complaints GET error:", error);
    return NextResponse.json({ error: "Failed to fetch complaints" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    // [AUDIT-FIX F-20] Ticket creation is staff+ workflow — CUSTOMER role excluded here
    await permissionFor(userId, "complaints.create");
    const body = await req.json();
    const { subscriberId, walkInName, areaId, type, priority, description, slaHours } = body;

    if (!type || !description) {
      return NextResponse.json({ error: "Type and description are required" }, { status: 400 });
    }

    const isWalkIn = !subscriberId || subscriberId === "walk-in" || subscriberId === "";

    if (isWalkIn && !walkInName) {
      return NextResponse.json({ error: "Walk-in customer name is required" }, { status: 400 });
    }

    const now = new Date();
    // Auto-set SLA based on priority if not provided
    const resolvedPriority = priority || "P3_MEDIUM";
    const hours = slaHours || PRIORITY_SLA[resolvedPriority] || 24;
    const slaDeadline = new Date(now.getTime() + hours * 60 * 60 * 1000);

    // Generate ticket number: CMP-YYYYMMDD-XXXX
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const count = await db.complaint.count({
      where: {
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
    });
    const ticketNumber = `CMP-${dateStr}-${String(count + 1).padStart(4, "0")}`;

    const finalSubscriberId = isWalkIn ? null : (subscriberId || null);

    const complaint = await db.complaint.create({
      data: {
        ticketNumber,
        subscriberId: finalSubscriberId,
        walkInName: isWalkIn ? (walkInName || "") : "",
        areaId: areaId || null,
        type,
        priority: resolvedPriority,
        description: isWalkIn ? `[Walk-in] ${description}` : description,
        slaHours: hours,
        slaDeadline,
        status: "OPEN",
      },
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, code: true } },
        Area: { select: { id: true, name: true, code: true } },
      },
    });

    // Fire webhook event
    fireEventAsync("complaint.opened", {
      complaintId: complaint.id,
      ticketNumber,
      type,
      priority: complaint.priority,
      subscriberId: finalSubscriberId,
      subscriberName: complaint.Subscriber?.name,
      walkInName: isWalkIn ? walkInName : undefined,
      areaId,
      slaDeadline: complaint.slaDeadline,
    });

    await auditCreate(req, "Complaint", complaint.id, { ticketNumber, type, priority: complaint.priority }, { userId });
    return NextResponse.json({ complaint }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Complaints POST error:", error);
    return NextResponse.json({ error: "Failed to create complaint" }, { status: 500 });
  }
}
