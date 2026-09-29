import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import type { ConnectionType } from "@prisma/client";

// GET /api/batch-provisioning/templates — List all provisioning templates
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const templates = await db.provisioningTemplate.findMany({
      where: { isActive: true },
      include: {
        Plan: {
          select: { id: true, name: true },
        },
        _count: {
          select: { jobs: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Map to the format the page component expects
    const mapped = templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      planId: t.planId || "",
      planName: t.Plan?.name || "No Plan",
      area: "",
      connectionType: mapConnectionType(t.connectionType),
      macBinding: t.bindToMac,
      ipv4Type: "DYNAMIC" as const,
      ipv6Enabled: false,
      radiusEnabled: true,
      autoAssignIp: t.autoAssignIp,
      createdAt: t.createdAt.toISOString(),
      usageCount: t._count.jobs,
    }));

    return NextResponse.json({ templates: mapped });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Batch provisioning templates GET error:", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

// POST /api/batch-provisioning/templates — Create a new template
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { name, description, planId, area, connectionType, macBinding, ipv4Type, ipv6Enabled, radiusEnabled, autoAssignIp } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }
    if (!planId) {
      return NextResponse.json({ error: "Plan is required" }, { status: 400 });
    }

    const template = await db.provisioningTemplate.create({
      data: {
        name: name.trim(),
        description: description || "",
        planId,
        connectionType: mapToConnectionType(connectionType),
        bindToMac: macBinding || false,
        autoAssignIp: autoAssignIp !== false,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Batch provisioning templates POST error:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}

// Helper: Map page's connection type to Prisma ConnectionType
function mapToConnectionType(ct: string): ConnectionType {
  switch (ct) {
    case "PPPoE": return "FTTH";
    case "DHCP": return "FTTH";
    case "STATIC": return "FTTH";
    case "HOTSPOT": return "WIRELESS";
    default: return "FTTH";
  }
}

// Helper: Map Prisma ConnectionType to page's connection type
function mapConnectionType(ct: ConnectionType): string {
  switch (ct) {
    case "FTTH": return "PPPoE";
    case "WIRELESS": return "HOTSPOT";
    default: return "PPPoE";
  }
}
