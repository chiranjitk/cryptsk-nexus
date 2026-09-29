import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// POST /api/captive-portal/sessions/disconnect-all — Mass disconnect
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json().catch(() => ({}));
    const { portalId } = body;

    const whereClause = portalId
      ? { portalId, status: "ACTIVE" as const }
      : { status: "ACTIVE" as const };

    const count = await db.portalSession.count({ where: whereClause });

    if (count === 0) {
      return NextResponse.json({ message: "No active sessions to disconnect", disconnected: 0 });
    }

    const result = await db.portalSession.updateMany({
      where: whereClause,
      data: {
        status: "ADMIN_DISCONNECT",
        disconnectReason: "Mass disconnected by administrator",
        lastActivity: new Date(),
      },
    });

    return NextResponse.json({
      message: `Disconnected ${result.count} active session(s)`,
      disconnected: result.count,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Sessions] POST disconnect-all error:", error);
    return NextResponse.json({ error: "Failed to disconnect sessions" }, { status: 500 });
  }
}
