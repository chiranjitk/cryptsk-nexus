import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requirePermission, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(_request, "users.read");
    const { id } = await params;

    // Verify user exists
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch last 20 audit log entries for this user
    const logs = await db.auditLog.findMany({
      where: { userId: id },
      select: {
        id: true,
        action: true,
        entity: true,
        details: true,
        ipAddress: true,
        timestamp: true,
      },
      orderBy: { timestamp: "desc" },
      take: 20,
    });

    // Parse details from JSON string
    const entries = logs.map((log) => {
      let parsedDetails: unknown = {};
      try {
        parsedDetails = JSON.parse(log.details || "{}");
      } catch {
        parsedDetails = {};
      }
      return {
        id: log.id,
        action: log.action,
        entity: log.entity,
        details: parsedDetails,
        ipAddress: log.ipAddress,
        timestamp: log.timestamp,
      };
    });

    return NextResponse.json({ userId: id, userName: user.name, entries });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User activity error:", error);
    return NextResponse.json({ error: "Failed to fetch user activity" }, { status: 500 });
  }
}
