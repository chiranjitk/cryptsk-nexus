import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal/voucher-pools — List voucher pools
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const portalId = searchParams.get("portalId") || "";

    const where: Prisma.PortalVoucherPoolWhereInput = {};
    if (portalId) where.portalId = portalId;

    const pools = await db.portalVoucherPool.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        portal: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ pools });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal VoucherPools] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch voucher pools" }, { status: 500 });
  }
}

// POST /api/captive-portal/voucher-pools — Create voucher pool
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { portalId } = body;

    if (!portalId) {
      return NextResponse.json({ error: "portalId is required" }, { status: 400 });
    }

    const portal = await db.captivePortal.findUnique({ where: { id: portalId } });
    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const pool = await db.portalVoucherPool.create({
      data: {
        portalId,
        name: body.name || "",
        voucherPrefix: body.voucherPrefix || "",
        maxUsesPerVoucher: body.maxUsesPerVoucher || 1,
        maxTotalActivations: body.maxTotalActivations || 0,
        currentActivations: 0,
        speedDownKbps: body.speedDownKbps || 0,
        speedUpKbps: body.speedUpKbps || 0,
        dataLimitMb: body.dataLimitMb || 0,
        sessionTimeoutMin: body.sessionTimeoutMin || 0,
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        enabled: body.enabled !== undefined ? body.enabled : true,
      },
    });

    return NextResponse.json({ pool }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal VoucherPools] POST error:", error);
    return NextResponse.json({ error: "Failed to create voucher pool" }, { status: 500 });
  }
}
