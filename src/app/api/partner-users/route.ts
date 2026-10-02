import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";
import { hash } from "bcryptjs";

// GET /api/partner-users — list partner users (filter by ?partnerId=, ?role=)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get("partnerId") || "";
    const role = searchParams.get("role") || "";

    const where: Record<string, unknown> = {};
    if (partnerId) where.partnerId = partnerId;
    if (role) where.role = role;

    const users = await db.partnerUser.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        Partner: { select: { id: true, name: true, code: true } },
        _count: { select: { PartnerRolePermission: true } },
      },
    });

    const data = users.map((u) => ({
      id: u.id,
      partnerId: u.partnerId,
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      status: u.status,
      lastLoginAt: u.lastLoginAt?.toISOString() || null,
      loginAttempts: u.loginAttempts,
      lockedUntil: u.lockedUntil?.toISOString() || null,
      partner: u.Partner,
      permissionCount: u._count?.PartnerRolePermission ?? 0,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));

    return NextResponse.json({ partnerUsers: data, total: data.length });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_users_list_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to fetch partner users" }, { status: 500 });
  }
}

// POST /api/partner-users — create partner user (email, password (bcrypt), name, phone, role, partnerId)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const { email, password, name, phone, role, partnerId, status } = body;

    if (!email?.trim() || !password || !name?.trim() || !partnerId) {
      return NextResponse.json(
        { error: "email, password, name, partnerId are required" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const partner = await db.partner.findUnique({ where: { id: partnerId } });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    const existing = await db.partnerUser.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return NextResponse.json(
        { error: "Partner user with this email already exists" },
        { status: 409 },
      );
    }

    const passwordHash = await hash(password, 12);

    const user = await db.partnerUser.create({
      data: {
        partnerId,
        email: email.trim().toLowerCase(),
        password: passwordHash,
        name: name.trim(),
        phone: phone?.trim() || "",
        role: role || "READONLY_USER",
        status: status || "ACTIVE",
      },
    });

    await auditCreate(
      request,
      "PartnerUser",
      user.id,
      { email: user.email, name: user.name, role: user.role, partnerId },
      { userId },
    );

    return NextResponse.json(
      {
        partnerUser: {
          id: user.id,
          partnerId: user.partnerId,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_user_create_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to create partner user" }, { status: 500 });
  }
}
