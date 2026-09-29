import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/devices - List network devices with pagination, filtering, sorting
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const search = searchParams.get("search") || "";
    const areaId = searchParams.get("areaId") || "";
    const type = searchParams.get("type") || "";
    const statusFilter = searchParams.get("status") || "";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const tag = searchParams.get("tag") || "";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { ipAddress: { contains: search } },
        { model: { contains: search } },
        { location: { contains: search } },
      ];
    }
    if (areaId) where.areaId = areaId;
    if (type) where.type = type;
    if (statusFilter) where.status = statusFilter;
    if (tag) {
      where.tags = { contains: tag };
    }

    // Sorting
    const orderBy: Record<string, string> = {};
    const allowedSortFields = ["name", "type", "vendor", "ipAddress", "status", "cpuUsage", "memoryUsage", "createdAt", "updatedAt", "lastSeenAt"];
    if (allowedSortFields.includes(sortBy)) {
      orderBy[sortBy] = sortOrder === "asc" ? "asc" : "desc";
    } else {
      orderBy.createdAt = "desc";
    }

    const [devices, total] = await Promise.all([
      (await db.networkDevice.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          Area: { select: { name: true, id: true } },
          interfaces: { select: { id: true, name: true, status: true } },
          parent: { select: { id: true, name: true, ipAddress: true } },
          _count: { select: { oltPorts: true, assignedSubscribers: true, children: true } },
        },
      })).map(({ password, snmpv3AuthKey, snmpv3PrivKey, ...safeDevice }) => safeDevice),
      db.networkDevice.count({ where }),
    ]);

    // Get status counts across all devices (not just current filter)
    const allStatusCounts = await db.networkDevice.groupBy({
      by: ["status"],
      _count: { status: true },
    });
    const statusCounts: Record<string, number> = {};
    for (const sc of allStatusCounts) {
      statusCounts[sc.status] = sc._count.status;
    }

    return NextResponse.json({
      items: devices,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      statusCounts,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Devices list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 }
    );
  }
}

// POST /api/devices - Create a new device
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const {
      name,
      type,
      vendor,
      model,
      ipAddress,
      port,
      apiPort,
      username,
      password,
      monitorProtocol,
      snmpCommunity,
      snmpVersion,
      snmpPort,
      snmpv3User,
      snmpv3AuthProto,
      snmpv3PrivProto,
      snmpv3AuthKey,
      snmpv3PrivKey,
      location,
      areaId,
      tags,
      parentId,
      autoBackup,
      backupSchedule,
    } = body;

    // Validation
    const errors: string[] = [];
    if (!name?.trim()) errors.push("Device name is required");
    if (!type) errors.push("Device type is required");
    if (!vendor) errors.push("Vendor is required");
    if (!ipAddress?.trim()) errors.push("IP address is required");
    else if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipAddress.trim()))
      errors.push("Invalid IP address format");
    if (port !== undefined && (port < 1 || port > 65535))
      errors.push("Port must be between 1 and 65535");
    if (apiPort !== undefined && (apiPort < 1 || apiPort > 65535))
      errors.push("API port must be between 1 and 65535");
    if (snmpPort !== undefined && (snmpPort < 1 || snmpPort > 65535))
      errors.push("SNMP port must be between 1 and 65535");

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const device = await db.networkDevice.create({
      data: {
        name: name.trim(),
        type,
        vendor,
        model: model?.trim() || "",
        ipAddress: ipAddress.trim(),
        port: port || 22,
        apiPort: apiPort || 8728,
        username: username?.trim() || "admin",
        password: password || "",
        monitorProtocol: monitorProtocol || "SNMP",
        snmpCommunity: snmpCommunity || "public",
        snmpVersion: snmpVersion || "2c",
        snmpPort: snmpPort || 161,
        snmpv3User: snmpv3User || "",
        snmpv3AuthProto: snmpv3AuthProto || "MD5",
        snmpv3PrivProto: snmpv3PrivProto || "DES",
        snmpv3AuthKey: snmpv3AuthKey || "",
        snmpv3PrivKey: snmpv3PrivKey || "",
        location: location?.trim() || "",
        areaId: areaId || null,
        status: "UNKNOWN",
        tags: tags || "[]",
        parentId: parentId || null,
        autoBackup: autoBackup || false,
        backupSchedule: backupSchedule || "daily",
      },
    });

    await auditCreate(request, "NetworkDevice", device.id, { name, type, ipAddress }, { userId });
    return NextResponse.json({ device }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Device create error:", error);
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
      { error: "Failed to create device" },
      { status: 500 }
    );
  }
}
