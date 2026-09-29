import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

const VALID_CATEGORIES = ["ROUTER", "ONT", "SWITCH", "AP", "CABLE", "SPLITTER", "ANTENNA", "UPS", "PATCH_CORD", "OLT", "POWER_SUPPLY", "OTHER"];
const VALID_CONDITIONS = ["NEW", "GOOD", "DAMAGED", "DEAD"];
const VALID_STATUSES = ["IN_STOCK", "DEPLOYED", "RETURNED", "DECOMMISSIONED"];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(_request);
    const { id } = await params;
    const equipment = await db.equipment.findUnique({
      where: { id },
      include: { Subscriber: { select: { id: true, name: true, phone: true, code: true } } },
    });
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }
    return NextResponse.json(equipment);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Equipment get error:", error);
    return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.equipment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    // Validate enums if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category.toUpperCase())) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
    }
    if (body.condition && !VALID_CONDITIONS.includes(body.condition.toUpperCase())) {
      return NextResponse.json({ error: `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(", ")}` }, { status: 400 });
    }
    if (body.status && !VALID_STATUSES.includes(body.status.toUpperCase())) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }

    // Serial number uniqueness check if changed
    const newSerial = body.serialNumber !== undefined ? (body.serialNumber ? String(body.serialNumber).trim() : "") : existing.serialNumber;
    if (newSerial && newSerial !== existing.serialNumber) {
      const duplicate = await db.equipment.findFirst({ where: { serialNumber: newSerial } });
      if (duplicate) {
        return NextResponse.json({ error: "Equipment with this serial number already exists" }, { status: 409 });
      }
    }

    const updated = await db.equipment.update({
      where: { id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : existing.name,
        category: body.category ? body.category.toUpperCase() : existing.category,
        manufacturer: body.manufacturer !== undefined ? String(body.manufacturer) : existing.manufacturer,
        model: body.model !== undefined ? String(body.model) : existing.model,
        serialNumber: newSerial,
        condition: body.condition ? body.condition.toUpperCase() : existing.condition,
        status: body.status ? body.status.toUpperCase() : existing.status,
        stockLocation: body.stockLocation !== undefined ? String(body.stockLocation) : existing.stockLocation,
        purchasePrice: body.purchasePrice !== undefined ? Number(body.purchasePrice) : existing.purchasePrice,
      },
    });

    auditUpdate(request, "Equipment", id, { name: updated.name, category: updated.category }, { name: existing.name, category: existing.category }).catch(() => {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Equipment update error:", error);
    return NextResponse.json({ error: "Failed to update equipment" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const existing = await db.equipment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    // Prevent deletion of deployed equipment
    if (existing.status === "DEPLOYED") {
      return NextResponse.json(
        { error: "Cannot delete deployed equipment. Return it to stock first." },
        { status: 409 }
      );
    }

    auditDelete(request, "Equipment", id, { name: existing.name, serialNumber: existing.serialNumber }).catch(() => {});
    await db.equipment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Equipment delete error:", error);
    return NextResponse.json({ error: "Failed to delete equipment" }, { status: 500 });
  }
}
