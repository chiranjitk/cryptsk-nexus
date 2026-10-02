import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";

// GET /api/refunds — list Refund records with payment + subscriber + processor
// [AUDIT F-20] refunds surface money-movement data — requires payments.read
export async function GET(req: NextRequest) {
  try {
    const userId = await requirePermission(req, "payments.read");

    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const status = searchParams.get("status"); // PROCESSED | PENDING | CANCELLED | FAILED
    const search = (searchParams.get("search") || "").trim(); // subscriber code/name or receipt #

    const where: Record<string, unknown> = {};
    if (status) where.status = status.toUpperCase();

    if (search) {
      where.OR = [
        { Payment: { receiptNumber: { contains: search, mode: "insensitive" as const } } },
        { Payment: { Subscriber: { name: { contains: search, mode: "insensitive" as const } } } },
        { Payment: { Subscriber: { code: { contains: search, mode: "insensitive" as const } } } },
        { reason: { contains: search, mode: "insensitive" as const } },
      ];
    }

    const [rows, total, agg, statusCounts] = await Promise.all([
      db.refund.findMany({
        where,
        include: {
          Payment: {
            select: {
              id: true,
              receiptNumber: true,
              amount: true,
              paymentMode: true,
              status: true,
              subscriberId: true,
              Subscriber: { select: { id: true, name: true, code: true } },
            },
          },
          User: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.refund.count({ where }),
      db.refund.aggregate({ where, _sum: { amount: true } }),
      db.refund.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    // Remap capitalized Prisma relation keys → lowercase, per client convention
    const refunds = rows.map(({ Payment, User, ...r }) => ({
      ...r,
      payment: Payment
        ? { ...Payment, subscriber: Payment.Subscriber, Subscriber: undefined }
        : null,
      processedBy: User ? { id: User.id, name: User.name } : null,
    }));

    return NextResponse.json({
      refunds,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: {
        totalRefunded: agg._sum.amount || 0,
        count: total,
        viewerId: userId,
        statusCounts: statusCounts.map((s) => ({
          status: s.status,
          count: s._count._all,
          amount: s._sum.amount || 0,
        })),
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
    console.error("Refunds GET error:", error);
    return NextResponse.json({ error: "Failed to fetch refunds" }, { status: 500 });
  }
}
