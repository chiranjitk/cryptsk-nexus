import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/ftth/ports/status-history?portId=xxx
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const portId = searchParams.get("portId");
    if (!portId) return NextResponse.json({ error: "portId is required" }, { status: 400 });

    const history = await db.portStatusHistory.findMany({
      where: { portId },
      orderBy: { changedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ history });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch port status history" }, { status: 500 });
  }
}
