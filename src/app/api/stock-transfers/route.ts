import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";

    const where: Record<string, unknown> = {};
    if (status !== "all") where.status = status;

    const transfers = await db.stockTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        Equipment: { select: { id: true, name: true, serialNumber: true, category: true } },
      },
    });

    return NextResponse.json({ transfers });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Stock transfers fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch transfers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      const { equipmentId, toLocation, notes } = body;
      if (!equipmentId || !toLocation) {
        return NextResponse.json({ error: "equipmentId and toLocation are required" }, { status: 400 });
      }

      const equipment = await db.equipment.findUnique({ where: { id: equipmentId } });
      if (!equipment) {
        return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
      }

      const transfer = await db.stockTransfer.create({
        data: {
          equipmentId,
          fromLocation: equipment.stockLocation || "Unknown",
          toLocation,
          transferredBy: userId,
          status: "PENDING",
          notes: notes || "",
        },
        include: { Equipment: true },
      });

      await auditCreate(request, "StockTransfer", transfer.id, { action: "create", equipmentId, toLocation }, { userId });
      return NextResponse.json({ transfer }, { status: 201 });
    }

    if (action === "approve") {
      const { transferId } = body;
      if (!transferId) {
        return NextResponse.json({ error: "transferId is required" }, { status: 400 });
      }

      const transfer = await db.stockTransfer.findUnique({ where: { id: transferId } });
      if (!transfer) {
        return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
      }

      const updated = await db.stockTransfer.update({
        where: { id: transferId },
        data: { status: "COMPLETED" },
      });

      // Update equipment location
      await db.equipment.update({
        where: { id: transfer.equipmentId },
        data: { stockLocation: transfer.toLocation },
      });

      await auditCreate(request, "StockTransfer", transferId, { action: "approve", transferId }, { userId });
      return NextResponse.json({ transfer: updated });
    }

    if (action === "reject") {
      const { transferId } = body;
      if (!transferId) {
        return NextResponse.json({ error: "transferId is required" }, { status: 400 });
      }

      const updated = await db.stockTransfer.update({
        where: { id: transferId },
        data: { status: "CANCELLED" },
      });

      await auditCreate(request, "StockTransfer", transferId, { action: "reject", transferId }, { userId });
      return NextResponse.json({ transfer: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Stock transfers POST error:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
