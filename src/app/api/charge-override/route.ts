import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET /api/charge-override — action-based routing
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    switch (action) {
      case "list":
        return handleList(searchParams);
      case "subscriber":
        return handleSubscriber(searchParams);
      case "active-overrides":
        return handleActiveOverrides();
      default:
        return NextResponse.json({ error: "Invalid action. Use: list, subscriber, active-overrides" }, { status: 400 });
    }
  } catch (error) {
    console.error("Charge Override GET error:", error);
    return NextResponse.json({ error: "Failed to process charge override request" }, { status: 500 });
  }
}

// POST /api/charge-override — action-based routing
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    switch (action) {
      case "create":
        return handleCreate(req);
      case "update":
        return handleUpdate(req);
      case "cancel":
        return handleCancel(req);
      default:
        return NextResponse.json({ error: "Invalid action. Use: create, update, cancel" }, { status: 400 });
    }
  } catch (error) {
    console.error("Charge Override POST error:", error);
    return NextResponse.json({ error: "Failed to process charge override request" }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────
// GET ?action=list — List all charge overrides with subscriber info
// ────────────────────────────────────────────────────────────────
async function handleList(searchParams: URLSearchParams) {
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const status = searchParams.get("status") || "";

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [overrides, total] = await Promise.all([
    db.subscriberChargeOverride.findMany({
      where,
      include: {
        Subscriber: {
          select: { id: true, code: true, name: true, phone: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.subscriberChargeOverride.count({ where }),
  ]);

  return NextResponse.json({
    overrides,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

// ────────────────────────────────────────────────────────────────
// GET ?action=subscriber&subscriberId=xxx
// ────────────────────────────────────────────────────────────────
async function handleSubscriber(searchParams: URLSearchParams) {
  const subscriberId = searchParams.get("subscriberId");
  if (!subscriberId) {
    return NextResponse.json({ error: "Missing required parameter: subscriberId" }, { status: 400 });
  }

  // Verify subscriber exists
  const subscriber = await db.subscriber.findUnique({
    where: { id: subscriberId },
    select: { id: true, code: true, name: true, planId: true },
  });
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }

  const overrides = await db.subscriberChargeOverride.findMany({
    where: { subscriberId },
    orderBy: { createdAt: "desc" },
  });

  // Determine the currently effective override (ACTIVE + within validity window)
  const now = new Date();
  const effectiveOverride = overrides.find((o) => {
    if (o.status !== "ACTIVE") return false;
    const fromOk = o.validFrom <= now;
    const untilOk = o.validUntil === null || o.validUntil >= now;
    return fromOk && untilOk;
  });

  return NextResponse.json({
    subscriber,
    overrides,
    total: overrides.length,
    effectiveOverride: effectiveOverride || null,
  });
}

// ────────────────────────────────────────────────────────────────
// GET ?action=active-overrides — All currently active overrides
// ────────────────────────────────────────────────────────────────
async function handleActiveOverrides() {
  const now = new Date();

  const overrides = await db.subscriberChargeOverride.findMany({
    where: {
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [
        { validUntil: { gte: now } },
        { validUntil: null },
      ],
    },
    include: {
      Subscriber: {
        select: { id: true, code: true, name: true, phone: true, status: true, planId: true },
      },
    },
    orderBy: { validFrom: "desc" },
  });

  return NextResponse.json({
    overrides,
    total: overrides.length,
    queriedAt: now.toISOString(),
  });
}

// ────────────────────────────────────────────────────────────────
// POST ?action=create — Create charge override
// ────────────────────────────────────────────────────────────────
async function handleCreate(req: NextRequest) {
  const body = await req.json();
  const {
    subscriberId,
    planId,
    oldPrice,
    newPrice,
    reason,
    approvedBy,
    validFrom,
    validUntil,
  } = body;

  // Validate required fields
  if (!subscriberId) {
    return NextResponse.json({ error: "subscriberId is required" }, { status: 400 });
  }
  if (newPrice === undefined || newPrice === null) {
    return NextResponse.json({ error: "newPrice is required" }, { status: 400 });
  }
  if (!validFrom) {
    return NextResponse.json({ error: "validFrom is required" }, { status: 400 });
  }

  // Verify subscriber exists
  const subscriber = await db.subscriber.findUnique({
    where: { id: subscriberId },
    select: { id: true },
  });
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }

  const parsedValidFrom = new Date(validFrom);
  if (isNaN(parsedValidFrom.getTime())) {
    return NextResponse.json({ error: "validFrom must be a valid date" }, { status: 400 });
  }

  let parsedValidUntil: Date | null = null;
  if (validUntil) {
    parsedValidUntil = new Date(validUntil);
    if (isNaN(parsedValidUntil.getTime())) {
      return NextResponse.json({ error: "validUntil must be a valid date" }, { status: 400 });
    }
    if (parsedValidUntil <= parsedValidFrom) {
      return NextResponse.json({ error: "validUntil must be after validFrom" }, { status: 400 });
    }
  }

  const override = await db.subscriberChargeOverride.create({
    data: {
      subscriberId,
      planId: planId || null,
      oldPrice: oldPrice ? parseFloat(String(oldPrice)) : 0,
      newPrice: parseFloat(String(newPrice)),
      reason: reason || "",
      approvedBy: approvedBy || null,
      validFrom: parsedValidFrom,
      validUntil: parsedValidUntil,
    },
    include: {
      Subscriber: {
        select: { id: true, code: true, name: true, phone: true },
      },
    },
  });

  return NextResponse.json({ override }, { status: 201 });
}

// ────────────────────────────────────────────────────────────────
// POST ?action=update — Update override fields
// ────────────────────────────────────────────────────────────────
async function handleUpdate(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify override exists
  const existing = await db.subscriberChargeOverride.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Charge override not found" }, { status: 404 });
  }

  // Build update payload with only allowed fields
  const updateData: Record<string, unknown> = {};

  if (fields.newPrice !== undefined) {
    updateData.newPrice = parseFloat(String(fields.newPrice));
  }
  if (fields.oldPrice !== undefined) {
    updateData.oldPrice = parseFloat(String(fields.oldPrice));
  }
  if (fields.reason !== undefined) {
    updateData.reason = fields.reason;
  }
  if (fields.approvedBy !== undefined) {
    updateData.approvedBy = fields.approvedBy || null;
  }
  if (fields.planId !== undefined) {
    updateData.planId = fields.planId || null;
  }
  if (fields.status !== undefined) {
    const validStatuses = ["ACTIVE", "EXPIRED", "CANCELLED"];
    if (!validStatuses.includes(fields.status)) {
      return NextResponse.json({ error: `status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }
    updateData.status = fields.status;
  }
  if (fields.validFrom !== undefined) {
    const parsed = new Date(fields.validFrom);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "validFrom must be a valid date" }, { status: 400 });
    }
    updateData.validFrom = parsed;
  }
  if (fields.validUntil !== undefined) {
    if (fields.validUntil === null) {
      updateData.validUntil = null;
    } else {
      const parsed = new Date(fields.validUntil);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "validUntil must be a valid date or null" }, { status: 400 });
      }
      updateData.validUntil = parsed;
    }
  }

  const override = await db.subscriberChargeOverride.update({
    where: { id },
    data: updateData,
    include: {
      Subscriber: {
        select: { id: true, code: true, name: true, phone: true },
      },
    },
  });

  return NextResponse.json({ override });
}

// ────────────────────────────────────────────────────────────────
// POST ?action=cancel — Cancel override
// ────────────────────────────────────────────────────────────────
async function handleCancel(req: NextRequest) {
  const body = await req.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify override exists
  const existing = await db.subscriberChargeOverride.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Charge override not found" }, { status: 404 });
  }

  if (existing.status === "CANCELLED") {
    return NextResponse.json({ error: "Override is already cancelled" }, { status: 400 });
  }

  const override = await db.subscriberChargeOverride.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: {
      Subscriber: {
        select: { id: true, code: true, name: true, phone: true },
      },
    },
  });

  return NextResponse.json({ override });
}
