/**
 * One-time data migration: Plan speeds stored as Kbps under speedUnit "MBPS" → convert to real Mbps
 *
 * Historical bug: prisma/seed.ts stored Kbps values (30720/15360, 51200/25600, ...) without setting
 * speedUnit, so the schema default "MBPS" applied and the UI rendered "30720 MBPS" for a 30 Mbps plan.
 *
 * Guard: only rows with speedUnit === "MBPS" AND at least one speed field > 1024 are touched,
 * which makes the script idempotent (real Mbps values like 30/50/100 are never re-divided).
 *
 * Usage: cd /home/z/my-project && DATABASE_URL=postgresql://... bun scripts/migrate-plan-speeds-to-mbps.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KBPS_PER_MBPS = 1024;
const toMbps = (v: number) => Math.round(v / KBPS_PER_MBPS);

function printTable(title: string, rows: { name: string; dl: number; ul: number; dlFup: number | null; ulFup: number | null }[]) {
  console.log(`\n${title}`);
  console.log(
    "|".padEnd(4) +
      "Plan".padEnd(24) +
      "DL".padStart(8) +
      "UL".padStart(8) +
      "DL FUP".padStart(9) +
      "UL FUP".padStart(9)
  );
  console.log("-".repeat(62));
  for (const r of rows) {
    console.log(
      "|".padEnd(4) +
        r.name.slice(0, 22).padEnd(24) +
        String(r.dl).padStart(8) +
        String(r.ul).padStart(8) +
        String(r.dlFup ?? "—").padStart(9) +
        String(r.ulFup ?? "—").padStart(9)
    );
  }
}

async function main() {
  console.log("=== Migrate Plan speeds Kbps → Mbps ===");

  const plans = await prisma.plan.findMany({
    select: {
      id: true,
      name: true,
      speedUnit: true,
      downloadSpeed: true,
      uploadSpeed: true,
      downloadSpeedFup: true,
      uploadSpeedFup: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  printTable(
    `BEFORE (${plans.length} plan(s) in DB):`,
    plans.map((p) => ({
      name: p.name,
      dl: p.downloadSpeed,
      ul: p.uploadSpeed,
      dlFup: p.downloadSpeedFup,
      ulFup: p.uploadSpeedFup,
    }))
  );

  const affected = plans.filter(
    (p) =>
      p.speedUnit === "MBPS" &&
      (p.downloadSpeed > KBPS_PER_MBPS ||
        p.uploadSpeed > KBPS_PER_MBPS ||
        (p.downloadSpeedFup ?? 0) > KBPS_PER_MBPS ||
        (p.uploadSpeedFup ?? 0) > KBPS_PER_MBPS)
  );

  console.log(`\n${affected.length} plan(s) need conversion (speedUnit=MBPS + a speed field > 1024).`);

  let migrated = 0;
  for (const plan of affected) {
    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        downloadSpeed: toMbps(plan.downloadSpeed),
        uploadSpeed: toMbps(plan.uploadSpeed),
        ...(plan.downloadSpeedFup != null && { downloadSpeedFup: toMbps(plan.downloadSpeedFup) }),
        ...(plan.uploadSpeedFup != null && { uploadSpeedFup: toMbps(plan.uploadSpeedFup) }),
      },
    });
    migrated++;
  }

  const after = await prisma.plan.findMany({
    select: {
      name: true,
      speedUnit: true,
      downloadSpeed: true,
      uploadSpeed: true,
      downloadSpeedFup: true,
      uploadSpeedFup: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  printTable(
    `AFTER (migrated ${migrated} plan(s), speedUnit per row: ${[...new Set(after.map((p) => p.speedUnit))].join(", ")}):`,
    after.map((p) => ({
      name: p.name,
      dl: p.downloadSpeed,
      ul: p.uploadSpeed,
      dlFup: p.downloadSpeedFup,
      ulFup: p.uploadSpeedFup,
    }))
  );

  console.log("\n✅ Migration complete. Script is idempotent — re-running is a no-op.");
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
