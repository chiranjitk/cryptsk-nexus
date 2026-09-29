import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// ============================================================
// CRYPTSK Nexus — Phase 1 Seed Script
// Per: docs/architecture/08_SECURITY_RBAC_SPECIFICATION.md
//
// Creates:
//   - 1 admin user (admin@cryptsk.com / Admin@2026)
//   - 15 roles (Super Admin, Platform Admin, NOC Operator, etc.)
//   - Core permissions (resource × action)
//   - Super Admin gets all permissions
//
// Usage:
//   bun run db:seed
// ============================================================

const db = new PrismaClient();

const ROLES = [
  { name: "Super Administrator", slug: "super_admin", isSystem: true, isBreakGlass: true, sortOrder: 0 },
  { name: "Platform Administrator", slug: "platform_admin", isSystem: true, sortOrder: 1 },
  { name: "NOC Operator", slug: "noc_operator", isSystem: true, sortOrder: 2 },
  { name: "Network Engineer", slug: "network_engineer", isSystem: true, sortOrder: 3 },
  { name: "AAA Operator", slug: "aaa_operator", isSystem: true, sortOrder: 4 },
  { name: "Billing Manager", slug: "billing_manager", isSystem: true, sortOrder: 5 },
  { name: "Finance Operator", slug: "finance_operator", isSystem: true, sortOrder: 6 },
  { name: "Support Lead", slug: "support_lead", isSystem: true, sortOrder: 7 },
  { name: "Support Agent", slug: "support_agent", isSystem: true, sortOrder: 8 },
  { name: "Field Technician", slug: "field_technician", isSystem: true, sortOrder: 9 },
  { name: "Sales / Collection Agent", slug: "sales_agent", isSystem: true, sortOrder: 10 },
  { name: "Reseller / Partner", slug: "reseller", isSystem: true, sortOrder: 11 },
  { name: "Read-only Auditor", slug: "auditor", isSystem: true, sortOrder: 12 },
  { name: "Scope Administrator", slug: "scope_admin", isSystem: true, sortOrder: 13 },
  { name: "LCO / Partner Operator", slug: "lco_operator", isSystem: true, sortOrder: 14 },
];

const RESOURCES = [
  "subscriber", "session", "policy", "billing.invoice", "billing.payment",
  "billing.refund", "network.device", "network.gateway", "network.interface",
  "aaa.radius", "aaa.nas", "user", "role", "permission", "module",
  "feature_flag", "api_key", "system_setting", "audit", "report",
  "ticket", "installation", "inventory", "whatsapp", "sms", "email",
  "mikrotik", "snmp", "tr069", "ssh", "captive_portal", "dhcp", "dns",
  "ai_advisor", "ai_diagnosis", "ai_churn", "ai_forecast", "monitoring",
];

const ACTIONS = ["read", "list", "create", "update", "delete", "approve", "execute", "export", "manage"] as const;

