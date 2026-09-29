import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

/**
 * GET /api/vouchers/usage-history
 * Returns a paginated list of all redeemed vouchers with full subscriber details
 * Supports search by subscriber name/code/phone and filtering by date range
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = req.nextUrl;
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "25");
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    const where: Record<string, unknown> = { status: "USED" };

    // Search by voucher code or subscriber info
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { usedBySubscriber: { name: { contains: search, mode: "insensitive" } } },
        { usedBySubscriber: { code: { contains: search, mode: "insensitive" } } },
        { usedBySubscriber: { phone: { contains: search } } },
      ];
    }

    // Date range filter on usedAt
    if (fromDate || toDate) {
      const dateFilter: Record<string, unknown> = {};
      if (fromDate) dateFilter.gte = new Date(fromDate);
      if (toDate) dateFilter.lte = new Date(toDate);
      where.usedAt = dateFilter;
    }

    const [history, total] = await Promise.all([
      db.voucher.findMany({
        where,
        include: {
          Plan: { select: { id: true, name: true } },
          usedBySubscriber: { select: { id: true, name: true, code: true, phone: true } },
        },
        orderBy: { usedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.voucher.count({ where }),
    ]);

    // Get summary stats for the current filter
    const summary = await db.voucher.aggregate({
      where: { status: "USED" },
      _count: true,
      _sum: { denomination: true },
    });

    return NextResponse.json({
      history,
      total,
      page,
      limit,
      summary: {
        totalRedeemed: summary._count,
        totalValue: summary._sum.denomination || 0,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Voucher usage history error:", error);
    return NextResponse.json({ error: "Failed to fetch usage history" }, { status: 500 });
  }
}
