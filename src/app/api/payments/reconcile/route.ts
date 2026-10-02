import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/services/audit-service";
import { requireAuth, permissionFor, AuthError } from "@/lib/api-auth";

// ─────────────────────────────────────────────────────────────────────────────
// [PAYMENTS-NOLEAK] Gateway reconciliation center.
//
//   GET  → gateway transactions (IntegrationTransaction) vs local Payments,
//          with automatic match suggestions (amount ≤ ₹1 tolerance + 48h window
//          + externalRef overlap) and both unmatched lists.
//
//   POST actions:
//     • sync-from-payments — ingest: for every Payment whose transactionRef
//       carries the gateway convention "orderId|paymentId", upsert an
//       IntegrationTransaction (idempotent on externalRef) and auto-link when
//       an exact externalRef match exists. Closes the "IntegrationTransaction
//       is never written" gap.
//     • link   — {transactionId, paymentId}: manual match (validates amount
//       within ₹1 tolerance).
//     • unlink — {transactionId}: detach a wrong match (audit-logged).
//
// Money-movement rule: this route NEVER mutates Payment/Invoice balances —
// reconciliation is an audit/visibility layer only.
// ─────────────────────────────────────────────────────────────────────────────

const TXN_TYPES = ["payment", "order", "settlement"];
const AMOUNT_TOLERANCE = 1.0;

function round2(n: number) { return Math.round(n * 100) / 100; }

