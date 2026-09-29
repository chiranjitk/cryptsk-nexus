import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreate } from "@/lib/audit";
import { buildResetLink, generateRawToken, hashResetToken, resetExpiry } from "@/lib/password-reset";

// ============================================================
// CRYPTSK Nexus — /api/users/[id]/reset-link (STAFF, T10-a)
// Staff-assisted password reset for a STAFF account (Admin →
// Users panel action). Creates a FRESH one-time token: raw =
// randomBytes(32).hex (returned in the link only), stored =
// sha256(raw), 60-minute expiry, createdBy + deliveredBy =
// issuing staff. The new password is set later by the PUBLIC
// POST /api/auth/reset-password when the user opens the link.
//   404 "User not found"
//   200 { link: "<proto>://<host>/?reset=<raw>", expiresAt, email }
// The link/token material is NEVER written to audit.
// RBAC: user.update.
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("user", "update");
    const { id } = await params;

    const staffUser = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (!staffUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const raw = generateRawToken();
    const expiresAt = resetExpiry();
    await db.passwordResetToken.create({
      data: {
        tokenHash: hashResetToken(raw),
        actorType: "staff",
        userId: staffUser.id,
        expiresAt,
        requestIp: req.headers.get("x-forwarded-for") || null,
        createdBy: user.id,
        deliveredBy: user.id,
      },
    });

    await auditCreate({
      userId: user.id,
      action: "update",
      resource: "user",
      resourceId: staffUser.id,
      resourceName: staffUser.email,
      after: { passwordResetLinkIssued: true },
      ipAddress: req.headers.get("x-forwarded-for") || "server",
    });

    return NextResponse.json({ link: buildResetLink(req, raw), expiresAt, email: staffUser.email });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/users/[id]/reset-link] POST failed:", err);
    return NextResponse.json({ error: "Failed to create reset link" }, { status: 500 });
  }
}
