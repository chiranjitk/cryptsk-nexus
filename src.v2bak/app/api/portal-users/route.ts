import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";
import bcrypt from "bcryptjs";

// ============================================================
// CRYPTSK Nexus — /api/portal-users
// Staff-facing Self-Care portal account provisioning (T6-a).
//   GET  ?customerId= → list portal accounts for a customer
//                        (safe fields only — NEVER passwordHash)
//   POST { customerId, email, password, name? } → create account
//                        (bcrypt cost 10, email unique, ≥8 char password)
// RBAC: subscriber.update (staff-only provisioning).
// Every mutation is audited (resource: portal_user).
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  try {
    await requirePermission("subscriber", "update");

    const customerId = new URL(req.url).searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }

    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const portalUsers = await db.portalUser.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ portalUsers });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/portal-users] GET failed:", err);
    return NextResponse.json({ error: "Failed to load portal users" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("subscriber", "update");

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;

    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const existing = await db.portalUser.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "Portal account already exists for this email" }, { status: 409 });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const portalUser = await db.portalUser.create({
      data: { email, passwordHash, name, customerId },
    });

    await auditCreateEntity({
      userId: user.id,
      resource: "portal_user",
      resourceId: portalUser.id,
      resourceName: portalUser.email,
      after: { email: portalUser.email, name: portalUser.name, status: portalUser.status, customerId },
      ipAddress: req.headers.get("x-forwarded-for") || "server",
    });

    return NextResponse.json(
      {
        portalUser: {
          id: portalUser.id,
          email: portalUser.email,
          name: portalUser.name,
          status: portalUser.status,
          createdAt: portalUser.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Unique-race fallback (two concurrent creates)
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Portal account already exists for this email" }, { status: 409 });
    }
    console.error("[/api/portal-users] POST failed:", err);
    return NextResponse.json({ error: "Failed to create portal user" }, { status: 500 });
  }
}
