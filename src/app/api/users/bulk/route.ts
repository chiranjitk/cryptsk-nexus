import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requirePermission, AuthError } from "@/lib/api-auth";
import { auditBulk } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function PUT(request: NextRequest) {
  try {
    const userId = await requirePermission(request, "users.update");
    const body = await request.json();
    const { userIds, action } = body as { userIds?: string[]; action?: string };

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds must be a non-empty array" }, { status: 400 });
    }

    if (userIds.length > 100) {
      return NextResponse.json({ error: "Cannot modify more than 100 users at once" }, { status: 400 });
    }

    if (!action || !["activate", "suspend"].includes(action)) {
      return NextResponse.json({ error: "action must be 'activate' or 'suspend'" }, { status: 400 });
    }

    const newStatus = action === "activate" ? "ACTIVE" : "SUSPENDED";

    // Cannot bulk-modify self
    if (userIds.includes(userId)) {
      return NextResponse.json({ error: "Cannot change your own status via bulk operation" }, { status: 403 });
    }

    // Execute bulk status change
    const result = await db.user.updateMany({
      where: { id: { in: userIds } },
      data: { status: newStatus },
    });

    auditBulk(request, "BULK_UPDATE", "User", result.count, userIds, { action, newStatus }).catch(() => {});

    return NextResponse.json({
      success: true,
      affected: result.count,
      message: `${result.count} user(s) ${action}d successfully`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bulk user update error:", error);
    return NextResponse.json({ error: "Failed to perform bulk operation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUserId = await requirePermission(request, "users.delete");
    const body = await request.json();
    const { userIds, action } = body as { userIds?: string[]; action?: string };

    if (action !== "delete") {
      return NextResponse.json({ error: "Invalid action for DELETE method" }, { status: 400 });
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "userIds must be a non-empty array" }, { status: 400 });
    }

    if (userIds.length > 100) {
      return NextResponse.json({ error: "Cannot delete more than 100 users at once" }, { status: 400 });
    }

    // Cannot bulk-delete self
    if (userIds.includes(currentUserId)) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 403 });
    }

    // Check for linked profiles before delete
    const usersWithProfiles = await db.user.findMany({
      where: { id: { in: userIds } },
      include: {
        Technician: { select: { id: true } },
        agent: { select: { id: true } },
      },
    });

    const blocked: string[] = [];
    const deletableIds: string[] = [];

    for (const u of usersWithProfiles) {
      if (u.Technician || u.agent) {
        blocked.push(u.name || u.email);
      } else {
        deletableIds.push(u.id);
      }
    }

    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error: `${blocked.length} user(s) cannot be deleted because they have linked profiles`,
          blockedUsers: blocked,
          deletableCount: deletableIds.length,
        },
        { status: 409 },
      );
    }

    if (deletableIds.length === 0) {
      return NextResponse.json({ error: "No users to delete" }, { status: 400 });
    }

    // Check if trying to delete the last SUPER_ADMIN
    const superAdminsToDelete = usersWithProfiles.filter((u) => u.role === "SUPER_ADMIN");
    if (superAdminsToDelete.length > 0) {
      const totalSuperAdmins = await db.user.count({ where: { role: "SUPER_ADMIN" } });
      if (totalSuperAdmins <= superAdminsToDelete.length) {
        return NextResponse.json(
          { error: "Cannot delete all SUPER_ADMIN accounts. At least one must remain." },
          { status: 403 },
        );
      }
    }

    // Perform bulk delete
    const result = await db.user.deleteMany({
      where: { id: { in: deletableIds } },
    });

    auditBulk(request, "BULK_DELETE", "User", result.count, deletableIds).catch(() => {});

    return NextResponse.json({
      success: true,
      affected: result.count,
      message: `${result.count} user(s) deleted successfully`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bulk user delete error:", error);
    return NextResponse.json({ error: "Failed to perform bulk delete" }, { status: 500 });
  }
}
