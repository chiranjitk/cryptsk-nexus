import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditCreateEntity } from "@/lib/audit";
import { generateRawToken, hashResetToken, resetExpiry } from "@/lib/password-reset";

// ============================================================
// CRYPTSK Nexus — /api/auth/forgot-password (PUBLIC, T10-a)
// Self-service password reset request. No auth guard.
// Deliberately NON-ENUMERATING: the response is identical whether
// or not the email exists. When an account matches (staff user by
// email, else an ACTIVE portal user), a one-time reset token is
// created: raw = randomBytes(32).hex, stored = sha256(raw),
// expires in 60 min. There is no mail transport in this sandbox —
// the helpdesk hands the link over after identity verification
// (GET /api/auth/reset-requests + POST .../[id]/deliver).
// Rate limit: ≤3 unused tokens per actor per 60 minutes.
// Audit: userId is ALWAYS null here — audit_events.user_id is a
// FK to STAFF users and this route is unauthenticated.
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 60 minutes
const RATE_LIMIT_MAX_UNUSED = 3;

const OK_BODY = {
  ok: true,
  message:
    "If the account exists, a one-time reset link has been created. Our support desk will hand it to you after identity verification.",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Resolve the actor — staff by email first, else an active portal user.
    const staff = await db.user.findUnique({ where: { email }, select: { id: true } });
    const portal = staff
      ? null
      : await db.portalUser.findFirst({ where: { email, status: "active" }, select: { id: true } });

    if (staff || portal) {
      const actorType = staff ? ("staff" as const) : ("portal" as const);
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

      // Rate limit: ≤3 unused tokens per actor in the last 60 minutes
      const unusedCount = await db.passwordResetToken.count({
        where: {
          actorType,
          ...(staff ? { userId: staff.id } : { portalUserId: portal!.id }),
          usedAt: null,
          createdAt: { gte: since },
        },
      });

      if (unusedCount < RATE_LIMIT_MAX_UNUSED) {
        const raw = generateRawToken();
        await db.passwordResetToken.create({
          data: staff
            ? {
                tokenHash: hashResetToken(raw),
                actorType,
                userId: staff.id,
                expiresAt: resetExpiry(),
                requestIp: req.headers.get("x-forwarded-for") || null,
                // createdBy stays null — self-service, no staff actor involved
              }
            : {
                tokenHash: hashResetToken(raw),
                actorType,
                portalUserId: portal!.id,
                expiresAt: resetExpiry(),
                requestIp: req.headers.get("x-forwarded-for") || null,
              },
        });
      }

      await auditCreateEntity({
        userId: null, // audit_events.user_id is a FK to staff users — self-service stays null
        resource: "password_reset",
        resourceName: email,
        after: { actorType, selfService: true },
        ipAddress: req.headers.get("x-forwarded-for") || "server",
      });
    }

    // Same response for known and unknown emails — no enumeration
    return NextResponse.json(OK_BODY);
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/auth/forgot-password] POST failed:", err);
    return NextResponse.json({ error: "Failed to process reset request" }, { status: 500 });
  }
}
