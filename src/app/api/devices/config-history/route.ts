import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/devices/config-history?deviceId=xxx - Get config history for a device
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");
    if (!deviceId) return NextResponse.json({ error: "deviceId is required" }, { status: 400 });

    const history = await db.deviceConfigHistory.findMany({
      where: { deviceId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ history });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Config history error:", error);
    return NextResponse.json({ error: "Failed to fetch config history" }, { status: 500 });
  }
}

// POST /api/devices/config-history - Create a config history entry (manual)
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { deviceId, field, oldValue, newValue } = body;

    if (!deviceId) return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
    if (!field) return NextResponse.json({ error: "field is required" }, { status: 400 });

    const entry = await db.deviceConfigHistory.create({
      data: {
        deviceId,
        field: field || "",
        oldValue: String(oldValue ?? ""),
        newValue: String(newValue ?? ""),
        changedBy: userId || "unknown",
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Config history create error:", error);
    return NextResponse.json({ error: "Failed to create config history entry" }, { status: 500 });
  }
}
