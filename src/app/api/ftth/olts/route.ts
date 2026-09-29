import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/ftth/olts - List all OLT devices with port utilization
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const olts = await db.networkDevice.findMany({
      where: { type: "OLT" },
      orderBy: { createdAt: "desc" },
      include: {
        Area: { select: { name: true } },
        oltPorts: {
          orderBy: { portNumber: "asc" },
        },
      },
    });

    // Use raw query for counts (Turbopack strips _count)
    const countsRaw: { id: string; portCount: number; subCount: number }[] = await db.$queryRawUnsafe(`
      SELECT nd."id",
             CAST(COUNT(op."id") AS int) as portCount,
             CAST((SELECT COUNT(*) FROM "Subscriber" s WHERE s."assignedDeviceId" = nd."id") AS int) as subCount
      FROM "NetworkDevice" nd
      LEFT JOIN "OltPort" op ON op."oltDeviceId" = nd."id"
      WHERE nd."type" = 'OLT'
      GROUP BY nd."id"
    `);
    const countsMap = new Map(countsRaw.map(c => [c.id, { portCount: Number(c.portCount), subCount: Number(c.subCount) }]));

    // Calculate port utilization per OLT
    const oltData = olts.map((olt) => {
      const totalPorts = olt.oltPorts.length;
      const usedPorts = olt.oltPorts.filter((p) => p.status === "active").length;
      const freePorts = totalPorts - usedPorts;
      const utilizationPercent =
        totalPorts > 0 ? Math.round((usedPorts / totalPorts) * 100) : 0;
      const counts = countsMap.get(olt.id) || { portCount: 0, subCount: 0 };

      return {
        id: olt.id,
        name: olt.name,
        type: olt.type,
        vendor: olt.vendor,
        model: olt.model,
        serialNumber: olt.serialNumber,
        firmwareVersion: olt.firmwareVersion,
        ipAddress: olt.ipAddress,
        status: olt.status,
        location: olt.location,
        areaName: olt.Area?.name || "",
        areaId: olt.areaId || null,
        // Management access
        port: olt.port,
        apiPort: olt.apiPort,
        username: olt.username,
        monitorProtocol: olt.monitorProtocol,
        // SNMP fields
        snmpCommunity: olt.snmpCommunity,
        snmpVersion: olt.snmpVersion,
        snmpPort: olt.snmpPort,
        snmpv3User: olt.snmpv3User,
        snmpv3AuthProto: olt.snmpv3AuthProto,
        snmpv3PrivProto: olt.snmpv3PrivProto,
        // System metrics
        cpuUsage: olt.cpuUsage,
        memoryUsage: olt.memoryUsage,
        temperature: olt.temperature,
        uptimeSeconds: olt.uptimeSeconds,
        lastSeenAt: olt.lastSeenAt,
        // Backup
        autoBackup: olt.autoBackup,
        backupSchedule: olt.backupSchedule,
        configLastBackup: olt.configLastBackup,
        // Computed
        totalPorts,
        usedPorts,
        freePorts,
        utilizationPercent,
        ports: olt.oltPorts,
        subscriberCount: counts.subCount,
        managementIpv6: olt.managementIpv6,
        ipv6Enabled: olt.ipv6Enabled,
        ipv6Gateway: olt.ipv6Gateway,
      };
    });

    // Summary stats
    const totalOlts = oltData.length;
    const onlineOlts = oltData.filter((o) => o.status === "ONLINE").length;
    const totalPorts = oltData.reduce((s, o) => s + o.totalPorts, 0);
    const usedPorts = oltData.reduce((s, o) => s + o.usedPorts, 0);
    const totalSubscribers = oltData.reduce((s, o) => s + o.subscriberCount, 0);

    return NextResponse.json({
      olts: oltData,
      summary: {
        totalOlts,
        onlineOlts,
        totalPorts,
        usedPorts,
        freePorts: totalPorts - usedPorts,
        totalSubscribers,
        overallUtilization:
          totalPorts > 0 ? Math.round((usedPorts / totalPorts) * 100) : 0,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("FTTH OLTs list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch OLT data" },
      { status: 500 }
    );
  }
}

// POST /api/ftth/olts - Create a new OLT device
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const {
      name, vendor, model, serialNumber, firmwareVersion,
      ipAddress, port, apiPort, username, password,
      location, areaId,
      monitorProtocol, snmpCommunity, snmpVersion, snmpPort,
      snmpv3User, snmpv3AuthProto, snmpv3PrivProto,
      autoBackup, backupSchedule,
      managementIpv6, ipv6Enabled, ipv6Gateway,
    } = body;

    // Validation
    const errors: string[] = [];
    if (!name?.trim()) errors.push("OLT name is required");
    if (!ipAddress?.trim()) errors.push("IP address is required");
    else {
      const trimmedIp = ipAddress.trim();
      if (trimmedIp.includes(":")) {
        // IPv6 validation (simplified: must contain : and be non-empty)
        if (!/^[0-9a-fA-F:]+$/.test(trimmedIp)) errors.push("Invalid IPv6 address format");
      } else {
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmedIp)) errors.push("Invalid IPv4 address format");
      }
    }
    if (port !== undefined && (port < 1 || port > 65535))
      errors.push("Port must be between 1 and 65535");

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const olt = await db.networkDevice.create({
      data: {
        name: name.trim(),
        type: "OLT",
        vendor: vendor || "OTHER",
        model: model?.trim() || "",
        serialNumber: serialNumber?.trim() || "",
        firmwareVersion: firmwareVersion?.trim() || "",
        ipAddress: ipAddress.trim(),
        port: port || 23,
        apiPort: apiPort || 8080,
        username: username?.trim() || "admin",
        password: password || "",
        location: location?.trim() || "",
        areaId: areaId || null,
        status: "UNKNOWN",
        monitorProtocol: monitorProtocol || "SNMP",
        snmpCommunity: snmpCommunity || "public",
        snmpVersion: snmpVersion || "2c",
        snmpPort: snmpPort || 161,
        snmpv3User: snmpv3User?.trim() || "",
        snmpv3AuthProto: snmpv3AuthProto || "MD5",
        snmpv3PrivProto: snmpv3PrivProto || "DES",
        autoBackup: autoBackup || false,
        backupSchedule: backupSchedule || "daily",
        managementIpv6: managementIpv6?.trim() || "",
        ipv6Enabled: ipv6Enabled || false,
        ipv6Gateway: ipv6Gateway?.trim() || "",
      },
    });

    return NextResponse.json({ olt }, { status: 201 });
  } catch (error: unknown) {
    console.error("OLT create error:", error);
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
      { error: "Failed to create OLT" },
      { status: 500 }
    );
  }
}
