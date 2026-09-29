import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auditCreate } from "@/lib/services/audit-service";
import { requirePermission, requireAuth, getUserRole, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR", "AGENT", "TECHNICIAN", "VIEWER", "CUSTOMER"];

export async function GET(request: NextRequest) {

  try {
    await requireAuth(request as unknown as import("next/server").NextRequest);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }

  try {
    await requirePermission(request, "users.read");

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const filterRole = searchParams.get("role") || "all";
    const filterStatus = searchParams.get("status") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const where: Record<string, unknown> = {};
    if (filterRole !== "all") where.role = filterRole;
    if (filterStatus !== "all") where.status = filterStatus;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          avatarUrl: true,
          twoFactorEnabled: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      db.user.count({ where }),
    ]);

    // Role counts from DB
    const roleCounts = await db.user.groupBy({ by: ["role"], _count: true });
    const statusCounts = await db.user.groupBy({ by: ["status"], _count: true });

    const roleMap: Record<string, number> = {};
    for (const rc of roleCounts) roleMap[rc.role] = rc._count;
    const statusMap: Record<string, number> = {};
    for (const sc of statusCounts) statusMap[sc.status] = sc._count;

    return NextResponse.json({
      items: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      roleCounts: roleMap,
      statusCounts: statusMap,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Users fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {

  try {
    await requireAuth(request as unknown as import("next/server").NextRequest);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }

  try {
    const userId = await requirePermission(request, "users.create");
    const body = await request.json();
    const { name, email, phone, role, password } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Role validation
    const userRole = (role || "OPERATOR").toUpperCase();
    if (!VALID_ROLES.includes(userRole)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }

    // ADMIN cannot create SUPER_ADMIN (role escalation protection)
    const { role: currentUserRole } = await getUserRole(request);
    if (currentUserRole !== "SUPER_ADMIN" && userRole === "SUPER_ADMIN") {
      return NextResponse.json({ error: "Only SUPER_ADMIN can create SUPER_ADMIN accounts" }, { status: 403 });
    }

    // Email uniqueness
    const existing = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone ? String(phone).trim() : "",
        role: userRole as "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "AGENT" | "TECHNICIAN" | "VIEWER" | "CUSTOMER",
        password: hashedPassword,
        assignedAreaIds: Array.isArray(body.assignedAreaIds) ? JSON.stringify(body.assignedAreaIds) : "[]",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    auditCreate(request, "User", user.id, { name: user.name, email: user.email, role: user.role }, { userId }).catch(() => {});
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User create error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
