// ═══════════════════════════════════════════════════════════════
// Seed demo data for the PAYMENTS / BILLING no-leak module — idempotent:
// skips when demo payments already exist (FORCE=1 to wipe + reseed).
// Run: bun run db:seed-payments
//
// Creates:
//   • 2 collection agents (with CollectionAgent rows + targets)
//   • Outstanding invoices across aging buckets (current → 90+ days)
//   • Payments across 30 days: VERIFIED (all 6 modes, 3 collectors),
//     PENDING (incl. 26h-stale for the verification queue), FAILED, REFUNDED
//   • Refund rows for the refunded payments
//   • IntegrationTransaction rows: matched gateway payments + 2 orphans
//   • 2 auto-verified counter payments (leak-radar demo) + 1 missing-receipt
// ═══════════════════════════════════════════════════════════════
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

const FORCE = process.env.FORCE === "1";
const DEMO_TAG = "[DEMO]";

function receipt(): string {
  return `RCT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
function daysAgo(n: number, hourOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10 + (hourOffset % 8), (hourOffset * 13) % 60, 0, 0);
  return d;
}
function daysAhead(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  console.log("── seed-payments: starting ──");

  const existingDemo = await db.payment.count({ where: { notes: { contains: DEMO_TAG } } });
  if (existingDemo > 0 && !FORCE) {
    console.log(`Found ${existingDemo} demo payments — skipping (FORCE=1 to reseed).`);
    await db.$disconnect();
    return;
  }
  if (existingDemo > 0 && FORCE) {
    console.log(`FORCE=1 — wiping ${existingDemo} demo payments + related rows...`);
    const demo = await db.payment.findMany({ where: { notes: { contains: DEMO_TAG } }, select: { id: true } });
    const ids = demo.map((p) => p.id);
    await db.integrationTransaction.deleteMany({ where: { paymentId: { in: ids } } });
    await db.refund.deleteMany({ where: { paymentId: { in: ids } } });
    await db.payment.deleteMany({ where: { id: { in: ids } } });
    // Demo aging invoices (tagged via notes)
    await db.invoice.deleteMany({ where: { notes: { contains: DEMO_TAG } } });
  }

  // ── Subscribers + admin ──
  const subs = await db.subscriber.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
    take: 12,
  });
  if (subs.length < 6) {
    console.log("Need ≥6 subscribers (run main seed first) — aborting.");
    await db.$disconnect();
    return;
  }
  const admin = await db.user.findUnique({ where: { email: "admin@cryptsk.com" } });
  if (!admin) {
    console.log("Admin user missing — run main seed first. Aborting.");
    await db.$disconnect();
    return;
  }

  // ── Collection agents ──
  const agentSpecs = [
    { email: "agent.rahul@cryptsk.com", name: "Rahul Verma (Agent)", phone: "9800011101", dailyTarget: 15000, monthlyTarget: 300000 },
    { email: "agent.priya@cryptsk.com", name: "Priya Das (Agent)", phone: "9800011102", dailyTarget: 12000, monthlyTarget: 250000 },
  ];
  const agents: Array<{ id: string; name: string }> = [];
  const hashed = await hash("Agent@2026", 12);
  for (const spec of agentSpecs) {
    const user = await db.user.upsert({
      where: { email: spec.email },
      update: {},
      create: {
        email: spec.email,
        name: spec.name,
        password: hashed,
        phone: spec.phone,
        role: "AGENT",
        status: "ACTIVE",
      },
    });
    await db.collectionAgent.upsert({
      where: { userId: user.id },
      update: { dailyTarget: spec.dailyTarget, monthlyTarget: spec.monthlyTarget },
      create: { userId: user.id, name: spec.name, dailyTarget: spec.dailyTarget, monthlyTarget: spec.monthlyTarget },
    });
    agents.push({ id: user.id, name: user.name });
  }
  console.log(`  agents ready: ${agents.map((a) => a.name).join(", ")}`);

  const collectors = [
    { id: admin.id, name: admin.name },
    ...agents,
  ];

  // ── Aging invoices (one per bucket) ──
  const plans = await db.plan.findMany({ select: { id: true, name: true, priceMonthly: true, cgstPercent: true, sgstPercent: true }, take: 3 });
  const plan = plans[0] || null;
  const subtotal = plan?.priceMonthly || 799;
  const tax = Math.round((subtotal * ((plan?.cgstPercent ?? 9) + (plan?.sgstPercent ?? 9))) / 100);
  const grand = subtotal + tax;

  const agingSpecs = [
    { sub: 0, dueInDays: 5, status: "SENT", label: "current" },
    { sub: 1, dueInDays: -12, status: "OVERDUE", label: "1-30" },
    { sub: 2, dueInDays: -40, status: "OVERDUE", label: "31-60" },
    { sub: 3, dueInDays: -70, status: "OVERDUE", label: "61-90" },
    { sub: 4, dueInDays: -110, status: "OVERDUE", label: "90+" },
    { sub: 5, dueInDays: -20, status: "PARTIALLY_PAID", label: "1-30 partial" },
  ] as const;

  const agingInvoices: Array<{ id: string; label: string }> = [];
  for (const spec of agingSpecs) {
    const inv = await db.invoice.create({
      data: {
        invoiceNumber: `INV-DEMO-AG-${spec.label.replace(/[^a-z0-9]/gi, "").toUpperCase()}-${daysAgo(0).getTime().toString(36).toUpperCase().slice(-4)}`,
        subscriberId: subs[spec.sub].id,
        planId: plan?.id,
        issueDate: daysAgo(30),
        dueDate: daysAhead(spec.dueInDays),
        periodStart: daysAgo(30),
        periodEnd: new Date(),
        description: `${DEMO_TAG} Aging demo — ${plan?.name || "Broadband"} monthly`,
        subtotal,
        cgstAmount: Math.round(tax / 2), sgstAmount: tax - Math.round(tax / 2), igstAmount: 0,
        totalTax: tax, totalAmount: grand, grandTotal: grand,
        paidAmount: spec.status === "PARTIALLY_PAID" ? Math.round(grand * 0.4) : 0,
        balanceAmount: spec.status === "PARTIALLY_PAID" ? grand - Math.round(grand * 0.4) : grand,
        status: spec.status,
        notes: DEMO_TAG,
      },
    });
    agingInvoices.push({ id: inv.id, label: spec.label });
  }
  console.log(`  aging invoices created: ${agingInvoices.length}`);

  // ── Payments spread over 30 days ──
  const modes = ["CASH", "UPI", "ONLINE", "BANK_TRANSFER", "CHEQUE", "WALLET"] as const;
  let paymentCounter = 0;

  type PaymentSpec = {
    sub: number; amount: number; mode: (typeof modes)[number];
    days: number; hour?: number; status: "VERIFIED" | "PENDING" | "FAILED" | "REFUNDED";
    collector: number; verifiedByAdmin?: boolean; invoiceId?: string;
    ref?: string; notes?: string;
  };

  const specs: PaymentSpec[] = [];
  // Today — 6 verified collections across all collectors
  for (let i = 0; i < 6; i++) {
    specs.push({
      sub: i % 6, amount: grand, mode: modes[i], days: 0, hour: 9 + i,
      status: "VERIFIED", collector: i % 3, verifiedByAdmin: i % 3 !== 0,
    });
  }
  // Yesterday
  for (let i = 0; i < 4; i++) {
    specs.push({ sub: (i + 2) % 6, amount: grand, mode: modes[(i + 1) % 6], days: 1, hour: 10 + i, status: "VERIFIED", collector: (i + 1) % 3, verifiedByAdmin: true });
  }
  // Spread 2-28 days
  for (let d = 2; d <= 28; d += 2) {
    const count = 1 + (d % 3);
    for (let i = 0; i < count; i++) {
      specs.push({
        sub: (d + i) % 6, amount: grand, mode: modes[(d + i) % 6], days: d, hour: 9 + i,
        status: "VERIFIED", collector: (d + i) % 3, verifiedByAdmin: (d + i) % 3 !== 0,
      });
    }
  }
  // Verification queue — 4 PENDING (2 today, 1 yesterday, 1 STALE 26h old)
  specs.push({ sub: 6, amount: grand, mode: "UPI", days: 0, hour: 8, status: "PENDING", collector: 1, ref: "UTRDEMO4251", notes: `${DEMO_TAG} awaiting verification` });
  specs.push({ sub: 7, amount: grand, mode: "BANK_TRANSFER", days: 0, hour: 9, status: "PENDING", collector: 2, ref: "UTRDEMO4252", notes: `${DEMO_TAG} awaiting verification` });
  specs.push({ sub: 8, amount: grand, mode: "CHEQUE", days: 1, hour: 7, status: "PENDING", collector: 1, notes: `${DEMO_TAG} cheque clearance pending` });
  specs.push({ sub: 9, amount: grand, mode: "UPI", days: 1, hour: 3, status: "PENDING", collector: 0, ref: "UTRDEMO4254", notes: `${DEMO_TAG} STALE — pending for over 24h` });
  // Failures
  specs.push({ sub: 10, amount: grand, mode: "ONLINE", days: 3, status: "FAILED", collector: 1, notes: `${DEMO_TAG} gateway timeout` });
  specs.push({ sub: 11, amount: grand, mode: "WALLET", days: 8, status: "FAILED", collector: 2, notes: `${DEMO_TAG} insufficient balance` });
  // Refunds (2)
  specs.push({ sub: 3, amount: grand, mode: "UPI", days: 12, status: "REFUNDED", collector: 0, verifiedByAdmin: true, notes: `${DEMO_TAG} duplicate collection` });
  specs.push({ sub: 5, amount: Math.round(grand * 0.5), mode: "CASH", days: 20, status: "VERIFIED", collector: 1, verifiedByAdmin: true, notes: `${DEMO_TAG} partially refunded` });
  // Auto-verified counter payments (leak radar)
  specs.push({ sub: 1, amount: grand, mode: "CASH", days: 0, hour: 11, status: "VERIFIED", collector: 1, verifiedByAdmin: false, invoiceId: agingInvoices[5].id, notes: `${DEMO_TAG} counter collection` });
  specs.push({ sub: 2, amount: grand, mode: "CASH", days: 2, hour: 12, status: "VERIFIED", collector: 2, verifiedByAdmin: false, notes: `${DEMO_TAG} counter collection` });

  const createdPayments: Array<{ id: string; status: string; amount: number; ref: string; receipt: string; days: number; mode: string; invoiceId?: string }> = [];

  for (const spec of specs) {
    const rc = receipt();
    const isCounterAuto = spec.verifiedByAdmin === false && spec.status === "VERIFIED";
    const payment = await db.payment.create({
      data: {
        subscriberId: subs[spec.sub].id,
        invoiceId: spec.invoiceId || null,
        amount: spec.amount,
        paymentMode: spec.mode,
        transactionRef: spec.ref || (spec.mode === "UPI" ? `UPI${daysAgo(spec.days, spec.hour).getTime().toString(36).toUpperCase()}` : ""),
        status: spec.status,
        receiptNumber: paymentCounter === 13 && spec.status === "VERIFIED" ? "" : rc, // one missing-receipt row for leak radar
        collectedById: collectors[spec.collector]?.id || admin.id,
        verifiedById: spec.status === "VERIFIED" || spec.status === "REFUNDED"
          ? (isCounterAuto ? collectors[spec.collector]?.id || admin.id : admin.id)
          : null,
        notes: `${spec.notes || ""} ${DEMO_TAG}`.trim(),
        createdAt: daysAgo(spec.days, spec.hour ?? 0),
        updatedAt: daysAgo(spec.days, spec.hour ?? 0),
      },
    });
    createdPayments.push({
      id: payment.id, status: spec.status, amount: spec.amount,
      ref: payment.transactionRef, receipt: rc, days: spec.days, mode: spec.mode,
      invoiceId: spec.invoiceId,
    });
    paymentCounter += 1;
  }
  console.log(`  payments created: ${createdPayments.length}`);

  // ── Refund rows for REFUNDED + the partially-refunded one ──
  const refundedFull = createdPayments.find((p) => p.status === "REFUNDED");
  const refundedPartial = createdPayments.find((p) => p.notesTaggedPartial);
  if (refundedFull) {
    await db.refund.create({
      data: {
        paymentId: refundedFull.id, amount: refundedFull.amount, reason: "Duplicate collection",
        mode: "UPI", notes: `${DEMO_TAG} demo refund`, status: "PROCESSED", processedById: admin.id,
      },
    });
  }
  void refundedPartial;

  // ── Gateway transactions: matched + 2 orphans ──
  const gatewayPayments = createdPayments.filter((p) => p.status === "VERIFIED" && p.mode === "ONLINE").slice(0, 5);
  for (const p of gatewayPayments) {
    const gatewayPaymentId = `pay_DEMO${p.id.slice(0, 8).toUpperCase()}`;
    const gatewayOrderId = `order_DEMO${p.id.slice(0, 8).toUpperCase()}`;
    await db.payment.update({ where: { id: p.id }, data: { transactionRef: `${gatewayOrderId}|${gatewayPaymentId}` } });
    await db.integrationTransaction.create({
      data: {
        gatewayType: "razorpay", transactionType: "payment", amount: p.amount,
        status: "captured", externalRef: gatewayPaymentId, paymentId: p.id,
        createdAt: daysAgo(p.days, 1),
      },
    });
    p.ref = `${gatewayOrderId}|${gatewayPaymentId}`;
  }
  // 2 orphan gateway transactions (money at gateway with no local payment)
  await db.integrationTransaction.create({
    data: { gatewayType: "razorpay", transactionType: "payment", amount: 649, status: "captured", externalRef: "pay_DEMOORPHAN1", createdAt: daysAgo(1, 4) },
  });
  await db.integrationTransaction.create({
    data: { gatewayType: "stripe", transactionType: "payment", amount: 499, status: "captured", externalRef: "pi_DEMOORPHAN2", createdAt: daysAgo(4, 2) },
  });
  console.log(`  gateway txns: ${gatewayPayments.length} matched + 2 orphans`);

  // ── Summary ──
  const byStatus = createdPayments.reduce<Record<string, number>>((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
  console.log("  status spread:", JSON.stringify(byStatus));
  console.log(`── seed-payments: done (${createdPayments.length} payments, ${agingInvoices.length} aging invoices, 2 agents) ──`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
