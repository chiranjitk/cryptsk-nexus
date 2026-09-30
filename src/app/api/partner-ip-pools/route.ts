import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

// GET /api/partner-ip-pools — list IP pools (filter by ?partnerId=)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get("partnerId") || "";

    const where: Record<string, unknown> = {};
    if (partnerId) where.partnerId = partnerId;

    const pools = await db.partnerIpPool.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        Partner: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return NextResponse.json({
      ipPools: pools.map((p) => ({
        id: p.id,
        partnerId: p.partnerId,
        poolType: p.poolType,
        startIp: p.startIp,
        endIp: p.endIp,
        subnetId: p.subnetId,
        description: p.description,
        partner: p.Partner,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      total: pools.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_ip_pools_list_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch partner IP pools" }, { status: 500 });
  }
}

// POST /api/partner-ip-pools — create IP pool mapping
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { partnerId, poolType, startIp, endIp, subnetId, description } = body;

    if (!partnerId || !startIp?.trim() || !endIp?.trim()) {
      return NextResponse.json(
        { error: "partnerId, startIp, endIp are required" },
        { status: 400 },
      );
    }

    const partner = await db.partner.findUnique({ where: { id: partnerId } });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    // Optional subnet validation
    if (subnetId) {
      const subnet = await db.subnet.findUnique({ where: { id: subnetId } });
      if (!subnet) {
        return NextResponse.json({ error: "Subnet not found" }, { status: 404 });
      }
    }

    const pool = await db.partnerIpPool.create({
      data: {
        partnerId,
        poolType: poolType || "IPv4",
        startIp: startIp.trim(),
        endIp: endIp.trim(),
        subnetId: subnetId || null,
        description: description?.trim() || "",
      },
    });

    await auditCreate(
      request,
      "PartnerIpPool",
      pool.id,
      { partnerId, poolType: pool.poolType, startIp: pool.startIp, endIp: pool.endIp },
      { userId },
    );

    return NextResponse.json({ ipPool: pool }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_ip_pool_create_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to create partner IP pool" }, { status: 500 });
  }
}
