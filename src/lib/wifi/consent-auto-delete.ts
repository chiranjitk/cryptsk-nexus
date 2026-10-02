/**
 * Consent Auto-Delete Service (GDPR Article 17 — Right to Erasure)
 *
 * Purges expired WiFiConsentLog records to comply with GDPR data retention
 * requirements. A consent record is considered expired when its `expiresAt`
 * has passed, or (edge case) when `createdAt` + `dataRetentionDays` days
 * have elapsed even if `expiresAt` was not set.
 */

import { db } from '@/lib/db';

export interface ConsentPurgeResult {
  deleted: number;
  byTenant: Record<string, number>;
}

/**
 * Purge all expired WiFiConsentLog records.
 *
 * Two criteria are checked:
 * 1. `expiresAt < NOW()` — the record has an explicit expiry that has passed.
 * 2. `expiresAt` is in the far future or missing — fallback to
 *    `createdAt + dataRetentionDays` days < NOW().
 *
 * Both conditions are OR-ed so any record matching either is deleted.
 */
export async function purgeExpiredConsents(): Promise<ConsentPurgeResult> {
  const now = new Date();

  // -------------------------------------------------------------------------
  // 1. Fetch expired records grouped by tenant so we can report per-tenant
  //    counts before deleting them.
  // -------------------------------------------------------------------------
  const expiredRecords = await db.wiFiConsentLog.findMany({
    where: {
      OR: [
        // Primary: explicit expiresAt has passed
        { expiresAt: { lt: now } },
        // Edge case: createdAt + dataRetentionDays has passed
        {
          createdAt: {
            lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), // max retention
          },
        },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      dataRetentionDays: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  // Filter using the exact `dataRetentionDays` per record for the edge case
  const idsToDelete: string[] = [];
  const byTenant: Record<string, number> = {};

  for (const record of expiredRecords) {
    const expiresAtPassed = record.expiresAt < now;
    const retentionPassed =
      new Date(
        record.createdAt.getTime() +
          record.dataRetentionDays * 24 * 60 * 60 * 1000
      ) < now;

    if (expiresAtPassed || retentionPassed) {
      idsToDelete.push(record.id);
      byTenant[record.tenantId] = (byTenant[record.tenantId] || 0) + 1;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Delete in batches of 500 to avoid long-running transactions
  // -------------------------------------------------------------------------
  let deleted = 0;
  const BATCH_SIZE = 500;

  for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
    const batch = idsToDelete.slice(i, i + BATCH_SIZE);
    const result = await db.wiFiConsentLog.deleteMany({
      where: { id: { in: batch } },
    });
    deleted += result.count;
  }

  console.log(
    `[GDPR] Purged ${deleted} expired consent records across ${Object.keys(byTenant).length} tenant(s)`
  );

  return { deleted, byTenant };
}
