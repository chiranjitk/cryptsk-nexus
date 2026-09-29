import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/devices/tree - Get device hierarchy tree structure
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = new URL(request.url);
    const areaId = searchParams.get("areaId") || undefined;

    const where: Record<string, unknown> = {};
    if (areaId) where.areaId = areaId;

    // Get all devices
    const devices = await db.networkDevice.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true, ipAddress: true, status: true } },
        children: { select: { id: true, name: true, ipAddress: true, status: true } },
        Area: { select: { id: true, name: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    // Build tree from flat list
    const roots: typeof devices = [];
    const childMap = new Map<string, (typeof devices)[number][]>();

    // Initialize child map
    for (const device of devices) {
      childMap.set(device.id, []);
    }

    // Populate children
    for (const device of devices) {
      if (device.parentId && childMap.has(device.parentId)) {
        childMap.get(device.parentId)!.push(device);
      }
    }

    // Collect root devices (no parent)
    for (const device of devices) {
      if (!device.parentId) {
        roots.push(device);
      }
    }

    return NextResponse.json({ tree: roots, total: devices.length });
  } catch (error) {
    console.error("Devices tree error:", error);
    return NextResponse.json({ error: "Failed to fetch device tree" }, { status: 500 });
  }
}
