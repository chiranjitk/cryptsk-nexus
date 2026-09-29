import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreate } from "@/lib/audit";
import { buildResetLink, generateRawToken, hashResetToken, resetExpiry } from "@/lib/password-reset";

// ============================================================
// CRYPTSK Nexus — /api/portal-users/[id]/reset-link (STAFF, T10-a)
// Staff-assisted password reset for a Self-Care portal account
// (Customer 360 → Portal Access action). Creates a FRESH one-time
// token for the portal user: raw = randomBytes(32).hex (returned
// in the link only), stored = sha256(raw), 60-minute expiry,
// createdBy + deliveredBy = issuing staff (no mail transport in
// this sandbox — the link is handed over directly).
//   404 "Portal user not found"
//   200 { link: "<proto>://<host>/?reset=<raw>", expiresAt, email }
// The link/token material is NEVER written to audit.
// RBAC: subscriber.update (same as the other portal-user routes).
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("subscriber", "update");
    const { id } = await params;

    const portalUser = await db.portalUser.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (!portalUser) {
      return NextResponse.json({ error: "Portal user not found" }, { status: 404 });
    }

    const raw = generateRawToken();
    const expiresAt = resetExpiry();
    await db.passwordResetToken.create({
      data: {
        tokenHash: hashResetToken(raw),
        actorType: "portal",
        portalUserId: portalUser.id,
        expiresAt,
        requestIp: req.headers.get("x-forwarded-for") || null,
        createdBy: user.id,
        deliveredBy: user.id,
      },
    });

    await auditCreate({
      userId: user.id,
      action: "update",
      resource: "portal_user",
      resourceId: portalUser.id,
      resourceName: portalUser.email,
      after: { passwordResetLinkIssued: true },
      ipAddress: req.headers.get("x-forwarded-for") || "server",
    });

    return NextResponse.json({ link: buildResetLink(req, raw), expiresAt, email: portalUser.email });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/portal-users/[id]/reset-link] POST failed:", err);
    return NextResponse.json({ error: "Failed to create reset link" }, { status: 500 });
  }
}
