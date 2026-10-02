import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const filterCategory = searchParams.get("category") || "all";
    const filterStatus = searchParams.get("status") || "all";
    const location = searchParams.get("location") || "";
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const where: Record<string, unknown> = {};
    if (filterCategory !== "all") where.category = filterCategory;
    if (filterStatus !== "all") where.status = filterStatus;
    if (location) where.stockLocation = location;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { serialNumber: { contains: search } },
        { manufacturer: { contains: search } },
        { model: { contains: search } },
      ];
    }

    const [equipment, total] = await Promise.all([
      db.equipment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          Subscriber: { select: { id: true, name: true, phone: true } },
        },
      }),
      db.equipment.count({ where }),
    ]);

    // Real status counts from DB groupBy (independent of filters)
    const statusCounts = await db.equipment.groupBy({
      by: ["status"],
      _count: true,
    });
    const countsMap: Record<string, number> = {};
    for (const sc of statusCounts) {
      countsMap[sc.status] = sc._count;
    }

    // Total value from DB aggregate
    const valueAgg = await db.equipment.aggregate({
      _sum: { purchasePrice: true },
    });

    return NextResponse.json({
      items: equipment.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        manufacturer: e.manufacturer,
        model: e.model,
        serialNumber: e.serialNumber,
        condition: e.condition,
        status: e.status,
        stockLocation: e.stockLocation,
        purchasePrice: e.purchasePrice,
        purchaseDate: e.purchaseDate?.toISOString() || null,
        depreciationRate: e.depreciationRate,
        bookValue: e.bookValue,
        warrantyExpiry: e.warrantyExpiry?.toISOString() || null,
        warrantyProvider: e.warrantyProvider,
        warrantyNumber: e.warrantyNumber,
        repairStatus: e.repairStatus,
        assignedSubscriberId: e.assignedSubscriberId,
        assignedSubscriberName: e.assignedSubscriber?.name || null,
        createdAt: e.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        total: Object.values(countsMap).reduce((a, b) => a + b, 0),
        inStock: countsMap["IN_STOCK"] || 0,
        deployed: countsMap["DEPLOYED"] || 0,
        returned: countsMap["RETURNED"] || 0,
        decommissioned: countsMap["DECOMMISSIONED"] || 0,
        totalValue: valueAgg._sum.purchasePrice || 0,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Equipment fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const { name, category, manufacturer, model, serialNumber, condition, status, stockLocation, purchasePrice } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Equipment name is required" }, { status: 400 });
    }

    const validCategories = ["ROUTER", "ONT", "SWITCH", "AP", "CABLE", "SPLITTER", "ANTENNA", "UPS", "PATCH_CORD", "OLT", "POWER_SUPPLY", "OTHER"];
    const validConditions = ["NEW", "GOOD", "DAMAGED", "DEAD"];
    const validStatuses = ["IN_STOCK", "DEPLOYED", "RETURNED", "DECOMMISSIONED"];

    const eqCategory = ((category || "OTHER") as string).toUpperCase();
    const eqCondition = ((condition || "NEW") as string).toUpperCase();
    const eqStatus = ((status || "IN_STOCK") as string).toUpperCase();

    if (!validCategories.includes(eqCategory)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 });
    }
    if (!validConditions.includes(eqCondition)) {
      return NextResponse.json({ error: `Invalid condition. Must be one of: ${validConditions.join(", ")}` }, { status: 400 });
    }
    if (!validStatuses.includes(eqStatus)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    // Serial number uniqueness check (if provided)
    if (serialNumber && serialNumber.trim()) {
      const existing = await db.equipment.findFirst({ where: { serialNumber: serialNumber.trim() } });
      if (existing) {
        return NextResponse.json({ error: "Equipment with this serial number already exists" }, { status: 409 });
      }
    }

    const equipment = await db.equipment.create({
      data: {
        name: name.trim(),
        category: eqCategory as "ROUTER" | "ONT" | "SWITCH" | "AP" | "CABLE" | "SPLITTER" | "ANTENNA" | "UPS" | "PATCH_CORD" | "OLT" | "POWER_SUPPLY" | "OTHER",
        manufacturer: manufacturer || "",
        model: model || "",
        serialNumber: serialNumber ? serialNumber.trim() : "",
        condition: eqCondition as "NEW" | "GOOD" | "DAMAGED" | "DEAD",
        status: eqStatus as "IN_STOCK" | "DEPLOYED" | "RETURNED" | "DECOMMISSIONED",
        stockLocation: stockLocation || "",
        purchasePrice: purchasePrice !== undefined && purchasePrice !== null ? Number(purchasePrice) : 0,
      },
    });

    auditCreate(request, "Equipment", equipment.id, { name: equipment.name, category: equipment.category, serialNumber: equipment.serialNumber }, { userId }).catch(() => {});
    return NextResponse.json(equipment, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Equipment create error:", error);
    return NextResponse.json({ error: "Failed to create equipment" }, { status: 500 });
  }
}
