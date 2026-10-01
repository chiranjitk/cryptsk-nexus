// ═══════════════════════════════════════════════════════════════
// Seed demo data for the ALERT MANAGEMENT module — idempotent:
// skips when AlertRule already populated (FORCE=1 to reseed).
// Run: DATABASE_URL=... npx tsx prisma/seed-alerts.ts
// ═══════════════════════════════════════════════════════════════
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const minsAgo = (m: number) => new Date(Date.now() - m * 60000);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000);
const minsFromNow = (m: number) => new Date(Date.now() + m * 60000);

async function main() {
  const existing = await db.alertRule.count();
  if (existing > 0 && !process.env.FORCE) {
    console.log(`⏭  ALERTS seed skipped — ${existing} alert rules already exist (FORCE=1 to reseed)`);
    return;
  }

  // ─── Admin user for comments/acks ─────────────────────────────
  const admin = await db.user.findFirst({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } }) ??
    await db.user.findFirst();
  const adminId = admin?.id ?? "usr_admin_001";

  // ─── Alert Rules (6 realistic ISP rules) ──────────────────────
  const rules = await Promise.all([
    db.alertRule.upsert({
      where: { id: "rule-device-offline" },
      update: {},
      create: {
        id: "rule-device-offline",
        name: "Device Offline (Core/OLT)",
        condition: "device.status == offline for > 2 min",
        threshold: 2,
        severity: "CRITICAL",
        notifyChannels: JSON.stringify(["IN_APP", "EMAIL", "SMS"]),
        cooldownMinutes: 10,
        enabled: true,
        escalationEnabled: true,
        escalationLevels: JSON.stringify([
          { level: 1, afterMinutes: 5, action: "Notify NOC lead" },
          { level: 2, afterMinutes: 15, action: "Notify head of operations" },
        ]),
        autoEscalate: true,
        escalationIntervalMinutes: 15,
        maxSeverity: "CRITICAL",
        deduplicationWindowMinutes: 10,
      },
    }),
    db.alertRule.upsert({
      where: { id: "rule-high-cpu" },
      update: {},
      create: {
        id: "rule-high-cpu",
        name: "High CPU on Network Device",
        condition: "device.cpuUsage > threshold%",
        threshold: 85,
        severity: "HIGH",
        notifyChannels: JSON.stringify(["IN_APP", "EMAIL"]),
        cooldownMinutes: 15,
        enabled: true,
        escalationEnabled: true,
        autoEscalate: false,
        escalationIntervalMinutes: 30,
        maxSeverity: "CRITICAL",
        deduplicationWindowMinutes: 15,
      },
    }),
    db.alertRule.upsert({
      where: { id: "rule-olt-rx-power" },
      update: {},
      create: {
        id: "rule-olt-rx-power",
        name: "OLT Port RX Power Low",
        condition: "oltPort.rxPower < threshold dBm",
        threshold: -28,
        severity: "HIGH",
        notifyChannels: JSON.stringify(["IN_APP", "EMAIL"]),
        cooldownMinutes: 30,
        enabled: true,
        escalationEnabled: false,
        autoEscalate: false,
        escalationIntervalMinutes: 30,
        maxSeverity: "HIGH",
        deduplicationWindowMinutes: 30,
      },
    }),
    db.alertRule.upsert({
      where: { id: "rule-radius-auth" },
      update: {},
      create: {
        id: "rule-radius-auth",
        name: "RADIUS Auth Failure Spike",
        condition: "radius.authFailures > threshold / 5 min",
        threshold: 50,
        severity: "MEDIUM",
        notifyChannels: JSON.stringify(["IN_APP"]),
        cooldownMinutes: 20,
        enabled: true,
        escalationEnabled: false,
        autoEscalate: false,
        escalationIntervalMinutes: 30,
        maxSeverity: "HIGH",
        deduplicationWindowMinutes: 20,
      },
    }),
    db.alertRule.upsert({
      where: { id: "rule-bandwidth" },
      update: {},
      create: {
        id: "rule-bandwidth",
        name: "Upstream Bandwidth Saturation",
        condition: "uplink.utilization > threshold%",
        threshold: 90,
        severity: "MEDIUM",
        notifyChannels: JSON.stringify(["IN_APP", "WHATSAPP"]),
        cooldownMinutes: 60,
        enabled: true,
        escalationEnabled: false,
        autoEscalate: false,
        escalationIntervalMinutes: 60,
        maxSeverity: "HIGH",
        deduplicationWindowMinutes: 60,
      },
    }),
    db.alertRule.upsert({
      where: { id: "rule-dhcp-pool" },
      update: {},
      create: {
        id: "rule-dhcp-pool",
        name: "DHCP Pool Exhaustion Warning",
        condition: "dhcp.poolUtilization > threshold%",
        threshold: 80,
        severity: "LOW",
        notifyChannels: JSON.stringify(["IN_APP"]),
        cooldownMinutes: 120,
        enabled: false,
        escalationEnabled: false,
        autoEscalate: false,
        escalationIntervalMinutes: 60,
        maxSeverity: "MEDIUM",
        deduplicationWindowMinutes: 120,
      },
    }),
  ]);
  const [offline, cpu, rx, radius, bw] = rules;

  // ─── NetworkAlerts (mixed lifecycle, last 7 days) ─────────────
  const alerts: Array<{
    ruleId?: string; severity: string; title: string; message: string; source: string;
    deviceId?: string; status: string; acknowledgedBy?: string; acknowledgedAt?: Date;
    resolution?: string; resolvedAt?: Date; duplicateCount?: number; escalationLevel?: number;
    createdAt: Date; assignedToId?: string;
  }> = [
    // ACTIVE now
    { ruleId: offline.id, severity: "CRITICAL", title: "OLT-BRAS-01 unreachable", message: "ICMP + SNMP both failing from monitor-1. Last seen 06:41 UTC. Uplink port Te0/1 shows LOS.", source: "network-monitor", deviceId: "dev-olt-01", status: "ACTIVE", duplicateCount: 3, escalationLevel: 1, createdAt: minsAgo(14) },
    { ruleId: cpu.id, severity: "HIGH", title: "CPU 92% on Core-Router-02", message: "Sustained CPU above 85% for 8 minutes. Top talker: BGP scan job.", source: "snmp-poller", deviceId: "dev-cr-02", status: "ACTIVE", duplicateCount: 2, createdAt: minsAgo(37) },
    { ruleId: bw.id, severity: "MEDIUM", title: "Upstream utilization 94%", message: "IX peering uplink at 940 Mbps of 1 Gbps CIR for 12+ minutes.", source: "bandwidth-monitor", status: "ACTIVE", createdAt: minsAgo(52) },
    { ruleId: rx.id, severity: "HIGH", title: "PON port 3 RX power -29.4 dBm", message: "Port PON3/1 optical RX degraded below -28 dBm threshold. 14 ONUs affected.", source: "olt-telemetry", deviceId: "dev-olt-02", status: "ACTIVE", createdAt: hoursAgo(2) },
    // ACKNOWLEDGED
    { ruleId: radius.id, severity: "MEDIUM", title: "RADIUS auth failures — 64 in 5 min", message: "Spike from ASR-BRAS domain 'zone-4'. Mostly wrong-password retries after CPE reflash.", source: "radius-engine", status: "ACKNOWLEDGED", acknowledgedBy: admin?.name ?? "NOC Admin", acknowledgedAt: minsAgo(25), duplicateCount: 2, createdAt: minsAgo(65) },
    { ruleId: cpu.id, severity: "HIGH", title: "CPU 88% on OLT-BRAS-02", message: "CPU spike during DHCP lease table compaction.", source: "snmp-poller", deviceId: "dev-olt-02", status: "ACKNOWLEDGED", acknowledgedBy: admin?.name ?? "NOC Admin", acknowledgedAt: hoursAgo(1), createdAt: hoursAgo(3) },
    { ruleId: offline.id, severity: "CRITICAL", title: "Switch-AGG-04 offline", message: "Management plane lost. Suspected fiber cut on ring segment D.", source: "network-monitor", deviceId: "dev-sw-04", status: "ACKNOWLEDGED", acknowledgedBy: admin?.name ?? "NOC Admin", acknowledgedAt: minsAgo(90), escalationLevel: 2, createdAt: minsAgo(140) },
    // RESOLVED — with realistic resolutions
    { ruleId: offline.id, severity: "CRITICAL", title: "OLT-BRAS-03 unreachable", message: "Loss of management connectivity during power grid transfer.", source: "network-monitor", deviceId: "dev-olt-03", status: "RESOLVED", acknowledgedBy: admin?.name ?? "NOC Admin", acknowledgedAt: hoursAgo(26), resolution: "UPS ATS failed over cleanly; device rebooted and returned to service in 11 min.", resolvedAt: minsAgo(1500), createdAt: hoursAgo(26) },
    { ruleId: bw.id, severity: "MEDIUM", title: "Upstream utilization 91%", message: "Evening peak on transit-A. Traffic-shaped by QoS policy as designed.", source: "bandwidth-monitor", status: "RESOLVED", acknowledgedBy: admin?.name ?? "NOC Admin", acknowledgedAt: hoursAgo(30), resolution: "Peak subsided at 23:10; no action needed. Cache offload absorbed majority.", resolvedAt: hoursAgo(29), createdAt: hoursAgo(31) },
    { ruleId: radius.id, severity: "MEDIUM", title: "RADIUS auth failures — 57 in 5 min", message: "Bulk retries from a single CPE model after firmware push.", source: "radius-engine", status: "RESOLVED", acknowledgedBy: admin?.name ?? "NOC Admin", acknowledgedAt: hoursAgo(49), resolution: "Vendor hotfix rolled to affected CPE cohort; failure rate back to baseline.", resolvedAt: hoursAgo(47), createdAt: hoursAgo(50) },
    { ruleId: rx.id, severity: "HIGH", title: "PON port 7 RX power -31.2 dBm", message: "Severe optical degradation; splitter leg suspected.", source: "olt-telemetry", deviceId: "dev-olt-01", status: "RESOLVED", acknowledgedBy: admin?.name ?? "NOC Admin", acknowledgedAt: hoursAgo(70), resolution: "Field crew replaced dirty UPC connector on splitter leg 7-C; RX restored to -19 dBm.", resolvedAt: hoursAgo(64), createdAt: hoursAgo(72) },
    { ruleId: cpu.id, severity: "LOW", title: "Memory 78% on Monitor-1", message: "Long-term memory creep on monitoring appliance.", source: "internal", status: "RESOLVED", acknowledgedBy: admin?.name ?? "NOC Admin", acknowledgedAt: hoursAgo(96), resolution: "Log rotation schedule tightened; weekly restart cron added.", resolvedAt: hoursAgo(90), createdAt: hoursAgo(100) },
    { ruleId: bw.id, severity: "LOW", title: "DHCP pool 'zone-2' at 82%", message: "Lease utilization crossing advisory threshold.", source: "ipam", status: "RESOLVED", acknowledgedBy: admin?.name ?? "NOC Admin", acknowledgedAt: hoursAgo(120), resolution: "Pool expanded /23 → /22.", resolvedAt: hoursAgo(118), createdAt: hoursAgo(124) },
    // SUPPRESSED example
    { ruleId: cpu.id, severity: "MEDIUM", title: "CPU 71% on Core-Router-01", message: "Expected during nightly backup window.", source: "snmp-poller", deviceId: "dev-cr-01", status: "SUPPRESSED", createdAt: hoursAgo(6) },
  ];

  const createdAlerts: { id: string; status: string; title: string }[] = [];
  for (const a of alerts) {
    const created = await db.networkAlert.create({
      data: {
        ruleId: a.ruleId ?? null,
        severity: a.severity,
        title: a.title,
        message: a.message,
        source: a.source,
        deviceId: a.deviceId ?? "",
        status: a.status,
        acknowledgedBy: a.acknowledgedBy ?? "",
        acknowledgedAt: a.acknowledgedAt ?? null,
        resolution: a.resolution ?? "",
        resolvedAt: a.resolvedAt ?? null,
        duplicateCount: a.duplicateCount ?? 1,
        escalationLevel: a.escalationLevel ?? 0,
        createdAt: a.createdAt,
        updatedAt: a.resolvedAt ?? a.acknowledgedAt ?? a.createdAt,
        assignedToId: a.assignedToId ?? null,
      },
      select: { id: true, status: true, title: true },
    });
    createdAlerts.push(created);
  }

  // ─── Alert comments on a couple of alerts ─────────────────────
  const criticalActive = createdAlerts.find((a) => a.status === "ACTIVE");
  const resolvedOne = createdAlerts.find((a) => a.status === "RESOLVED");
  if (criticalActive) {
    await db.alertComment.create({ data: { alertId: criticalActive.id, userId: adminId, message: "NOC notified via WhatsApp bridge. Field tech dispatched to pop-site 3." } });
  }
  if (resolvedOne) {
    await db.alertComment.create({ data: { alertId: resolvedOne.id, userId: adminId, message: "Root cause logged: utility power transfer exceeded ATS transfer time." } });
  }

  // ─── Suppressions ─────────────────────────────────────────────
  await db.alertSuppression.create({
    data: {
      alertRuleId: cpu.id,
      reason: "Nightly backup window — CPU spikes expected 01:00-02:00",
      suppressedBy: admin?.name ?? "NOC Admin",
      startsAt: minsAgo(90),
      endsAt: minsFromNow(30),
    },
  });
  await db.alertSuppression.create({
    data: {
      alertRuleId: rx.id,
      reason: "Fiber reroute maintenance completed — window expired",
      suppressedBy: "Field Ops",
      startsAt: hoursAgo(30),
      endsAt: hoursAgo(28),
    },
  });

  // ─── Maintenance window ───────────────────────────────────────
  await db.maintenanceWindow.create({
    data: {
      title: "Ring segment D fiber reroute",
      description: "Carrier moving ring segment D to new duct. Agg switches may flap; suppressions recommended.",
      scheduledAt: minsAgo(60),
      endTime: minsFromNow(120),
      affectedAreaIds: JSON.stringify([]),
      status: "IN PROGRESS",
    },
  });

  // ─── Notification rules (event → channel routing) ─────────────
  await db.notificationRule.createMany({
    data: [
      { name: "Payment received → In-App receipt", triggerEvent: "payment.received", channel: "IN_APP", templateId: "", message: "Payment of {{amount}} received from {{name}}. Invoice {{invoice}} settled.", isActive: true },
      { name: "Invoice generated → Email invoice", triggerEvent: "invoice.generated", channel: "EMAIL", templateId: "tpl-invoice-standard", message: "Hi {{name}}, your invoice {{invoice}} for {{amount}} is due on {{dueDate}}.", isActive: true },
      { name: "Invoice overdue → WhatsApp nudge", triggerEvent: "invoice.overdue", channel: "WHATSAPP", templateId: "tpl-overdue-nudge", message: "Hi {{name}}, invoice {{invoice}} ({{amount}}) is past due. Pay now to avoid service interruption.", isActive: true },
      { name: "Device offline → SMS escalation", triggerEvent: "device.offline", channel: "SMS", templateId: "", message: "[{{severity}}] {{device}} is offline since {{time}}. — Cryptsk NOC", isActive: true },
      { name: "Complaint opened → In-App ticket trail", triggerEvent: "complaint.opened", channel: "IN_APP", templateId: "", message: "Complaint {{ticket}} opened by {{name}}: {{summary}}", isActive: false },
    ],
  });

  // ─── Recent Notification deliveries (feeds stats panel) ───────
  await db.notification.createMany({
    data: [
      { type: "EMAIL", category: "BILL_DUE", title: "Invoice INV-2026-0912 generated", message: "Invoice for Ayesha K. generated via schedule.", status: "SENT", sentAt: minsAgo(40), createdAt: minsAgo(40) },
      { type: "WHATSAPP", category: "BILL_DUE", title: "Overdue nudge — INV-2026-0877", message: "WhatsApp nudge dispatched for overdue invoice.", status: "DELIVERED", sentAt: minsAgo(120), deliveredAt: minsAgo(119), createdAt: minsAgo(120) },
      { type: "SMS", category: "OUTAGE", title: "[CRITICAL] OLT-BRAS-01 is offline", message: "Escalation SMS to NOC on-call.", status: "SENT", sentAt: minsAgo(14), createdAt: minsAgo(14) },
      { type: "IN_APP", category: "PAYMENT_CONFIRM", title: "Payment received — ₹1,199", message: "UPI payment for INV-2026-0901.", status: "READ", sentAt: hoursAgo(5), createdAt: hoursAgo(5) },
      { type: "EMAIL", category: "WELCOME", title: "Welcome to Cryptsk Broadband", message: "Onboarding email for new subscriber.", status: "FAILED", createdAt: hoursAgo(8) },
      { type: "PUSH", category: "MAINTENANCE", title: "Maintenance window tonight 01:00-02:00", message: "Planned maintenance notification push.", status: "SENT", sentAt: hoursAgo(11), createdAt: hoursAgo(11) },
    ],
  });

  console.log(`✅ ALERTS seed complete: ${rules.length} rules, ${createdAlerts.length} alerts, 2 suppressions, 1 maintenance window, 5 notification rules, 6 deliveries`);
}

main()
  .catch((e) => {
    console.error("❌ seed-alerts failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
