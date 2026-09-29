/**
 * One-time seed script: Auto-create RadiusGroup for existing Plans that have groupId: null
 *
 * Usage: cd /home/z/my-project && bun run scripts/sync-plan-groups.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Sync Plan → RadiusGroup ===\n");

  // Find all plans without a linked group
  const plans = await prisma.plan.findMany({
    where: { groupId: null },
  });

  console.log(`Found ${plans.length} plan(s) without a RADIUS group.\n`);

  if (plans.length === 0) {
    console.log("All plans already have a linked group. Nothing to do.");
    return;
  }

  let created = 0;
  let skipped = 0;
  let linked = 0;

  for (const plan of plans) {
    const groupName = plan.name;
    const dataLimitMb = plan.dataLimitGb ? Math.round(plan.dataLimitGb * 1024) : null;

    // Check if a group with this name already exists
    const existingGroup = await prisma.radiusGroup.findUnique({
      where: { name: groupName },
    });

    if (existingGroup) {
      // Link the plan to the existing group
      await prisma.plan.update({
        where: { id: plan.id },
        data: { groupId: existingGroup.id },
      });
      console.log(`  ✓ Plan "${plan.name}" → linked to existing group "${existingGroup.name}" (↓${plan.downloadSpeed}/↑${plan.uploadSpeed} Kbps)`);
      linked++;
    } else {
      // Create a new group and link it
      try {
        const group = await prisma.radiusGroup.create({
          data: {
            name: groupName,
            description: `Auto-generated for plan: ${plan.name}`,
            speedLimitDown: plan.downloadSpeed,
            speedLimitUp: plan.uploadSpeed,
            dataLimit: dataLimitMb,
          },
        });

        await prisma.plan.update({
          where: { id: plan.id },
          data: { groupId: group.id },
        });

        const dataLimitStr = dataLimitMb ? `${dataLimitMb} MB` : "unlimited";
        console.log(`  ✓ Plan "${plan.name}" → created group "${group.name}" (↓${plan.downloadSpeed}/↑${plan.uploadSpeed} Kbps, data: ${dataLimitStr})`);
        created++;
      } catch (error: any) {
        if (error?.code === "P2002") {
          console.log(`  ✗ Plan "${plan.name}" → group name "${groupName}" conflict (unique constraint), skipped`);
          skipped++;
        } else {
          console.error(`  ✗ Plan "${plan.name}" → error: ${error.message}`);
          skipped++;
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Groups created : ${created}`);
  console.log(`  Groups linked : ${linked}`);
  console.log(`  Skipped       : ${skipped}`);
  console.log(`  Total plans   : ${plans.length}`);
}

main()
  .catch((err) => {
    console.error("Script error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
