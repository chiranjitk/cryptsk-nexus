/**
 * Migrate Subscriber.currentSpeedDown / currentSpeedUp from legacy Kbps → Mbps.
 *
 * Context: Plans were migrated to Mbps storage (scripts/migrate-plan-speeds-to-mbps.ts,
 * QA8). The per-subscriber provisioned speeds still hold Kbps values (e.g. 40960),
 * which surfaces as "40960 Mbps" in the self-care portal and quick view.
 *
 * Idempotent: rows already in Mbps (all values ≤ 1024) are skipped.
 * Safe: divides by 1024 with Math.round, matching the plan migration.
 *
 * Run: DATABASE_URL=... bun scripts/migrate-subscriber-speeds-to-mbps.ts
 */
import { PrismaClient } from "@prisma/client";

const DATABASE_URL =
  process.env.DATABASE_URL?.startsWith("postgres") // shell env may hold a stale file:sqlite override
    ? process.env.DATABASE_URL
    : "postgresql://cryptsknexus:nexus_pg_2026@127.0.0.1:5432/cryptsknexus";

const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

const SPEED_FIELDS = ["currentSpeedDown", "currentSpeedUp"] as const;

async function main() {
  const subscribers = await db.subscriber.findMany({
    select: { id: true, code: true, currentSpeedDown: true, currentSpeedUp: true },
  });

  const needs = subscribers.filter(
    (s) => (s.currentSpeedDown ?? 0) > 1024 || (s.currentSpeedUp ?? 0) > 1024
  );

  console.log(`Subscribers: ${subscribers.length} · need conversion: ${needs.length}`);
  if (needs.length === 0) {
    console.log("All subscriber speeds already in Mbps — nothing to do.");
    return;
  }

  console.log("\nBEFORE → AFTER (Kbps → Mbps, ÷1024):");
  for (const s of needs) {
    const down = s.currentSpeedDown ? Math.round(s.currentSpeedDown / 1024) : null;
    const up = s.currentSpeedUp ? Math.round(s.currentSpeedUp / 1024) : null;
    console.log(
      `  ${s.code}: down ${s.currentSpeedDown ?? "—"} → ${down ?? "—"} · up ${s.currentSpeedUp ?? "—"} → ${up ?? "—"}`
    );
    await db.subscriber.update({
      where: { id: s.id },
      data: {
        ...(s.currentSpeedDown != null && { currentSpeedDown: down }),
        ...(s.currentSpeedUp != null && { currentSpeedUp: up }),
      },
    });
  }

  const after = await db.subscriber.findMany({
    select: { code: true, ...Object.fromEntries(SPEED_FIELDS.map((f) => [f, true])) },
  });
  const stillLegacy = after.filter(
    (s) => (s.currentSpeedDown ?? 0) > 1024 || (s.currentSpeedUp ?? 0) > 1024
  );
  console.log(`\nDone. Converted ${needs.length} subscriber(s). Remaining legacy rows: ${stillLegacy.length}`);
  if (stillLegacy.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
