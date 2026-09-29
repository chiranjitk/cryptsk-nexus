import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/ftth/ports - List OLT ports (optionally filter by OLT)
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = new URL(request.url);
    const oltId = searchParams.get("oltId");

    const where = oltId ? { oltDeviceId: oltId } : {};

    const ports = await db.oltPort.findMany({
      where,
      orderBy: [{ oltDeviceId: "asc" }, { portNumber: "asc" }],
      include: {
        oltDevice: { select: { id: true, name: true, ipAddress: true } },
      },
    });

    // Manually resolve subscriber info (no Prisma relation on OltPort.subscriberId)
    const subscriberIds = [...new Set(ports.filter((p) => p.subscriberId).map((p) => p.subscriberId!))];
    const subscribers = subscriberIds.length > 0
      ? await db.subscriber.findMany({
          where: { id: { in: subscriberIds } },
          select: { id: true, name: true, code: true, phone: true },
        })
      : [];
    const subMap = new Map(subscribers.map((s) => [s.id, s]));

    const portsWithSubscribers = ports.map((p) => ({
      ...p,
      subscriber: p.subscriberId ? subMap.get(p.subscriberId) || null : null,
    }));

    return NextResponse.json({ ports: portsWithSubscribers });
  } catch (error) {
    console.error("FTTH ports list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch OLT ports" },
      { status: 500 }
    );
  }
}

// POST /api/ftth/ports - Add a new OLT port
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await request.json();
    const { oltDeviceId, portNumber, portType, subscriberId, lineProfileId, serviceProfileId } = body;

    const errors: string[] = [];
    if (!oltDeviceId?.trim()) errors.push("OLT device ID is required");
    if (portNumber === undefined || portNumber < 1)
      errors.push("Valid port number is required");

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const olt = await db.networkDevice.findUnique({
      where: { id: oltDeviceId },
    });
    if (!olt) {
      return NextResponse.json({ error: "OLT device not found" }, { status: 404 });
    }

    const port = await db.oltPort.create({
      data: {
        oltDeviceId,
        portNumber,
        portType: portType || "PON",
        subscriberId: subscriberId || null,
        lineProfileId: lineProfileId || "",
        serviceProfileId: serviceProfileId || "",
        status: subscriberId ? "active" : "free",
      },
      include: {
        oltDevice: { select: { name: true, ipAddress: true } },
      },
    });

    // Manually resolve subscriber info
    let Subscriber: { code: string; name: string } | null = null;
    if (port.subscriberId) {
      subscriber = await db.subscriber.findUnique({
        where: { id: port.subscriberId },
        select: { name: true, code: true },
      });
    }

    return NextResponse.json({ port: { ...port, subscriber } }, { status: 201 });
  } catch (error) {
    console.error("OLT port create error:", error);
    return NextResponse.json(
      { error: "Failed to create OLT port" },
      { status: 500 }
    );
  }
}
