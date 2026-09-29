import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requirePermission, requireAuth, AuthError } from "@/lib/api-auth";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/session";
import { auditCreate } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUserId = await requirePermission(request, "users.update");
    const { id: targetUserId } = await params;

    // Cannot impersonate yourself
    if (adminUserId === targetUserId) {
      return NextResponse.json(
        { error: "You cannot impersonate yourself" },
        { status: 400 }
      );
    }

    // Fetch admin user info
    const admin = await db.user.findUnique({
      where: { id: adminUserId },
      select: { role: true, name: true },
    });
    if (!admin) {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }

    // Only SUPER_ADMIN can impersonate
    if (admin.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only Super Admin can impersonate users" },
        { status: 403 }
      );
    }

    // Fetch target user
    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Cannot impersonate an inactive user" },
        { status: 400 }
      );
    }

    // Create session token for the target user
    const sessionToken = await createSessionToken(targetUser.id);

    // Audit log
    await auditCreate(
      request,
      "User",
      targetUser.id,
      {
        action: "impersonate",
        targetName: targetUser.name,
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        adminName: admin.name,
      },
      { userId: adminUserId }
    ).catch(() => {});

    // Return the session token in the response body (frontend will set cookie)
    // Also set the cookie directly
    const response = NextResponse.json({
      success: true,
      message: `Impersonating ${targetUser.name}`,
      token: sessionToken,
      User: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
      },
    });

    // Set the impersonation cookie
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    // Also store impersonation metadata so we can show the banner
    response.cookies.set("impersonating_from", adminUserId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    response.cookies.set("impersonating_name", admin.name, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Impersonate error:", error);
    return NextResponse.json(
      { error: "Failed to impersonate user" },
      { status: 500 }
    );
  }
}
