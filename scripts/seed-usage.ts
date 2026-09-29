import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get all active subscribers
  const subscribers = await prisma.subscriber.findMany({
    where: { status: "ACTIVE" },
    include: { plan: true },
  });

  console.log(`Seeding usage data for ${subscribers.length} active subscribers...`);

  const today = new Date();
  const records: { subscriberId: string; date: string; downloadMb: number; uploadMb: number; totalMb: number }[] = [];

  for (const sub of subscribers) {
    const dataLimitGb = sub.plan?.dataLimitGb || 500; // Default 500GB
    const dailyAvgMb = (dataLimitGb * 1024) / 30; // Average daily usage in MB

    for (let daysAgo = 89; daysAgo >= 0; daysAgo--) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysAgo);
      const dateStr = date.toISOString().slice(0, 10);

      // Random variance: 40% to 160% of daily average
      const variance = 0.4 + Math.random() * 1.2;
      const download = Math.round(dailyAvgMb * 0.7 * variance * 100) / 100;
      const upload = Math.round(dailyAvgMb * 0.3 * variance * 100) / 100;
      const total = Math.round((download + upload) * 100) / 100;

      records.push({
        subscriberId: sub.id,
        date: dateStr,
        downloadMb: download,
        uploadMb: upload,
        totalMb: total,
      });
    }
  }

  // Insert in batches to avoid timeout
  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await prisma.dataUsage.createMany({
      data: batch,
      // skipDuplicates not supported in SQLite
    });
    inserted += batch.length;
    if (i % 2000 === 0) console.log(`  Inserted ${inserted}/${records.length} records...`);
  }

  console.log(`\n✅ Seeded ${inserted} usage records (${subscribers.length} subscribers × 90 days)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
