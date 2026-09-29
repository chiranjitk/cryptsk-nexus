import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    // Find all failed notifications that haven't exceeded max retries
    const failedNotifications = await db.notification.findMany({
      where: {
        status: "FAILED",
        retryCount: { lt: 3 }, // default maxRetries
        Subscriber: { isNot: null },
      },
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, email: true } },
      },
      take: 50, // Limit batch size
    });

    if (failedNotifications.length === 0) {
      return NextResponse.json({ success: true, retried: 0, message: "No failed notifications eligible for retry" });
    }

    // Reset all to PENDING status
    await db.notification.updateMany({
      where: {
        id: { in: failedNotifications.map((n) => n.id) },
      },
      data: {
        retryCount: { increment: 1 },
        status: "PENDING",
        sentAt: null,
        deliveredAt: null,
      },
    });

    auditCreate(request, "Notification", "bulk-retry", { count: failedNotifications.length }, { userId }).catch(() => {});

    return NextResponse.json({
      success: true,
      retried: failedNotifications.length,
      message: `${failedNotifications.length} failed notifications queued for retry`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bulk retry notifications error:", error);
    return NextResponse.json({ error: "Failed to retry notifications" }, { status: 500 });
  }
}
