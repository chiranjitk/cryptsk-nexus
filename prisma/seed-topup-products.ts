// ═══════════════════════════════════════════════════════════════
// Seed demo TOP-UP PRODUCTS for the Top-Ups page — idempotent:
// skips when [DEMO] products already exist (FORCE=1 to re-apply).
// Run: bun run db:seed-topups
//
// Creates 6 active top-up products across the schema's TopUpType
// enum (DATA / TIME / SPEED_BOOST):
//   • 10 GB Data Booster ₹99 (15 days)      — DATA
//   • 50 GB Data Booster ₹199 (30 days)     — DATA
//   • 200 GB Data Mega Pack ₹499 (60 days)  — DATA
//   • Speed Boost 50 Mbps — 7 Days ₹149     — SPEED_BOOST
//   • Speed Boost 100 Mbps — 24 Hours ₹69   — SPEED_BOOST
//   • 24-Hour Unlimited Pass ₹49            — TIME
//
// Also seeds 5 demo SubscriberTopUp PURCHASES linked to real
// subscribers in the DB (skipped when they already exist, tagged by
// fixed ids) so the Purchase History tab demonstrates real flows.
//
// NOTE: the suggested OTT Bundle / Static IP / Voice Pack concepts
// are NOT representable — TopUpType only has DATA/TIME/SPEED_BOOST —
// so the closest in-catalogue products were seeded instead.
//
// Idempotency: rows are UPSERTed by FIXED ids and tagged "[DEMO]"
// in `description`. Products are NEVER deleted (FORCE only re-applies
// values), so existing SubscriberTopUp purchase rows keep working.
// ═══════════════════════════════════════════════════════════════
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// process is read via globalThis so this file type-checks clean under scoped
// tsconfigs with "types": [] (project doctrine) as well as with node types.
type ProcLike = { env?: Record<string, string | undefined>; exit?: (code?: number) => void };
const proc = (globalThis as { process?: ProcLike }).process;
const FORCE = proc?.env?.FORCE === "1";
const DEMO_TAG = "[DEMO]";

type TopUpTypeValue = "DATA" | "TIME" | "SPEED_BOOST";

interface ProductSpec {
  id: string;
  name: string;
  description: string;
  type: TopUpTypeValue;
  /** DATA → GB, TIME/SPEED_BOOST → hours (matches consume/purchase semantics in /api/top-ups) */
  value: number;
  validityHours: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
}

const PRODUCTS: ProductSpec[] = [
  { id: "tup-demo-data-10gb",   name: "10 GB Data Booster",            description: `${DEMO_TAG} Extra 10 GB high-speed data on top of your plan`, type: "DATA",        value: 10,  validityHours: 360,  price: 99,  isActive: true, sortOrder: 11 },
  { id: "tup-demo-data-50gb",   name: "50 GB Data Booster",            description: `${DEMO_TAG} Extra 50 GB high-speed data, valid for 30 days`,  type: "DATA",        value: 50,  validityHours: 720,  price: 199, isActive: true, sortOrder: 12 },
  { id: "tup-demo-data-200gb",  name: "200 GB Data Mega Pack",         description: `${DEMO_TAG} Bulk 200 GB data pack for heavy users, 60 days`,  type: "DATA",        value: 200, validityHours: 1440, price: 499, isActive: true, sortOrder: 13 },
  { id: "tup-demo-boost-50",    name: "Speed Boost 50 Mbps — 7 Days",  description: `${DEMO_TAG} Flat +50 Mbps on your base speed for 7 days`,     type: "SPEED_BOOST", value: 168, validityHours: 168,  price: 149, isActive: true, sortOrder: 14 },
  { id: "tup-demo-boost-100",   name: "Speed Boost 100 Mbps — 24 Hrs", description: `${DEMO_TAG} Flat +100 Mbps burst speed for 24 hours`,         type: "SPEED_BOOST", value: 24,  validityHours: 24,   price: 69,  isActive: true, sortOrder: 15 },
  { id: "tup-demo-time-24h",    name: "24-Hour Unlimited Pass",        description: `${DEMO_TAG} 24 hours of unlimited access / time extension`,   type: "TIME",        value: 24,  validityHours: 24,   price: 49,  isActive: true, sortOrder: 16 },
];

