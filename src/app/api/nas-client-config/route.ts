import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";

// GET /api/nas-client-config — List all configs or get by device
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "list") {
      return handleList();
    }

    if (action === "get") {
      const deviceId = searchParams.get("deviceId");
      if (!deviceId) {
        return NextResponse.json({ error: "deviceId query parameter is required" }, { status: 400 });
      }
      return handleGetByDevice(deviceId);
    }

    return NextResponse.json(
      { error: "Invalid action. Use ?action=list or ?action=get&deviceId=xxx" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("[NAS Client Config] GET error:", error);
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: "Internal server error" }, { status });
  }
}

// POST /api/nas-client-config — Upsert or delete
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const body = await req.json();

    switch (action) {
      case "upsert":
        return handleUpsert(body);
      case "delete":
        return handleDelete(body);
      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}. Use ?action=upsert or ?action=delete` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    console.error("[NAS Client Config] POST error:", error);
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: "Internal server error" }, { status });
  }
}

// ─── Handlers ──────────────────────────────────────────────

async function handleList() {
  const configs = await db.nasClientConfig.findMany({
    include: {
      device: {
        select: {
          id: true,
          name: true,
          type: true,
          Vendor: true,
          ipAddress: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ configs });
}

async function handleGetByDevice(deviceId: string) {
  // Verify the device exists
  const device = await db.networkDevice.findUnique({
    where: { id: deviceId },
    select: { id: true, name: true },
  });
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const config = await db.nasClientConfig.findUnique({
    where: { deviceId },
    include: {
      device: {
        select: {
          id: true,
          name: true,
          type: true,
          Vendor: true,
          ipAddress: true,
          status: true,
        },
      },
    },
  });

  if (!config) {
    return NextResponse.json({ config: null, message: "No NAS client config found for this device" });
  }

  return NextResponse.json({ config });
}

async function handleUpsert(body: Record<string, unknown>) {
  const {
    deviceId,
    nasIdentifier,
    secretKey,
    nasType,
    vendorId,
    idleTimeout,
    acctInterimInterval,
    coaSupport,
    dmTimeout,
    leaseIp,
    fapDomain,
    datatransferDomain,
    bwSupport,
  } = body;

  if (!deviceId || typeof deviceId !== "string") {
    return NextResponse.json({ error: "Device ID is required" }, { status: 400 });
  }

  // Verify the device exists
  const device = await db.networkDevice.findUnique({ where: { id: deviceId } });
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const data = {
    nasIdentifier: typeof nasIdentifier === "string" ? nasIdentifier : "",
    secretKey: typeof secretKey === "string" ? secretKey : "",
    nasType: typeof nasType === "string" ? nasType : "",
    vendorId: typeof vendorId === "number" ? vendorId : 21067,
    idleTimeout: typeof idleTimeout === "number" ? idleTimeout : 0,
    acctInterimInterval: typeof acctInterimInterval === "number" ? acctInterimInterval : 60,
    coaSupport: typeof coaSupport === "boolean" ? coaSupport : true,
    dmTimeout: typeof dmTimeout === "number" ? dmTimeout : 3,
    leaseIp: typeof leaseIp === "boolean" ? leaseIp : false,
    fapDomain: typeof fapDomain === "string" ? fapDomain : "",
    datatransferDomain: typeof datatransferDomain === "string" ? datatransferDomain : "",
    bwSupport: typeof bwSupport === "boolean" ? bwSupport : true,
  };

  // Upsert: create if not exists, update if exists
  const config = await db.nasClientConfig.upsert({
    where: { deviceId },
    update: data,
    create: { deviceId, ...data },
    include: {
      device: {
        select: {
          id: true,
          name: true,
          type: true,
          Vendor: true,
          ipAddress: true,
          status: true,
        },
      },
    },
  });

  return NextResponse.json({ config });
}

async function handleDelete(body: Record<string, unknown>) {
  const { id } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Config ID is required" }, { status: 400 });
  }

  const existing = await db.nasClientConfig.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "NAS client config not found" }, { status: 404 });
  }

  await db.nasClientConfig.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
