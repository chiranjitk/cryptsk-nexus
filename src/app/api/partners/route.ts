import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

// GET /api/partners — list partners (filter by ?distributionHubId=, ?status=, search)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const distributionHubId = searchParams.get("distributionHubId") || "";
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};
    if (distributionHubId) where.distributionHubId = distributionHubId;
    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { contactName: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    const partners = await db.partner.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        DistributionHub: { select: { id: true, name: true, code: true } },
        _count: { select: { Subscriber: true, PartnerUser: true, PartnerIpPool: true } },
      },
    });

    const data = partners.map((p) => ({
      id: p.id,
      distributionHubId: p.distributionHubId,
      name: p.name,
      code: p.code,
      description: p.description,
      status: p.status,
      contactName: p.contactName,
      contactPhone: p.contactPhone,
      contactEmail: p.contactEmail,
      address: p.address,
      logoUrl: p.logoUrl,
      primaryColor: p.primaryColor,
      customDomain: p.customDomain,
      distributionHub: p.DistributionHub,
      subscriberCount: p._count?.Subscriber ?? 0,
      partnerUserCount: p._count?.PartnerUser ?? 0,
      ipPoolCount: p._count?.PartnerIpPool ?? 0,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return NextResponse.json({ partners: data, total: data.length });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partners_list_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch partners" }, { status: 500 });
  }
}

// POST /api/partners — create partner under a distribution hub
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const {
      distributionHubId,
      name,
      code,
      description,
      contactName,
      contactPhone,
      contactEmail,
      address,
      logoUrl,
      primaryColor,
      customDomain,
      status,
    } = body;

    if (!distributionHubId || !name?.trim() || !code?.trim()) {
      return NextResponse.json(
        { error: "distributionHubId, name and code are required" },
        { status: 400 },
      );
    }

    const hub = await db.distributionHub.findUnique({ where: { id: distributionHubId } });
    if (!hub) {
      return NextResponse.json({ error: "Distribution hub not found" }, { status: 404 });
    }

    const existing = await db.partner.findFirst({
      where: {
        OR: [{ name: name.trim() }, { code: code.trim().toUpperCase() }],
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Partner with this name or code already exists" },
        { status: 409 },
      );
    }

    const partner = await db.partner.create({
      data: {
        distributionHubId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description?.trim() || "",
        contactName: contactName?.trim() || "",
        contactPhone: contactPhone?.trim() || "",
        contactEmail: contactEmail?.trim() || "",
        address: address?.trim() || "",
        logoUrl: logoUrl?.trim() || "",
        primaryColor: primaryColor?.trim() || "",
        customDomain: customDomain?.trim() || "",
        status: status || "ACTIVE",
      },
    });

    await auditCreate(
      request,
      "Partner",
      partner.id,
      { name: partner.name, code: partner.code, distributionHubId, status: partner.status },
      { userId },
    );

    return NextResponse.json({ partner }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_create_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to create partner" }, { status: 500 });
  }
}
