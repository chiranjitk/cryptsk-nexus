import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/ipam/assignment-history?ipAddressId=xxx
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const ipAddressId = searchParams.get("ipAddressId");
    if (!ipAddressId) return NextResponse.json({ error: "ipAddressId is required" }, { status: 400 });

    const history = await db.ipAssignmentHistory.findMany({
      where: { ipAddressId },
      orderBy: { assignedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ history });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch assignment history" }, { status: 500 });
  }
}
