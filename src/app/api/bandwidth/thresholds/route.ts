import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

// POST /api/bandwidth/thresholds - Create bandwidth alert rule
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const { name, deviceId, metric, thresholdValue, direction, notifyChannels, severity } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Rule name is required" }, { status: 400 });
    }
    if (!metric || !["download", "upload", "total"].includes(metric)) {
      return NextResponse.json({ error: "Metric must be download, upload, or total" }, { status: 400 });
    }
    if (!thresholdValue || thresholdValue <= 0) {
      return NextResponse.json({ error: "Threshold value must be positive" }, { status: 400 });
    }

    const condition = JSON.stringify({
      type: "BANDWIDTH",
      metric,
      deviceId: deviceId || null,
      direction: direction || "above",
      thresholdMbps: Number(thresholdValue),
    });

    const rule = await db.alertRule.create({
      data: {
        name: name.trim(),
        condition,
        threshold: Number(thresholdValue),
        severity: severity || "MEDIUM",
        notifyChannels: notifyChannels || '["IN_APP"]',
        enabled: true,
      },
    });

    await db.auditLog.create({
      data: {
        userId,
        action: "bandwidth_threshold_create",
        entity: "AlertRule",
        entityId: rule.id,
        details: JSON.stringify({ name, metric, thresholdValue, direction }),
      },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth threshold POST error:", error);
    return NextResponse.json({ error: "Failed to create bandwidth threshold" }, { status: 500 });
  }
}

// GET /api/bandwidth/thresholds - List bandwidth alert rules
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const rules = await db.alertRule.findMany({
      where: {
        condition: { contains: "BANDWIDTH" },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ rules });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth threshold GET error:", error);
    return NextResponse.json({ error: "Failed to fetch bandwidth thresholds" }, { status: 500 });
  }
}

// DELETE /api/bandwidth/thresholds - Delete a threshold rule
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Rule ID required" }, { status: 400 });
    }
    await db.alertRule.delete({ where: { id } });
    await db.auditLog.create({
      data: { userId, action: "bandwidth_threshold_delete", entity: "AlertRule", entityId: id, details: "{}" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth threshold DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete threshold" }, { status: 500 });
  }
}
