import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

// GET /api/partner-portal-mappings — list portal mappings (filter by ?partnerId=)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get("partnerId") || "";

    const where: Record<string, unknown> = {};
    if (partnerId) where.partnerId = partnerId;

    const mappings = await db.partnerPortalMapping.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        Partner: { select: { id: true, name: true, code: true } },
        CaptivePortal: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      portalMappings: mappings.map((m) => ({
        id: m.id,
        partnerId: m.partnerId,
        captivePortalId: m.captivePortalId,
        portalTemplate: m.portalTemplate,
        partner: m.Partner,
        captivePortal: m.CaptivePortal,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      total: mappings.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_portal_mappings_list_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch partner portal mappings" }, { status: 500 });
  }
}

// POST /api/partner-portal-mappings — create portal mapping
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const { partnerId, captivePortalId, portalTemplate } = body;

    if (!partnerId) {
      return NextResponse.json({ error: "partnerId is required" }, { status: 400 });
    }

    const partner = await db.partner.findUnique({ where: { id: partnerId } });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    if (captivePortalId) {
      const portal = await db.captivePortal.findUnique({ where: { id: captivePortalId } });
      if (!portal) {
        return NextResponse.json({ error: "Captive portal not found" }, { status: 404 });
      }
    }

    const mapping = await db.partnerPortalMapping.create({
      data: {
        partnerId,
        captivePortalId: captivePortalId || null,
        portalTemplate: portalTemplate?.trim() || "default",
      },
    });

    await auditCreate(
      request,
      "PartnerPortalMapping",
      mapping.id,
      { partnerId, captivePortalId: mapping.captivePortalId, portalTemplate: mapping.portalTemplate },
      { userId },
    );

    return NextResponse.json({ portalMapping: mapping }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_portal_mapping_create_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to create partner portal mapping" }, { status: 500 });
  }
}
