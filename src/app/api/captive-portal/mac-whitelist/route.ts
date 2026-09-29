import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal/mac-whitelist — List MAC entries
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const portalId = searchParams.get("portalId") || "";
    const search = searchParams.get("search") || "";

    const where: Prisma.PortalMacWhitelistWhereInput = {};
    if (portalId) where.portalId = portalId;
    if (search) {
      where.OR = [
        { macAddress: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const entries = await db.portalMacWhitelist.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        portal: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal MAC] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch MAC whitelist" }, { status: 500 });
  }
}

// POST /api/captive-portal/mac-whitelist — Add MAC entry
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { portalId, macAddress } = body;

    if (!portalId) {
      return NextResponse.json({ error: "portalId is required" }, { status: 400 });
    }
    if (!macAddress?.trim()) {
      return NextResponse.json({ error: "macAddress is required" }, { status: 400 });
    }

    const portal = await db.captivePortal.findUnique({ where: { id: portalId } });
    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    // Check unique constraint (portalId + macAddress)
    const existing = await db.portalMacWhitelist.findUnique({
      where: {
        portalId_macAddress: {
          portalId,
          macAddress: macAddress.trim(),
        },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This MAC address already exists in this portal" },
        { status: 409 }
      );
    }

    const entry = await db.portalMacWhitelist.create({
      data: {
        portalId,
        macAddress: macAddress.trim(),
        description: body.description || "",
        subscriberId: body.subscriberId || null,
        allowedDays: body.allowedDays || "[1,2,3,4,5,6,7]",
        allowedFrom: body.allowedFrom || "00:00",
        allowedUntil: body.allowedUntil || "23:59",
        enabled: body.enabled !== undefined ? body.enabled : true,
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal MAC] POST error:", error);
    return NextResponse.json({ error: "Failed to add MAC entry" }, { status: 500 });
  }
}

// DELETE /api/captive-portal/mac-whitelist — Bulk remove
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");

    if (!idsParam) {
      return NextResponse.json({ error: "ids query parameter is required (comma-separated)" }, { status: 400 });
    }

    const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: "No valid IDs provided" }, { status: 400 });
    }

    const result = await db.portalMacWhitelist.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal MAC] DELETE error:", error);
    return NextResponse.json({ error: "Failed to remove MAC entries" }, { status: 500 });
  }
}
