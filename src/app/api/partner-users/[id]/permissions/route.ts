import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate, auditLog } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

// GET /api/partner-users/[id]/permissions — list permissions assigned to this partner user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const user = await db.partnerUser.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, partnerId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Partner user not found" }, { status: 404 });
    }

    const assigned = await db.partnerRolePermission.findMany({
      where: { partnerUserId: id },
      include: { PartnerPermission: true },
    });

    return NextResponse.json({
      partnerUser: user,
      permissions: assigned.map((rp) => ({
        assignmentId: rp.id,
        partnerPermissionId: rp.partnerPermissionId,
        assignedAt: rp.assignedAt.toISOString(),
        assignedBy: rp.assignedBy,
        permission: {
          id: rp.PartnerPermission.id,
          key: rp.PartnerPermission.key,
          description: rp.PartnerPermission.description,
          category: rp.PartnerPermission.category,
        },
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_user_permissions_list_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch partner user permissions" }, { status: 500 });
  }
}

// POST /api/partner-users/[id]/permissions — assign permission to partner user (partnerPermissionId)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const body = await request.json();
    const { partnerPermissionId } = body;

    if (!partnerPermissionId) {
      return NextResponse.json({ error: "partnerPermissionId is required" }, { status: 400 });
    }

    const user = await db.partnerUser.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "Partner user not found" }, { status: 404 });
    }

    const permission = await db.partnerPermission.findUnique({ where: { id: partnerPermissionId } });
    if (!permission) {
      return NextResponse.json({ error: "Permission not found" }, { status: 404 });
    }

    // Upsert to handle the @@unique([partnerUserId, partnerPermissionId])
    const assignment = await db.partnerRolePermission.upsert({
      where: {
        partnerUserId_partnerPermissionId: {
          partnerUserId: id,
          partnerPermissionId,
        },
      },
      update: { assignedBy: userId },
      create: {
        partnerUserId: id,
        partnerPermissionId,
        assignedBy: userId,
      },
    });

    await auditCreate(
      request,
      "PartnerRolePermission",
      assignment.id,
      { partnerUserId: id, partnerPermissionId, permissionKey: permission.key },
      { userId },
    );

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_user_permission_assign_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to assign permission" }, { status: 500 });
  }
}

// DELETE /api/partner-users/[id]/permissions?partnerPermissionId=... — revoke permission
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const partnerPermissionId = searchParams.get("partnerPermissionId");

    if (!partnerPermissionId) {
      return NextResponse.json({ error: "partnerPermissionId query parameter is required" }, { status: 400 });
    }

    const assignment = await db.partnerRolePermission.findUnique({
      where: {
        partnerUserId_partnerPermissionId: {
          partnerUserId: id,
          partnerPermissionId,
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Permission assignment not found" }, { status: 404 });
    }

    await db.partnerRolePermission.delete({
      where: {
        partnerUserId_partnerPermissionId: {
          partnerUserId: id,
          partnerPermissionId,
        },
      },
    });

    await auditLog(request, "UNASSIGN", "PartnerRolePermission", assignment.id, {
      details: { partnerUserId: id, partnerPermissionId },
      userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_user_permission_revoke_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to revoke permission" }, { status: 500 });
  }
}