async function main() {
  console.log("── seed-topups: starting ──");

  const existingDemo = await db.topUpProduct.count({ where: { description: { contains: DEMO_TAG } } });
  if (existingDemo > 0 && !FORCE) {
    console.log(`Found ${existingDemo} demo top-up products — skipping (FORCE=1 to re-apply).`);
    await db.$disconnect();
    return;
  }
  if (existingDemo > 0 && FORCE) {
    console.log(`FORCE=1 — re-applying values on ${existingDemo} demo top-up products (products are never deleted; existing purchases stay linked).`);
  }

  for (const spec of PRODUCTS) {
    await db.topUpProduct.upsert({
      where: { id: spec.id },
      update: {
        name: spec.name,
        description: spec.description,
        type: spec.type,
        value: spec.value,
        validityHours: spec.validityHours,
        price: spec.price,
        isActive: spec.isActive,
        sortOrder: spec.sortOrder,
      },
      create: {
        id: spec.id,
        name: spec.name,
        description: spec.description,
        type: spec.type,
        value: spec.value,
        validityHours: spec.validityHours,
        price: spec.price,
        isActive: spec.isActive,
        sortOrder: spec.sortOrder,
      },
    });
  }

  const byType = await db.topUpProduct.groupBy({ by: ["type"], _count: { id: true }, where: { description: { contains: DEMO_TAG } } });
  const spread = byType.map((t) => `${t.type}:${t._count.id}`).join(", ");
  const total = await db.topUpProduct.count({ where: { description: { contains: DEMO_TAG } } });
  console.log(`  top-up products seeded: ${total} (${spread})`);

  // ── Demo purchases: link demo products to real subscribers ──
  const subscribers = await db.subscriber.findMany({
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, name: true, code: true },
  });
  if (subscribers.length === 0) {
    console.log("  no subscribers found — skipping demo purchases");
  } else {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const purchaseSpecs = [
      { id: "stub-demo-1", productId: "tup-demo-data-50gb",  sub: 0, daysAgo: 12, status: "ACTIVE" as const,  usedFraction: 0.4 },
      { id: "stub-demo-2", productId: "tup-demo-data-10gb",  sub: 1, daysAgo: 6,  status: "ACTIVE" as const,  usedFraction: 0.7 },
      { id: "stub-demo-3", productId: "tup-demo-boost-50",   sub: 2, daysAgo: 20, status: "EXPIRED" as const, usedFraction: 1.0 },
      { id: "stub-demo-4", productId: "tup-demo-time-24h",   sub: 3, daysAgo: 30, status: "EXPIRED" as const, usedFraction: 1.0 },
      { id: "stub-demo-5", productId: "tup-demo-data-200gb", sub: 4 % Math.max(subscribers.length, 1), daysAgo: 3, status: "ACTIVE" as const, usedFraction: 0.15 },
    ];
    let created = 0;
    for (const spec of purchaseSpecs) {
      const subscriber = subscribers[spec.sub % subscribers.length];
      if (!subscriber) continue;
      const product = await db.topUpProduct.findUnique({ where: { id: spec.productId } });
      if (!product) continue;
      const purchasedAt = new Date(now - spec.daysAgo * DAY);
      const expiresAt = new Date(purchasedAt.getTime() + product.validityHours * 60 * 60 * 1000);
      const existingRow = await db.subscriberTopUp.findUnique({ where: { id: spec.id } });
      if (existingRow) continue;
      await db.subscriberTopUp.create({
        data: {
          id: spec.id,
          subscriberId: subscriber.id,
          topUpProductId: product.id,
          purchasedAt,
          expiresAt,
          usedAmount: Math.round(product.value * spec.usedFraction * 10) / 10,
          remainingAmount: Math.round(product.value * (1 - spec.usedFraction) * 10) / 10,
          status: spec.status,
        },
      });
      created += 1;
    }
    console.log(`  demo purchases created: ${created} (real subscribers × demo products)`);
  }

  console.log(`── seed-topups: done ──`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ seed-topups failed:", e);
  await db.$disconnect();
  proc?.exit(1);
});
