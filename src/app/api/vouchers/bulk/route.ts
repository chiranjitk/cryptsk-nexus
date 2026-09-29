import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { action, ids } = body;

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Missing required fields: action, ids" }, { status: 400 });
    }

    if (ids.length > 500) {
      return NextResponse.json({ error: "Maximum 500 vouchers per bulk action" }, { status: 400 });
    }

    if (action === "cancel") {
      const result = await db.voucher.updateMany({
        where: {
          id: { in: ids },
          status: "ACTIVE",
        },
        data: { status: "CANCELLED" },
      });

      await auditCreate(req, "Voucher", "bulk", {
        action: "bulk-cancel",
        count: result.count,
        ids,
      });

      return NextResponse.json({
        success: true,
        count: result.count,
        message: `${result.count} voucher(s) cancelled`,
      });
    }

    if (action === "print") {
      const vouchers = await db.voucher.findMany({
        where: { id: { in: ids } },
        include: {
          Plan: { select: { id: true, name: true, priceMonthly: true, validityDays: true } },
          usedBySubscriber: { select: { id: true, name: true, code: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ vouchers, count: vouchers.length });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Vouchers bulk error:", error);
    return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 });
  }
}
