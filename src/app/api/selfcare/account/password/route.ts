import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { authOptions } from "@/lib/auth";
import { auditUpdate } from "@/lib/audit";
import { isRedirectError } from "../../common";

// ============================================================
// CRYPTSK Nexus — POST /api/selfcare/account/password
// Self-Care "Account" (spec §18): the portal user changes their own
// password (bcrypt cost 10, 8..128 chars, must differ from current).
// AUTH: requireSelfcareAccess — customer sessions ONLY (staff get
// 403: staff passwords are managed from the admin console); the
// portal user row is re-fetched from the DB and must still exist.
// PRIVACY (hard rule): password values (current or new) and the
// bcrypt hash are NEVER logged, serialized or audited — the audit
// event records only { passwordChanged: true } on resource
// portal_user with userId null (staff users FK).
// NOTE: the session JWT is stateless, so it stays valid after a
// password change — acceptable by design: requireSelfcareAccess
// re-checks the portal user's status/lockout from the DB on every
// request.
// ============================================================

export const dynamic = "force-dynamic";

// POST /api/selfcare/account/password — change own password (customer session ONLY)
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSelfcareAccess({});

    if (ctx.mode !== "customer") {
      return NextResponse.json({ error: "Only customer accounts can change their password here" }, { status: 403 });
    }

    // requireSelfcareAccess proved this is a live customer login —
    // sessionUser.id IS the portal_users id.
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const portalUserId = String(sessionUser?.id ?? "");
    const sessionEmail = typeof sessionUser?.email === "string" ? sessionUser.email : null;

    const portalUser = await db.portalUser.findUnique({ where: { id: portalUserId } });
    if (!portalUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json({ error: "New password must be between 8 and 128 characters" }, { status: 400 });
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ error: "New password must be different from the current password" }, { status: 400 });
    }

    const valid = await bcrypt.compare(currentPassword, portalUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    await db.portalUser.update({
      where: { id: portalUser.id },
      data: {
        passwordHash: bcrypt.hashSync(newPassword, 10),
        loginAttempts: 0, // fresh start — matches the login-success reset
        lockedUntil: null,
      },
    });

    // Audit never blocks the response (rbac.ts convention); userId MUST be
    // null — audit_events.user_id is a staff users FK (portal ids would
    // fail). Password values are NEVER included here.
    // action "update" — a credential rotation is a portal_user update.
    try {
      await auditUpdate({
        userId: null,
        resource: "portal_user",
        resourceId: portalUser.id,
        resourceName: portalUser.email || sessionEmail,
        after: { passwordChanged: true },
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
    } catch (auditErr) {
      console.error("[/api/selfcare/account/password] failed to audit password change:", auditErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/account/password] POST failed:", err);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
