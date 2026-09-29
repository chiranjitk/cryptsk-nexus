import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { isRedirectError } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/profile?subscriberId=<cuid>
// Self-Care "My Profile" (spec §18): the customer's own identity,
// KYC flags, addresses and contacts plus the subscriber's service
// identity.
// AUTH: requireSelfcareAccess — customer logins are scoped to their
// own customer (subscriberId auto-picked from their first subscriber);
// staff preview per-subscriber via ?subscriberId= (RBAC: subscriber.list).
// PRIVACY (hard rule): NEVER returns customer.notes, tags, audit
// columns (createdBy/updatedBy), the RADIUS password hash, wallet
// internals or any other tenant's data.
// Read-only.
// ============================================================

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ctx = await requireSelfcareAccess({
      subscriberId: searchParams.get("subscriberId"),
      customerId: searchParams.get("customerId"),
    });

    if (!ctx.subscriberId) {
      return ctx.mode === "staff"
        ? NextResponse.json({ error: "subscriberId is required" }, { status: 400 })
        : NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const subscriber = await db.subscriber.findUnique({
      where: { id: ctx.subscriberId },
      select: {
        id: true,
        subscriberCode: true,
        radiusUsername: true,
        status: true,
        activatedAt: true,
        expiresAt: true,
        staticIp: true,
        vlanId: true,
        customer: {
          select: {
            id: true,
            customerCode: true,
            displayName: true,
            email: true,
            phone: true,
            whatsappNumber: true,
            companyName: true,
            gstin: true,
            pan: true,
            kycVerified: true,
            addresses: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              select: {
                id: true,
                type: true,
                line1: true,
                line2: true,
                city: true,
                state: true,
                postalCode: true,
                country: true,
                landmark: true,
                isPrimary: true,
              },
            },
            contacts: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              select: {
                id: true,
                type: true,
                value: true,
                label: true,
                isPrimary: true,
                verifiedAt: true,
              },
            },
          },
        },
      },
    });

    if (!subscriber || !subscriber.customer) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    return NextResponse.json({
      customer: subscriber.customer,
      subscriber: {
        id: subscriber.id,
        subscriberCode: subscriber.subscriberCode,
        radiusUsername: subscriber.radiusUsername,
        status: subscriber.status,
        activatedAt: subscriber.activatedAt,
        expiresAt: subscriber.expiresAt,
        staticIp: subscriber.staticIp,
        vlanId: subscriber.vlanId,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/profile] GET failed:", err);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
