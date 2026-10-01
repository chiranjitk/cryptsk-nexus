import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

// GET /api/partner-permissions — list all partner permissions grouped by category
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const permissions = await db.partnerPermission.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    const grouped: Record<string, typeof permissions> = {};
    for (const p of permissions) {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    }

    return NextResponse.json({
      permissions,
      grouped,
      total: permissions.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_permissions_list_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch partner permissions" }, { status: 500 });
  }
}

// POST /api/partner-permissions — create a new permission (key, description, category)
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { key, description, category } = body;

    if (!key?.trim()) {
      return NextResponse.json({ error: "Permission key is required" }, { status: 400 });
    }

    const existing = await db.partnerPermission.findUnique({ where: { key: key.trim() } });
    if (existing) {
      return NextResponse.json(
        { error: "Permission with this key already exists" },
        { status: 409 },
      );
    }

    const permission = await db.partnerPermission.create({
      data: {
        key: key.trim(),
        description: description?.trim() || "",
        category: category?.trim() || "general",
      },
    });

    await auditCreate(
      request,
      "PartnerPermission",
      permission.id,
      { key: permission.key, description: permission.description, category: permission.category },
      { userId },
    );

    return NextResponse.json({ permission }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_permission_create_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to create partner permission" }, { status: 500 });
  }
}
