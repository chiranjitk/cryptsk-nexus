import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity, auditDelete } from "@/lib/audit";

// GET /api/users — list all users (with roles)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("user", "list");

    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        status: true,
        lastLoginAt: true,
        lastLoginIp: true,
        loginAttempts: true,
        lockedUntil: true,
        forcePasswordChange: true,
        mfaEnabled: true,
        createdAt: true,
        roles: {
          include: {
            role: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

// POST /api/users — create new user
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("user", "create");

    const body = await req.json();
    const { email, username, name, password, roleIds, status } = body;

    if (!email || !username || !password) {
      return NextResponse.json({ error: "email, username, password required" }, { status: 400 });
    }

    // Check duplicates
    const existing = await db.user.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { username }] },
    });
    if (existing) {
      return NextResponse.json({ error: "User with this email or username already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await db.user.create({
      data: {
        email: email.toLowerCase(),
        username,
        name: name || username,
        passwordHash,
        status: status || "active",
        roles: roleIds?.length
          ? { create: roleIds.map((roleId: string) => ({ roleId, assignedBy: user.id })) }
          : undefined,
      },
      include: {
        roles: { include: { role: { select: { id: true, name: true, slug: true } } } },
      },
    });

    await auditCreateEntity({
      userId: user.id,
      action: "create",
      resource: "user",
      resourceId: newUser.id,
      resourceName: newUser.email,
      after: { email: newUser.email, username: newUser.username, name: newUser.name, status: newUser.status },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
