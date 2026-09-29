import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/devices/export - Export devices as CSV
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const areaId = searchParams.get("areaId") || "";
    const type = searchParams.get("type") || "";
    const statusFilter = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const tag = searchParams.get("tag") || "";

    const where: Record<string, unknown> = {};
    if (areaId) where.areaId = areaId;
    if (type) where.type = type;
    if (statusFilter) where.status = statusFilter;
    if (tag) where.tags = { contains: tag };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { ipAddress: { contains: search } },
        { model: { contains: search } },
        { location: { contains: search } },
      ];
    }

    const devices = await db.networkDevice.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        Area: { select: { name: true } },
      },
    });

    const header = "Name,Type,IP,Status,Location,CPU,Memory,Model,Vendor,Tags,Area,Last Seen";
    const rows = devices.map((d) => {
      const tags = (d.tags || "[]").replace(/"/g, '""');
      const location = (d.location || "").replace(/"/g, '""');
      return [
        `"${(d.name || "").replace(/"/g, '""')}"`,
        d.type,
        d.ipAddress,
        d.status,
        `"${location}"`,
        d.cpuUsage,
        d.memoryUsage,
        `"${(d.model || "").replace(/"/g, '""')}"`,
        d.vendor,
        `"${tags}"`,
        `"${(d.Area?.name || "").replace(/"/g, '""')}"`,
        d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : "Never",
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="devices-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Device export error:", error);
    return NextResponse.json(
      { error: "Failed to export devices" },
      { status: 500 }
    );
  }
}
