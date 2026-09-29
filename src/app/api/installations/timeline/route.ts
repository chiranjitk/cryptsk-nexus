import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 25));

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status && status !== "all") {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.scheduledDate = {};
      if (dateFrom) (where.scheduledDate as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.scheduledDate as Record<string, unknown>).lte = new Date(dateTo);
    }

    if (search) {
      where.OR = [
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
        { Technician: { name: { contains: search } } },
        { Area: { name: { contains: search } } },
        { notes: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      db.installation.findMany({
        where,
        include: {
          Subscriber: { select: { id: true, name: true, phone: true, code: true, address: true } },
          Technician: { select: { id: true, name: true, phone: true, status: true } },
          Area: { select: { id: true, name: true, code: true } },
        },
        orderBy: { scheduledDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.installation.count({ where }),
    ]);

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Installations timeline GET error:", error);
    return NextResponse.json({ error: "Failed to fetch timeline data" }, { status: 500 });
  }
}