/** "order_ABC|pay_XYZ" → { orderId, paymentId, ref: paymentId-part } */
function splitGatewayRef(ref: string): { orderId: string; paymentId: string } | null {
  if (!ref || !ref.includes("|")) return null;
  const parts = ref.split("|");
  if (parts.length < 2 || !parts[1]) return null;
  return { orderId: parts[0], paymentId: parts[1] };
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const [transactions, gatewayPayments] = await Promise.all([
      db.integrationTransaction.findMany({
        where: { transactionType: { in: TXN_TYPES } },
        orderBy: { createdAt: "desc" },
        take: 300,
        include: {
          Payment: { select: { id: true, receiptNumber: true, amount: true, status: true } },
          IntegrationConfig: { select: { name: true, provider: true, environment: true } },
        },
      }),
      db.payment.findMany({
        where: { transactionRef: { contains: "|" } },
        orderBy: { createdAt: "desc" },
        take: 300,
        include: {
          Subscriber: { select: { id: true, name: true, code: true } },
          Invoice: { select: { invoiceNumber: true } },
        },
      }),
    ]);

    // Index payments by gateway paymentId (right side of the ref) and by full ref
    const byGatewayPaymentId = new Map<string, typeof gatewayPayments[number]>();
    const byFullRef = new Map<string, typeof gatewayPayments[number]>();
    const linkedPaymentIds = new Set<number | string>();
    for (const p of gatewayPayments) {
      const split = splitGatewayRef(p.transactionRef);
      if (split) {
        if (!byGatewayPaymentId.has(split.paymentId)) byGatewayPaymentId.set(split.paymentId, p);
        if (!byFullRef.has(p.transactionRef)) byFullRef.set(p.transactionRef, p);
      }
    }
    for (const t of transactions) {
      if (t.paymentId) linkedPaymentIds.add(t.paymentId);
    }

    const matched: Array<Record<string, unknown>> = [];
    const unmatchedTransactions: Array<Record<string, unknown>> = [];
    const linkedPaymentIdSet = new Set(transactions.filter((t) => t.paymentId).map((t) => t.paymentId as string));

    for (const t of transactions) {
      const base = {
        id: t.id,
        gatewayType: t.gatewayType,
        gatewayName: t.IntegrationConfig?.name || t.gatewayType || "Gateway",
        environment: t.IntegrationConfig?.environment || "",
        transactionType: t.transactionType,
        amount: t.amount,
        status: t.status,
        externalRef: t.externalRef,
        createdAt: t.createdAt,
      };
      if (t.paymentId && t.Payment) {
        matched.push({
          ...base,
          matched: true,
          payment: {
            id: t.Payment.id,
            receiptNumber: t.Payment.receiptNumber,
            amount: t.Payment.amount,
            status: t.Payment.status,
          },
        });
      } else {
        // Suggest a payment match: exact externalRef, else amount+48h proximity
        const exact = byGatewayPaymentId.get(t.externalRef) || byFullRef.get(t.externalRef);
        let suggestion: Record<string, unknown> | null = null;
        if (exact && !linkedPaymentIdSet.has(exact.id)) {
          suggestion = { paymentId: exact.id, receiptNumber: exact.receiptNumber, amount: exact.amount, confidence: "exact" };
        } else {
          const candidates = gatewayPayments.filter((p) => !linkedPaymentIdSet.has(p.id));
          const nearest = candidates
            .map((p) => ({ p, dt: Math.abs(new Date(p.createdAt).getTime() - new Date(t.createdAt).getTime()) }))
            .filter(({ p, dt }) => Math.abs(p.amount - t.amount) <= AMOUNT_TOLERANCE && dt <= 48 * 3600 * 1000)
            .sort((a, b) => a.dt - b.dt)[0];
          if (nearest) {
            suggestion = {
              paymentId: nearest.p.id,
              receiptNumber: nearest.p.receiptNumber,
              amount: nearest.p.amount,
              confidence: nearest.dt <= 3600 * 1000 ? "high" : "possible",
            };
          }
        }
        unmatchedTransactions.push({ ...base, matched: false, suggestion });
      }
    }

    const unmatchedPayments = gatewayPayments
      .filter((p) => !linkedPaymentIdSet.has(p.id))
      .map((p) => {
        const split = splitGatewayRef(p.transactionRef);
        const hasTxn = split
          ? transactions.some((t) => t.externalRef === split.paymentId || t.externalRef === p.transactionRef)
          : transactions.some((t) => t.externalRef === p.transactionRef);
        return {
          id: p.id,
          receiptNumber: p.receiptNumber,
          amount: p.amount,
          status: p.status,
          transactionRef: p.transactionRef,
          gatewayPaymentId: split?.paymentId || "",
          orderId: split?.orderId || "",
          createdAt: p.createdAt,
          subscriber: p.Subscriber,
          invoiceNumber: p.Invoice?.invoiceNumber || "",
          hasGatewayRecord: hasTxn,
        };
      });

    return NextResponse.json({
      stats: {
        totalTransactions: transactions.length,
        matchedCount: matched.length,
        unmatchedTransactionCount: unmatchedTransactions.length,
        unmatchedPaymentCount: unmatchedPayments.filter((p) => !p.hasGatewayRecord).length,
      },
      matched: matched.slice(0, 100),
      unmatchedTransactions: unmatchedTransactions.slice(0, 100),
      unmatchedPayments: unmatchedPayments.slice(0, 100),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Reconcile GET error:", error);
    return NextResponse.json({ error: "Failed to load reconciliation data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const action = body.action;

    // ── sync-from-payments: ingest gateway refs from Payment rows ──
    if (action === "sync-from-payments") {
      await permissionFor(userId, "payments.verify");

      const gatewayPayments = await db.payment.findMany({
        where: { transactionRef: { contains: "|" } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true, amount: true, transactionRef: true, status: true, createdAt: true,
          Subscriber: { select: { name: true } },
        },
      });

      const activeConfig = await db.integrationConfig.findFirst({
        where: { type: "payment_gateway", enabled: true },
        orderBy: { updatedAt: "desc" },
        select: { id: true, provider: true },
      });

      let created = 0;
      let autoLinked = 0;
      let skipped = 0;

      for (const p of gatewayPayments) {
        const split = splitGatewayRef(p.transactionRef);
        if (!split) { skipped += 1; continue; }

        const existing = await db.integrationTransaction.findFirst({
          where: { OR: [{ externalRef: split.paymentId }, { externalRef: p.transactionRef }] },
        });

        if (existing) {
          // Backfill the link if the row exists but was never matched
          if (!existing.paymentId && existing.externalRef === split.paymentId) {
            await db.integrationTransaction.update({
              where: { id: existing.id },
              data: { paymentId: p.id },
            });
            autoLinked += 1;
          }
          continue;
        }

        await db.integrationTransaction.create({
          data: {
            integrationId: activeConfig?.id || null,
            gatewayType: activeConfig?.provider || "gateway",
            transactionType: "payment",
            amount: p.amount,
            status: p.status === "VERIFIED" ? "captured" : p.status.toLowerCase(),
            externalRef: split.paymentId,
            paymentId: p.id,
          },
        });
        created += 1;
        autoLinked += 1;
      }

      await auditLog(req, "CREATE", "IntegrationTransaction", "sync-from-payments", {
        created, autoLinked, skipped, by: userId,
      });

      return NextResponse.json({
        message: `Synced: ${created} gateway transaction(s) ingested, ${autoLinked} auto-linked to payments${skipped ? `, ${skipped} skipped (unrecognized ref format)` : ""}`,
        created,
        autoLinked,
        skipped,
      });
    }

    // ── link: manual match ──
    if (action === "link") {
      await permissionFor(userId, "payments.verify");
      const { transactionId, paymentId } = body;
      if (!transactionId || !paymentId) {
        return NextResponse.json({ error: "transactionId and paymentId are required" }, { status: 400 });
      }

      const [txn, payment] = await Promise.all([
        db.integrationTransaction.findUnique({ where: { id: transactionId } }),
        db.payment.findUnique({ where: { id: paymentId }, select: { id: true, amount: true, receiptNumber: true } }),
      ]);
      if (!txn || !payment) {
        return NextResponse.json({ error: "Transaction or payment not found" }, { status: 404 });
      }
      if (txn.paymentId && txn.paymentId !== paymentId) {
        return NextResponse.json({ error: "Transaction is already matched to another payment" }, { status: 409 });
      }
      if (Math.abs(txn.amount - payment.amount) > AMOUNT_TOLERANCE) {
        return NextResponse.json({
          error: `Amount mismatch: gateway ₹${round2(txn.amount)} vs payment ₹${round2(payment.amount)} (tolerance ₹${AMOUNT_TOLERANCE}). Refuse to link mismatched money.`,
        }, { status: 400 });
      }

      await db.integrationTransaction.update({
        where: { id: transactionId },
        data: { paymentId },
      });
      await auditLog(req, "UPDATE", "IntegrationTransaction", transactionId, {
        action: "link", paymentId, receipt: payment.receiptNumber, by: userId,
      });
      return NextResponse.json({ message: "Transaction linked to payment" });
    }

    // ── unlink: detach a wrong match ──
    if (action === "unlink") {
      await permissionFor(userId, "payments.verify");
      const { transactionId } = body;
      if (!transactionId) {
        return NextResponse.json({ error: "transactionId is required" }, { status: 400 });
      }
      const txn = await db.integrationTransaction.findUnique({ where: { id: transactionId } });
      if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      if (!txn.paymentId) return NextResponse.json({ error: "Transaction is not linked" }, { status: 400 });

      await db.integrationTransaction.update({
        where: { id: transactionId },
        data: { paymentId: null },
      });
      await auditLog(req, "UPDATE", "IntegrationTransaction", transactionId, {
        action: "unlink", previousPaymentId: txn.paymentId, by: userId,
      });
      return NextResponse.json({ message: "Transaction unlinked" });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Reconcile POST error:", error);
    return NextResponse.json({ error: "Reconciliation action failed" }, { status: 500 });
  }
}
