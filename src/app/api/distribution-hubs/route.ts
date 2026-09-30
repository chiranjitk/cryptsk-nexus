import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

// GET /api/distribution-hubs — list all hubs with partner count
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const hubs = await db.distributionHub.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { Partner: true } } },
    });

    const data = hubs.map((h) => ({
      id: h.id,
      name: h.name,
      code: h.code,
      description: h.description,
      status: h.status,
      partnerCount: h._count?.Partner ?? 0,
      createdAt: h.createdAt.toISOString(),
      updatedAt: h.updatedAt.toISOString(),
    }));

    return NextResponse.json({ hubs: data, total: data.length });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("distribution_hubs_list_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch distribution hubs" }, { status: 500 });
  }
}

// POST /api/distribution-hubs — create a new distribution hub
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { name, code, description } = body;

    if (!name?.trim() || !code?.trim()) {
      return NextResponse.json(
        { error: "Name and code are required" },
        { status: 400 },
      );
    }

    // Uniqueness check
    const exists = await db.distributionHub.findFirst({
      where: {
        OR: [{ name: name.trim() }, { code: code.trim().toUpperCase() }],
      },
    });
    if (exists) {
      return NextResponse.json(
        { error: "Distribution hub with this name or code already exists" },
        { status: 409 },
      );
    }

    const hub = await db.distributionHub.create({
      data: {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description?.trim() || "",
        status: body.status || "ACTIVE",
      },
    });

    await auditCreate(
      request,
      "DistributionHub",
      hub.id,
      { name: hub.name, code: hub.code, status: hub.status },
      { userId },
    );

    return NextResponse.json({ hub }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("distribution_hub_create_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to create distribution hub" }, { status: 500 });
  }
}
