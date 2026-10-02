import { db } from "@/lib/db";

/**
 * [AUDIT-FIX F-12] Single source of truth for invoice numbering.
 *
 * The platform previously had FOUR competing generators:
 *   - INV-00001  (bulk renew / invoices route — max-scan of LATEST row only)
 *   - INV000001  (billing route — count()+offset, race-prone)
 *   - INV-<code>-001 (subscriber creation)
 *   - INV-<ts36>-<rand> (bulk-generate)
 *   plus the billing-cron's own prefix/count scheme.
 *
 * Cross-format dedupe relied on the unique index + ad-hoc retries. This allocator
 * scans ALL historic numbers that match the canonical `INV-<digits>` form and takes
 * the true MAX, so numbering stays dense and collision-free regardless of which
 * legacy format the newest invoice has. Callers still retry on P2002.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const rows = await db.$queryRaw<Array<{ max_num: string | null }>>`
    SELECT MAX(NULLIF(regexp_replace("invoiceNumber", '^INV-', ''), '')::bigint)::text AS max_num
    FROM "Invoice"
    WHERE "invoiceNumber" ~ '^INV-[0-9]+$'
  `;
  const next = rows?.[0]?.max_num ? parseInt(rows[0].max_num, 10) + 1 : 1;
  return `INV-${String(next).padStart(5, "0")}`;
}
