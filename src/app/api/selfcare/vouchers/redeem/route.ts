import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { authOptions } from "@/lib/auth";
import { auditUpdate } from "@/lib/audit";
import { isRedirectError } from "../../common";

// ============================================================
// CRYPTSK Nexus — POST /api/selfcare/vouchers/redeem
// Self-Care "Wallet" tab (spec §18): the customer redeems a prepaid
// recharge voucher; its face value is credited to their wallet.
// AUTH: requireSelfcareAccess + customer mode ONLY — staff get 403
// (staff provision vouchers from the admin console /api/vouchers).
// MONEY FLOW (single interactive transaction):
//   voucher (unused → used) + wallet upsert + balance increment
//   + WalletTransaction(recharge) — atomic, all-or-nothing.
// PRIVACY: an unknown code and an already-used code return the SAME
// 404 message — no enumeration leak. Vouchers are stored uppercase;
// the lookup uppercases the trimmed input.
// The wallet row is created on first redeem (upsert) — GET never
// auto-creates it. Audit userId stays NULL — audit_events.user_id
// FKs to the staff users table; the portal identity lives in the
// WalletTransaction.createdBy ("portal:<id>").
// ============================================================

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSelfcareAccess({});

    // Staff preview stays read-only — voucher provisioning is a staff
    // console concern (/api/vouchers), redemption is customer-only.
    if (ctx.mode !== "customer") {
      return NextResponse.json(
        { error: "Only customer accounts can redeem vouchers" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code) {
      return NextResponse.json({ error: "Voucher code is required" }, { status: 400 });
    }

    // Session identity for the money trail — requireSelfcareAccess has
    // already proven this is a live customer login (status re-checked).
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const portalUserId = String(sessionUser?.id ?? "");

    const now = new Date();

    // Interactive transaction — the whole money flow is atomic.
    // The "expired" branch marks the voucher inside the txn and commits,
    // then maps to 400 outside (a throw here would roll the marking back).
    const outcome = await db.$transaction(async (tx) => {
      const voucher = await tx.voucher.findUnique({ where: { code } });

      // Single message for unknown AND already-used — no enumeration leak
      if (!voucher || voucher.status !== "unused") {
        throw new Response(JSON.stringify({ error: "Invalid or already used voucher code" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (voucher.expiresAt && voucher.expiresAt < now) {
        // Persist the expiry so the code stops lingering as redeemable
        await tx.voucher.update({
          where: { id: voucher.id },
          data: { status: "expired" },
        });
        return { kind: "expired" as const };
      }

      // Claim the voucher (string column — portal ids are not staff users FKs)
      await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          status: "used",
          usedAt: now,
          activatedAt: now,
          usedBy: ctx.customerId,
        },
      });

      // Credit the wallet — created on first redeem (one wallet per customer)
      await tx.wallet.upsert({
        where: { customerId: ctx.customerId },
        create: { customerId: ctx.customerId },
        update: {},
      });
      const wallet = await tx.wallet.update({
        where: { customerId: ctx.customerId },
        data: { balance: { increment: voucher.faceValue } },
        select: { id: true, balance: true },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: voucher.faceValue, // positive = credit
          type: "recharge",
          description: `Voucher ${code} redeemed`,
          balanceAfter: wallet.balance,
          createdBy: `portal:${portalUserId}`,
        },
      });

      return {
        kind: "ok" as const,
        voucher: { code: voucher.code, faceValue: voucher.faceValue },
        wallet: { balance: wallet.balance },
        voucherId: voucher.id,
      };
    });

    if (outcome.kind === "expired") {
      return NextResponse.json({ error: "This voucher has expired" }, { status: 400 });
    }

    // Audit never blocks the response (rbac.ts convention); userId MUST be
    // null — audit_events.user_id is a staff users FK (portal ids would fail).
    try {
      await auditUpdate({
        userId: null,
        resource: "voucher",
        resourceId: outcome.voucherId,
        resourceName: code,
        after: { redeemed: true, faceValue: outcome.voucher.faceValue },
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
    } catch (auditErr) {
      console.error("[/api/selfcare/vouchers/redeem] failed to audit redemption:", auditErr);
    }

    return NextResponse.json({
      voucher: outcome.voucher,
      wallet: outcome.wallet,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/vouchers/redeem] POST failed:", err);
    return NextResponse.json({ error: "Failed to redeem voucher" }, { status: 500 });
  }
}
