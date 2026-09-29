import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { action, ids, status: newStatus } = body;

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "action and ids are required" }, { status: 400 });
    }

    if (action === "update-status") {
      if (!newStatus || !["IN_STOCK", "DEPLOYED", "RETURNED", "DECOMMISSIONED"].includes(newStatus)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      const result = await db.equipment.updateMany({
        where: { id: { in: ids } },
        data: { status: newStatus as "IN_STOCK" | "DEPLOYED" | "RETURNED" | "DECOMMISSIONED" },
      });
      await auditCreate(request, "Equipment", "bulk", { action: "update-status", ids, newStatus }, { userId });
      return NextResponse.json({ success: true, updated: result.count });
    }

    if (action === "delete") {
      // Only delete non-deployed equipment
      const deployed = await db.equipment.findMany({
        where: { id: { in: ids }, status: "DEPLOYED" },
        select: { id: true },
      });
      if (deployed.length > 0) {
        return NextResponse.json({ error: `Cannot delete ${deployed.length} deployed item(s)` }, { status: 400 });
      }
      const result = await db.equipment.deleteMany({ where: { id: { in: ids } } });
      await auditCreate(request, "Equipment", "bulk", { action: "delete", ids }, { userId });
      return NextResponse.json({ success: true, deleted: result.count });
    }

    if (action === "export") {
      const equipment = await db.equipment.findMany({
        where: { id: { in: ids } },
        include: { Subscriber: { select: { name: true } }, Vendor: { select: { name: true } } },
      });
      return NextResponse.json({ equipment });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Inventory bulk error:", error);
    return NextResponse.json({ error: "Failed to process bulk action" }, { status: 500 });
  }
}
