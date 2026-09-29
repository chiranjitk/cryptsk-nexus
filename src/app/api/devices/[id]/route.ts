import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/devices/[id] - Get single device
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const device = await db.networkDevice.findUnique({
      where: { id },
      include: {
        Area: { select: { name: true, id: true } },
        interfaces: { orderBy: { name: "asc" } },
        parent: { select: { id: true, name: true, ipAddress: true } },
        children: { select: { id: true, name: true, status: true } },
        oltPorts: {
          orderBy: { portNumber: "asc" },
        },
        bandwidthLogs: {
          orderBy: { timestamp: "desc" },
          take: 20,
        },
        _count: { select: { assignedSubscribers: true } },
        configHistory: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    // Check if device is currently in maintenance window
    const now = new Date();
    const inMaintenance = device.maintenanceStart && device.maintenanceEnd &&
      now >= device.maintenanceStart && now <= device.maintenanceEnd;

    return NextResponse.json({ device, inMaintenance });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Device get error:", error);
    return NextResponse.json(
      { error: "Failed to fetch device" },
      { status: 500 }
    );
  }
}

// Fields to track in config history
const TRACKED_FIELDS = [
  "name", "type", "vendor", "model", "ipAddress", "port", "apiPort",
  "username", "location", "status", "autoBackup", "parentId",
  "monitorProtocol", "snmpCommunity", "snmpVersion", "snmpPort",
];

// PUT /api/devices/[id] - Update device
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
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
      location,
      areaId,
      status,
      autoBackup,
      tags,
      maintenanceStart,
      maintenanceEnd,
      maintenanceNote,
      parentId,
      backupSchedule,
      sortOrder,
      monitorProtocol,
      snmpCommunity,
      snmpVersion,
      snmpPort,
      snmpv3User,
      snmpv3AuthProto,
      snmpv3PrivProto,
      snmpv3AuthKey,
      snmpv3PrivKey,
    } = body;

    // Validation
    const errors: string[] = [];
    if (name !== undefined && !name?.trim())
      errors.push("Device name is required");
    if (ipAddress !== undefined) {
      if (!ipAddress?.trim()) errors.push("IP address is required");
      else if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipAddress.trim()))
        errors.push("Invalid IP address format");
    }
    if (port !== undefined && (port < 1 || port > 65535))
      errors.push("Port must be between 1 and 65535");
    if (apiPort !== undefined && (apiPort < 1 || apiPort > 65535))
      errors.push("API port must be between 1 and 65535");
    if (snmpPort !== undefined && (snmpPort < 1 || snmpPort > 65535))
      errors.push("SNMP port must be between 1 and 65535");

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const existing = await db.networkDevice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    // Check if this is a reboot action
    const isRebootAction = status === "MAINTENANCE" && !maintenanceStart && existing.password && existing.username;
    const isRebootNoAccess = status === "MAINTENANCE" && !maintenanceStart && (!existing.password || !existing.username);

    const device = await db.networkDevice.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(type !== undefined && { type }),
        ...(vendor !== undefined && { vendor }),
        ...(model !== undefined && { model: model.trim() || "" }),
        ...(ipAddress !== undefined && { ipAddress: ipAddress.trim() }),
        ...(port !== undefined && { port }),
        ...(apiPort !== undefined && { apiPort }),
        ...(username !== undefined && { username: username.trim() || "admin" }),
        ...(password !== undefined && { password: password || "" }),
        ...(location !== undefined && { location: location.trim() || "" }),
        ...(areaId !== undefined && { areaId: areaId || null }),
        ...(status !== undefined && { status }),
        ...(autoBackup !== undefined && { autoBackup }),
        ...(tags !== undefined && { tags: tags || "[]" }),
        ...(maintenanceStart !== undefined && { maintenanceStart: maintenanceStart ? new Date(maintenanceStart) : null }),
        ...(maintenanceEnd !== undefined && { maintenanceEnd: maintenanceEnd ? new Date(maintenanceEnd) : null }),
        ...(maintenanceNote !== undefined && { maintenanceNote: maintenanceNote || "" }),
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(backupSchedule !== undefined && { backupSchedule: backupSchedule || "daily" }),
        ...(sortOrder !== undefined && { sortOrder: typeof sortOrder === "number" ? sortOrder : 0 }),
        ...(monitorProtocol !== undefined && { monitorProtocol }),
        ...(snmpCommunity !== undefined && { snmpCommunity: snmpCommunity || "public" }),
        ...(snmpVersion !== undefined && { snmpVersion: snmpVersion || "2c" }),
        ...(snmpPort !== undefined && { snmpPort: snmpPort || 161 }),
        ...(snmpv3User !== undefined && { snmpv3User: snmpv3User || "" }),
        ...(snmpv3AuthProto !== undefined && { snmpv3AuthProto: snmpv3AuthProto || "MD5" }),
        ...(snmpv3PrivProto !== undefined && { snmpv3PrivProto: snmpv3PrivProto || "DES" }),
        ...(snmpv3AuthKey !== undefined && { snmpv3AuthKey: snmpv3AuthKey || "" }),
        ...(snmpv3PrivKey !== undefined && { snmpv3PrivKey: snmpv3PrivKey || "" }),
      },
    });

    // Auto-log config changes to DeviceConfigHistory
    const changedFields: { field: string; oldValue: string; newValue: string }[] = [];
    for (const field of TRACKED_FIELDS) {
      if (body[field] !== undefined) {
        const oldVal = String(existing[field as keyof typeof existing] ?? "");
        const newVal = String(body[field] ?? "");
        if (oldVal !== newVal) {
          changedFields.push({ field, oldValue: oldVal, newValue: newVal });
        }
      }
    }

    // Batch create config history entries
    if (changedFields.length > 0) {
      await db.deviceConfigHistory.createMany({
        data: changedFields.map((cf) => ({
          deviceId: id,
          field: cf.field,
          oldValue: cf.oldValue,
          newValue: cf.newValue,
          changedBy: userId || "unknown",
        })),
      }).catch(() => {});
    }

    // Return reboot-specific metadata
    if (isRebootAction || isRebootNoAccess) {
      await auditUpdate(request, "NetworkDevice", id, body, existing, { userId }).catch(() => {});
      return NextResponse.json({
        device,
        reboot: {
          statusUpdated: true,
          directAccess: isRebootAction,
          message: isRebootAction
            ? "Status updated to MAINTENANCE. Device has SSH/API credentials — direct reboot may be attempted via device management integration."
            : "Status updated — no direct device access configured. Set username and password on the device to enable remote reboot.",
        },
      });
    }

    await auditUpdate(request, "NetworkDevice", id, body, existing, { userId }).catch(() => {});
    return NextResponse.json({ device });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Device update error:", error);
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
      { error: "Failed to update device" },
      { status: 500 }
    );
  }
}

// DELETE /api/devices/[id] - Delete device
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const existing = await db.networkDevice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const deletedRecord = { ...existing };
    await db.networkDevice.delete({ where: { id } });
    await auditDelete(request, "NetworkDevice", id, deletedRecord, { userId }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Device delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete device" },
      { status: 500 }
    );
  }
}
