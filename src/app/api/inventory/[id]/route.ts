import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate, auditDelete } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — PATCH/DELETE /api/inventory/[id]
// PATCH fields: quantityDelta (± int, result must stay ≥ 0 → 409),
// name, category, minQuantity, unitPrice, location
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

// PATCH /api/inventory/[id] — stock adjustment + field updates
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("inventory", "update");
    const { id } = await params;
    const body = await req.json();
    const { quantityDelta, name, category, minQuantity, unitPrice, location } = body;

    const current = await db.inventoryItem.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (quantityDelta !== undefined && quantityDelta !== null && quantityDelta !== 0) {
      const delta = Number(quantityDelta);
      if (!Number.isInteger(delta)) {
        return NextResponse.json({ error: "quantityDelta must be an integer" }, { status: 400 });
      }
      const newQty = current.quantity + delta;
      if (newQty < 0) {
        return NextResponse.json(
          { error: `Insufficient stock: ${current.quantity} units on hand, cannot remove ${Math.abs(delta)}` },
          { status: 409 }
        );
      }
      data.quantity = newQty;
    }

    if (name !== undefined && name !== null && String(name).trim()) data.name = String(name).trim();
    if (category !== undefined) data.category = category?.trim() || null;
    if (location !== undefined) data.location = location?.trim() || null;
    if (minQuantity !== undefined && minQuantity !== null && minQuantity !== "") {
      const minQty = Number(minQuantity);
      if (!Number.isInteger(minQty) || minQty < 0) {
        return NextResponse.json({ error: "minQuantity must be an integer ≥ 0" }, { status: 400 });
      }
      data.minQuantity = minQty;
    }
    if (unitPrice !== undefined) {
      data.unitPrice = unitPrice === null || unitPrice === "" ? null : Number(unitPrice);
      if (data.unitPrice !== null && (isNaN(data.unitPrice as number) || (data.unitPrice as number) < 0)) {
        return NextResponse.json({ error: "unitPrice must be a number ≥ 0" }, { status: 400 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const item = await db.inventoryItem.update({ where: { id }, data });

    await auditUpdate({
      userId: user.id, action: "update", resource: "inventory_item",
      resourceId: item.id, resourceName: item.sku,
      before: { quantity: current.quantity, minQuantity: current.minQuantity, unitPrice: current.unitPrice },
      after: { quantity: item.quantity, minQuantity: item.minQuantity, unitPrice: item.unitPrice },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ item });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/inventory/[id]] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update inventory item" }, { status: 500 });
  }
}

// DELETE /api/inventory/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("inventory", "delete");
    const { id } = await params;

    const item = await db.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    await db.inventoryItem.delete({ where: { id } });

    await auditDelete({
      userId: user.id, action: "delete", resource: "inventory_item",
      resourceId: id, resourceName: item.sku,
      before: { sku: item.sku, name: item.name, quantity: item.quantity },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/inventory/[id]] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete inventory item" }, { status: 500 });
  }
}
