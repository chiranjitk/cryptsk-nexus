import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// PUT /api/charge-overrides/:id — Update a charge override
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { overridePrice, validFrom, validUntil, reason } = body;

    const existing = await db.subscriberChargeOverride.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Charge override not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (overridePrice !== undefined) {
      updateData.newPrice = parseFloat(String(overridePrice));
    }
    if (validFrom !== undefined) {
      const parsed = new Date(validFrom);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "validFrom must be a valid date" }, { status: 400 });
      }
      updateData.validFrom = parsed;
    }
    if (validUntil !== undefined) {
      if (validUntil === null || validUntil === "") {
        updateData.validUntil = null;
      } else {
        const parsed = new Date(validUntil);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "validUntil must be a valid date or null" }, { status: 400 });
        }
        updateData.validUntil = parsed;
      }
    }
    if (reason !== undefined) {
      updateData.reason = reason;
    }

    // Re-compute status based on dates
    const now = new Date();
    const fromDate = updateData.validFrom ? new Date(updateData.validFrom as Date) : existing.validFrom;
    const untilDate = updateData.validUntil !== undefined ? updateData.validUntil as Date | null : existing.validUntil;

    if (existing.status !== "CANCELLED") {
      if (fromDate > now) {
        updateData.status = "SCHEDULED";
      } else if (untilDate && untilDate < now) {
        updateData.status = "EXPIRED";
      } else {
        updateData.status = "ACTIVE";
      }
    }

    const override = await db.subscriberChargeOverride.update({
      where: { id },
      data: updateData,
      include: {
        Subscriber: {
          select: { id: true, name: true, code: true, Plan: { select: { id: true, name: true, priceMonthly: true } } },
        },
      },
    });

    return NextResponse.json({ override });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Charge override PUT error:", error);
    return NextResponse.json({ error: "Failed to update charge override" }, { status: 500 });
  }
}

// DELETE /api/charge-overrides/:id — Cancel (delete) a charge override
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const existing = await db.subscriberChargeOverride.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Charge override not found" }, { status: 404 });
    }

    if (existing.status === "CANCELLED") {
      return NextResponse.json({ error: "Override is already cancelled" }, { status: 400 });
    }

    // Set status to CANCELLED instead of deleting
    const override = await db.subscriberChargeOverride.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ override });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Charge override DELETE error:", error);
    return NextResponse.json({ error: "Failed to cancel charge override" }, { status: 500 });
  }
}
