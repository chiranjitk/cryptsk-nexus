import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { auditUpdate } from "@/lib/audit";
import { isRedirectError } from "../common";

// ============================================================
// CRYPTSK Nexus — GET/PATCH /api/selfcare/profile
// Self-Care "My Profile" (spec §18): the customer's own identity,
// KYC flags, addresses and contacts plus the subscriber's service
// identity.
// GET   ?subscriberId=<cuid> — own profile + service identity.
// PATCH { email?, phone?, whatsappNumber? } — update own contact
//       details (customer mode ONLY — staff get 403: they manage
//       customers from the admin console). Email is regex-validated
//       + uniqueness-checked (excluding own row, P2002 race → 409);
//       phone/whatsapp max 20 chars, empty string clears the field.
// AUTH: requireSelfcareAccess — customer logins are scoped to their
// own customer (subscriberId auto-picked from their first subscriber);
// staff preview per-subscriber via ?subscriberId= (RBAC: subscriber.list).
// PRIVACY (hard rule): NEVER returns customer.notes, tags, audit
// columns (createdBy/updatedBy), the RADIUS password hash, wallet
// internals or any other tenant's data. PATCH only ever touches the
// three self-service contact fields — never identity/KYC/status.
// Audit userId stays NULL — audit_events.user_id FKs to the staff
// users table; the customer is identified by customerCode.
// ============================================================

// Same simple email shape check as /api/portal-users
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// PATCH /api/selfcare/profile — update own contact details (customer mode ONLY)
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireSelfcareAccess({});

    // Staff preview stays read-only — customer master data is edited in
    // the admin console (/api/customers).
    if (ctx.mode !== "customer") {
      return NextResponse.json({ error: "Staff accounts manage customers from the admin console" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim() : null;
    const phone = typeof body.phone === "string" ? body.phone.trim() : null;
    const whatsappNumber = typeof body.whatsappNumber === "string" ? body.whatsappNumber.trim() : null;

    if (email === null && phone === null && whatsappNumber === null) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    if (email !== null && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    // Uniqueness excluding the customer's own row (Customer.email @unique)
    if (email !== null) {
      const clash = await db.customer.findFirst({
        where: { email, NOT: { id: ctx.customerId } },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json({ error: "This email is already in use" }, { status: 409 });
      }
    }
    // Empty string clears the field; anything longer than 20 chars is junk
    if (phone !== null && phone.length > 20) {
      return NextResponse.json({ error: "Phone number is too long" }, { status: 400 });
    }
    if (whatsappNumber !== null && whatsappNumber.length > 20) {
      return NextResponse.json({ error: "Phone number is too long" }, { status: 400 });
    }

    // Before-row for the audit trail (+ customerCode as resourceName)
    const before = await db.customer.findUnique({
      where: { id: ctx.customerId },
      select: { id: true, customerCode: true, email: true, phone: true, whatsappNumber: true },
    });
    if (!before) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const data: { email?: string; phone?: string; whatsappNumber?: string } = {};
    const beforeFields: Record<string, string | null> = {};
    const afterFields: Record<string, string | null> = {};
    if (email !== null) {
      data.email = email;
      beforeFields.email = before.email;
      afterFields.email = email;
    }
    if (phone !== null) {
      data.phone = phone;
      beforeFields.phone = before.phone;
      afterFields.phone = phone;
    }
    if (whatsappNumber !== null) {
      data.whatsappNumber = whatsappNumber;
      beforeFields.whatsappNumber = before.whatsappNumber;
      afterFields.whatsappNumber = whatsappNumber;
    }

    let updated;
    try {
      updated = await db.customer.update({
        where: { id: ctx.customerId },
        data,
        select: { id: true, email: true, phone: true, whatsappNumber: true },
      });
    } catch (e: any) {
      // Unique race between the pre-check above and the write
      if (e?.code === "P2002") {
        return NextResponse.json({ error: "This email is already in use" }, { status: 409 });
      }
      throw e;
    }

    // Audit never blocks the response (rbac.ts convention); userId MUST be
    // null — audit_events.user_id is a staff users FK (portal ids would fail).
    try {
      await auditUpdate({
        userId: null,
        resource: "customer",
        resourceId: ctx.customerId,
        resourceName: before.customerCode,
        before: beforeFields,
        after: afterFields,
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
    } catch (auditErr) {
      console.error("[/api/selfcare/profile] failed to audit profile update:", auditErr);
    }

    return NextResponse.json({ customer: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/profile] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
