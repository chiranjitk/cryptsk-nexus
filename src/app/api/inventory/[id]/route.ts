import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

function calculateCurrentValue(purchasePrice: number, purchaseDate: Date | null, depreciationRate: number): number {
  if (!purchaseDate || purchasePrice <= 0 || depreciationRate <= 0) return purchasePrice;
  const now = new Date();
  const ageYears = (now.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const depreciatedValue = purchasePrice - (purchasePrice * (depreciationRate / 100) * ageYears);
  return Math.max(0, Math.round(depreciatedValue * 100) / 100);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const equipment = await db.equipment.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, code: true, phone: true, address: true } },
        Vendor: { select: { id: true, name: true, phone: true, email: true } },
        StockTransfer: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    const currentValue = equipment.currentValue || calculateCurrentValue(equipment.purchasePrice, equipment.purchaseDate, equipment.depreciationRate);
    const warrantyStatus = equipment.warrantyExpiry
      ? new Date(equipment.warrantyExpiry) < new Date()
        ? "expired"
        : new Date(equipment.warrantyExpiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          ? "expiring-soon"
          : "active"
      : "none";

    return NextResponse.json({ Equipment: { ...Equipment, currentValue, warrantyStatus } });
  } catch (error) {
    console.error("Inventory GET by ID error:", error);
    return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const body = await req.json();

    const existing = await db.equipment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.manufacturer !== undefined) updateData.manufacturer = body.manufacturer;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.serialNumber !== undefined) updateData.serialNumber = body.serialNumber;
    if (body.macAddress !== undefined) updateData.macAddress = body.macAddress;
    if (body.condition !== undefined) updateData.condition = body.condition;
    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === "DEPLOYED") {
        updateData.assignedAt = new Date();
        if (body.assignedSubscriberId) updateData.assignedSubscriberId = body.assignedSubscriberId;
      }
      if (body.status === "RETURNED") {
        updateData.returnedAt = new Date();
        updateData.assignedSubscriberId = null;
      }
      if (body.status === "DECOMMISSIONED") {
        updateData.assignedSubscriberId = null;
      }
    }
    if (body.assignedSubscriberId !== undefined && body.status === undefined) {
      updateData.assignedSubscriberId = body.assignedSubscriberId || null;
      if (body.assignedSubscriberId) {
        updateData.status = "DEPLOYED";
        updateData.assignedAt = new Date();
      }
    }
    if (body.stockLocation !== undefined) updateData.stockLocation = body.stockLocation;
    if (body.purchasePrice !== undefined) updateData.purchasePrice = body.purchasePrice;
    if (body.purchaseDate !== undefined) updateData.purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : null;
    if (body.vendorName !== undefined) updateData.vendorName = body.vendorName;
    if (body.vendorId !== undefined) updateData.vendorId = body.vendorId || null;
    if (body.depreciationRate !== undefined) updateData.depreciationRate = Number(body.depreciationRate);
    if (body.warrantyExpiry !== undefined) updateData.warrantyExpiry = body.warrantyExpiry ? new Date(body.warrantyExpiry) : null;

    // Recalculate current value
    const price = body.purchasePrice !== undefined ? Number(body.purchasePrice) : existing.purchasePrice;
    const date = body.purchaseDate !== undefined ? (body.purchaseDate ? new Date(body.purchaseDate) : null) : existing.purchaseDate;
    const rate = body.depreciationRate !== undefined ? Number(body.depreciationRate) : existing.depreciationRate;
    updateData.currentValue = calculateCurrentValue(price, date, rate);

    const equipment = await db.equipment.update({
      where: { id },
      data: updateData,
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Vendor: { select: { id: true, name: true } },
      },
    });

    await auditUpdate(req, "Equipment", id, updateData, existing);
    return NextResponse.json({ equipment });
  } catch (error) {
    console.error("Inventory PUT error:", error);
    return NextResponse.json({ error: "Failed to update equipment" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;

    const existing = await db.equipment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    if (existing.status === "DEPLOYED") {
      return NextResponse.json(
        { error: "Cannot delete deployed equipment. Return it first." },
        { status: 400 }
      );
    }

    const deletedRecord = { ...existing };
    await db.equipment.delete({ where: { id } });
    await auditDelete(req, "Equipment", id, deletedRecord);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Inventory DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete equipment" }, { status: 500 });
  }
}
