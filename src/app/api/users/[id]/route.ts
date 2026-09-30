import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requirePermission, AuthError } from "@/lib/api-auth";
import { revokeAllUserSessionsAsync } from "@/lib/session-store";
import type { NextRequest } from "next/server";

const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "AGENT", "TECHNICIAN", "VIEWER", "CUSTOMER"];
const VALID_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE", "LOCKED"];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(_request, "users.read");
    const { id } = await params;
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, phone: true, role: true, status: true,
        avatarUrl: true, lastLoginAt: true, createdAt: true, updatedAt: true, twoFactorEnabled: true, assignedAreaIds: true,
        Technician: {
          select: { id: true, name: true, phone: true, skills: true, status: true, rating: true, totalResolved: true },
        },
        CollectionAgent: {
          select: { id: true, name: true, phone: true, dailyTarget: true, monthlyTarget: true, totalCollectedMonth: true },
        },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User get error:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUserId = await requirePermission(request, "users.update");
    const { id } = await params;
    const body = await request.json();

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    // Name
    if (body.name !== undefined) {
      if (!body.name || !String(body.name).trim()) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      updateData.name = String(body.name).trim();
    }

    // Email with uniqueness check
    if (body.email !== undefined) {
      const newEmail = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }
      if (newEmail !== existing.email) {
        const duplicate = await db.user.findUnique({ where: { email: newEmail } });
        if (duplicate) {
          return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
        }
      }
      updateData.email = newEmail;
    }

    // Phone
    if (body.phone !== undefined) {
      updateData.phone = body.phone !== null ? String(body.phone).trim() : "";
    }

    // Avatar URL
    if (body.avatarUrl !== undefined) {
      updateData.avatarUrl = String(body.avatarUrl || "");
    }

    // Role validation
    if (body.role !== undefined) {
      const role = String(body.role).toUpperCase();
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
      }
      // Prevent non-SUPER_ADMIN from escalating roles to SUPER_ADMIN
      const currentUser = await db.user.findUnique({ where: { id: currentUserId }, select: { role: true } });
      if (currentUser && currentUser.role !== "SUPER_ADMIN" && role === "SUPER_ADMIN") {
        return NextResponse.json({ error: "Only SUPER_ADMIN can assign SUPER_ADMIN role" }, { status: 403 });
      }
      updateData.role = role;
    }

    // Status validation
    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
      }
      // Prevent self-suspension
      if (id === currentUserId && status !== "ACTIVE") {
        return NextResponse.json({ error: "You cannot change your own status" }, { status: 403 });
      }
      updateData.status = status;
    }

    // Password
    if (body.password && typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      updateData.password = await bcrypt.hash(body.password, 12);
    }

    // Two-Factor Authentication toggle
    if (body.twoFactorEnabled !== undefined) {
      updateData.twoFactorEnabled = Boolean(body.twoFactorEnabled);
    }

    // Assigned area IDs
    if (body.assignedAreaIds !== undefined) {
      const areaIds = body.assignedAreaIds;
      if (typeof areaIds === "string") {
        try {
          const parsed = JSON.parse(areaIds);
          if (Array.isArray(parsed)) {
            updateData.assignedAreaIds = JSON.stringify(parsed);
          } else {
            return NextResponse.json({ error: "assignedAreaIds must be a JSON array" }, { status: 400 });
          }
        } catch {
          return NextResponse.json({ error: "assignedAreaIds must be valid JSON" }, { status: 400 });
        }
      } else if (Array.isArray(areaIds)) {
        updateData.assignedAreaIds = JSON.stringify(areaIds);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true, name: true, email: true, phone: true, role: true, status: true,
        avatarUrl: true, createdAt: true, updatedAt: true,
      },
    });

    // [AUDIT-FIX F-19] Role change, deactivation, or password reset must kill
    // all of the target user's live sessions immediately (fire-and-forget).
    const roleChanged = updateData.role !== undefined && updateData.role !== existing.role;
    const statusChanged = updateData.status !== undefined && updateData.status !== "ACTIVE";
    const passwordReset = updateData.password !== undefined;
    if (roleChanged || statusChanged || passwordReset) {
      revokeAllUserSessionsAsync(id);
    }

    auditUpdate(request, "User", id, { changed: Object.keys(updateData) }, { name: existing.name, email: existing.email }, { userId: currentUserId }).catch(() => {});
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User update error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUserId = await requirePermission(request, "users.delete");
    const { id } = await params;

    // Self-delete protection
    if (id === currentUserId) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 403 });
    }

    const existing = await db.user.findUnique({
      where: { id },
      include: {
        Technician: { select: { id: true } },
        CollectionAgent: { select: { id: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Linked profile check — block delete if user has Technician or CollectionAgent profile
    if (existing.Technician) {
      return NextResponse.json(
        { error: "Cannot delete user: this user is linked to a Technician profile. Delete the technician profile first." },
        { status: 409 },
      );
    }
    if (existing.CollectionAgent) {
      return NextResponse.json(
        { error: "Cannot delete user: this user is linked to a Collection Agent profile. Delete the agent profile first." },
        { status: 409 },
      );
    }

    // Last SUPER_ADMIN protection
    if (existing.role === "SUPER_ADMIN") {
      const superAdminCount = await db.user.count({ where: { role: "SUPER_ADMIN" } });
      if (superAdminCount <= 1) {
        return NextResponse.json({ error: "Cannot delete the last SUPER_ADMIN account" }, { status: 403 });
      }
    }

    auditDelete(request, "User", id, { name: existing.name, email: existing.email, role: existing.role }, { userId: currentUserId }).catch(() => {});
    await db.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User delete error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
