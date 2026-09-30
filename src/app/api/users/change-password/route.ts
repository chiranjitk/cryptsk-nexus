import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth, extractSessionToken, AuthError } from "@/lib/api-auth";
import { hashToken, revokeAllUserSessions } from "@/lib/session-store";
import { auditCreate } from "@/lib/services/audit-service";
import { rateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    // Rate limiting
    const { success: rateLimitOk, retryAfterMs } = rateLimit(`password-change:${userId}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: 'Too many password change attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json(
        { error: "Current password is required" },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json(
        { error: "New password is required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    if (newPassword.length > 128) {
      return NextResponse.json(
        { error: "New password must not exceed 128 characters" },
        { status: 400 }
      );
    }

    // Fetch user with password
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, password: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify current password
    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    // Check new password is not same as old
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      return NextResponse.json(
        { error: "New password must be different from current password" },
        { status: 400 }
      );
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // [AUDIT-FIX F-19] Revoke every OTHER session of this user — a password
    // change must kill stolen tokens on other devices immediately. The current
    // session is kept alive so the user is not logged out mid-flow.
    const currentToken = extractSessionToken(request);
    const revokedCount = await revokeAllUserSessions(
      userId,
      currentToken ? hashToken(currentToken) : undefined
    );

    // Audit log
    await auditCreate(
      request,
      "User",
      userId,
      {
        action: "change_password",
        userName: user.name,
        userEmail: user.email,
      },
      { userId }
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
      sessionsRevoked: revokedCount,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}
