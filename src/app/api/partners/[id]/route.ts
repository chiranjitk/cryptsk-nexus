import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

// GET /api/partners/[id] — partner with subscriber count, user count, IP pools, portal mappings
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const partner = await db.partner.findUnique({
      where: { id },
      include: {
        DistributionHub: { select: { id: true, name: true, code: true } },
        PartnerIpPool: { orderBy: { createdAt: "desc" } },
        PartnerPortalMapping: {
          orderBy: { createdAt: "desc" },
          include: { CaptivePortal: { select: { id: true, name: true } } },
        },
        _count: { select: { Subscriber: true, PartnerUser: true } },
      },
    });

    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    return NextResponse.json({
      partner: {
        id: partner.id,
        distributionHubId: partner.distributionHubId,
        name: partner.name,
        code: partner.code,
        description: partner.description,
        status: partner.status,
        contactName: partner.contactName,
        contactPhone: partner.contactPhone,
        contactEmail: partner.contactEmail,
        address: partner.address,
        logoUrl: partner.logoUrl,
        primaryColor: partner.primaryColor,
        customDomain: partner.customDomain,
        distributionHub: partner.DistributionHub,
        ipPools: partner.PartnerIpPool,
        portalMappings: partner.PartnerPortalMapping,
        subscriberCount: partner._count?.Subscriber ?? 0,
        partnerUserCount: partner._count?.PartnerUser ?? 0,
        createdAt: partner.createdAt.toISOString(),
        updatedAt: partner.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_get_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch partner" }, { status: 500 });
  }
}

// PUT /api/partners/[id] — update partner
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.partner.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.code !== undefined) updateData.code = String(body.code).trim().toUpperCase();
    if (body.description !== undefined) updateData.description = String(body.description);
    if (body.contactName !== undefined) updateData.contactName = String(body.contactName);
    if (body.contactPhone !== undefined) updateData.contactPhone = String(body.contactPhone);
    if (body.contactEmail !== undefined) updateData.contactEmail = String(body.contactEmail);
    if (body.address !== undefined) updateData.address = String(body.address);
    if (body.logoUrl !== undefined) updateData.logoUrl = String(body.logoUrl);
    if (body.primaryColor !== undefined) updateData.primaryColor = String(body.primaryColor);
    if (body.customDomain !== undefined) updateData.customDomain = String(body.customDomain);
    if (body.status !== undefined) updateData.status = String(body.status);

    const updated = await db.partner.update({
      where: { id },
      data: updateData,
    });

    await auditUpdate(request, "Partner", id, updateData, existing as unknown as Record<string, unknown>, { userId });

    return NextResponse.json({ partner: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_update_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to update partner" }, { status: 500 });
  }
}

// DELETE /api/partners/[id] — soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;

    const existing = await db.partner.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    const updated = await db.partner.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await auditDelete(request, "Partner", id, existing as unknown as Record<string, unknown>, { userId });

    return NextResponse.json({ success: true, partner: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_delete_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to delete partner" }, { status: 500 });
  }
}
