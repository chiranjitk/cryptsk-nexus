import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// Helper to resolve subscriber from OltPort.subscriberId (no Prisma relation)
async function resolveSubscriber(subscriberId: string | null) {
  if (!subscriberId) return null;
  return db.subscriber.findUnique({
    where: { id: subscriberId },
    select: { id: true, name: true, code: true, phone: true, status: true },
  });
}

// GET /api/ftth/ports/[id] - Get single port
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const port = await db.oltPort.findUnique({
      where: { id },
      include: {
        oltDevice: { select: { id: true, name: true, ipAddress: true, status: true } },
      },
    });

    if (!port) {
      return NextResponse.json({ error: "Port not found" }, { status: 404 });
    }

    const subscriber = await resolveSubscriber(port.subscriberId);
    return NextResponse.json({ port: { ...port, subscriber } });
  } catch (error) {
    console.error("OLT port get error:", error);
    return NextResponse.json(
      { error: "Failed to fetch port" },
      { status: 500 }
    );
  }
}

// PUT /api/ftth/ports/[id] - Update port
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const body = await request.json();
    const { portType, subscriberId, lineProfileId, serviceProfileId, status, txPower, rxPower } = body;

    const errors: string[] = [];
    if (status !== undefined && !["free", "active", "disabled", "fault"].includes(status)) {
      errors.push("Status must be one of: free, active, disabled, fault");
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const existing = await db.oltPort.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Port not found" }, { status: 404 });
    }

    const port = await db.oltPort.update({
      where: { id },
      data: {
        ...(portType !== undefined && { portType }),
        ...(subscriberId !== undefined && {
          subscriberId: subscriberId || null,
        }),
        ...(lineProfileId !== undefined && {
          lineProfileId: lineProfileId || "",
        }),
        ...(serviceProfileId !== undefined && {
          serviceProfileId: serviceProfileId || "",
        }),
        ...(status !== undefined && { status }),
        ...(txPower !== undefined && { txPower }),
        ...(rxPower !== undefined && { rxPower }),
      },
      include: {
        oltDevice: { select: { name: true, ipAddress: true } },
      },
    });

    // Auto-log port status changes
    if (status !== undefined && status !== existing.status) {
      await db.portStatusHistory.create({
        data: { portId: id, status, changedAt: new Date() },
      }).catch(() => {});
    }

    const subscriber = await resolveSubscriber(port.subscriberId);
    return NextResponse.json({ port: { ...port, subscriber } });
  } catch (error) {
    console.error("OLT port update error:", error);
    return NextResponse.json(
      { error: "Failed to update port" },
      { status: 500 }
    );
  }
}

// DELETE /api/ftth/ports/[id] - Delete port
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const existing = await db.oltPort.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Port not found" }, { status: 404 });
    }

    await db.oltPort.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("OLT port delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete port" },
      { status: 500 }
    );
  }
}
