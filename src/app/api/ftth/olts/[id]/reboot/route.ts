import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// POST /api/ftth/olts/[id]/reboot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(request);
    const { id } = await params;

    const device = await db.networkDevice.findUnique({ where: { id } });
    if (!device) return NextResponse.json({ error: "OLT not found" }, { status: 404 });
    if (device.type !== "OLT") return NextResponse.json({ error: "Device is not an OLT" }, { status: 400 });

    await db.networkDevice.update({
      where: { id },
      data: { status: "MAINTENANCE" },
    });

    return NextResponse.json({
      success: true,
      message: `OLT "${device.name}" reboot initiated. Status set to MAINTENANCE.`,
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("OLT reboot error:", error);
    return NextResponse.json({ error: "Failed to reboot OLT" }, { status: 500 });
  }
}
