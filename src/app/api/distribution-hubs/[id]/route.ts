import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

// GET /api/distribution-hubs/[id] — single hub with partners
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const hub = await db.distributionHub.findUnique({
      where: { id },
      include: {
        Partner: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            contactName: true,
            contactPhone: true,
            contactEmail: true,
            createdAt: true,
          },
        },
      },
    });

    if (!hub) {
      return NextResponse.json({ error: "Distribution hub not found" }, { status: 404 });
    }

    return NextResponse.json({
      hub: {
        id: hub.id,
        name: hub.name,
        code: hub.code,
        description: hub.description,
        status: hub.status,
        createdAt: hub.createdAt.toISOString(),
        updatedAt: hub.updatedAt.toISOString(),
        partners: hub.Partner.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("distribution_hub_get_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch distribution hub" }, { status: 500 });
  }
}

// PUT /api/distribution-hubs/[id] — update hub
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.distributionHub.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Distribution hub not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.code !== undefined) updateData.code = String(body.code).trim().toUpperCase();
    if (body.description !== undefined) updateData.description = String(body.description);
    if (body.status !== undefined) updateData.status = String(body.status);

    const updated = await db.distributionHub.update({
      where: { id },
      data: updateData,
    });

    await auditUpdate(request, "DistributionHub", id, updateData, existing as unknown as Record<string, unknown>, { userId });

    return NextResponse.json({ hub: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("distribution_hub_update_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to update distribution hub" }, { status: 500 });
  }
}

// DELETE /api/distribution-hubs/[id] — soft delete (set status to INACTIVE)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;

    const existing = await db.distributionHub.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Distribution hub not found" }, { status: 404 });
    }

    const updated = await db.distributionHub.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

    await auditDelete(request, "DistributionHub", id, existing as unknown as Record<string, unknown>, { userId });

    return NextResponse.json({ success: true, hub: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("distribution_hub_delete_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to delete distribution hub" }, { status: 500 });
  }
}
