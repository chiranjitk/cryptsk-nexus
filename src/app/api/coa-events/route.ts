import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET /api/coa-events — action-based routing
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "list";

    switch (action) {
      case "list":
        return handleList(searchParams);
      case "get":
        return handleGet(searchParams);
      case "subscriber-events":
        return handleSubscriberEvents(searchParams);
      case "stats":
        return handleStats();
      default:
        return NextResponse.json({ error: "Invalid action. Use: list, get, subscriber-events, stats" }, { status: 400 });
    }
  } catch (error) {
    console.error("CoA Events GET error:", error);
    return NextResponse.json({ error: "Failed to process CoA event request" }, { status: 500 });
  }
}

// POST /api/coa-events — action-based routing
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    switch (action) {
      case "create":
        return handleCreate(req);
      case "update-status":
        return handleUpdateStatus(req);
      default:
        return NextResponse.json({ error: "Invalid action. Use: create, update-status" }, { status: 400 });
    }
  } catch (error) {
    console.error("CoA Events POST error:", error);
    return NextResponse.json({ error: "Failed to process CoA event request" }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────
// GET ?action=list — List all CoA events with pagination + filters
// ────────────────────────────────────────────────────────────────
async function handleList(searchParams: URLSearchParams) {
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const subscriberId = searchParams.get("subscriberId") || "";
  const coaType = searchParams.get("coaType") || "";
  const coaStatus = searchParams.get("coaStatus") || "";

  const where: Record<string, unknown> = {};
  if (subscriberId) where.subscriberId = subscriberId;
  if (coaType) where.coaType = coaType;
  if (coaStatus) where.coaStatus = coaStatus;

  const [events, total] = await Promise.all([
    db.coaEvent.findMany({
      where,
      include: {
        Subscriber: {
          select: { id: true, code: true, name: true, phone: true },
        },
      },
      orderBy: { triggeredAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.coaEvent.count({ where }),
  ]);

  return NextResponse.json({
    events,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

// ────────────────────────────────────────────────────────────────
// GET ?action=get&id=xxx — Get single CoA event
// ────────────────────────────────────────────────────────────────
async function handleGet(searchParams: URLSearchParams) {
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing required parameter: id" }, { status: 400 });
  }

  const event = await db.coaEvent.findUnique({
    where: { id },
    include: {
      Subscriber: {
        select: { id: true, code: true, name: true, phone: true },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "CoA event not found" }, { status: 404 });
  }

  return NextResponse.json({ event });
}

// ────────────────────────────────────────────────────────────────
// GET ?action=subscriber-events&subscriberId=xxx
// ────────────────────────────────────────────────────────────────
async function handleSubscriberEvents(searchParams: URLSearchParams) {
  const subscriberId = searchParams.get("subscriberId");
  if (!subscriberId) {
    return NextResponse.json({ error: "Missing required parameter: subscriberId" }, { status: 400 });
  }

  // Verify subscriber exists
  const subscriber = await db.subscriber.findUnique({
    where: { id: subscriberId },
    select: { id: true, code: true, name: true },
  });
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }

  const events = await db.coaEvent.findMany({
    where: { subscriberId },
    orderBy: { triggeredAt: "desc" },
  });

  return NextResponse.json({
    subscriber,
    events,
    total: events.length,
  });
}

// ────────────────────────────────────────────────────────────────
// GET ?action=stats — CoA statistics
// ────────────────────────────────────────────────────────────────
async function handleStats() {
  const [total, success, failed, timeout, requested] = await Promise.all([
    db.coaEvent.count(),
    db.coaEvent.count({ where: { coaStatus: "SUCCESS" } }),
    db.coaEvent.count({ where: { coaStatus: "FAILED" } }),
    db.coaEvent.count({ where: { coaStatus: "TIMEOUT" } }),
    db.coaEvent.count({ where: { coaStatus: "REQUESTED" } }),
  ]);

  // Group by type
  const byTypeRaw = await db.coaEvent.groupBy({
    by: ["coaType"],
    _count: { id: true },
  });
  const byType: Record<string, number> = {};
  for (const row of byTypeRaw) {
    byType[row.coaType] = row._count.id;
  }

  return NextResponse.json({
    total,
    success,
    failed,
    timeout,
    requested,
    successRate: total > 0 ? ((success / total) * 100).toFixed(1) : "0",
    byType,
  });
}

// ────────────────────────────────────────────────────────────────
// POST ?action=create — Create CoA event
// ────────────────────────────────────────────────────────────────
async function handleCreate(req: NextRequest) {
  const body = await req.json();
  const {
    subscriberId,
    radiusSessionId,
    coaType,
    oldPlanId,
    newPlanId,
    oldBwPolicyId,
    newBwPolicyId,
    bwPercent,
    triggeredBy,
  } = body;

  // Validate required fields
  if (!subscriberId) {
    return NextResponse.json({ error: "subscriberId is required" }, { status: 400 });
  }

  const validCoaTypes = [
    "PLAN_CHANGE",
    "BANDWIDTH_CHANGE",
    "SESSION_DISCONNECT",
    "SESSION_TIMEOUT",
    "FAP_TRIGGER",
    "TOPUP_APPLY",
  ];
  if (!coaType || !validCoaTypes.includes(coaType)) {
    return NextResponse.json({ error: `coaType is required and must be one of: ${validCoaTypes.join(", ")}` }, { status: 400 });
  }

  // Verify subscriber exists
  const subscriber = await db.subscriber.findUnique({
    where: { id: subscriberId },
    select: { id: true },
  });
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }

  const event = await db.coaEvent.create({
    data: {
      subscriberId,
      radiusSessionId: radiusSessionId || null,
      coaType,
      oldPlanId: oldPlanId || null,
      newPlanId: newPlanId || null,
      oldBwPolicyId: oldBwPolicyId || null,
      newBwPolicyId: newBwPolicyId || null,
      bwPercent: bwPercent ? parseFloat(String(bwPercent)) : 0,
      triggeredBy: triggeredBy || "system",
    },
    include: {
      Subscriber: {
        select: { id: true, code: true, name: true, phone: true },
      },
    },
  });

  return NextResponse.json({ event }, { status: 201 });
}

// ────────────────────────────────────────────────────────────────
// POST ?action=update-status — Update CoA status
// ────────────────────────────────────────────────────────────────
async function handleUpdateStatus(req: NextRequest) {
  const body = await req.json();
  const { id, coaStatus, completedAt, errorDetail } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const validStatuses = ["REQUESTED", "SUCCESS", "FAILED", "TIMEOUT"];
  if (!coaStatus || !validStatuses.includes(coaStatus)) {
    return NextResponse.json({ error: `coaStatus must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
  }

  // Verify event exists
  const existing = await db.coaEvent.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "CoA event not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {
    coaStatus,
    completedAt: completedAt ? new Date(completedAt) : new Date(),
  };

  // Only set errorDetail when status is FAILED or TIMEOUT
  if (errorDetail) {
    updateData.errorDetail = errorDetail;
  }
  if (coaStatus === "SUCCESS") {
    updateData.errorDetail = "";
  }

  const event = await db.coaEvent.update({
    where: { id },
    data: updateData,
    include: {
      Subscriber: {
        select: { id: true, code: true, name: true, phone: true },
      },
    },
  });

  return NextResponse.json({ event });
}
