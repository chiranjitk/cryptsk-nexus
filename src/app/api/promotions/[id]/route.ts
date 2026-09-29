import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

const VALID_TYPES = ["PERCENTAGE", "FLAT", "FREE_TRIAL"];
const VALID_STATUSES = ["ACTIVE", "EXPIRED", "DEPLETED"];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(_request);
    const { id } = await params;
    const promotion = await db.promotion.findUnique({ where: { id } });
    if (!promotion) {
      return NextResponse.json({ error: "Promotion not found" }, { status: 404 });
    }
    return NextResponse.json(promotion);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Promotion get error:", error);
    return NextResponse.json({ error: "Failed to fetch promotion" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.promotion.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Promotion not found" }, { status: 404 });
    }

    // --- Validation ---
    const code = body.code !== undefined ? String(body.code).trim().toUpperCase() : existing.code;
    const value = body.value !== undefined ? Number(body.value) : existing.value;
    const type = body.type !== undefined ? String(body.type).toUpperCase() : existing.type;
    const validFrom = body.validFrom ? new Date(body.validFrom) : existing.validFrom;
    const validUntil = body.validUntil ? new Date(body.validUntil) : existing.validUntil;

    // Validate type
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
    }

    // Validate value
    if (value <= 0) {
      return NextResponse.json({ error: "Value must be greater than 0" }, { status: 400 });
    }
    if (type === "PERCENTAGE" && value > 100) {
      return NextResponse.json({ error: "Percentage value cannot exceed 100" }, { status: 400 });
    }

    // Validate dates
    if (validUntil <= validFrom) {
      return NextResponse.json({ error: "Valid until date must be after valid from date" }, { status: 400 });
    }

    // Validate status if provided
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }

    // Uniqueness check if code changed
    if (code !== existing.code) {
      const duplicate = await db.promotion.findUnique({ where: { code } });
      if (duplicate) {
        return NextResponse.json({ error: "Promotion with this code already exists" }, { status: 409 });
      }
    }

    const updated = await db.promotion.update({
      where: { id },
      data: {
        code,
        description: body.description !== undefined ? String(body.description) : existing.description,
        type: type as "PERCENTAGE" | "FLAT" | "FREE_TRIAL",
        value,
        minAmount: body.minAmount !== undefined ? Number(body.minAmount) : existing.minAmount,
        maxDiscount: body.maxDiscount !== undefined && body.maxDiscount !== null ? Number(body.maxDiscount) : existing.maxDiscount,
        validFrom,
        validUntil,
        usageLimit: body.usageLimit !== undefined && body.usageLimit !== null ? Number(body.usageLimit) : existing.usageLimit,
        status: body.status !== undefined ? body.status : existing.status,
      },
    });

    auditUpdate(request, "Promotion", id, { code: updated.code, type: updated.type, value: updated.value }, { code: existing.code, type: existing.type, value: existing.value }).catch(() => {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Promotion update error:", error);
    return NextResponse.json({ error: "Failed to update promotion" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const existing = await db.promotion.findUnique({
      where: { id },
      include: {
        _count: { select: { usedBySubscribers: true, Plan: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Promotion not found" }, { status: 404 });
    }

    // Protect against deleting promotions that are actively in use
    if (existing._count.usedBySubscribers > 0) {
      return NextResponse.json(
        { error: `Cannot delete: this promotion has been used by ${existing._count.usedBySubscribers} subscriber(s). Deactivate it instead.` },
        { status: 409 }
      );
    }

    await auditDelete(request, "Promotion", id, { code: existing.code });
    await db.promotion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Promotion delete error:", error);
    return NextResponse.json({ error: "Failed to delete promotion" }, { status: 500 });
  }
}
