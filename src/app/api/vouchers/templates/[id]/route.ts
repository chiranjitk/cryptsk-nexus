import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const template = await db.voucherTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const updated = await db.voucherTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.denomination !== undefined && { denomination: parseFloat(body.denomination) }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.validityDays !== undefined && { validityDays: parseInt(body.validityDays) }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json({ template: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Voucher template PUT error:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    await db.voucherTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Voucher template DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
