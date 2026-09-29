import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — POST /api/wallet/topup
// STAFF-ONLY — record a REAL cash/office top-up against a
// customer's prepaid wallet (Billing console action; customers top
// up themselves via /api/selfcare/vouchers/redeem, which this route
// mirrors structurally).
// RBAC: billing.payment.create — the SAME permission POST
// /api/payments uses to move money, so only payment-authorized staff
// can credit wallets.
// Flow (single $transaction, same upsert→increment→read pattern as
// the voucher redeem route): wallet upsert (first top-up creates the
// wallet — reads elsewhere never auto-create) → balance increment →
// read new balance → WalletTransaction ledger row (type "recharge",
// balanceAfter snapshot). The ledger can therefore never drift from
// the balance.
// Amount hygiene: must be a finite number > 0, rounded to 2 decimals
// (Math.round(x*100)/100) so float dust never reaches the ledger.
// NO GET is exported here — staff wallet reads already exist via
// /api/selfcare/wallet?customerId=.
// Audit: auditCreateEntity FORCES action "create" (src/lib/audit.ts),
// so the action field is omitted — same semantics as T7's wallet
// events (one create event covering the balance update + ledger row).
// ============================================================

// POST /api/wallet/topup — record a cash/office top-up
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("billing.payment", "create");
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { customerId, amount, notes } = body;

    if (!customerId || typeof customerId !== "string") {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }

    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true, customerCode: true, displayName: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }
    const amt = Math.round(amount * 100) / 100;

    const result = await db.$transaction(async (tx) => {
      // First top-up creates the wallet (balance defaults to 0);
      // otherwise a no-op upsert so the increment below always applies.
      await tx.wallet.upsert({
        where: { customerId },
        create: { customerId },
        update: {},
      });
      const wallet = await tx.wallet.update({
        where: { customerId },
        data: { balance: { increment: amt } },
        select: { id: true, balance: true, currency: true },
      });
      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: amt, // positive = credit
          type: "recharge",
          description:
            typeof notes === "string" && notes.trim() !== ""
              ? notes.trim()
              : "Cash top-up recorded by staff",
          balanceAfter: wallet.balance,
          createdBy: user.id,
        },
      });
      return { wallet, transaction };
    });

    await auditCreateEntity({
      userId: user.id,
      resource: "wallet",
      resourceId: result.wallet.id,
      resourceName: customer.customerCode,
      after: { topup: amt, balanceAfter: result.wallet.balance },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({
      wallet: { balance: result.wallet.balance, currency: result.wallet.currency },
      transaction: {
        id: result.transaction.id,
        amount: result.transaction.amount,
        type: result.transaction.type,
        balanceAfter: result.transaction.balanceAfter,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("[/api/wallet/topup] POST failed:", err);
    return NextResponse.json({ error: "Failed to record top-up" }, { status: 500 });
  }
}
