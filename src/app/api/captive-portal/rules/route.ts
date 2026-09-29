import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal/rules — List access rules
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const portalId = searchParams.get("portalId") || "";
    const enabled = searchParams.get("enabled");

    const where: Prisma.PortalAccessRuleWhereInput = {};
    if (portalId) where.portalId = portalId;
    if (enabled !== null && enabled !== undefined && enabled !== "") {
      where.enabled = enabled === "true";
    }

    const rules = await db.portalAccessRule.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      include: {
        portal: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Rules] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
  }
}

// POST /api/captive-portal/rules — Create access rule
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { portalId, name } = body;

    if (!portalId) {
      return NextResponse.json({ error: "portalId is required" }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: "Rule name is required" }, { status: 400 });
    }

    const portal = await db.captivePortal.findUnique({ where: { id: portalId } });
    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const rule = await db.portalAccessRule.create({
      data: {
        portalId,
        name: name.trim(),
        description: body.description || "",
        enabled: body.enabled !== undefined ? body.enabled : true,
        priority: body.priority || 0,
        condition: body.condition || "{}",
        actions: body.actions || "[]",
        stopOnMatch: body.stopOnMatch || false,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Rules] POST error:", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
