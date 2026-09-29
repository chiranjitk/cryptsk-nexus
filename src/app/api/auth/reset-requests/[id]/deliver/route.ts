import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreate } from "@/lib/audit";
import { buildResetLink, generateRawToken, hashResetToken, resetExpiry } from "@/lib/password-reset";

// ============================================================
// CRYPTSK Nexus — /api/auth/reset-requests/[id]/deliver (STAFF, T10-a)
// Helpdesk hands over a reset link after identity verification.
// ROTATES the token: a brand-new raw token is generated (the
// previously delivered link, if any, dies because only the
// sha256 hash is stored) with a fresh 60-minute expiry, and
// deliveredAt/deliveredBy are stamped.
//   404 "Reset request not found"
//   400 "Reset link has already been used"
//   400 "Reset link has expired"
//   200 { link: "<proto>://<host>/?reset=<raw>", expiresAt }
//   (proto/host from x-forwarded-proto/x-forwarded-host, else origin)
// The raw token exists ONLY in this response — never stored.
// RBAC: user.list (same as GET /api/auth/reset-requests).
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("user", "list");
    const { id } = await params;

    const record = await db.passwordResetToken.findUnique({
      where: { id },
      select: {
        id: true,
        actorType: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { email: true } },
        portalUser: { select: { email: true } },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Reset request not found" }, { status: 404 });
    }
    if (record.usedAt) {
      return NextResponse.json({ error: "Reset link has already been used" }, { status: 400 });
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Reset link has expired" }, { status: 400 });
    }

    // Rotate — new raw token + fresh expiry; stamp delivery
    const raw = generateRawToken();
    const expiresAt = resetExpiry();
    await db.passwordResetToken.update({
      where: { id: record.id },
      data: {
        tokenHash: hashResetToken(raw),
        expiresAt,
        deliveredAt: new Date(),
        deliveredBy: user.id,
      },
    });

    const email =
      record.actorType === "staff" ? record.user?.email ?? null : record.portalUser?.email ?? null;

    await auditCreate({
      userId: user.id,
      action: "update",
      resource: "password_reset",
      resourceId: record.id,
      resourceName: email,
      after: { delivered: true, rotated: true },
      ipAddress: req.headers.get("x-forwarded-for") || "server",
    });

    return NextResponse.json({ link: buildResetLink(req, raw), expiresAt });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/auth/reset-requests/[id]/deliver] POST failed:", err);
    return NextResponse.json({ error: "Failed to deliver reset link" }, { status: 500 });
  }
}
