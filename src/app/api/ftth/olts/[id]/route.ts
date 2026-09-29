import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/ftth/olts/[id] - Get single OLT with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_request);
    const { id } = await params;
    const olt = await db.networkDevice.findUnique({
      where: { id },
      include: {
        Area: { select: { name: true } },
        oltPorts: {
          orderBy: { portNumber: "asc" },
        },
        interfaces: { orderBy: { name: "asc" } },
      },
    });

    if (!olt) {
      return NextResponse.json({ error: "OLT not found" }, { status: 404 });
    }

    // Manually resolve subscriber info (no Prisma relation on OltPort.subscriberId)
    const portsWithSubscribers = await Promise.all(
      olt.oltPorts.map(async (p) => {
        let Subscriber: { id: string; name: string; code: string; phone: string } | null = null;
        if (p.subscriberId) {
          subscriber = await db.subscriber.findUnique({
            where: { id: p.subscriberId },
            select: { id: true, name: true, code: true, phone: true },
          });
        }
        return { ...p, subscriber };
      })
    );

    const totalPorts = portsWithSubscribers.length;
    const usedPorts = portsWithSubscribers.filter((p) => p.status === "active").length;

    // Get subscriber count via raw query
    const subRaw: { count: number }[] = await db.$queryRawUnsafe(`
      SELECT CAST(COUNT(*) AS int) as count FROM "Subscriber" WHERE "assignedDeviceId" = $1
    `, olt.id);
    const subscriberCount = Number(subRaw[0]?.count || 0);

    return NextResponse.json({
      olt: {
        ...olt,
        oltPorts: portsWithSubscribers,
        totalPorts,
        usedPorts,
        freePorts: totalPorts - usedPorts,
        utilizationPercent: totalPorts > 0 ? Math.round((usedPorts / totalPorts) * 100) : 0,
        subscriberCount,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("OLT get error:", error);
    return NextResponse.json(
      { error: "Failed to fetch OLT" },
      { status: 500 }
    );
  }
}

// PUT /api/ftth/olts/[id] - Update OLT
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();
    const {
      name, vendor, model, serialNumber, firmwareVersion,
      ipAddress, port, apiPort, username, password,
      location, areaId, status,
      monitorProtocol, snmpCommunity, snmpVersion, snmpPort,
      snmpv3User, snmpv3AuthProto, snmpv3PrivProto,
      autoBackup, backupSchedule,
    } = body;

    const errors: string[] = [];
    if (name !== undefined && !name?.trim()) errors.push("OLT name is required");
    if (ipAddress !== undefined) {
      if (!ipAddress?.trim()) errors.push("IP address is required");
      else if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipAddress.trim()))
        errors.push("Invalid IP address format");
    }
    if (port !== undefined && (port < 1 || port > 65535))
      errors.push("Port must be between 1 and 65535");

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const existing = await db.networkDevice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "OLT not found" }, { status: 404 });
    }

    const isRebootAction = status === "MAINTENANCE";

    const olt = await db.networkDevice.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(vendor !== undefined && { vendor }),
        ...(model !== undefined && { model: model.trim() || "" }),
        ...(serialNumber !== undefined && { serialNumber: serialNumber.trim() || "" }),
        ...(firmwareVersion !== undefined && { firmwareVersion: firmwareVersion.trim() || "" }),
        ...(ipAddress !== undefined && { ipAddress: ipAddress.trim() }),
        ...(port !== undefined && { port }),
        ...(apiPort !== undefined && { apiPort }),
        ...(username !== undefined && { username: username.trim() || "admin" }),
        ...(password !== undefined && { password: password || "" }),
        ...(location !== undefined && { location: location.trim() || "" }),
        ...(areaId !== undefined && { areaId: areaId || null }),
        ...(status !== undefined && { status }),
        ...(monitorProtocol !== undefined && { monitorProtocol }),
        ...(snmpCommunity !== undefined && { snmpCommunity }),
        ...(snmpVersion !== undefined && { snmpVersion }),
        ...(snmpPort !== undefined && { snmpPort }),
        ...(snmpv3User !== undefined && { snmpv3User: snmpv3User.trim() || "" }),
        ...(snmpv3AuthProto !== undefined && { snmpv3AuthProto }),
        ...(snmpv3PrivProto !== undefined && { snmpv3PrivProto }),
        ...(autoBackup !== undefined && { autoBackup }),
        ...(backupSchedule !== undefined && { backupSchedule }),
      },
    });

    if (isRebootAction) {
      return NextResponse.json({
        olt,
        reboot: {
          statusUpdated: true,
          message: "OLT reboot initiated — status set to MAINTENANCE.",
        },
      });
    }

    return NextResponse.json({ olt });
  } catch (error: unknown) {
    console.error("OLT update error:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A device with this IP address already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update OLT" },
      { status: 500 }
    );
  }
}

// DELETE /api/ftth/olts/[id] - Delete an OLT (cascades to ports)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_request);
    const { id } = await params;

    // Get port count via raw query (Turbopack safe)
    const portRaw: { count: number }[] = await db.$queryRawUnsafe(`
      SELECT CAST(COUNT(*) AS int) as count FROM "OltPort" WHERE "oltDeviceId" = $1
    `, id);
    const portCount = Number(portRaw[0]?.count || 0);

    const existing = await db.networkDevice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "OLT not found" }, { status: 404 });
    }
    await db.networkDevice.delete({ where: { id } });
    return NextResponse.json({ success: true, message: `OLT deleted with ${portCount} ports` });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("OLT delete error:", error);
    return NextResponse.json({ error: "Failed to delete OLT" }, { status: 500 });
  }
}
