/**
 * Cryptsk ISP Platform — Database Seed Script
 *
 * Usage:
 *   DATABASE_URL="postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform" npx tsx prisma/seed.ts
 *   or via Prisma: npx prisma db seed
 *
 * Seeds:
 *   - Super Admin user
 *   - ISP default settings
 *   - Coverage areas (6)
 *   - Plans (8) with RADIUS groups
 *   - Demo subscribers (15) with RADIUS provisioning
 *   - RADIUS check/reply/user-group entries
 *   - Sample NAS device
 *   - Sample invoices and payments
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

// ─── Seed Configuration ──────────────────────────────────────

const ADMIN_USER = {
  id: "usr_admin_001",
  email: "admin@cryptsk.com",
  name: "Super Administrator",
  password: "Admin@2026",
  phone: "9000000001",
  role: "SUPER_ADMIN" as const,
  status: "ACTIVE" as const,
};

const ISP_SETTINGS = {
  companyName: "Cryptsk Networks Pvt Ltd",
  tagline: "Intelligent ISP Management Platform",
  address: "42 Tech Park, Salt Lake",
  city: "Kolkata",
  state: "West Bengal",
  pincode: "700091",
  phone: "+91-33-4000-0001",
  email: "support@cryptsk.com",
  website: "https://cryptsk.com",
  gstin: "19AABCU9603R1ZM",
  primaryColor: "#DC2626",
  currency: "INR",
  timezone: "Asia/Kolkata",
  gracePeriodDays: 5,
  lateFeeType: "PERCENTAGE" as const,
  lateFeeValue: 2,
  invoicePrefix: "INV",
  customerCodePrefix: "CRY",
  defaultCgstRate: 9,
  defaultSgstRate: 9,
  taxInclusive: false,
  kpiTargets: JSON.stringify({
    dailyCollectionTarget: 50000,
    monthlyCollectionTarget: 1500000,
    newConnectionTarget: 20,
    churnRateTarget: 2,
    uptimeTarget: 99.5,
    complaintResolutionTarget: 4,
  }),
};

const AREAS = [
  { name: "Salt Lake", code: "SL", description: "Salt Lake City, Sector I-V" },
  { name: "New Town", code: "NT", description: "New Town, Rajarhat" },
  { name: "Lake Town", code: "LT", description: "Lake Town, Bangur Avenue" },
  { name: "Dum Dum", code: "DD", description: "Dum Dum, Durganagar" },
  { name: "Barasat", code: "BR", description: "Barasat, Madhyamgram" },
  { name: "Howrah", code: "HW", description: "Howrah, Shibpur" },
];

const PLANS = [
  {
    name: "Basic 30 Mbps",
    category: "FTTH" as const,
    downloadSpeed: 30720,
    uploadSpeed: 15360,
    priceMonthly: 399,
    installationCharge: 500,
    securityDeposit: 500,
    validityDays: 30,
    dataLimitGb: null,
    status: "ACTIVE" as const,
    isPopular: false,
    sortOrder: 1,
    contentionRatio: "1:10",
    slaUptime: 99.0,
  },
  {
    name: "Standard 50 Mbps",
    category: "FTTH" as const,
    downloadSpeed: 51200,
    uploadSpeed: 25600,
    priceMonthly: 599,
    installationCharge: 500,
    securityDeposit: 500,
    validityDays: 30,
    dataLimitGb: null,
    status: "ACTIVE" as const,
    isPopular: true,
    sortOrder: 2,
    contentionRatio: "1:10",
    slaUptime: 99.2,
  },
  {
    name: "Premium 100 Mbps",
    category: "FTTH" as const,
    downloadSpeed: 102400,
    uploadSpeed: 51200,
    priceMonthly: 999,
    installationCharge: 0,
    securityDeposit: 1000,
    validityDays: 30,
    dataLimitGb: null,
    status: "ACTIVE" as const,
    isPopular: true,
    sortOrder: 3,
    contentionRatio: "1:8",
    slaUptime: 99.5,
  },
  {
    name: "Ultra 200 Mbps",
    category: "FTTH" as const,
    downloadSpeed: 204800,
    uploadSpeed: 102400,
    priceMonthly: 1499,
    installationCharge: 0,
    securityDeposit: 1000,
    validityDays: 30,
    dataLimitGb: null,
    status: "ACTIVE" as const,
    isPopular: false,
    sortOrder: 4,
    contentionRatio: "1:8",
    burstSpeed: 256000,
    burstDuration: 30,
    slaUptime: 99.7,
  },
  {
    name: "Enterprise 500 Mbps",
    category: "FTTH" as const,
    downloadSpeed: 512000,
    uploadSpeed: 256000,
    priceMonthly: 2999,
    installationCharge: 0,
    securityDeposit: 0,
    validityDays: 30,
    dataLimitGb: null,
    status: "ACTIVE" as const,
    isPopular: false,
    sortOrder: 5,
    contentionRatio: "1:4",
    burstSpeed: 614400,
    burstDuration: 60,
    slaUptime: 99.9,
  },
  {
    name: "Wireless 20 Mbps",
    category: "WIRELESS" as const,
    downloadSpeed: 20480,
    uploadSpeed: 10240,
    priceMonthly: 349,
    installationCharge: 800,
    securityDeposit: 500,
    validityDays: 30,
    dataLimitGb: 500,
    status: "ACTIVE" as const,
    isPopular: false,
    sortOrder: 10,
    contentionRatio: "1:15",
    slaUptime: 98.0,
  },
  {
    name: "Wireless 40 Mbps",
    category: "WIRELESS" as const,
    downloadSpeed: 40960,
    uploadSpeed: 20480,
    priceMonthly: 549,
    installationCharge: 800,
    securityDeposit: 500,
    validityDays: 30,
    dataLimitGb: 750,
    status: "ACTIVE" as const,
    isPopular: true,
    sortOrder: 11,
    contentionRatio: "1:12",
    slaUptime: 98.5,
  },
  {
    name: "Cable 30 Mbps",
    category: "CABLE" as const,
    downloadSpeed: 30720,
    uploadSpeed: 15360,
    priceMonthly: 299,
    installationCharge: 300,
    securityDeposit: 300,
    validityDays: 30,
    dataLimitGb: null,
    status: "ACTIVE" as const,
    isPopular: false,
    sortOrder: 20,
    contentionRatio: "1:20",
    slaUptime: 97.0,
  },
];

// Demo subscribers with realistic Indian names and data
const DEMO_SUBSCRIBERS = [
  {
    name: "Amit Sharma",
    phone: "9876543210",
    email: "amit.sharma@gmail.com",
    areaCode: "SL",
    planName: "Standard 50 Mbps",
    connectionType: "FTTH" as const,
    address: "Block A, Sector V, Salt Lake",
    macAddress: "AA:BB:CC:11:22:33",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Priya Das",
    phone: "9876543211",
    email: "priya.das@outlook.com",
    areaCode: "NT",
    planName: "Premium 100 Mbps",
    connectionType: "FTTH" as const,
    address: "Tower 4, Eco Space, New Town",
    macAddress: "AA:BB:CC:22:33:44",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Rajesh Kumar",
    phone: "9876543212",
    email: "rajesh.k@yahoo.com",
    areaCode: "LT",
    planName: "Basic 30 Mbps",
    connectionType: "FTTH" as const,
    address: "13 Bangur Avenue, Lake Town",
    macAddress: "AA:BB:CC:33:44:55",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Sneha Mukherjee",
    phone: "9876543213",
    email: "sneha.m@gmail.com",
    areaCode: "SL",
    planName: "Ultra 200 Mbps",
    connectionType: "FTTH" as const,
    address: "FD Block, Salt Lake",
    macAddress: "AA:BB:CC:44:55:66",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Sourav Banerjee",
    phone: "9876543214",
    email: "sourav.b@gmail.com",
    areaCode: "DD",
    planName: "Wireless 40 Mbps",
    connectionType: "WIRELESS" as const,
    address: "Durganagar, Dum Dum",
    macAddress: "AA:BB:CC:55:66:77",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Ananya Ghosh",
    phone: "9876543215",
    email: "ananya.g@outlook.com",
    areaCode: "BR",
    planName: "Standard 50 Mbps",
    connectionType: "FTTH" as const,
    address: "Barasat Main Road",
    macAddress: "AA:BB:CC:66:77:88",
    radiusEnabled: false,
    status: "ACTIVE" as const,
  },
  {
    name: "Debasis Roy",
    phone: "9876543216",
    email: "debasis.r@gmail.com",
    areaCode: "HW",
    planName: "Basic 30 Mbps",
    connectionType: "CABLE" as const,
    address: "Shibpur, Howrah",
    macAddress: "AA:BB:CC:77:88:99",
    radiusEnabled: true,
    status: "SUSPENDED" as const,
  },
  {
    name: "Tanmoy Paul",
    phone: "9876543217",
    email: "tanmoy.p@gmail.com",
    areaCode: "SL",
    planName: "Enterprise 500 Mbps",
    connectionType: "FTTH" as const,
    address: "Sector III, Salt Lake",
    macAddress: "AA:BB:CC:88:99:AA",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Mousumi Saha",
    phone: "9876543218",
    email: "mousumi.s@outlook.com",
    areaCode: "NT",
    planName: "Wireless 20 Mbps",
    connectionType: "WIRELESS" as const,
    address: "Action Area I, New Town",
    macAddress: "AA:BB:CC:99:AA:BB",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Indranil Chakraborty",
    phone: "9876543219",
    email: "indranil.c@gmail.com",
    areaCode: "LT",
    planName: "Premium 100 Mbps",
    connectionType: "FTTH" as const,
    address: "Lake Town South",
    macAddress: "AA:BB:CC:AA:BB:CC",
    radiusEnabled: false,
    status: "TRIAL" as const,
  },
  {
    name: "Rupam Dutta",
    phone: "9876543220",
    email: "rupam.d@gmail.com",
    areaCode: "DD",
    planName: "Cable 30 Mbps",
    connectionType: "CABLE" as const,
    address: "Kestopur, Dum Dum",
    macAddress: "AA:BB:CC:BB:CC:DD",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Pallabi Sen",
    phone: "9876543221",
    email: "pallabi.s@outlook.com",
    areaCode: "SL",
    planName: "Standard 50 Mbps",
    connectionType: "FTTH" as const,
    address: "BE Block, Salt Lake",
    macAddress: "AA:BB:CC:CC:DD:EE",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Arka Bhattacharya",
    phone: "9876543222",
    email: "arka.b@gmail.com",
    areaCode: "NT",
    planName: "Ultra 200 Mbps",
    connectionType: "FTTH" as const,
    address: "Uniworld City, New Town",
    macAddress: "AA:BB:CC:DD:EE:FF",
    radiusEnabled: true,
    status: "ACTIVE" as const,
  },
  {
    name: "Sujata Kayal",
    phone: "9876543223",
    email: "sujata.k@gmail.com",
    areaCode: "BR",
    planName: "Wireless 40 Mbps",
    connectionType: "WIRELESS" as const,
    address: "Madhyamgram, Barasat",
    macAddress: "11:22:33:44:55:66",
    radiusEnabled: false,
    status: "PENDING_ACTIVATION" as const,
  },
  {
    name: "Bikash Mondal",
    phone: "9876543224",
    email: "bikash.m@outlook.com",
    areaCode: "HW",
    planName: "Standard 50 Mbps",
    connectionType: "FTTH" as const,
    address: "Shibpur Bazaar, Howrah",
    macAddress: "22:33:44:55:66:77",
    radiusEnabled: true,
    status: "DISCONNECTED" as const,
  },
];

// ─── Main Seed Function ──────────────────────────────────────

async function main() {
  console.log("🌱 Cryptsk ISP Platform — Seeding database...\n");

  // 1. Seed Admin User
  console.log("▸ Seeding admin user...");
  const existingAdmin = await prisma.user.findUnique({
    where: { email: ADMIN_USER.email },
  });
  if (!existingAdmin) {
    const hashedPassword = await hash(ADMIN_USER.password, 12);
    await prisma.user.create({
      data: {
        id: ADMIN_USER.id,
        email: ADMIN_USER.email,
        name: ADMIN_USER.name,
        password: hashedPassword,
        phone: ADMIN_USER.phone,
        role: ADMIN_USER.role,
        status: ADMIN_USER.status,
        updatedAt: new Date(),
      },
    });
    console.log(`  ✅ Admin created: ${ADMIN_USER.email} / ${ADMIN_USER.password}`);
  } else {
    console.log(`  ⏭️  Admin already exists: ${ADMIN_USER.email}`);
  }

  // 2. Seed ISP Settings
  console.log("▸ Seeding ISP settings...");
  const existingSettings = await prisma.ispSettings.findUnique({
    where: { id: "default" },
  });
  if (!existingSettings) {
    await prisma.ispSettings.create({
      data: {
        ...ISP_SETTINGS,
        updatedAt: new Date(),
      },
    });
    console.log(`  ✅ ISP settings created: ${ISP_SETTINGS.companyName}`);
  } else {
    console.log("  ⏭️  ISP settings already exist");
  }

  // 3. Seed Areas
  console.log("▸ Seeding coverage areas...");
  let areasCreated = 0;
  const areaMap: Record<string, string> = {};
  for (const area of AREAS) {
    const exists = await prisma.area.findUnique({ where: { code: area.code } });
    if (!exists) {
      const created = await prisma.area.create({ data: { id: randomUUID(), ...area, updatedAt: new Date() } });
      areasCreated++;
      areaMap[area.code] = created.id;
    } else {
      areaMap[area.code] = exists.id;
    }
  }
  console.log(`  ✅ ${areasCreated} area(s) created`);

  // 4. Seed Plans + RADIUS Groups
  console.log("▸ Seeding plans + RADIUS groups...");
  let plansCreated = 0;
  const planMap: Record<string, { id: string; groupId: string }> = {};
  for (const plan of PLANS) {
    const existingPlan = await prisma.plan.findFirst({
      where: { name: plan.name },
    });
    if (!existingPlan) {
      const groupName = plan.name.replace(/\s+/g, "-").toLowerCase();
      const dlMbps = Math.round(plan.downloadSpeed / 1024);
      const ulMbps = Math.round(plan.uploadSpeed / 1024);

      // Create or reuse RADIUS group
      const existingGroup = await prisma.radiusGroup.findUnique({
        where: { name: groupName },
      });
      const radiusGroup = existingGroup || await prisma.radiusGroup.create({
        data: {
          id: randomUUID(),
          name: groupName,
          description: `RADIUS group for ${plan.name}`,
          speedLimitDown: dlMbps,
          speedLimitUp: ulMbps,
          dataLimit: plan.dataLimitGb ? Math.round(plan.dataLimitGb * 1024) : null,
          sessionTimeout: plan.validityDays * 86400,
          updatedAt: new Date(),
        },
      });

      const createdPlan = await prisma.plan.create({
        data: {
          id: randomUUID(),
          ...plan,
          groupId: radiusGroup.id,
          updatedAt: new Date(),
        },
      });
      plansCreated++;
      planMap[plan.name] = { id: createdPlan.id, groupId: radiusGroup.id };
    } else {
      planMap[plan.name] = { id: existingPlan.id, groupId: existingPlan.groupId || "" };
    }
  }
  console.log(`  ✅ ${plansCreated} plan(s) created with RADIUS provisioning`);

  // 5. Seed Demo Subscribers + RADIUS provisioning
  console.log("▸ Seeding demo subscribers + RADIUS entries...");
  let subsCreated = 0;
  const existingSubCount = await prisma.subscriber.count();

  if (existingSubCount === 0) {
    for (let i = 0; i < DEMO_SUBSCRIBERS.length; i++) {
      const sub = DEMO_SUBSCRIBERS[i];
      const code = `CRY${String(i + 1).padStart(5, "0")}`;
      const serviceUsername = sub.name.toLowerCase().replace(/\s+/g, ".").replace(/[.]+/g, ".");
      const servicePassword = `Cryptsk@${String(i + 1).padStart(3, "0")}`;
      const areaId = areaMap[sub.areaCode];
      const planInfo = planMap[sub.planName];

      // Create subscriber
      const subscriber = await prisma.subscriber.create({
        data: {
          id: randomUUID(),
          code,
          name: sub.name,
          phone: sub.phone,
          email: sub.email,
          areaId,
          planId: planInfo?.id || null,
          connectionType: sub.connectionType,
          address: sub.address,
          macAddress: sub.macAddress,
          status: sub.status,
          serviceUsername,
          servicePassword,
          radiusEnabled: sub.radiusEnabled,
          radiusGroupId: sub.radiusEnabled ? planInfo?.groupId : null,
          activationDate: sub.status === "ACTIVE" ? new Date() : null,
          billingStartDate: sub.status === "ACTIVE" ? new Date() : null,
          currentSpeedDown: planInfo?.id ? PLANS.find(p => p.name === sub.planName)?.downloadSpeed || 0 : 0,
          currentSpeedUp: planInfo?.id ? PLANS.find(p => p.name === sub.planName)?.uploadSpeed || 0 : 0,
          balance: sub.status === "ACTIVE" ? Math.random() * 500 : 0,
          updatedAt: new Date(),
        },
      });

      // Create RADIUS user record
      if (sub.radiusEnabled && planInfo?.groupId) {
        try {
          await prisma.radiusUser.create({
            data: { id: randomUUID(), subscriberId: subscriber.id, updatedAt: new Date() },
          });
        } catch (e) {
          // Ignore duplicate errors
        }

        // Create RADIUS check entry (Cleartext-Password)
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO radcheck (UserName, Attribute, op, Value, subscriber_id)
             VALUES ($1, 'Cleartext-Password', '==', $2, $3)
             ON CONFLICT DO NOTHING`,
            serviceUsername, servicePassword, subscriber.id
          );
        } catch (e) {
          console.error(`  ⚠️  Failed to create radcheck for ${serviceUsername}:`, e);
        }

        // Create RADIUS user-group mapping
        const groupName = sub.planName.replace(/\s+/g, "-").toLowerCase();
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO radusergroup (UserName, GroupName, priority, subscriber_id, is_active)
             VALUES ($1, $2, 0, $3, $4)
             ON CONFLICT DO NOTHING`,
            serviceUsername, groupName, subscriber.id, sub.status === "ACTIVE"
          );
        } catch (e) {
          console.error(`  ⚠️  Failed to create radusergroup for ${serviceUsername}:`, e);
        }
      }

      subsCreated++;
    }
    console.log(`  ✅ ${subsCreated} subscriber(s) created`);
  } else {
    console.log(`  ⏭️  ${existingSubCount} subscriber(s) already exist, skipping`);
  }

  // 6. Seed Sample NAS Device
  console.log("▸ Seeding NAS devices...");
  const nasExists = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM nas WHERE nasname = '192.168.1.1' LIMIT 1`
  );
  if (!nasExists || (nasExists as any[])?.length === 0) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO nas (nasname, shortname, type, ports, secret, server, community, description, status, coa_enabled)
      VALUES ('192.168.1.1', 'MikroTik-CORE', 'other', 0, 'cryptsksecret', '', 'public', 'Core MikroTik NAS', 'active', true)
      ON CONFLICT DO NOTHING
    `);
    console.log("  ✅ NAS device created: MikroTik-CORE (192.168.1.1)");
  } else {
    console.log("  ⏭️  NAS devices already exist");
  }

  // 7. Seed Sample Invoices for active subscribers
  console.log("▸ Seeding sample invoices...");
  let invoicesCreated = 0;
  const activeSubs = await prisma.subscriber.findMany({
    where: { status: "ACTIVE", planId: { not: null } },
    include: { Plan: true },
    take: 5,
  });
  for (const sub of activeSubs) {
    if (!sub.Plan) continue;
    const existingInvoice = await prisma.invoice.findFirst({
      where: { subscriberId: sub.id },
    });
    if (!existingInvoice) {
      const cgst = (sub.Plan.priceMonthly * (sub.Plan.cgstPercent || 9)) / 100;
      const sgst = (sub.Plan.priceMonthly * (sub.Plan.sgstPercent || 9)) / 100;
      const total = sub.Plan.priceMonthly + cgst + sgst;
      await prisma.invoice.create({
        data: {
          id: randomUUID(),
          subscriberId: sub.id,
          planId: sub.Plan.id,
          invoiceNumber: `INV-${sub.code}-001`,
          issueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          periodEnd: new Date(),
          subtotal: sub.Plan.priceMonthly,
          cgstAmount: cgst,
          sgstAmount: sgst,
          igstAmount: 0,
          totalAmount: total,
          grandTotal: total,
          status: "DRAFT",
          updatedAt: new Date(),
        },
      });
      invoicesCreated++;
    }
  }
  console.log(`  ✅ ${invoicesCreated} invoice(s) created`);

  // 8. Summary
  const totalSubscribers = await prisma.subscriber.count();
  const totalPlans = await prisma.plan.count();
  const totalAreas = await prisma.area.count();
  const totalUsers = await prisma.user.count();
  const totalRadiusGroups = await prisma.radiusGroup.count();
  const totalRadcheck = await prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM radcheck`) as any[];
  const totalRadusergroup = await prisma.$queryRawUnsafe(`SELECT count(*)::int as c FROM radusergroup`) as any[];

  console.log("\n📊 Database Summary:");
  console.log(`   Users:              ${totalUsers}`);
  console.log(`   Areas:              ${totalAreas}`);
  console.log(`   Plans:              ${totalPlans}`);
  console.log(`   RADIUS Groups:      ${totalRadiusGroups}`);
  console.log(`   Subscribers:        ${totalSubscribers}`);
  console.log(`   RADIUS Users:       ${(totalRadcheck[0] as any)?.c || 0}`);
  console.log(`   RADIUS User-Groups: ${(totalRadusergroup[0] as any)?.c || 0}`);
  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
