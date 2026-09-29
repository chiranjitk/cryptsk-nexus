import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const filterStatus = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const where: Record<string, unknown> = {};
    if (filterStatus !== "all") where.status = filterStatus;
    if (search) {
      where.OR = [
        { code: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [promotions, total] = await Promise.all([
      db.promotion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.promotion.count({ where }),
    ]);

    // Real status counts from DB (not from loaded page)
    const statusCounts = await db.promotion.groupBy({
      by: ["status"],
      _count: true,
    });

    const countsMap: Record<string, number> = {};
    for (const sc of statusCounts) {
      countsMap[sc.status] = sc._count;
    }

    return NextResponse.json({
      items: promotions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      statusCounts: {
        active: countsMap["ACTIVE"] || 0,
        expired: countsMap["EXPIRED"] || 0,
        depleted: countsMap["DEPLETED"] || 0,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Promotions fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch promotions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { code, description, type, value, minAmount, maxDiscount, validFrom, validUntil, usageLimit } = body;

    // --- Validation ---
    if (!code || !code.trim()) {
      return NextResponse.json({ error: "Promo code is required" }, { status: 400 });
    }
    if (value === undefined || value === null || Number(value) <= 0) {
      return NextResponse.json({ error: "Value must be greater than 0" }, { status: 400 });
    }
    if (!validFrom || !validUntil) {
      return NextResponse.json({ error: "Valid from and valid until dates are required" }, { status: 400 });
    }

    const validTypes = ["PERCENTAGE", "FLAT", "FREE_TRIAL"];
    const promoType = ((type || "PERCENTAGE") as string).toUpperCase();
    if (!validTypes.includes(promoType)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 });
    }

    const numericValue = Number(value);

    // Type-specific validation
    if (promoType === "PERCENTAGE" && numericValue > 100) {
      return NextResponse.json({ error: "Percentage value cannot exceed 100" }, { status: 400 });
    }

    // Date validation
    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);
    if (untilDate <= fromDate) {
      return NextResponse.json({ error: "Valid until date must be after valid from date" }, { status: 400 });
    }

    // Uniqueness check
    const upperCode = code.trim().toUpperCase();
    const existing = await db.promotion.findUnique({ where: { code: upperCode } });
    if (existing) {
      return NextResponse.json({ error: "Promotion with this code already exists" }, { status: 409 });
    }

    const promotion = await db.promotion.create({
      data: {
        code: upperCode,
        description: (description || "").trim(),
        type: promoType as "PERCENTAGE" | "FLAT" | "FREE_TRIAL",
        value: numericValue,
        minAmount: minAmount !== undefined && minAmount !== "" ? Number(minAmount) : 0,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        validFrom: fromDate,
        validUntil: untilDate,
        usageLimit: usageLimit ? Number(usageLimit) : null,
      },
    });

    // Audit
    const { auditCreate } = await import("@/lib/services/audit-service");
    auditCreate(request, "Promotion", promotion.id, { code: promotion.code, type: promotion.type, value: promotion.value }, { userId }).catch(() => {});

    return NextResponse.json(promotion, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Promotion create error:", error);
    return NextResponse.json({ error: "Failed to create promotion" }, { status: 500 });
  }
}
