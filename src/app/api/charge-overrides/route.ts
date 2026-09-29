import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// GET /api/charge-overrides — List charge overrides with filters
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "15");
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const activeOnly = searchParams.get("active") === "true";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status && status !== "all") {
      where.status = status;
    }

    if (activeOnly) {
      const now = new Date();
      where.status = "ACTIVE";
      where.validFrom = { lte: now };
      where.OR = [
        { validUntil: { gte: now } },
        { validUntil: null },
      ];
    }

    // Search by subscriber name or code
    if (search) {
      where.Subscriber = {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
        ],
      };
    }

    const [overrides, total] = await Promise.all([
      db.subscriberChargeOverride.findMany({
        where,
        include: {
          Subscriber: {
            select: {
              id: true,
              name: true,
              code: true,
              Plan: {
                select: { id: true, name: true, priceMonthly: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.subscriberChargeOverride.count({ where }),
    ]);

    // Map to the format the page component expects
    const mapped = overrides.map((o) => {
      const now = new Date();
      const from = new Date(o.validFrom);
      const until = o.validUntil ? new Date(o.validUntil) : null;
      let effectiveStatus = o.status as string;
      if (o.status === "ACTIVE") {
        if (from > now) effectiveStatus = "SCHEDULED";
        else if (until && until < now) effectiveStatus = "EXPIRED";
      }

      return {
        id: o.id,
        subscriberId: o.subscriberId,
        subscriberName: o.Subscriber.name,
        subscriberCode: o.Subscriber.code,
        planName: o.Subscriber.Plan?.name || "No Plan",
        originalPrice: o.Subscriber.Plan?.priceMonthly || o.oldPrice,
        overridePrice: o.newPrice,
        validFrom: o.validFrom.toISOString(),
        validUntil: o.validUntil ? o.validUntil.toISOString() : null,
        status: effectiveStatus,
        reason: o.reason,
        createdAt: o.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      overrides: mapped,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Charge overrides GET error:", error);
    return NextResponse.json({ error: "Failed to fetch charge overrides" }, { status: 500 });
  }
}

// POST /api/charge-overrides — Create a new charge override
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { subscriberId, overridePrice, validFrom, validUntil, reason } = body;

    if (!subscriberId) {
      return NextResponse.json({ error: "subscriberId is required" }, { status: 400 });
    }
    if (!overridePrice || overridePrice <= 0) {
      return NextResponse.json({ error: "overridePrice must be greater than 0" }, { status: 400 });
    }
    if (!validFrom) {
      return NextResponse.json({ error: "validFrom is required" }, { status: 400 });
    }

    // Verify subscriber exists and get plan info
    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      select: { id: true, name: true, code: true, planId: true, Plan: { select: { id: true, name: true, priceMonthly: true } } },
    });
    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const parsedValidFrom = new Date(validFrom);
    if (isNaN(parsedValidFrom.getTime())) {
      return NextResponse.json({ error: "validFrom must be a valid date" }, { status: 400 });
    }

    let parsedValidUntil: Date | null = null;
    if (validUntil) {
      parsedValidUntil = new Date(validUntil);
      if (isNaN(parsedValidUntil.getTime())) {
        return NextResponse.json({ error: "validUntil must be a valid date" }, { status: 400 });
      }
      if (parsedValidUntil <= parsedValidFrom) {
        return NextResponse.json({ error: "validUntil must be after validFrom" }, { status: 400 });
      }
    }

    // Determine effective status
    const now = new Date();
    let status: "ACTIVE" | "SCHEDULED" = "ACTIVE";
    if (parsedValidFrom > now) status = "SCHEDULED";

    const override = await db.subscriberChargeOverride.create({
      data: {
        subscriberId,
        planId: subscriber.planId,
        oldPrice: subscriber.Plan?.priceMonthly || 0,
        newPrice: parseFloat(String(overridePrice)),
        reason: reason || "",
        validFrom: parsedValidFrom,
        validUntil: parsedValidUntil,
        status,
      },
      include: {
        Subscriber: {
          select: { id: true, name: true, code: true, Plan: { select: { id: true, name: true, priceMonthly: true } } },
        },
      },
    });

    return NextResponse.json({ override }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Charge overrides POST error:", error);
    return NextResponse.json({ error: "Failed to create charge override" }, { status: 500 });
  }
}
