import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const existing = await db.vendor.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.contactPerson !== undefined) updateData.contactPerson = body.contactPerson;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.gstin !== undefined) updateData.gstin = body.gstin;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.rating !== undefined) updateData.rating = Math.min(5, Math.max(0, Number(body.rating)));
    if (body.notes !== undefined) updateData.notes = body.notes;

    const vendor = await db.vendor.update({ where: { id }, data: updateData });

    await auditUpdate(req, "Vendor", id, updateData, existing);
    return NextResponse.json({ vendor });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Vendor update error:", error);
    return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const existing = await db.vendor.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    await db.vendor.delete({ where: { id } });
    await auditDelete(req, "Vendor", id, existing);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Vendor delete error:", error);
    return NextResponse.json({ error: "Failed to delete vendor" }, { status: 500 });
  }
}
