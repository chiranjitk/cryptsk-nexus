import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate, auditDelete } from "@/lib/audit";

// GET /api/users/[id] — get single user
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("user", "read");
    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, username: true, name: true,
        status: true, lastLoginAt: true, lastLoginIp: true,
        loginAttempts: true, lockedUntil: true,
        forcePasswordChange: true, mfaEnabled: true,
        timezone: true, locale: true, avatarUrl: true,
        createdAt: true, updatedAt: true,
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({ user });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

// PATCH /api/users/[id] — update user
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requirePermission("user", "update");
    const { id } = await params;
    const body = await req.json();
    const { email, username, name, status, password, roleIds, forcePasswordChange, mfaEnabled } = body;

    const existing = await db.user.findUnique({ where: { id }, include: { roles: true } });
    if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (email) data.email = email.toLowerCase();
    if (username) data.username = username;
    if (name !== undefined) data.name = name;
    if (status) data.status = status;
    if (forcePasswordChange !== undefined) data.forcePasswordChange = forcePasswordChange;
    if (mfaEnabled !== undefined) data.mfaEnabled = mfaEnabled;
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 12);
      data.passwordChangedAt = new Date();
      data.forcePasswordChange = false;
    }

    const updated = await db.user.update({
      where: { id },
      data,
      include: {
        roles: { include: { role: { select: { id: true, name: true, slug: true } } } },
      },
    });

    // Update role assignments if provided
    if (roleIds !== undefined) {
      // Remove existing roles
      await db.userRole.deleteMany({ where: { userId: id } });
      // Add new roles
      if (roleIds.length > 0) {
        await db.userRole.createMany({
          data: roleIds.map((roleId: string) => ({
            userId: id,
            roleId,
            assignedBy: currentUser.id,
          })),
        });
      }
    }

    await auditUpdate({
      userId: currentUser.id,
      action: "update",
      resource: "user",
      resourceId: id,
      resourceName: existing.email,
      before: { email: existing.email, username: existing.username, name: existing.name, status: existing.status },
      after: { email: updated.email, username: updated.username, name: updated.name, status: updated.status, roleIds },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ user: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

// DELETE /api/users/[id] — delete user
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requirePermission("user", "delete");
    const { id } = await params;

    if (id === currentUser.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await db.user.delete({ where: { id } });

    await auditDelete({
      userId: currentUser.id,
      action: "delete",
      resource: "user",
      resourceId: id,
      resourceName: existing.email,
      before: { email: existing.email, username: existing.username },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
