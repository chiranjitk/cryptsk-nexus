/**
 * seed-side-revenue.ts — demo data for the Side Revenue report (Phase 2).
 * Idempotent: skips any section whose rows already exist.
 * Run:  DATABASE_URL=postgresql://... bun scripts/seed-side-revenue.ts
 */
import { PrismaClient, VoucherStatus, SubscriberAddOnStatus } from "@prisma/client";

const db = new PrismaClient();

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function seedAddOnServices() {
  const existing = await db.addOnService.count();
  if (existing > 0) {
    console.log(`  ⏭️  ${existing} add-on service(s) already exist, skipping`);
    return;
  }
  const defs = [
    { name: "Premium OTT Bundle", description: "Streaming bundle add-on", chargeType: "FLAT" as const, chargeValue: 99, validityDays: 30 },
    { name: "Extra 100 GB Data", description: "One-time data pack", chargeType: "FLAT" as const, chargeValue: 149, validityDays: 30 },
    { name: "Static IP", description: "Dedicated public IPv4", chargeType: "PER_MONTH" as const, chargeValue: 199, validityDays: 30 },
    { name: "Dual Band WiFi Router Rental", description: "Monthly router rental", chargeType: "PER_MONTH" as const, chargeValue: 79, validityDays: 30 },
  ];
  for (const d of defs) await db.addOnService.create({ data: d });
  console.log(`  ✅ add-on services seeded: ${defs.length}`);
}

async function seedSubscriberAddOns() {
  const existing = await db.subscriberAddOn.count();
  if (existing > 0) {
    console.log(`  ⏭️  ${existing} subscriber add-on(s) already exist, skipping`);
    return;
  }
  const subs = await db.subscriber.findMany({ where: { status: "ACTIVE" }, take: 6, orderBy: { code: "asc" } });
  const services = await db.addOnService.findMany({ orderBy: { sortOrder: "asc" } });
  if (subs.length === 0 || services.length === 0) {
    console.log("  ⚠️  no active subscribers/services — skipping purchases");
    return;
  }
  let n = 0;
  for (let i = 0; i < Math.min(subs.length, 6); i++) {
    const svc = services[i % services.length];
    await db.subscriberAddOn.create({
      data: {
        subscriberId: subs[i].id,
        addOnServiceId: svc.id,
        startDate: daysAgo(3 + i * 4),
        chargeAmount: svc.chargeValue,
        status: SubscriberAddOnStatus.ACTIVE,
        autoRenew: i % 2 === 0,
      },
    });
    n++;
  }
  // one EXPIRED historical purchase for realism
  if (subs.length > 2) {
    await db.subscriberAddOn.create({
      data: {
        subscriberId: subs[2].id,
        addOnServiceId: services[0].id,
        startDate: daysAgo(40),
        endDate: daysAgo(10),
        chargeAmount: services[0].chargeValue,
        status: SubscriberAddOnStatus.EXPIRED,
      },
    });
    n++;
  }
  console.log(`  ✅ subscriber add-on purchases created: ${n}`);
}

async function seedVouchers() {
  const existing = await db.voucher.count();
  if (existing > 0) {
    console.log(`  ⏭️  ${existing} voucher(s) already exist, skipping`);
    return;
  }
  const subs = await db.subscriber.findMany({ where: { status: { in: ["ACTIVE", "TRIAL"] } }, take: 5, orderBy: { code: "asc" } });
  const codes = [
    { code: "VCH-SIDE-001", denomination: 100, validityDays: 30, days: 2 },
    { code: "VCH-SIDE-002", denomination: 250, validityDays: 30, days: 5 },
    { code: "VCH-SIDE-003", denomination: 500, validityDays: 30, days: 9 },
    { code: "VCH-SIDE-004", denomination: 100, validityDays: 30, days: 14 },
    { code: "VCH-SIDE-005", denomination: 250, validityDays: 30, days: 21 },
  ];
  let n = 0;
  for (let i = 0; i < codes.length; i++) {
    const used = i < 3 && subs[i]; // first 3 USED (side revenue), rest ACTIVE inventory
    await db.voucher.create({
      data: {
        code: codes[i].code,
        denomination: codes[i].denomination,
        validityDays: codes[i].validityDays,
        status: used ? VoucherStatus.USED : VoucherStatus.ACTIVE,
        usedBySubscriberId: used ? subs[i].id : null,
        usedAt: used ? daysAgo(codes[i].days) : null,
      },
    });
    n++;
  }
  console.log(`  ✅ vouchers created: ${n} (3 USED → side revenue)`);
}

async function main() {
  console.log("── seed-side-revenue: starting ──");
  await seedAddOnServices();
  await seedSubscriberAddOns();
  await seedVouchers();
  const [svc, purch, vch] = [await db.addOnService.count(), await db.subscriberAddOn.count(), await db.voucher.count()];
  console.log(`── seed-side-revenue: done (services ${svc}, purchases ${purch}, vouchers ${vch}) ──`);
}

main()
  .catch((e) => {
    console.error("seed-side-revenue failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
