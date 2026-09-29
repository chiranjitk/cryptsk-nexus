import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate, auditDelete } from "@/lib/audit";
import bcrypt from "bcryptjs";

// ============================================================
// CRYPTSK Nexus — /api/portal-users/[id]
// Staff-facing Self-Care portal account management (T6-a).
//   PATCH  { status?:"active"|"disabled", password?, name? }
//          — at least one field required (400). A password reset also
//            clears the lockout counters (loginAttempts/lockedUntil).
//            Audited before/after — hashes are NEVER written to audit.
//   DELETE — remove the portal account (customer data untouched).
// RBAC: subscriber.update (staff-only provisioning).
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export const dynamic = "force-dynamic";

const PORTAL_STATUSES = ["active", "disabled"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("subscriber", "update");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const hasStatus = body.status !== undefined;
    const hasPassword = body.password !== undefined;
    const hasName = body.name !== undefined;
    if (!hasStatus && !hasPassword && !hasName) {
      return NextResponse.json(
        { error: "At least one of status, password or name is required" },
        { status: 400 }
      );
    }

    if (hasStatus && !PORTAL_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "status must be 'active' or 'disabled'" }, { status: 400 });
    }
    if (hasPassword && (typeof body.password !== "string" || body.password.length < 8)) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await db.portalUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Portal user not found" }, { status: 404 });
    }

    const data: { status?: "active" | "disabled"; passwordHash?: string; name?: string | null; loginAttempts?: number; lockedUntil?: null } = {};
    if (hasStatus) data.status = body.status as "active" | "disabled";
    if (hasName) data.name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
    if (hasPassword) {
      data.passwordHash = bcrypt.hashSync(body.password, 10);
      // A password reset invalidates any lockout in progress
      data.loginAttempts = 0;
      data.lockedUntil = null;
    }

    const portalUser = await db.portalUser.update({ where: { id }, data });

    // Audit before/after — hashes never included (password presence only)
    await auditUpdate({
      userId: user.id,
      resource: "portal_user",
      resourceId: portalUser.id,
      resourceName: portalUser.email,
      before: {
        email: existing.email,
        name: existing.name,
        status: existing.status,
        loginAttempts: existing.loginAttempts,
        lockedUntil: existing.lockedUntil,
        passwordChanged: false,
      },
      after: {
        email: portalUser.email,
        name: portalUser.name,
        status: portalUser.status,
        loginAttempts: portalUser.loginAttempts,
        lockedUntil: portalUser.lockedUntil,
        passwordChanged: hasPassword,
      },
      ipAddress: req.headers.get("x-forwarded-for") || "server",
    });

    return NextResponse.json({
      portalUser: {
        id: portalUser.id,
        email: portalUser.email,
        name: portalUser.name,
        status: portalUser.status,
        lastLoginAt: portalUser.lastLoginAt,
        lastLoginIp: portalUser.lastLoginIp,
        createdAt: portalUser.createdAt,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/portal-users/[id]] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update portal user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("subscriber", "update");
    const { id } = await params;

    const existing = await db.portalUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Portal user not found" }, { status: 404 });
    }

    await db.portalUser.delete({ where: { id } });

    await auditDelete({
      userId: user.id,
      resource: "portal_user",
      resourceId: existing.id,
      resourceName: existing.email,
      before: { email: existing.email, name: existing.name, status: existing.status, customerId: existing.customerId },
      ipAddress: req.headers.get("x-forwarded-for") || "server",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/portal-users/[id]] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete portal user" }, { status: 500 });
  }
}
