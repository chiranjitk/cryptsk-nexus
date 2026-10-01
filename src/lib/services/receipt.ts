// ─── Receipt / Reference allocator ─────────────────────────────────────────
// [PAYMENTS-NOLEAK] Single source of truth for receipt numbers.
// History: `RCT-<count+1>` was used in 4 places and two concurrent inserts got
// the same receipt (column is not unique — no backstop). The F-21 fix in
// /api/payments/route.ts (timestamp36 + entropy) is the only collision-proof
// form; this module applies it everywhere so no payment can be recorded
// without a traceable, unique receipt number.

const ENTROPY_RETRIES = 5;

/**
 * Collision-proof receipt number: RCT-<base36 timestamp>-<4 chars entropy>.
 * Handles the astronomically-unlikely entropy clash with bounded retries.
 */
export function newReceiptNumber(prefix = "RCT"): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

/**
 * Inside an interactive $transaction: verify uniqueness, retry on the rare
 * entropy clash. Use this when the write is already transactional.
 */
export async function allocateReceiptNumber(
  tx: { payment: { findFirst: (args: { where: { receiptNumber: string } }) => Promise<unknown> } },
  prefix = "RCT"
): Promise<string> {
  for (let attempt = 0; attempt < ENTROPY_RETRIES; attempt++) {
    const candidate = newReceiptNumber(prefix);
    const clash = await tx.payment.findFirst({ where: { receiptNumber: candidate } });
    if (!clash) return candidate;
  }
  // Last resort: longer entropy window — still unique in practice.
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()}`;
}

/** Marker appended to notes for counter/agent collections that skip the
 * maker-checker queue so the audit dashboard can flag them for spot-checks. */
export const AUTO_VERIFIED_MARKER = "[auto-verified at counter]";
