import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — GET/POST /api/vouchers
// Prepaid recharge voucher provisioning (Billing module).
// RBAC: same permission the invoices routes use (billing.invoice
// read/create) so billing staff manage the voucher stock.
// GET  filters: ?status (unused/used/expired/cancelled) ?search
//      (code/batchNumber) ?limit (default 50, max 200). KPIs
//      aggregate the WHOLE table, not just the page.
// POST { count, faceValue, validityDays? } — generates a batch of
//      real random codes: CRPT-XXXX-XXXX-XXXX over an unambiguous
//      32-char alphabet (no O/I/0/1). Codes are uniform-random via
//      crypto.randomBytes — 256 = 8 × 32, so byte % 32 is exactly
//      unbiased (no rejection sampling needed). A P2002 unique-code
//      collision regenerates the batch (max 5 attempts).
// ============================================================

const VALID_STATUSES = ["unused", "used", "expired", "cancelled"];
const BATCH_PREFIX = "VCH-2026";

// 32 chars — digits/letters that can't be misread (no O, I, 0, 1)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

function generateVoucherCode(): string {
  // 12 uniform chars from the 32-char alphabet → XXXX-XXXX-XXXX.
  // 256 % 32 === 0 so every byte maps uniformly — no modulo bias.
  let raw = "";
  while (raw.length < 12) {
    const buf = randomBytes(12);
    for (const byte of buf) {
      if (raw.length < 12) raw += CODE_ALPHABET[byte % 32];
    }
  }
  return `CRPT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

// GET /api/vouchers — list vouchers + whole-table KPIs
export async function GET(req: NextRequest) {
  try {
    await requirePermission("billing.invoice", "read");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    const where: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (search) {
      where.OR = [{ code: { contains: search } }, { batchNumber: { contains: search } }];
    }

    const [vouchers, total, unused, used, expired, cancelled, faceAgg] = await Promise.all([
      db.voucher.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      // KPIs — real parallel aggregates over the WHOLE table
      db.voucher.count(),
      db.voucher.count({ where: { status: "unused" } }),
      db.voucher.count({ where: { status: "used" } }),
      db.voucher.count({ where: { status: "expired" } }),
      db.voucher.count({ where: { status: "cancelled" } }),
      db.voucher.aggregate({ _sum: { faceValue: true } }),
    ]);

    return NextResponse.json({
      vouchers,
      kpis: {
        total,
        unused,
        used,
        expired,
        cancelled,
        totalFaceValue: faceAgg._sum.faceValue ?? 0,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/vouchers] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch vouchers" }, { status: 500 });
  }
}

// POST /api/vouchers — generate a batch of vouchers
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("billing.invoice", "create");
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { count, faceValue, validityDays } = body;

    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return NextResponse.json({ error: "Generate between 1 and 100 vouchers" }, { status: 400 });
    }
    if (typeof faceValue !== "number" || !Number.isFinite(faceValue) || faceValue <= 0) {
      return NextResponse.json({ error: "Face value must be greater than zero" }, { status: 400 });
    }
    if (validityDays !== undefined && validityDays !== null) {
      if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) {
        return NextResponse.json(
          { error: "Validity days must be between 1 and 3650" },
          { status: 400 }
        );
      }
    }

    // Sequential batch number — count prior Cryptsk batches
    const batchCount = await db.voucher.count({
      where: { batchNumber: { startsWith: BATCH_PREFIX } },
    });
    const batchNumber = `${BATCH_PREFIX}-${String(batchCount + 1).padStart(4, "0")}`;

    const expiresAt =
      validityDays ? new Date(Date.now() + validityDays * 24 * 3600 * 1000) : null;

    // Codes are unique — on the (astronomically unlikely) P2002 collision
    // regenerate the whole batch, max 5 attempts.
    const createBatch = async () => {
      const codes = Array.from({ length: count as number }, () => generateVoucherCode());
      await db.voucher.createMany({
        data: codes.map((code) => ({
          code,
          faceValue: faceValue as number,
          currency: "INR",
          status: "unused" as const,
          batchNumber,
          expiresAt,
          createdBy: user.id,
        })),
      });
      return codes;
    };

    let codes: string[] | null = null;
    for (let attempt = 0; attempt < 5 && !codes; attempt++) {
      try {
        codes = await createBatch();
      } catch (e: any) {
        if (e?.code !== "P2002") throw e; // unique-code race only — regenerate
      }
    }
    if (!codes) {
      throw new Error("voucher code collision persisted after 5 attempts");
    }

    await auditCreateEntity({
      userId: user.id,
      action: "create",
      resource: "voucher",
      resourceName: batchNumber,
      after: { count, faceValue, validityDays: validityDays ?? null },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(
      { batchNumber, created: codes.length, faceValue, codes },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/vouchers] POST failed:", err);
    return NextResponse.json({ error: "Failed to generate vouchers" }, { status: 500 });
  }
}
