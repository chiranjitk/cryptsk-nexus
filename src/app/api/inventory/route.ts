import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — GET/POST /api/inventory
// Warehouse / van-stock items (routers, ONUs, cable, tools…)
// GET  filters: ?search (sku|name) ?category ?lowStock=1
//      lowStock → quantity <= minQuantity, lowest stock first
//      stats.stockValue = Σ quantity × unitPrice (real aggregate)
// POST create — sku unique (409 on duplicate)
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("inventory", "list");

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const lowStock = searchParams.get("lowStock") === "1";

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { sku: { contains: search } },
        { name: { contains: search } },
      ];
    }
    if (lowStock) where.quantity = { lte: db.inventoryItem.fields.minQuantity };

    const [items, allItems, lowStockCount, outOfStockCount] = await Promise.all([
      db.inventoryItem.findMany({
        where,
        orderBy: lowStock ? { quantity: "asc" } : { updatedAt: "desc" },
        take: 500,
      }),
      // Global stats — real aggregates, independent of list filters
      db.inventoryItem.findMany({ select: { quantity: true, unitPrice: true } }),
      db.inventoryItem.count({ where: { quantity: { lte: db.inventoryItem.fields.minQuantity } } }),
      db.inventoryItem.count({ where: { quantity: 0 } }),
    ]);

    const total = allItems.length;
    const stockValue = allItems.reduce(
      (sum, it) => sum + (it.quantity || 0) * (it.unitPrice ?? 0),
      0
    );

    return NextResponse.json({
      items,
      stats: { total, lowStock: lowStockCount, outOfStock: outOfStockCount, stockValue },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/inventory] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}

// POST /api/inventory — add a stock item
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("inventory", "create");
    const body = await req.json();
    const { sku, name, category, quantity, minQuantity, unitPrice, location } = body;

    if (!sku || !String(sku).trim() || !name || !String(name).trim()) {
      return NextResponse.json({ error: "sku and name are required" }, { status: 400 });
    }
    const qty = Number(quantity ?? 0);
    const minQty = Number(minQuantity ?? 0);
    if (!Number.isInteger(qty) || qty < 0) {
      return NextResponse.json({ error: "quantity must be an integer ≥ 0" }, { status: 400 });
    }
    if (!Number.isInteger(minQty) || minQty < 0) {
      return NextResponse.json({ error: "minQuantity must be an integer ≥ 0" }, { status: 400 });
    }

    const normalizedSku = String(sku).trim().toUpperCase();
    const existing = await db.inventoryItem.findUnique({ where: { sku: normalizedSku } });
    if (existing) {
      return NextResponse.json({ error: `SKU "${normalizedSku}" already exists` }, { status: 409 });
    }

    const item = await db.inventoryItem.create({
      data: {
        sku: normalizedSku,
        name: String(name).trim(),
        category: category || null,
        quantity: qty,
        minQuantity: minQty,
        unitPrice: unitPrice !== undefined && unitPrice !== null && unitPrice !== "" ? Number(unitPrice) : null,
        location: location?.trim() || null,
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "inventory_item",
      resourceId: item.id, resourceName: item.sku,
      after: { sku: item.sku, name: item.name, quantity: item.quantity, minQuantity: item.minQuantity },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/inventory] POST failed:", err);
    return NextResponse.json({ error: "Failed to create inventory item" }, { status: 500 });
  }
}
