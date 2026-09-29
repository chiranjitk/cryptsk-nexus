import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const warehouse = await db.warehouse.findUnique({
      where: { id },
      include: {
        Equipment: { select: { id: true, name: true, category: true, status: true, serialNumber: true } },
      },
    });
    if (!warehouse) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
    return NextResponse.json({ warehouse });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch warehouse" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();
    const { name, address, city, state, pincode, isDefault, status } = body;

    const existing = await db.warehouse.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });

    if (isDefault) {
      await db.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (address !== undefined) data.address = address;
    if (city !== undefined) data.city = city;
    if (state !== undefined) data.state = state;
    if (pincode !== undefined) data.pincode = pincode;
    if (isDefault !== undefined) data.isDefault = isDefault;
    if (status !== undefined) data.status = status;

    const warehouse = await db.warehouse.update({ where: { id }, data });
    return NextResponse.json({ warehouse });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to update warehouse" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const existing = await db.warehouse.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });

    const equipmentCount = await db.equipment.count({ where: { warehouseId: id } });
    if (equipmentCount > 0) {
      return NextResponse.json({ error: `Cannot delete warehouse with ${equipmentCount} equipment items. Reassign them first.` }, { status: 400 });
    }

    await db.warehouse.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to delete warehouse" }, { status: 500 });
  }
}
