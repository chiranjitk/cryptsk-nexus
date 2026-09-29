import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { isRedirectError } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/wallet?customerId=<cuid>
// Self-Care "Wallet" tab (spec §18): the customer's prepaid wallet
// balance and its transaction history.
// AUTH: requireSelfcareAccess — customer logins have customerId
// FORCED from their session (a differing query customerId → 404);
// staff pass ?customerId= (RBAC: subscriber.list).
// 100% real data — wallets + wallet_transactions only; a customer
// without a wallet is a normal state → { wallet: null, transactions: [] }.
// READ-ONLY — the wallet is NEVER auto-created on GET (it comes to
// life on the first real recharge, e.g. voucher redemption).
// ============================================================

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ctx = await requireSelfcareAccess({
      customerId: searchParams.get("customerId"),
    });

    if (!ctx.customerId) {
      return ctx.mode === "staff"
        ? NextResponse.json({ error: "customerId is required" }, { status: 400 })
        : NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    const customerId = ctx.customerId;

    // Scope guard — unknown id → 404 (same pattern as /api/selfcare/support)
    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // One wallet per customer (Wallet.customerId is @unique) — may not exist
    const wallet = await db.wallet.findUnique({
      where: { customerId },
      select: { id: true, balance: true, currency: true, minBalance: true, autoRecharge: true },
    });

    if (!wallet) {
      // No wallet yet — normal, not an error. Never auto-create on GET.
      return NextResponse.json({ wallet: null, transactions: [] });
    }

    const transactions = await db.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        amount: true,
        type: true,
        description: true,
        balanceAfter: true,
        createdAt: true,
        invoiceId: true,
      },
    });

    return NextResponse.json({ wallet, transactions });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/wallet] GET failed:", err);
    return NextResponse.json({ error: "Failed to load wallet" }, { status: 500 });
  }
}