async function main() {
  console.log("🌱 CRYPTSK Nexus — Phase 1 Seed starting…\n");

  // ── 1. Create roles ──
  console.log("1. Creating 15 roles…");
  for (const role of ROLES) {
    await db.role.upsert({
      where: { slug: role.slug },
      update: role,
      create: role,
    });
  }
  console.log("   ✓ 15 roles created\n");

  // ── 2. Create permissions ──
  console.log("2. Creating permissions…");
  let permCount = 0;
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      await db.permission.upsert({
        where: { resource_action: { resource, action } },
        update: {},
        create: {
          resource,
          action,
          description: `${action} ${resource}`,
          isSystem: true,
        },
      });
      permCount++;
    }
  }
  console.log(`   ✓ ${permCount} permissions created (${RESOURCES.length} resources × ${ACTIONS.length} actions)\n`);

  // ── 3. Assign ALL permissions to Super Administrator ──
  console.log("3. Assigning all permissions to Super Administrator…");
  const superAdmin = await db.role.findUnique({ where: { slug: "super_admin" } });
  if (!superAdmin) throw new Error("Super Administrator role not found");

  const allPerms = await db.permission.findMany();
  for (const perm of allPerms) {
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: superAdmin.id, permissionId: perm.id },
      },
      update: {},
      create: { roleId: superAdmin.id, permissionId: perm.id },
    });
  }
  console.log(`   ✓ ${allPerms.length} permissions assigned to Super Administrator\n`);

  // ── 4. Assign read permissions to Read-only Auditor ──
  console.log("4. Assigning read permissions to Read-only Auditor…");
  const auditor = await db.role.findUnique({ where: { slug: "auditor" } });
  if (auditor) {
    const readPerms = allPerms.filter((p) => p.action === "read" || p.action === "list" || p.action === "export");
    for (const perm of readPerms) {
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: auditor.id, permissionId: perm.id } },
        update: {},
        create: { roleId: auditor.id, permissionId: perm.id },
      });
    }
    console.log(`   ✓ ${readPerms.length} read/list/export permissions assigned to Read-only Auditor\n`);
  }

  // ── 5. Create admin user ──
  console.log("5. Creating admin user (admin@cryptsk.com / Admin@2026)…");
  const passwordHash = await bcrypt.hash("Admin@2026", 12);
  const adminUser = await db.user.upsert({
    where: { email: "admin@cryptsk.com" },
    update: {},
    create: {
      email: "admin@cryptsk.com",
      username: "admin",
      name: "Super Administrator",
      passwordHash,
      status: "active",
      forcePasswordChange: false,
      timezone: "Asia/Kolkata",
      locale: "en",
    },
  });
  console.log(`   ✓ Admin user created (ID: ${adminUser.id})\n`);

  // ── 6. Assign Super Administrator role to admin ──
  console.log("6. Assigning Super Administrator role to admin user…");
  await db.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: superAdmin.id } },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: superAdmin.id,
      assignedBy: adminUser.id,
    },
  });
  console.log("   ✓ Role assigned\n");

  // ── 7. Create core system settings ──
  console.log("7. Creating system settings…");
  const settings = [
    { key: "platform.name", value: "CRYPTSK Nexus", type: "string", category: "general", description: "Platform display name" },
    { key: "platform.version", value: "1.0.0", type: "string", category: "general", description: "Platform version" },
    { key: "platform.phase", value: "1", type: "string", category: "general", description: "Current implementation phase" },
    { key: "auth.session_timeout", value: "28800", type: "number", category: "security", description: "Session timeout in seconds (8h)" },
    { key: "auth.lockout_threshold", value: "5", type: "number", category: "security", description: "Failed login attempts before lockout" },
    { key: "auth.lockout_duration", value: "900", type: "number", category: "security", description: "Lockout duration in seconds (15m)" },
    { key: "billing.currency", value: "INR", type: "string", category: "billing", description: "Default currency" },
    { key: "billing.gst_enabled", value: "true", type: "boolean", category: "billing", description: "Enable GST tax calculation" },
    { key: "ai.enabled", value: "true", type: "boolean", category: "ai", description: "Enable AI features (advisory only per ADR-030)" },
  ];
  for (const s of settings) {
    await db.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`   ✓ ${settings.length} system settings created\n`);

  // ── 8. Create core modules ──
  console.log("8. Creating modules…");
  const modules = [
    { name: "Dashboard", slug: "dashboard", description: "Main dashboard", status: "active", isRequired: true, sortOrder: 0 },
    { name: "Identity & Administration", slug: "identity_admin", description: "Users, roles, permissions, RBAC, audit", status: "active", isRequired: true, sortOrder: 1 },
    { name: "Customer & Services", slug: "customer_service", description: "Customers, subscribers, products, packages", status: "active", sortOrder: 2 },
    { name: "AAA", slug: "aaa", description: "RADIUS auth/authz/accounting", status: "active", sortOrder: 3 },
    { name: "Session Engine", slug: "session_engine", description: "Live session management", status: "active", sortOrder: 4 },
    { name: "Policy Engine", slug: "policy_engine", description: "Policy definition and enforcement", status: "active", sortOrder: 5 },
    { name: "VPP Gateway", slug: "vpp_gateway", description: "DPDK/VPP dataplane", status: "active", sortOrder: 6 },
    { name: "Billing & Finance", slug: "billing_finance", description: "Invoices, payments, collections", status: "active", sortOrder: 7 },
    { name: "Operations & Support", slug: "operations_support", description: "Tickets, installations, inventory", status: "active", sortOrder: 8 },
    { name: "Reports & Analytics", slug: "reporting", description: "Revenue, usage, SLA reports and data export", status: "active", sortOrder: 9 },
    { name: "Monitoring", slug: "monitoring", description: "Live monitoring, syslog, alerts", status: "active", sortOrder: 10 },
    { name: "AI & Intelligence", slug: "ai_intelligence", description: "AI advisor, diagnosis, churn", status: "active", sortOrder: 11 },
  ];
  for (const m of modules) {
    await db.module.upsert({
      where: { slug: m.slug },
      update: {},
      create: m,
    });
  }
  console.log(`   ✓ ${modules.length} modules created\n`);

  // ── 9. Role-permission matrix (idempotent, additive — never prunes manual links) ──
  console.log("9. Applying role-permission matrix…");

  /** Expand helper: P(resource, [actions]) → [resource, action] tuples */
  function P(resource: string, actions: string[]): Array<[string, string]> {
    return actions.map((a) => [resource, a] as [string, string]);
  }

  // Enterprise RBAC matrix per docs/architecture/08_SECURITY_RBAC_SPECIFICATION.md
  // Key = role slug, value = "ALL" (every permission) or [resource, action] tuples.
  // super_admin bypasses RBAC in code (src/lib/rbac.ts) but is also fully seeded.
  const ROLE_PERMISSION_MATRIX: Record<string, "ALL" | Array<[string, string]>> = {
    super_admin: "ALL",

    platform_admin: [
      ...P("user", ["manage"]),
      ...P("role", ["manage"]),
      ...P("module", ["manage"]),
      ...P("feature_flag", ["manage"]),
      ...P("api_key", ["manage"]),
      ...P("system_setting", ["manage"]),
      ...P("audit", ["read", "list", "export"]),
      ...P("subscriber", ["manage"]),
      ...P("billing.invoice", ["manage"]),
      ...P("billing.payment", ["manage"]),
      ...P("billing.refund", ["manage"]),
      ...P("network.device", ["manage"]),
      ...P("network.gateway", ["manage"]),
      ...P("network.interface", ["manage"]),
      ...P("aaa.radius", ["manage"]),
      ...P("aaa.nas", ["manage"]),
      ...P("dhcp", ["manage"]),
      ...P("dns", ["manage"]),
      ...P("policy", ["manage"]),
      ...P("report", ["read", "list", "export"]),
    ],

    noc_operator: [
      ...P("session", ["read", "list", "execute"]),
      ...P("aaa.radius", ["read", "list"]),
      ...P("aaa.nas", ["read", "list"]),
      ...P("network.device", ["read", "list"]),
      ...P("dhcp", ["read", "list"]),
      ...P("dns", ["read", "list"]),
      ...P("report", ["read", "list"]),
      ...P("audit", ["read", "list"]),
    ],

    network_engineer: [
      ...P("network.device", ["manage"]),
      ...P("dhcp", ["manage"]),
      ...P("dns", ["manage"]),
      ...P("policy", ["read", "list", "update"]),
      ...P("report", ["read", "list"]),
    ],

    aaa_operator: [
      ...P("aaa.radius", ["manage"]),
      ...P("aaa.nas", ["manage"]),
      ...P("session", ["read", "list", "execute"]),
      ...P("subscriber", ["read", "list"]),
      ...P("audit", ["read", "list"]),
    ],

    billing_manager: [
      ...P("billing.invoice", ["manage"]),
      ...P("billing.payment", ["manage"]),
      ...P("billing.refund", ["approve"]),
      ...P("subscriber", ["read", "list"]),
      ...P("report", ["read", "list", "export"]),
      ...P("audit", ["read", "list"]),
    ],

    finance_operator: [
      ...P("billing.payment", ["create", "update", "list", "read"]),
      ...P("billing.invoice", ["read", "list"]),
      ...P("report", ["read", "list", "export"]),
    ],

    support_lead: [
      ...P("subscriber", ["manage"]),
      ...P("session", ["read", "list"]),
      ...P("ticket", ["manage"]),
      ...P("installation", ["manage"]),
      ...P("audit", ["read", "list"]),
    ],

    support_agent: [
      ...P("subscriber", ["read", "list", "update"]),
      ...P("ticket", ["create", "update", "list", "read"]),
      ...P("session", ["read", "list"]),
    ],

    field_technician: [
      ...P("installation", ["read", "list", "update"]),
      ...P("subscriber", ["read", "list"]),
      ...P("inventory", ["read", "list"]),
    ],

    sales_agent: [
      ...P("subscriber", ["read", "list", "create"]),
      ...P("report", ["read"]),
      ...P("billing.invoice", ["read", "list"]),
    ],

    reseller: [
      ...P("subscriber", ["read", "list"]),
      ...P("report", ["read"]),
      ...P("billing.invoice", ["read", "list"]),
    ],

    // Read-only persona: read + list + export only
    auditor: [
      ...["audit", "report", "user", "role", "subscriber", "billing.invoice", "billing.payment",
        "session", "aaa.radius", "network.device", "policy", "dhcp", "dns"].flatMap((r) =>
        P(r, ["read", "list", "export"])
      ),
    ],

    scope_admin: [
      ...P("subscriber", ["manage"]),
      ...P("report", ["read", "list"]),
      ...P("policy", ["read", "list"]),
    ],

    lco_operator: [
      ...P("subscriber", ["read", "list", "update"]),
      ...P("session", ["read", "list"]),
      ...P("report", ["read"]),
      ...P("billing.payment", ["create"]),
    ],
  };

  // Map "resource.action" → permission id (seed step 2 guarantees all exist)
  const matrixPermRecords = await db.permission.findMany({
    select: { id: true, resource: true, action: true },
  });
  const permIdByKey = new Map<string, string>(
    matrixPermRecords.map((p) => [`${p.resource}.${p.action}`, p.id])
  );

  // Existing links → idempotency: only add missing links, never remove
  const existingRolePerms = await db.rolePermission.findMany({
    select: { roleId: true, permissionId: true },
  });
  const linkedByRole = new Map<string, Set<string>>();
  for (const rp of existingRolePerms) {
    let set = linkedByRole.get(rp.roleId);
    if (!set) {
      set = new Set();
      linkedByRole.set(rp.roleId, set);
    }
    set.add(rp.permissionId);
  }

  let matrixLinksCreated = 0;
  for (const [roleSlug, spec] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const role = await db.role.findUnique({
      where: { slug: roleSlug },
      select: { id: true, name: true },
    });
    if (!role) {
      console.log(`   ⚠ role "${roleSlug}" not found — skipped`);
      continue;
    }

    let targetIds: string[];
    if (spec === "ALL") {
      targetIds = matrixPermRecords.map((p) => p.id);
    } else {
      const ids: string[] = [];
      for (const [resource, action] of spec) {
        const id = permIdByKey.get(`${resource}.${action}`);
        if (!id) {
          console.log(`   ⚠ permission "${resource}.${action}" not found — skipped`);
          continue;
        }
        ids.push(id);
      }
      targetIds = Array.from(new Set(ids));
    }

    const already = linkedByRole.get(role.id) ?? new Set<string>();
    const missing = targetIds.filter((id) => !already.has(id));
    if (missing.length > 0) {
      await db.rolePermission.createMany({
        data: missing.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
    matrixLinksCreated += missing.length;
    console.log(
      `   ✓ ${roleSlug} (${role.name}): +${missing.length} new → ${targetIds.length} permissions total`
    );
  }
  console.log(`   ✓ Role-permission matrix applied (${matrixLinksCreated} new links)\n`);

  // ── Summary ──
  console.log("══════════════════════════════════════════════════");
  console.log("✅ SEED COMPLETE");
  console.log("══════════════════════════════════════════════════");
  console.log(`Roles:        15`);
  console.log(`Permissions:  ${allPerms.length}`);
  console.log(`Role perms:   +${matrixLinksCreated} links via matrix`);
  console.log(`Admin user:   admin@cryptsk.com (password: Admin@2026)`);
  console.log(`Settings:     ${settings.length}`);
  console.log(`Modules:      ${modules.length}`);
  console.log("══════════════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
