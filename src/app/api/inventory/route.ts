import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditCreate, auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

// Helper: calculate depreciated value
function calculateCurrentValue(purchasePrice: number, purchaseDate: Date | null, depreciationRate: number): number {
  if (!purchaseDate || purchasePrice <= 0 || depreciationRate <= 0) return purchasePrice;
  const now = new Date();
  const ageYears = (now.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const depreciatedValue = purchasePrice - (purchasePrice * (depreciationRate / 100) * ageYears);
  return Math.max(0, Math.round(depreciatedValue * 100) / 100);
}

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const condition = searchParams.get("condition");
    const status = searchParams.get("status");
    const vendorId = searchParams.get("vendorId");
    const warrantyFilter = searchParams.get("warranty"); // active, expired, expiring-soon

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (condition) where.condition = condition;
    if (status) where.status = status;
    if (vendorId) where.vendorId = vendorId;

    // Warranty filter
    if (warrantyFilter === "active") {
      where.warrantyExpiry = { gt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) };
    } else if (warrantyFilter === "expiring-soon") {
      where.warrantyExpiry = { gt: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) };
    } else if (warrantyFilter === "expired") {
      where.OR = [
        { warrantyExpiry: { lt: new Date() } },
        { warrantyExpiry: null },
      ];
    }

    const [equipment, summary] = await Promise.all([
      db.equipment.findMany({
        where,
        include: {
          Subscriber: { select: { id: true, name: true, code: true } },
          Vendor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.equipment.groupBy({
        by: ["status"],
        _count: { id: true },
        _sum: { purchasePrice: true, currentValue: true },
      }),
    ]);

    const statusSummary: Record<string, { count: number; totalValue: number; currentTotalValue: number }> = {};
    for (const s of summary) {
      statusSummary[s.status] = {
        count: s._count.id,
        totalValue: s._sum.purchasePrice || 0,
        currentTotalValue: s._sum.currentValue || 0,
      };
    }

    const totalItems = equipment.length;
    const inStock = statusSummary["IN_STOCK"]?.count || 0;
    const deployed = statusSummary["DEPLOYED"]?.count || 0;
    const returned = statusSummary["RETURNED"]?.count || 0;
    const decommissioned = statusSummary["DECOMMISSIONED"]?.count || 0;
    const totalValue = equipment.reduce((sum, e) => sum + e.purchasePrice, 0);
    const totalCurrentValue = equipment.reduce((sum, e) => sum + (e.currentValue || e.purchasePrice), 0);

    // Calculate current values if not set
    const enrichedEquipment = equipment.map((e) => {
      const currentValue = e.currentValue || calculateCurrentValue(e.purchasePrice, e.purchaseDate, e.depreciationRate);
      const warrantyStatus = e.warrantyExpiry
        ? new Date(e.warrantyExpiry) < new Date()
          ? "expired"
          : new Date(e.warrantyExpiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            ? "expiring-soon"
            : "active"
        : "none";
      return { ...e, currentValue, warrantyStatus };
    });

    return NextResponse.json({
      equipment: enrichedEquipment,
      summary: { totalItems, inStock, deployed, returned, decommissioned, totalValue, totalCurrentValue, statusSummary },
    });
  } catch (error) {
    console.error("Inventory GET error:", error);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await req.json();
    const { name, category, manufacturer, model, serialNumber, macAddress, condition, purchasePrice, stockLocation, purchaseDate, vendorName, vendorId, depreciationRate, warrantyExpiry } = body;

    if (!name) {
      return NextResponse.json({ error: "Equipment name is required" }, { status: 400 });
    }

    const parsedDate = purchaseDate ? new Date(purchaseDate) : null;
    const parsedPrice = purchasePrice ? Number(purchasePrice) : 0;
    const parsedRate = depreciationRate ? Number(depreciationRate) : 20;
    const currentValue = calculateCurrentValue(parsedPrice, parsedDate, parsedRate);

    const equipment = await db.equipment.create({
      data: {
        name,
        category: category || "OTHER",
        manufacturer: manufacturer || "",
        model: model || "",
        serialNumber: serialNumber || "",
        macAddress: macAddress || "",
        condition: condition || "NEW",
        status: "IN_STOCK",
        purchasePrice: parsedPrice,
        depreciationRate: parsedRate,
        currentValue,
        stockLocation: stockLocation || "",
        purchaseDate: parsedDate,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        vendorName: vendorName || "",
        vendorId: vendorId || null,
      },
    });

    await auditCreate(req, "Equipment", equipment.id, { name, category, serialNumber, purchasePrice });
    return NextResponse.json({ equipment }, { status: 201 });
  } catch (error) {
    console.error("Inventory POST error:", error);
    return NextResponse.json({ error: "Failed to add equipment" }, { status: 500 });
  }
}
