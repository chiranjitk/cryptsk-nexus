import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

// GET /api/bandwidth/qos - List all QoS configs
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const configs = await db.qosConfig.findMany({
      include: { targetPlan: { select: { id: true, name: true } } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ configs });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("QoS config GET error:", error);
    return NextResponse.json({ error: "Failed to fetch QoS configs" }, { status: 500 });
  }
}

// POST /api/bandwidth/qos - Create or update QoS config
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const { id, name, priority, targetPlanId, targetIpRange, maxBandwidthMbps, minBandwidthMbps, enabled } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!priority || !["HIGH", "MEDIUM", "LOW", "BULK"].includes(priority)) {
      return NextResponse.json({ error: "Priority must be HIGH, MEDIUM, LOW, or BULK" }, { status: 400 });
    }

    let config;
    if (id) {
      config = await db.qosConfig.update({
        where: { id },
        data: {
          name: name.trim(),
          priority,
          targetPlanId: targetPlanId || null,
          targetIpRange: targetIpRange || "",
          maxBandwidthMbps: Number(maxBandwidthMbps) || 0,
          minBandwidthMbps: Number(minBandwidthMbps) || 0,
          enabled: enabled !== false,
        },
        include: { targetPlan: { select: { id: true, name: true } } },
      });
    } else {
      config = await db.qosConfig.create({
        data: {
          name: name.trim(),
          priority,
          targetPlanId: targetPlanId || null,
          targetIpRange: targetIpRange || "",
          maxBandwidthMbps: Number(maxBandwidthMbps) || 0,
          minBandwidthMbps: Number(minBandwidthMbps) || 0,
          enabled: enabled !== false,
        },
        include: { targetPlan: { select: { id: true, name: true } } },
      });
    }

    await db.auditLog.create({
      data: {
        userId,
        action: "qos_config",
        entity: "QosConfig",
        entityId: config.id,
        details: JSON.stringify({ name, priority }),
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("QoS config POST error:", error);
    return NextResponse.json({ error: "Failed to save QoS config" }, { status: 500 });
  }
}

// DELETE /api/bandwidth/qos - Delete QoS config
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Config ID required" }, { status: 400 });
    }
    await db.qosConfig.delete({ where: { id } });
    await db.auditLog.create({
      data: { userId, action: "qos_delete", entity: "QosConfig", entityId: id, details: "{}" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("QoS config DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete QoS config" }, { status: 500 });
  }
}
