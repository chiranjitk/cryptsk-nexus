import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as NextRequest);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
  } catch {
    // Stats endpoint is accessible without auth for public display
  }
  try {
    const now = new Date();

    const [
      total,
      active,
      used,
      expired,
      cancelled,
      totalValueResult,
      redeemedValueResult,
      denominationBreakdown,
    ] = await Promise.all([
      db.voucher.count(),
      db.voucher.count({ where: { status: "ACTIVE" } }),
      db.voucher.count({ where: { status: "USED" } }),
      db.voucher.count({ where: { status: "EXPIRED" } }),
      db.voucher.count({ where: { status: "CANCELLED" } }),
      db.voucher.aggregate({ _sum: { denomination: true }, _count: true }),
      db.voucher.aggregate({
        where: { status: "USED" },
        _sum: { denomination: true },
        _count: true,
      }),
      db.voucher.groupBy({
        by: ["denomination"],
        _count: { id: true },
        _sum: { denomination: true },
      }),
    ]);

    const totalValue = totalValueResult._sum.denomination || 0;
    const redeemedValue = redeemedValueResult._sum.denomination || 0;
    const usedCount = redeemedValueResult._count || 0;
    const redemptionRate = total > 0 ? Math.round((usedCount / total) * 100 * 10) / 10 : 0;

    // Auto-expire vouchers that are past their validity
    const activeVouchers = await db.voucher.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, createdAt: true, validityDays: true, denomination: true },
    });

    let autoExpiredCount = 0;
    for (const v of activeVouchers) {
      const expires = new Date(v.createdAt.getTime() + v.validityDays * 86400000);
      if (expires <= now) {
        autoExpiredCount++;
      }
    }

    const usedByDenom = await db.voucher.groupBy({
      by: ["denomination"],
      where: { status: "USED" },
      _count: { id: true },
    });
    const usedDenomMap = new Map(usedByDenom.map((d) => [d.denomination, d._count.id]));

    const denomBreakdown = denominationBreakdown
      .map((d) => ({
        denom: d.denomination,
        count: d._count.id,
        used: usedDenomMap.get(d.denomination) || 0,
      }))
      .sort((a, b) => a.denom - b.denom);

    if (autoExpiredCount > 0) {
      const toExpire = activeVouchers.filter((v) => {
        const expires = new Date(v.createdAt.getTime() + v.validityDays * 86400000);
        return expires <= now;
      }).map((v) => v.id);

      if (toExpire.length > 0) {
        db.voucher.updateMany({
          where: { id: { in: toExpire } },
          data: { status: "EXPIRED" },
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      total,
      active,
      used,
      expired: expired + autoExpiredCount,
      cancelled,
      totalValue,
      redeemedValue,
      redemptionRate,
      denominationBreakdown: denomBreakdown,
    });
  } catch (error) {
    console.error("Voucher stats error:", error);
    return NextResponse.json({ error: "Failed to fetch voucher stats" }, { status: 500 });
  }
}
