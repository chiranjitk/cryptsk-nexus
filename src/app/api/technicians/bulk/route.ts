import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditBulk } from "@/lib/services/audit-service";

// POST /api/technicians/bulk - Bulk operations on technicians
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { action, ids, status: newStatus } = body;

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Action and technician IDs are required" },
        { status: 400 }
      );
    }

    if (action === "delete") {
      // Check for active complaints before deleting
      const techsWithActive = await db.complaint.groupBy({
        by: ["assignedToId"],
        where: {
          assignedToId: { in: ids },
          status: { in: ["ASSIGNED", "IN_PROGRESS", "OPEN"] },
        },
      });
      const activeIds = new Set(techsWithActive.map((t) => t.assignedToId));
      const safeIds = ids.filter((id: string) => !activeIds.has(id));

      if (safeIds.length === 0) {
        return NextResponse.json(
          { error: "All selected technicians have active complaints and cannot be deleted" },
          { status: 400 }
        );
      }

      const result = await db.technician.deleteMany({
        where: { id: { in: safeIds } },
      });

      await auditBulk(request, "BULK_DELETE", "Technician", result.count, safeIds, { userId }).catch(() => {});
      return NextResponse.json({
        success: true,
        message: `Deleted ${result.count} technician(s)`,
        count: result.count,
        skipped: ids.length - safeIds.length,
      });
    }

    if (action === "setStatus") {
      const validStatuses = ["available", "busy", "offline"];
      if (!newStatus || !validStatuses.includes(newStatus)) {
        return NextResponse.json(
          { error: "Invalid status. Use 'available', 'busy', or 'offline'." },
          { status: 400 }
        );
      }

      const result = await db.technician.updateMany({
        where: { id: { in: ids } },
        data: { status: newStatus },
      });

      await auditBulk(request, "BULK_UPDATE", "Technician", result.count, ids, { status: newStatus }).catch(() => {});
      return NextResponse.json({
        success: true,
        message: `Updated ${result.count} technician(s) to "${newStatus}"`,
        count: result.count,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'delete' or 'setStatus'." },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bulk technicians error:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
