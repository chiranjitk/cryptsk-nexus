import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const voucher = await db.voucher.findUnique({
      where: { id },
      include: {
        Plan: { select: { id: true, name: true, priceMonthly: true, validityDays: true } },
        usedBySubscriber: { select: { id: true, name: true, code: true, phone: true } },
      },
    });

    if (!voucher) {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }

    // Get usage history: related payments for the subscriber
    let usageHistory: unknown[] = [];
    if (voucher.usedBySubscriberId && voucher.usedAt) {
      usageHistory = await db.payment.findMany({
        where: {
          subscriberId: voucher.usedBySubscriberId,
          createdAt: { gte: voucher.usedAt },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          Invoice: { select: { invoiceNumber: true } },
        },
      });
    }

    return NextResponse.json({ voucher, usageHistory });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Voucher GET [id] error:", error);
    return NextResponse.json({ error: "Failed to fetch voucher" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const voucher = await db.voucher.findUnique({ where: { id } });
    if (!voucher) {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (body.status && body.status !== voucher.status) {
      if (voucher.status === "USED") {
        return NextResponse.json({ error: "Cannot modify a used voucher" }, { status: 400 });
      }
      updateData.status = body.status;
    }

    if (body.extendDays && voucher.status !== "USED") {
      updateData.validityDays = voucher.validityDays + parseInt(body.extendDays);
    } else if (body.validityDays !== undefined && voucher.status !== "USED") {
      updateData.validityDays = body.validityDays;
    }

    if (body.status === "USED" && body.usedBySubscriberId) {
      updateData.usedBySubscriberId = body.usedBySubscriberId;
      updateData.usedAt = new Date();
      updateData.status = "USED";
    }

    const updated = await db.voucher.update({
      where: { id },
      data: updateData,
      include: {
        Plan: { select: { id: true, name: true, priceMonthly: true, validityDays: true } },
        usedBySubscriber: { select: { id: true, name: true, code: true, phone: true } },
      },
    });

    await auditUpdate(req, "Voucher", id, updateData, voucher);
    return NextResponse.json({ voucher: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Voucher PUT error:", error);
    return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const voucher = await db.voucher.findUnique({ where: { id } });
    if (!voucher) {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }

    if (voucher.status === "USED") {
      return NextResponse.json({ error: "Cannot delete a used voucher" }, { status: 400 });
    }

    const deletedRecord = { ...voucher };
    await db.voucher.delete({ where: { id } });
    await auditDelete(req, "Voucher", id, deletedRecord);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Voucher DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete voucher" }, { status: 500 });
  }
}
