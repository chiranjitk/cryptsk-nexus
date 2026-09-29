import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── CORS Headers ────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── OPTIONS handler for CORS preflight ──────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── GET /api/network/devices ────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const skip = (page - 1) * limit;

    const [devices, total] = await Promise.all([
      db.networkDevice.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          Vendor: true,
          model: true,
          ipAddress: true,
          status: true,
          location: true,
          areaId: true,
          uptimeSeconds: true,
          cpuUsage: true,
          memoryUsage: true,
          temperature: true,
          lastSeenAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      db.networkDevice.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        devices,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Network devices fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch network devices" },
      { status: 500, headers: corsHeaders }
    );
  }
}
