import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─────────────────────────────────────────────────────────────
// GET — List all grace periods, or get periods for a subscriber
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    // ── List all grace periods (with pagination, status filter) ──
    if (action === "list") {
      const page = parseInt(searchParams.get("page") || "1");
      const limit = parseInt(searchParams.get("limit") || "25");
      const status = searchParams.get("status");
      const graceType = searchParams.get("graceType");

      const where: Record<string, unknown> = {};
      if (status) {
        where.status = status;
      }
      if (graceType) {
        where.graceType = graceType;
      }

      const [gracePeriods, total] = await Promise.all([
        db.subscriberGracePeriod.findMany({
          where,
          include: {
            Subscriber: {
              select: { id: true, name: true, code: true, phone: true },
            },
          },
          orderBy: { appliedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.subscriberGracePeriod.count({ where }),
      ]);

      return NextResponse.json({ gracePeriods, total, page, limit });
    }

    // ── Get grace periods for a specific subscriber ──
    if (action === "subscriber") {
      const subscriberId = searchParams.get("subscriberId");
      if (!subscriberId) {
        return NextResponse.json(
          { error: "Missing required query param: subscriberId" },
          { status: 400 }
        );
      }

      const gracePeriods = await db.subscriberGracePeriod.findMany({
        where: { subscriberId },
        orderBy: { appliedAt: "desc" },
      });

      return NextResponse.json({ gracePeriods });
    }

    return NextResponse.json(
      { error: "Unknown action. Valid GET actions: list, subscriber" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Grace periods GET error:", error);
    return NextResponse.json({ error: "Failed to fetch grace periods" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// POST — Apply, update status, or cancel a grace period
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");
    const body = await req.json();

    // ── Apply grace period ──
    if (action === "apply") {
      const { subscriberId, graceDays, graceType, reason, appliedBy } = body;

      if (!subscriberId || graceDays === undefined || !graceDays) {
        return NextResponse.json(
          { error: "Missing required fields: subscriberId, graceDays" },
          { status: 400 }
        );
      }

      // Verify subscriber exists
      const subscriber = await db.subscriber.findUnique({
        where: { id: subscriberId },
      });
      if (!subscriber) {
        return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
      }

      // Validate graceDays is positive
      if (graceDays <= 0) {
        return NextResponse.json(
          { error: "graceDays must be a positive integer" },
          { status: 400 }
        );
      }

      const gracePeriod = await db.subscriberGracePeriod.create({
        data: {
          subscriberId,
          graceDays,
          graceType: graceType ?? "POST_BILLING",
          reason: reason ?? "",
          appliedBy: appliedBy ?? null,
        },
      });

      return NextResponse.json({ gracePeriod }, { status: 201 });
    }

    // ── Update grace period status ──
    if (action === "update-status") {
      const { id, status, suspensionDate } = body;

      if (!id || !status) {
        return NextResponse.json(
          { error: "Missing required fields: id, status" },
          { status: 400 }
        );
      }

      // Validate status value
      const validStatuses = ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      const existing = await db.subscriberGracePeriod.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Grace period not found" }, { status: 404 });
      }

      // Cannot update if already CANCELLED or EXPIRED
      if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
        return NextResponse.json(
          { error: `Cannot update grace period with status: ${existing.status}` },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = { status };
      if (suspensionDate !== undefined) {
        updateData.suspensionDate = suspensionDate ? new Date(suspensionDate) : null;
      }

      const gracePeriod = await db.subscriberGracePeriod.update({
        where: { id },
        data: updateData,
      });

      return NextResponse.json({ gracePeriod });
    }

    // ── Cancel grace period ──
    if (action === "cancel") {
      const { id } = body;

      if (!id) {
        return NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        );
      }

      const existing = await db.subscriberGracePeriod.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Grace period not found" }, { status: 404 });
      }

      if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
        return NextResponse.json(
          { error: `Cannot cancel grace period with status: ${existing.status}` },
          { status: 400 }
        );
      }

      const gracePeriod = await db.subscriberGracePeriod.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      return NextResponse.json({ gracePeriod });
    }

    return NextResponse.json(
      { error: "Unknown action. Valid POST actions: apply, update-status, cancel" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Grace periods POST error:", error);
    return NextResponse.json({ error: "Failed to perform grace period operation" }, { status: 500 });
  }
}
