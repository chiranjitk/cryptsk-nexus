import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — /api/portal-users/bulk (STAFF, T10-a)
// Bulk portal-account provisioning from the Customers list
// (checkbox selection). STATIC segment — wins over [id].
//   POST { customerIds: string[] } (1..100)
//   400 "customerIds must be a non-empty array"
//   400 "A maximum of 100 customers can be provisioned at once"
// Per customer (request order, deduped):
//   skipped  not-found            — no such customer
//   skipped  no-email             — customer has no email address
//   skipped  already-provisioned  — a portal user with that email
//                                   already exists (pre-check AND
//                                   per-row P2002 race fallback)
//   created  PortalUser{ email = customer.email, name = displayName,
//                        tempPassword (12-char unambiguous alphabet,
//                        ≥1 upper + ≥1 lower + ≥1 digit), bcrypt 10 }
//   200 { created: [{ customerId, customerCode, displayName, email,
//                     tempPassword }],
//         skipped: [{ customerId, customerCode, displayName, reason }] }
// tempPassword is returned ONCE in the response and is NEVER
// written to audit (hashes are stored, plaintext is not).
// Audit: one auditCreateEntity per created user (resource
// portal_user, action forced "create").
// RBAC: subscriber.update (same as single provisioning).
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export const dynamic = "force-dynamic";

const MAX_BATCH = 100;

// Unambiguous alphabet — no I/O/0/1/l look-alikes. Guaranteed to
// contain ≥1 upper + ≥1 lower + ≥1 digit via the seeded picks below.
const TEMP_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_LOWER = "abcdefghjkmnpqrstuvwxyz";
const TEMP_DIGIT = "23456789";
const TEMP_ALPHABET = TEMP_UPPER + TEMP_LOWER + TEMP_DIGIT;

function generateTempPassword(length = 12): string {
  const pick = (set: string) => set[randomBytes(1)[0] % set.length];
  const chars: string[] = [pick(TEMP_UPPER), pick(TEMP_LOWER), pick(TEMP_DIGIT)];
  while (chars.length < length) chars.push(pick(TEMP_ALPHABET));
  // Fisher–Yates so the guaranteed characters aren't front-loaded
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("subscriber", "update");

    const body = await req.json().catch(() => null);
    const customerIds: unknown = body?.customerIds;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return NextResponse.json({ error: "customerIds must be a non-empty array" }, { status: 400 });
    }
    if (customerIds.length > MAX_BATCH) {
      return NextResponse.json(
        { error: "A maximum of 100 customers can be provisioned at once" },
        { status: 400 }
      );
    }

    // Dedupe + drop non-string/blank entries, preserve request order
    const ids = [
      ...new Set(
        customerIds
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .map((v) => v.trim())
      ),
    ];
    if (ids.length === 0) {
      return NextResponse.json({ error: "customerIds must be a non-empty array" }, { status: 400 });
    }

    const customers = await db.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, customerCode: true, displayName: true, email: true },
    });
    const byId = new Map(customers.map((c) => [c.id, c]));

    const created: {
      customerId: string;
      customerCode: string;
      displayName: string;
      email: string;
      tempPassword: string;
    }[] = [];
    const skipped: {
      customerId: string;
      customerCode: string | null;
      displayName: string | null;
      reason: "not-found" | "no-email" | "already-provisioned";
    }[] = [];

    for (const customerId of ids) {
      const customer = byId.get(customerId);
      if (!customer) {
        skipped.push({ customerId, customerCode: null, displayName: null, reason: "not-found" });
        continue;
      }

      const email = (customer.email || "").toLowerCase().trim();
      if (!email) {
        skipped.push({
          customerId,
          customerCode: customer.customerCode,
          displayName: customer.displayName,
          reason: "no-email",
        });
        continue;
      }

      const existing = await db.portalUser.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        skipped.push({
          customerId,
          customerCode: customer.customerCode,
          displayName: customer.displayName,
          reason: "already-provisioned",
        });
        continue;
      }

      // Generate ONCE — returned in the response, never audited, only its
      // bcrypt hash is persisted.
      const tempPassword = generateTempPassword();
      try {
        const portalUser = await db.portalUser.create({
          data: {
            email,
            passwordHash: bcrypt.hashSync(tempPassword, 10),
            name: customer.displayName,
            customerId: customer.id,
          },
        });

        created.push({
          customerId: customer.id,
          customerCode: customer.customerCode,
          displayName: customer.displayName,
          email: portalUser.email,
          tempPassword,
        });

        // NEVER include tempPassword (or any hash) in the audit payload
        await auditCreateEntity({
          userId: user.id,
          resource: "portal_user",
          resourceId: portalUser.id,
          resourceName: portalUser.email,
          after: { email: portalUser.email, name: portalUser.name, status: portalUser.status, customerId: customer.id },
          ipAddress: req.headers.get("x-forwarded-for") || "server",
        });
      } catch (err: any) {
        // Unique-race fallback (concurrent provisioning of the same email)
        if (err?.code === "P2002") {
          skipped.push({
            customerId,
            customerCode: customer.customerCode,
            displayName: customer.displayName,
            reason: "already-provisioned",
          });
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json({ created, skipped });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/portal-users/bulk] POST failed:", err);
    return NextResponse.json({ error: "Failed to provision portal users" }, { status: 500 });
  }
}
