import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";
import { hash } from "bcryptjs";

// GET /api/partner-users/[id] — get partner user with permissions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const user = await db.partnerUser.findUnique({
      where: { id },
      include: {
        Partner: { select: { id: true, name: true, code: true } },
        PartnerRolePermission: {
          include: { PartnerPermission: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Partner user not found" }, { status: 404 });
    }

    return NextResponse.json({
      partnerUser: {
        id: user.id,
        partnerId: user.partnerId,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
        loginAttempts: user.loginAttempts,
        lockedUntil: user.lockedUntil?.toISOString() || null,
        partner: user.Partner,
        permissions: user.PartnerRolePermission.map((rp) => ({
          id: rp.id,
          partnerPermissionId: rp.partnerPermissionId,
          assignedAt: rp.assignedAt.toISOString(),
          permission: {
            id: rp.PartnerPermission.id,
            key: rp.PartnerPermission.key,
            description: rp.PartnerPermission.description,
            category: rp.PartnerPermission.category,
          },
        })),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_user_get_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch partner user" }, { status: 500 });
  }
}

// PUT /api/partner-users/[id] — update partner user (name, phone, role, status, password?)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.partnerUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Partner user not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.phone !== undefined) updateData.phone = String(body.phone);
    if (body.role !== undefined) updateData.role = String(body.role);
    if (body.status !== undefined) updateData.status = String(body.status);

    if (body.password) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 },
        );
      }
      updateData.password = await hash(String(body.password), 12);
    }

    // Reset failed login state when reactivating
    if (body.status === "ACTIVE" && existing.status !== "ACTIVE") {
      updateData.loginAttempts = 0;
      updateData.lockedUntil = null;
    }

    const updated = await db.partnerUser.update({
      where: { id },
      data: updateData,
    });

    await auditUpdate(request, "PartnerUser", id, updateData, existing as unknown as Record<string, unknown>, { userId });

    return NextResponse.json({ partnerUser: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_user_update_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to update partner user" }, { status: 500 });
  }
}

// DELETE /api/partner-users/[id] — delete partner user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;

    const existing = await db.partnerUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Partner user not found" }, { status: 404 });
    }

    await db.partnerUser.delete({ where: { id } });

    await auditDelete(request, "PartnerUser", id, existing as unknown as Record<string, unknown>, { userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_user_delete_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to delete partner user" }, { status: 500 });
  }
}
