import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─────────────────────────────────────────────────────────────
// GET — List actions with pagination & filters, or full subscriber history
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    // ── List actions (with pagination, subscriber filter, action type filter) ──
    if (action === "list") {
      const page = parseInt(searchParams.get("page") || "1");
      const limit = parseInt(searchParams.get("limit") || "25");
      const subscriberId = searchParams.get("subscriberId");
      const actionType = searchParams.get("actionType");
      const entityType = searchParams.get("entityType");
      const isReversible = searchParams.get("isReversible");
      const performedBy = searchParams.get("performedBy");
      const from = searchParams.get("from");
      const to = searchParams.get("to");

      const where: Record<string, unknown> = {};

      if (subscriberId) {
        where.subscriberId = subscriberId;
      }
      if (actionType) {
        where.actionType = actionType;
      }
      if (entityType) {
        where.entityType = entityType;
      }
      if (isReversible === "true") {
        where.isReversible = true;
      }
      if (performedBy) {
        where.performedBy = performedBy;
      }

      // Date range filter
      if (from || to) {
        const createdAt: Record<string, Date> = {};
        if (from) {
          createdAt.gte = new Date(from);
        }
        if (to) {
          createdAt.lte = new Date(to);
        }
        where.createdAt = createdAt;
      }

      // Only show non-reversed by default (unless specifically requested)
      const showReversed = searchParams.get("showReversed") === "true";
      if (!showReversed) {
        where.reversedById = null;
      }

      const [actions, total] = await Promise.all([
        db.userActionHistory.findMany({
          where,
          include: {
            Subscriber: {
              select: { id: true, name: true, code: true },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.userActionHistory.count({ where }),
      ]);

      return NextResponse.json({ actions, total, page, limit });
    }

    // ── Full history for a subscriber ──
    if (action === "subscriber") {
      const subscriberId = searchParams.get("subscriberId");
      if (!subscriberId) {
        return NextResponse.json(
          { error: "Missing required query param: subscriberId" },
          { status: 400 }
        );
      }

      const subscriber = await db.subscriber.findUnique({
        where: { id: subscriberId },
        select: { id: true, name: true, code: true },
      });

      if (!subscriber) {
        return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
      }

      const actionType = searchParams.get("actionType");
      const entityType = searchParams.get("entityType");

      const where: Record<string, unknown> = { subscriberId };
      if (actionType) {
        where.actionType = actionType;
      }
      if (entityType) {
        where.entityType = entityType;
      }

      const actions = await db.userActionHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({
        subscriber,
        actions,
        total: actions.length,
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Valid GET actions: list, subscriber" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Action history GET error:", error);
    return NextResponse.json({ error: "Failed to fetch action history" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// POST — Record a new action, or reverse an existing reversible action
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");
    const body = await req.json();

    // ── Record a new action ──
    if (action === "record") {
      const {
        subscriberId,
        actionType,
        entityType,
        entityId,
        oldValues,
        newValues,
        performedBy,
        isReversible,
      } = body;

      if (!subscriberId || !actionType) {
        return NextResponse.json(
          { error: "Missing required fields: subscriberId, actionType" },
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

      // Validate actionType
      const validActionTypes = [
        "PLAN_CHANGE",
        "PLAN_ASSIGN",
        "RENEWAL",
        "SUSPEND",
        "ACTIVATE",
        "PLAN_UPGRADE",
        "PLAN_DOWNGRADE",
        "FAP_TRIGGER",
        "TOPUP_APPLY",
        "REVERSAL",
        "PRICE_OVERRIDE",
        "GRACE_APPLY",
        "NOTE_ADD",
      ];
      if (!validActionTypes.includes(actionType)) {
        return NextResponse.json(
          { error: `Invalid actionType. Must be one of: ${validActionTypes.join(", ")}` },
          { status: 400 }
        );
      }

      // Ensure JSON fields are properly stringified
      let oldValuesStr = "{}";
      let newValuesStr = "{}";
      try {
        oldValuesStr = typeof oldValues === "string" ? oldValues : JSON.stringify(oldValues || {});
      } catch {
        oldValuesStr = "{}";
      }
      try {
        newValuesStr = typeof newValues === "string" ? newValues : JSON.stringify(newValues || {});
      } catch {
        newValuesStr = "{}";
      }

      const historyEntry = await db.userActionHistory.create({
        data: {
          subscriberId,
          actionType,
          entityType: entityType ?? "",
          entityId: entityId ?? "",
          oldValues: oldValuesStr,
          newValues: newValuesStr,
          performedBy: performedBy ?? "",
          isReversible: isReversible ?? false,
        },
        include: {
          Subscriber: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      return NextResponse.json({ historyEntry }, { status: 201 });
    }

    // ── Reverse an action ──
    if (action === "reverse") {
      const { id, reversedById, reversalNote } = body;

      if (!id) {
        return NextResponse.json(
          { error: "Missing required field: id" },
          { status: 400 }
        );
      }

      const existing = await db.userActionHistory.findUnique({
        where: { id },
      });

      if (!existing) {
        return NextResponse.json({ error: "Action history entry not found" }, { status: 404 });
      }

      // Check if action is reversible
      if (!existing.isReversible) {
        return NextResponse.json(
          { error: "This action is not reversible. Only actions marked as reversible can be reversed." },
          { status: 400 }
        );
      }

      // Check if already reversed
      if (existing.reversedById) {
        return NextResponse.json(
          { error: "This action has already been reversed" },
          { status: 400 }
        );
      }

      const reversedEntry = await db.userActionHistory.update({
        where: { id },
        data: {
          reversedById: reversedById ?? null,
          reversedAt: new Date(),
          reversalNote: reversalNote ?? "",
        },
        include: {
          Subscriber: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      // Also create a REVERSAL history entry for audit trail
      await db.userActionHistory.create({
        data: {
          subscriberId: existing.subscriberId,
          actionType: "REVERSAL",
          entityType: existing.entityType,
          entityId: existing.id,
          oldValues: existing.newValues, // What was applied
          newValues: existing.oldValues, // What it reverts to
          performedBy: reversedById ?? "",
          isReversible: false, // A reversal itself is not reversible
        },
      });

      return NextResponse.json({ reversedEntry });
    }

    return NextResponse.json(
      { error: "Unknown action. Valid POST actions: record, reverse" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Action history POST error:", error);
    return NextResponse.json({ error: "Failed to perform action history operation" }, { status: 500 });
  }
}
