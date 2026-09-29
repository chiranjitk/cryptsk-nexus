import { db } from "../src/lib/db";

// ============================================================
// CRYPTSK Nexus — Monitoring module permissions (one-off, idempotent)
// Run: DATABASE_URL=postgresql://cryptsknexus:nexus_pg_2026@localhost:5432/cryptsknexus \
//        bun run prisma/seed-monitoring.ts
// Adds the "monitoring" resource permissions (monitoring.list,
// monitoring.update) WITHOUT re-running the full seed, then links
// them exactly like ticket.list was granted by seed.ts:
//   - Super Administrator: ALL permissions (seed.ts step 3 blanket)
//   - Read-only Auditor:   read/list/export blanket (seed.ts step 4)
// "monitoring" is also added to seed.ts RESOURCES so future full
// seeds create all 9 monitoring.* actions automatically.
// ============================================================

const MONITORING_PERMISSIONS = [
  { resource: "monitoring", action: "list" as const, description: "list monitoring" },
  { resource: "monitoring", action: "update" as const, description: "update monitoring" },
];

async function main() {
  console.log("🌱 CRYPTSK Nexus — Monitoring permission seed starting…\n");

  // ── 1. Upsert the two monitoring permissions (same shape as seed.ts step 2) ──
  const permIds: Record<string, string> = {};
  for (const p of MONITORING_PERMISSIONS) {
    const perm = await db.permission.upsert({
      where: { resource_action: { resource: p.resource, action: p.action } },
      update: { description: p.description, isSystem: true },
      create: { resource: p.resource, action: p.action, description: p.description, isSystem: true },
    });
    permIds[`${p.resource}.${p.action}`] = perm.id;
    console.log(`   ✓ permission upserted: ${p.resource}.${p.action} (${perm.id})`);
  }
  console.log("");

  // ── 2. Grant both to Super Administrator (matches ticket.list grant path) ──
  const superAdmin = await db.role.findUnique({ where: { slug: "super_admin" } });
  if (!superAdmin) throw new Error("Super Administrator role not found");
  for (const permId of Object.values(permIds)) {
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: permId } },
      update: {},
      create: { roleId: superAdmin.id, permissionId: permId },
    });
  }
  console.log("   ✓ monitoring.list + monitoring.update → Super Administrator");

  // ── 3. Grant monitoring.list to Read-only Auditor (read/list/export blanket) ──
  const auditor = await db.role.findUnique({ where: { slug: "auditor" } });
  if (auditor) {
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: auditor.id, permissionId: permIds["monitoring.list"] } },
      update: {},
      create: { roleId: auditor.id, permissionId: permIds["monitoring.list"] },
    });
    console.log("   ✓ monitoring.list → Read-only Auditor");
  }

  // ── 4. Flip the Monitoring module to active (one-off for the live DB) ──
  const monitoringModule = await db.module.update({
    where: { slug: "monitoring" },
    data: { status: "active", installedAt: new Date(), enabledAt: new Date() },
  });
  console.log(`   ✓ module "${monitoringModule.slug}" status → ${monitoringModule.status}`);

  // ── 5. Verify: super_admin role now holds monitoring.list ──
  const verify = await db.role.findUnique({
    where: { slug: "super_admin" },
    include: { permissions: { include: { permission: true } } },
  });
  const held = verify?.permissions
    .map((rp) => `${rp.permission.resource}.${rp.permission.action}`)
    .filter((k) => k.startsWith("monitoring."));
  console.log("\n   Verify — super_admin monitoring permissions:", held?.join(", "));
  if (!held?.includes("monitoring.list") || !held?.includes("monitoring.update")) {
    throw new Error("Verification failed: super_admin is missing monitoring permissions");
  }
  console.log("\n✅ MONITORING PERMISSION SEED COMPLETE (verified)");
}

main()
  .catch((e) => {
    console.error("❌ Monitoring seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
