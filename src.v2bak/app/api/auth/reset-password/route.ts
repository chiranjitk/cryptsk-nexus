import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { auditCreate } from "@/lib/audit";
import { hashResetToken } from "@/lib/password-reset";

// ============================================================
// CRYPTSK Nexus — /api/auth/reset-password (PUBLIC, T10-a)
// Consumes a one-time reset token (the RAW token arrives in the
// body — the DB only ever holds its SHA-256 hash) and sets the
// new password (bcrypt cost 10).
//   staff  → passwordHash + loginAttempts 0 + lockedUntil null
//            + forcePasswordChange false
//   portal → passwordHash + loginAttempts 0 + lockedUntil null
// On success the token is consumed (usedAt) and every other
// unused token for the same actor is invalidated — a reset always
// kills all outstanding links for that account.
// Audit: staff actor → userId set; portal actor → userId null
// (audit_events.user_id is a FK to staff users). Hashes and token
// material are NEVER written to audit.
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!token || !password) {
      return NextResponse.json({ error: "Reset token and new password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
    });

    // Single message for unknown / already-used / expired — no oracle
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (record.actorType === "staff") {
      const account = record.userId
        ? await db.user.findUnique({ where: { id: record.userId }, select: { id: true, email: true } })
        : null;
      if (!account) {
        return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
      }

      await db.$transaction([
        db.user.update({
          where: { id: account.id },
          data: { passwordHash, loginAttempts: 0, lockedUntil: null, forcePasswordChange: false },
        }),
        // Consume this token AND invalidate every other unused token for the same actor
        db.passwordResetToken.updateMany({
          where: { actorType: "staff", userId: account.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
      ]);

      await auditCreate({
        userId: account.id,
        action: "update",
        resource: "password_reset",
        resourceId: record.id,
        resourceName: account.email,
        after: { passwordChanged: true },
        ipAddress: req.headers.get("x-forwarded-for") || "server",
      });
    } else {
      const account = record.portalUserId
        ? await db.portalUser.findUnique({ where: { id: record.portalUserId }, select: { id: true, email: true } })
        : null;
      if (!account) {
        return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
      }

      await db.$transaction([
        db.portalUser.update({
          where: { id: account.id },
          data: { passwordHash, loginAttempts: 0, lockedUntil: null },
        }),
        db.passwordResetToken.updateMany({
          where: { actorType: "portal", portalUserId: account.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
      ]);

      await auditCreate({
        userId: null, // portal actor — audit_events.user_id is a FK to staff users
        action: "update",
        resource: "password_reset",
        resourceId: record.id,
        resourceName: account.email,
        after: { passwordChanged: true },
        ipAddress: req.headers.get("x-forwarded-for") || "server",
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Password has been reset. You can now sign in with your new password.",
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/auth/reset-password] POST failed:", err);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
