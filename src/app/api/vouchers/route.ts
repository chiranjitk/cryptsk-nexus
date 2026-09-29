import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status");
    const denomination = searchParams.get("denomination");
    const planId = searchParams.get("planId");
    const search = searchParams.get("search");
    const area = searchParams.get("area");
    const subscriberSearch = searchParams.get("subscriberSearch");
    const subscriberId = searchParams.get("subscriberId");
    const expiry = searchParams.get("expiry");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "25");

    const where: Record<string, unknown> = {};

    if (status && status !== "ALL") {
      where.status = status;
    }
    if (denomination && denomination !== "ALL") {
      where.denomination = parseFloat(denomination);
    }
    if (planId && planId !== "ALL") {
      where.planId = planId;
    }
    if (search) {
      where.code = { contains: search };
    }

    // Area filter: find subscriber IDs in that area, then filter vouchers
    if (area && area !== "ALL") {
      const subscribersInArea = await db.subscriber.findMany({
        where: {
          OR: [
            { Area: { name: { contains: area } } },
          ],
        },
        select: { id: true },
      });
      const subscriberIds = subscribersInArea.map((s) => s.id);
      if (subscriberIds.length > 0) {
        where.usedBySubscriberId = { in: subscriberIds };
      }
    }

    // Subscriber search: search by name, phone, or code (filters vouchers used by matching subscribers)
    if (subscriberSearch) {
      const matchedSubscribers = await db.subscriber.findMany({
        where: {
          OR: [
            { name: { contains: subscriberSearch } },
            { phone: { contains: subscriberSearch } },
            { code: { contains: subscriberSearch } },
          ],
        },
        select: { id: true },
        take: 100,
      });
      const subscriberIds = matchedSubscribers.map((s) => s.id);
      if (subscriberIds.length > 0) {
        where.usedBySubscriberId = { in: subscriberIds };
      } else {
        // No matching subscribers, return empty
        return NextResponse.json({ vouchers: [], total: 0, page, limit });
      }
    }

    // Direct subscriber ID filter
    if (subscriberId && subscriberId !== "ALL") {
      where.usedBySubscriberId = subscriberId;
    }

    // Expiry filter
    if (expiry && expiry !== "ALL") {
      const now = new Date();
      if (expiry === "EXPIRED") {
        const vouchers = await db.voucher.findMany({
          where: {
            ...where,
            status: { in: ["ACTIVE", "EXPIRED"] },
          },
          include: {
            Plan: { select: { id: true, name: true } },
            Subscriber: { select: { id: true, name: true, code: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit * 5,
        });

        const filtered = vouchers.filter((v) => {
          const expires = new Date(v.createdAt.getTime() + v.validityDays * 86400000);
          return expires <= now;
        });

        const paginatedFiltered = filtered.slice((page - 1) * limit, page * limit);

        return NextResponse.json({
          vouchers: paginatedFiltered,
          total: filtered.length,
          page,
          limit,
        });
      } else if (expiry === "EXPIRING_SOON") {
        const futureCutoff = new Date(now.getTime() + 7 * 86400000);
        const vouchers = await db.voucher.findMany({
          where: {
            ...where,
            status: { in: ["ACTIVE", "EXPIRED"] },
          },
          include: {
            Plan: { select: { id: true, name: true } },
            Subscriber: { select: { id: true, name: true, code: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit * 5,
        });

        const filtered = vouchers.filter((v) => {
          const expires = new Date(v.createdAt.getTime() + v.validityDays * 86400000);
          return expires > now && expires <= futureCutoff;
        });

        const paginatedFiltered = filtered.slice((page - 1) * limit, page * limit);

        return NextResponse.json({
          vouchers: paginatedFiltered,
          total: filtered.length,
          page,
          limit,
        });
      } else if (expiry === "VALID") {
        const vouchers = await db.voucher.findMany({
          where: {
            ...where,
            status: { in: ["ACTIVE"] },
          },
          include: {
            Plan: { select: { id: true, name: true } },
            Subscriber: { select: { id: true, name: true, code: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit * 5,
        });

        const filtered = vouchers.filter((v) => {
          const expires = new Date(v.createdAt.getTime() + v.validityDays * 86400000);
          return expires > now;
        });

        const paginatedFiltered = filtered.slice((page - 1) * limit, page * limit);

        return NextResponse.json({
          vouchers: paginatedFiltered,
          total: filtered.length,
          page,
          limit,
        });
      }
    }

    const [vouchers, total] = await Promise.all([
      db.voucher.findMany({
        where,
        include: {
          Plan: { select: { id: true, name: true } },
          Subscriber: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.voucher.count({ where }),
    ]);

    return NextResponse.json({ vouchers, total, page, limit });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Vouchers GET error:", error);
    return NextResponse.json({ error: "Failed to fetch vouchers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { code, denomination, planId, validityDays } = body;

    if (!code || !denomination) {
      return NextResponse.json({ error: "Missing required fields: code, denomination" }, { status: 400 });
    }

    const existing = await db.voucher.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: "Voucher code already exists" }, { status: 409 });
    }

    const voucher = await db.voucher.create({
      data: {
        code,
        denomination: parseFloat(denomination),
        planId: planId || null,
        validityDays: validityDays || 30,
        status: "ACTIVE",
      },
      include: {
        Plan: { select: { id: true, name: true } },
      },
    });

    await auditCreate(req, "Voucher", voucher.id, { code, denomination, planId });
    return NextResponse.json({ voucher }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Vouchers POST error:", error);
    return NextResponse.json({ error: "Failed to create voucher" }, { status: 500 });
  }
}
