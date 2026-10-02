import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditUpdate } from "@/lib/services/audit-service";

// POST /api/devices/bulk - Bulk reboot or delete devices
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const { action, ids } = body;

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Action and device IDs are required" },
        { status: 400 }
      );
    }

    if (action === "reboot") {
      const result = await db.networkDevice.updateMany({
        where: { id: { in: ids } },
        data: { status: "MAINTENANCE" },
      });

      await auditUpdate(request, "NetworkDevice", "bulk", body, undefined, { userId }).catch(() => {});
      return NextResponse.json({
        success: true,
        message: `Reboot command sent to ${result.count} device(s)`,
        count: result.count,
      });
    }

    if (action === "delete") {
      const result = await db.networkDevice.deleteMany({
        where: { id: { in: ids } },
      });

      await auditUpdate(request, "NetworkDevice", "bulk-delete", body, undefined, { userId }).catch(() => {});
      return NextResponse.json({
        success: true,
        message: `Deleted ${result.count} device(s)`,
        count: result.count,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'reboot' or 'delete'." },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bulk devices error:", error);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
