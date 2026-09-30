// Cryptsk Billing Cron Service — Port 3004
// Production-ready billing automation with real database access, auth, and structured logging

import { PrismaClient } from "@prisma/client";
import { requireAuth, corsHeaders } from "../shared/auth.ts";
import { createLogger } from "../shared/logger.ts";

const db = new PrismaClient();
const logger = createLogger("billing-cron");

// ─── Helpers ────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function jsonErr(message: string, status = 400) {
  return json({ error: message }, status);
}

// ─── RADIUS data-plane enforcement ─────────────────────────
// [AUDIT-FIX F-04] The cron previously only flipped DB status. These helpers mirror
// src/lib/radius-sync.ts blockUserInFreeRADIUS/unblockUserInFreeRADIUS so suspended
// subscribers are actually rejected by FreeRADIUS (Auth-Type=Reject in radcheck).
function esc(v: string): string {
  return v.replace(/'/g, "''");
}

async function blockRadiusUser(username: string): Promise<void> {
  const uname = esc(username);
  await db.$executeRawUnsafe(`DELETE FROM radcheck WHERE username = '${uname}' AND attribute = 'Auth-Type'`);
  await db.$executeRawUnsafe(`INSERT INTO radcheck (username, attribute, op, value) VALUES ('${uname}', 'Auth-Type', ':=', 'Reject')`);
}

async function unblockRadiusUser(username: string): Promise<void> {
  const uname = esc(username);
  await db.$executeRawUnsafe(`DELETE FROM radcheck WHERE username = '${uname}' AND attribute = 'Auth-Type'`);
}

// ─── Scheduled Jobs State ──────────────────────────────────

interface JobExecution {
  id: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: "running" | "success" | "failed";
  result?: Record<string, unknown>;
  error?: string;
}

interface ScheduledJob {
  id: string;
  name: string;
  description: string;
  type: string;
  cron: string;
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
  status: "idle" | "running";
  totalRuns: number;
  successCount: number;
  failCount: number;
  history: JobExecution[];
  handler: () => Promise<Record<string, unknown>>;
}

// ─── Job Handlers (Real Database Operations) ───────────────

async function jobGenerateInvoices(): Promise<Record<string, unknown>> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Find active subscribers with plans
  const subscribers = await db.subscriber.findMany({
    where: {
      status: "ACTIVE",
      planId: { not: null },
    },
    include: { Plan: true },
  });

  let generated = 0;
  let totalAmount = 0;
  let totalTax = 0;

  for (const sub of subscribers) {
    if (!sub.Plan) continue;
    const plan = sub.Plan;

    // Check if invoice already exists for this subscriber this month
    const existing = await db.invoice.findFirst({
      where: {
        subscriberId: sub.id,
        periodStart: { gte: monthStart },
        periodEnd: { lte: monthEnd },
      },
    });
    if (existing) continue;

    // Get ISP settings for prefix
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const graceDays = settings?.gracePeriodDays || 5;

    const subtotal = plan.priceMonthly;
    const cgstAmount = subtotal * (plan.cgstPercent / 100);
    const sgstAmount = subtotal * (plan.sgstPercent / 100);
    const totalTaxVal = cgstAmount + sgstAmount;
    const grandTotal = subtotal + totalTaxVal;

    // [AUDIT-FIX F-12] Same canonical allocator as the app (max over INV-<digits>) with
    // P2002 retry — previously count()-based, so a concurrent manual invoice caused 500s.
    let invoiceNumber = "";
    let created = false;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const maxRow = await db.$queryRaw<Array<{ max_num: string | null }>>`
        SELECT MAX(NULLIF(regexp_replace("invoiceNumber", '^INV-', ''), '')::bigint)::text AS max_num
        FROM "Invoice"
        WHERE "invoiceNumber" ~ '^INV-[0-9]+$'
      `;
      const next = maxRow?.[0]?.max_num ? parseInt(maxRow[0].max_num, 10) + 1 : 1;
      invoiceNumber = `INV-${String(next).padStart(5, "0")}`;
      try {
        await db.invoice.create({
          data: {
            invoiceNumber,
            subscriberId: sub.id,
            planId: plan.id,
            issueDate: now,
            dueDate: new Date(now.getTime() + graceDays * 86400000),
            periodStart: monthStart,
            periodEnd: monthEnd,
            description: `${plan.name} - Monthly Subscription`,
            subtotal,
            cgstAmount,
            sgstAmount,
            totalTax: totalTaxVal,
            // [AUDIT-FIX F-14] totalAmount previously excluded tax (stored `subtotal` while
            // grandTotal = subtotal + tax) — every report reading totalAmount understated
            // monthly billed revenue by the GST amount.
            totalAmount: grandTotal,
            grandTotal,
            balanceAmount: grandTotal,
            status: "DRAFT",
          },
        });
        created = true;
      } catch (e: unknown) {
        if ((e as { code?: string })?.code !== "P2002") throw e;
      }
    }
    if (!created) continue;

    generated++;
    totalAmount += grandTotal;
    totalTax += totalTaxVal;
  }

  logger.info("Invoices generated", { generated, totalAmount, totalTax });
  return { invoicesGenerated: generated, totalAmount: Math.round(totalAmount), totalTax: Math.round(totalTax) };
}

async function jobCheckOverdue(): Promise<Record<string, unknown>> {
  const now = new Date();

  // Find all SENT invoices past due date
  const overdueInvoices = await db.invoice.findMany({
    where: {
      status: { in: ["SENT", "DRAFT"] },
      dueDate: { lt: now },
      balanceAmount: { gt: 0 },
    },
    include: { Subscriber: true },
  });

  let marked = 0;
  let lateFeesAdded = 0;
  let totalLateFees = 0;

  const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
  const lateFeeType = settings?.lateFeeType || "PERCENTAGE";
  const lateFeeValue = settings?.lateFeeValue || 0;

  for (const inv of overdueInvoices) {
    await db.invoice.update({
      where: { id: inv.id },
      data: { status: "OVERDUE" },
    });
    marked++;

    // Calculate and add late fee
    if (lateFeeValue > 0 && inv.lateFee === 0) {
      let lateFee = 0;
      if (lateFeeType === "PERCENTAGE") {
        lateFee = inv.grandTotal * (lateFeeValue / 100);
      } else {
        lateFee = lateFeeValue;
      }
      if (lateFee > 0) {
        await db.invoice.update({
          where: { id: inv.id },
          data: {
            lateFee,
            grandTotal: inv.grandTotal + lateFee,
            balanceAmount: inv.balanceAmount + lateFee,
          },
        });
        lateFeesAdded++;
        totalLateFees += lateFee;
      }
    }
  }

  logger.info("Overdue check complete", { checked: overdueInvoices.length, marked, lateFeesAdded, totalLateFees });
  return { checked: overdueInvoices.length, markedOverdue: marked, lateFeesAdded, totalLateFees: Math.round(totalLateFees) };
}

async function jobSendReminders(): Promise<Record<string, unknown>> {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000);
  const reminderThreshold = new Date(now.getTime() - 3 * 86400000);

  // Find invoices due in 3 days
  const upcoming = await db.invoice.findMany({
    where: {
      status: { in: ["SENT", "DRAFT"] },
      dueDate: { gte: now, lte: threeDaysFromNow },
      balanceAmount: { gt: 0 },
    },
    include: { Subscriber: true },
  });

  // Find invoices overdue for 1-3 days
  const overdueRecent = await db.invoice.findMany({
    where: {
      status: "OVERDUE",
      dueDate: { gte: reminderThreshold },
      balanceAmount: { gt: 0 },
    },
    include: { Subscriber: true },
  });

  let queued = 0;

  // Queue notifications for upcoming due
  for (const inv of upcoming) {
    if (!inv.Subscriber) continue;
    await db.notification.create({
      data: {
        subscriberId: inv.Subscriber.id,
        type: "IN_APP",
        category: "BILL_DUE",
        title: "Payment Reminder",
        message: `Your bill of ₹${inv.grandTotal} is due on ${inv.dueDate.toLocaleDateString()}. Invoice: ${inv.invoiceNumber}`,
        status: "PENDING",
      },
    });
    queued++;
  }

  // Queue notifications for recent overdue
  for (const inv of overdueRecent) {
    if (!inv.Subscriber) continue;
    await db.notification.create({
      data: {
        subscriberId: inv.Subscriber.id,
        type: "IN_APP",
        category: "BILL_DUE",
        title: "Overdue Payment Reminder",
        message: `Your bill of ₹${inv.grandTotal} (Invoice: ${inv.invoiceNumber}) is overdue. Please pay immediately to avoid service suspension.`,
        status: "PENDING",
      },
    });
    queued++;
  }

  logger.info("Reminders queued", { upcomingDue: upcoming.length, overdueRecent: overdueRecent.length, totalQueued: queued });
  return { upcomingDue: upcoming.length, overdueRecent: overdueRecent.length, totalQueued: queued };
}

async function jobSuspendOverdue(): Promise<Record<string, unknown>> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  // Find subscribers with invoices overdue > 30 days
  const overdueInvoices = await db.invoice.findMany({
    where: {
      status: "OVERDUE",
      dueDate: { lt: thirtyDaysAgo },
      balanceAmount: { gt: 0 },
    },
    include: { Subscriber: true },
    distinct: ["subscriberId"],
  });

  let suspended = 0;
  let radiusBlocked = 0;
  let graceHonored = 0;
  for (const inv of overdueInvoices) {
    if (!inv.Subscriber || inv.Subscriber.status !== "ACTIVE") continue;

    // [AUDIT-FIX F-16] Skip subscribers inside an operator-granted grace window —
    // the grace period CRUD existed but nothing honored it at enforcement time.
    const gracePeriod = await db.subscriberGracePeriod.findFirst({
      where: {
        subscriberId: inv.Subscriber.id,
        status: "ACTIVE",
        OR: [
          { suspensionDate: { gt: new Date() } },
          { suspensionDate: null, appliedAt: { gt: new Date(Date.now() - 86400000 * 365) } },
        ],
      },
      select: { id: true, graceDays: true, appliedAt: true, suspensionDate: true },
    });
    if (gracePeriod) {
      const windowEnd = gracePeriod.suspensionDate
        ? new Date(gracePeriod.suspensionDate).getTime()
        : gracePeriod.appliedAt.getTime() + gracePeriod.graceDays * 86400000;
      if (windowEnd > Date.now()) {
        graceHonored++;
        continue;
      }
    }

    await db.subscriber.update({
      where: { id: inv.Subscriber.id },
      data: { status: "SUSPENDED" },
    });

    // [AUDIT-FIX F-04] Enforce the suspension in FreeRADIUS — non-payers must not
    // be able to authenticate. Failures are logged but do not abort the sweep.
    if (inv.Subscriber.radiusEnabled && inv.Subscriber.serviceUsername) {
      try {
        await blockRadiusUser(inv.Subscriber.serviceUsername);
        radiusBlocked++;
      } catch (e) {
        logger.error("RADIUS block failed", { username: inv.Subscriber.serviceUsername, error: String(e) });
      }
    }

    // Create notification
    await db.notification.create({
      data: {
        subscriberId: inv.Subscriber.id,
        type: "IN_APP",
        category: "BILL_DUE",
        title: "Service Suspended",
        message: `Your service has been suspended due to unpaid invoice ${inv.invoiceNumber} (₹${inv.balanceAmount}). Please pay to reactivate.`,
        status: "PENDING",
      },
    });

    suspended++;
  }

  logger.info("Suspension job complete", { checked: overdueInvoices.length, suspended, radiusBlocked, graceHonored });
  return { checked: overdueInvoices.length, suspended, radiusBlocked, graceHonored };
}

// [AUDIT-FIX F-05] Expiry enforcement — the product had NO mechanism to stop service
// when a plan's validity lapses (reproduced live: subscriber expired 60 days stayed
// ACTIVE and unblocked after running the suspend-overdue job, because that job only
// looks at OVERDUE invoices). This job computes each subscriber's paid-through date
// from their billing anchor + plan validity and suspends + RADIUS-blocks whoever has
// lapsed beyond the grace period.
async function jobExpiryEnforcement(): Promise<Record<string, unknown>> {
  const graceDays = 3; // default days of tolerance after the paid-through date before suspension
  const now = Date.now();

  // [AUDIT-FIX F-16] Operator-granted grace windows now EXTEND the tolerance:
  // a subscriber with an ACTIVE SubscriberGracePeriod gets max(default, graceDays).
  const activeGrace = await db.subscriberGracePeriod.findMany({
    where: { status: "ACTIVE" },
    select: { subscriberId: true, graceDays: true, appliedAt: true, suspensionDate: true },
  });
  const graceBySubscriber = new Map<string, number>();
  for (const gp of activeGrace) {
    const windowEnd = gp.suspensionDate
      ? new Date(gp.suspensionDate).getTime()
      : gp.appliedAt.getTime() + gp.graceDays * 86400000;
    if (windowEnd > now) {
      graceBySubscriber.set(gp.subscriberId, Math.max(graceBySubscriber.get(gp.subscriberId) || 0, gp.graceDays));
    }
  }

  const active = await db.subscriber.findMany({
    where: { status: "ACTIVE", planId: { not: null } },
    include: { Plan: { select: { name: true, validityDays: true } } },
  });

  let checked = 0;
  let expiredSuspended = 0;
  let radiusBlocked = 0;
  const details: Array<{ code: string; expiredDaysAgo: number }> = [];

  for (const sub of active) {
    const validityDays = sub.Plan?.validityDays || 30;
    if (!sub.billingStartDate) continue;
    checked++;

    // Paid-through = last cycle anchor + one validity period.
    // The billing anchor advances on every renewal, so the subscriber is entitled to
    // service from billingStartDate until billingStartDate + validityDays (single-cycle
    // entitlement). Multi-cycle renewals set the anchor to the final cycle (bulk renew
    // writes newBillingStart = periodStart + cycleDays*(months-1)), so this stays correct.
    const paidThrough = sub.billingStartDate.getTime() + validityDays * 86400000;
    const lapsedDays = Math.floor((now - paidThrough) / 86400000);

    // Beyond the paid-through date + grace AND no PAID invoice covering the future
    // (belt-and-braces: a recently generated invoice that starts in the future means
    // the operator has already taken payment for the next cycle).
    const effectiveGrace = Math.max(graceDays, graceBySubscriber.get(sub.id) || 0);
    if (lapsedDays > effectiveGrace) {
      const coveringInvoice = await db.invoice.findFirst({
        where: {
          subscriberId: sub.id,
          status: { in: ["PAID", "SENT", "PARTIALLY_PAID"] },
          periodEnd: { gte: new Date() },
        },
        select: { invoiceNumber: true },
      });
      if (coveringInvoice) continue; // already paid for a period extending past today

      await db.subscriber.update({
        where: { id: sub.id },
        data: { status: "SUSPENDED" },
      });
      if (sub.radiusEnabled && sub.serviceUsername) {
        try {
          await blockRadiusUser(sub.serviceUsername);
          radiusBlocked++;
        } catch (e) {
          logger.error("Expiry RADIUS block failed", { username: sub.serviceUsername, error: String(e) });
        }
      }
      await db.notification.create({
        data: {
          subscriberId: sub.id,
          type: "IN_APP",
          category: "BILL_DUE",
          title: "Plan Expired",
          message: `Your plan ${sub.Plan?.name || ""} expired ${lapsedDays} day(s) ago and service has been suspended. Renew to reactivate instantly.`,
          status: "PENDING",
        },
      });
      expiredSuspended++;
      details.push({ code: sub.code, expiredDaysAgo: lapsedDays });
    }
  }

  logger.info("Expiry enforcement complete", { checked, expiredSuspended, radiusBlocked });
  return { checked, expiredSuspended, radiusBlocked, details };
}

async function jobUsageReset(): Promise<Record<string, unknown>> {
  // Reset monthly data counters for all active subscribers
  const result = await db.subscriber.updateMany({
    where: { status: "ACTIVE" },
    data: { currentCycleDataUsed: 0 },
  });

  logger.info("Usage reset complete", { resetCount: result.count });
  return { resetCount: result.count };
}

// [AUDIT-FIX F-16] Complaint SLA escalation — previously this logic lived inside
// GET /api/complaints (a read path!), so escalation only happened when someone
// browsed the complaints page, and never overnight. job-007 owns it on the clock.
async function jobComplaintSlaSweep(): Promise<Record<string, unknown>> {
  const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
  if (!settings?.complaintEscalationEnabled) {
    logger.info("Complaint SLA sweep skipped — escalation disabled");
    return { skipped: true, reason: "escalation disabled in settings" };
  }

  const active = await db.complaint.findMany({
    where: {
      status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
      isSlaPaused: false,
      slaDeadline: { not: null },
      escalationLevel: { lt: 2 },
    },
    select: {
      id: true, ticketNumber: true, status: true, priority: true,
      escalationLevel: true, slaDeadline: true, createdAt: true,
      assignedToId: true,
    },
  });

  const level1Percent = settings.complaintEscalationLevel1Percent || 75;
  const level2Percent = settings.complaintEscalationLevel2Percent || 100;
  const PRIORITY_ORDER: Record<string, string> = {
    P4_LOW: "P3_MEDIUM",
    P3_MEDIUM: "P2_HIGH",
    P2_HIGH: "P1_CRITICAL",
  };

  const now = Date.now();
  let escalatedL1 = 0;
  let escalatedL2 = 0;
  let priorityRaised = 0;
  const details: string[] = [];

  for (const c of active) {
    const deadline = new Date(c.slaDeadline!).getTime();
    const created = new Date(c.createdAt).getTime();
    const totalSlaMs = Math.max(deadline - created, 1);
    const elapsedPercent = ((now - created) / totalSlaMs) * 100;

    let newLevel = c.escalationLevel;
    if (elapsedPercent >= level2Percent && c.escalationLevel < 2) newLevel = 2;
    else if (elapsedPercent >= level1Percent && c.escalationLevel < 1) newLevel = 1;

    const breached = elapsedPercent >= 100;
    const newPriority = breached ? (PRIORITY_ORDER[c.priority] || null) : null;

    if (newLevel !== c.escalationLevel || (newPriority && newPriority !== c.priority)) {
      const data: Record<string, unknown> = { escalationLevel: newLevel };
      if (newPriority && newPriority !== c.priority) data.priority = newPriority;

      await db.complaint.update({ where: { id: c.id }, data });
      await db.auditLog.create({
        data: {
          action: "AUTO_ESCALATION",
          entity: "Complaint",
          entityId: c.id,
          details: JSON.stringify({
            ticketNumber: c.ticketNumber,
            fromLevel: c.escalationLevel,
            toLevel: newLevel,
            fromPriority: c.priority,
            toPriority: newPriority || c.priority,
            toRole: newLevel === 1 ? (settings.complaintEscalationRole1 || "MANAGER") : (settings.complaintEscalationRole2 || "ADMIN"),
            elapsedPercent: Math.round(elapsedPercent * 10) / 10,
            triggeredBy: "job-007-sla-sweep",
          }),
          userName: "System",
        },
      });

      // [NEW-FEATURE] Surface the escalation in the notification center —
      // previously it only landed in the audit trail where nobody looks.
      // One IN_APP row per active staff member (ADMIN/SUPER_ADMIN) + the
      // assigned technician if any.
      try {
        const staff = await db.user.findMany({
          where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" },
          select: { id: true },
        });
        if (c.assignedToId) staff.push({ id: c.assignedToId });
        const uniqueStaff = Array.from(new Set(staff.map((s) => s.id)));
        if (uniqueStaff.length > 0) {
          const escLabel = newLevel === 1 ? "L1 · Manager" : "L2 · Admin";
          await db.notification.createMany({
            data: uniqueStaff.map((uid) => ({
              userId: uid,
              type: "IN_APP" as const,
              category: "OTHER" as const,
              title: `SLA Escalation — ${c.ticketNumber}`,
              message: `Complaint ${c.ticketNumber} auto-escalated to ${escLabel}${newPriority && newPriority !== c.priority ? ` and raised to ${newPriority.replace("P", "P")}` : ""}. SLA ${Math.round(elapsedPercent)}% elapsed.`,
              status: "PENDING" as const,
            })),
          });
        }
      } catch (e) {
        logger.error("Escalation notification write failed", { ticket: c.ticketNumber, error: String(e) });
      }

      if (newLevel === 2 && c.escalationLevel < 2) escalatedL2++;
      else if (newLevel === 1 && c.escalationLevel < 1) escalatedL1++;
      if (newPriority && newPriority !== c.priority) {
        priorityRaised++;
        details.push(`${c.ticketNumber} → ${newPriority}`);
      }
    }
  }

  logger.info("Complaint SLA sweep complete", {
    checked: active.length, escalatedL1, escalatedL2, priorityRaised,
  });
  return { checked: active.length, escalatedL1, escalatedL2, priorityRaised, details };
}

// [AUDIT-FIX F-16] Grace-period automation — SubscriberGracePeriod rows existed
// with CRUD + UI but NOTHING read them. This job applies the operator-granted
// grace: subscribers inside their grace window are protected from job-004
// suspension (consumed here via the same lookup) and get a heads-up notification
// before the window ends; expired windows are marked USED so they stop protecting.
async function jobGracePeriodSweep(): Promise<Record<string, unknown>> {
  const now = new Date();
  const activePeriods = await db.subscriberGracePeriod.findMany({
    where: { status: "ACTIVE" },
    include: { Subscriber: { select: { id: true, code: true, name: true, status: true } } },
  });

  let markedUsed = 0;
  let notified = 0;
  for (const gp of activePeriods) {
    // Window end = appliedAt + graceDays (or explicit suspensionDate if set)
    const windowEnd = gp.suspensionDate
      ? new Date(gp.suspensionDate)
      : new Date(gp.appliedAt.getTime() + gp.graceDays * 86400000);

    if (now > windowEnd) {
      await db.subscriberGracePeriod.update({
        where: { id: gp.id },
        data: { status: "USED" },
      });
      markedUsed++;
      continue;
    }

    // Remind the subscriber once per day while inside the window (deduped by
    // only notifying when a prior reminder for today does not exist).
    if (gp.Subscriber && gp.graceDays > 0) {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const recentReminder = await db.notification.findFirst({
        where: {
          subscriberId: gp.Subscriber.id,
          category: "BILL_DUE",
          title: "Grace Period Active",
          createdAt: { gte: startOfDay },
        },
        select: { id: true },
      });
      if (!recentReminder) {
        const daysLeft = Math.max(0, Math.ceil((windowEnd.getTime() - now.getTime()) / 86400000));
        await db.notification.create({
          data: {
            subscriberId: gp.Subscriber.id,
            type: "IN_APP",
            category: "BILL_DUE",
            title: "Grace Period Active",
            message: `A ${gp.graceDays}-day grace period is active on your account. Please clear your dues before ${windowEnd.toISOString().slice(0, 10)} (${daysLeft} day(s) left) to avoid service suspension.`,
            status: "PENDING",
          },
        });
        notified++;
      }
    }
  }

  logger.info("Grace period sweep complete", { active: activePeriods.length, markedUsed, notified });
  return { active: activePeriods.length, markedUsed, notified };
}

// ─── Job 009: Retention & Archival Sweep ────────────────────
// [NEW-FEATURE] Data-retention automation (GST/tax law requires keeping
// financial records; audit/event logs should not grow unbounded).
// Two-stage archival for AuditLog: mark isArchived after AUDIT_ARCHIVE_DAYS,
// hard-delete after AUDIT_PURGE_DAYS. Sessions, delivered notifications and
// stale PENDING notifications are pruned on their own schedules.
// Configurable via env: RETENTION_AUDIT_ARCHIVE_DAYS (90), RETENTION_AUDIT_PURGE_DAYS (180),
// RETENTION_SESSION_DAYS (30), RETENTION_NOTIFICATION_DAYS (60).

function envDays(name: string, fallback: number): number {
  const v = parseInt(process.env[name] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function jobRetentionSweep(): Promise<Record<string, unknown>> {
  const now = new Date();
  const archiveDays = envDays("RETENTION_AUDIT_ARCHIVE_DAYS", 90);
  const purgeDays = envDays("RETENTION_AUDIT_PURGE_DAYS", 180);
  const sessionDays = envDays("RETENTION_SESSION_DAYS", 30);
  const notificationDays = envDays("RETENTION_NOTIFICATION_DAYS", 60);

  const archiveCutoff = new Date(now.getTime() - archiveDays * 86400000);
  const purgeCutoff = new Date(now.getTime() - purgeDays * 86400000);
  const sessionCutoff = new Date(now.getTime() - sessionDays * 86400000);
  const notificationCutoff = new Date(now.getTime() - notificationDays * 86400000);

  // ── Stage 1: archive audit logs past retention window (idempotent) ──
  const archived = await db.auditLog.updateMany({
    where: { timestamp: { lt: archiveCutoff }, isArchived: false },
    data: { isArchived: true, archivedAt: now },
  });

  // ── Stage 2: hard-delete audit logs past the purge window (2x retention) ──
  const purgedAuditLogs = await db.auditLog.deleteMany({
    where: { timestamp: { lt: purgeCutoff } },
  });

  // ── Sessions: any row (active or revoked) untouched past the window is dead.
  // Cookie life is 7 days, so nothing legitimately survives 30 days inactive. ──
  const purgedSessions = await db.userSession.deleteMany({
    where: { updatedAt: { lt: sessionCutoff } },
  });

  // ── Notifications: DELIVERED read-notifications past window + ancient PENDING ──
  const purgedDeliveredNotifications = await db.notification.deleteMany({
    where: {
      status: "DELIVERED",
      OR: [{ deliveredAt: { lt: notificationCutoff } }, { createdAt: { lt: notificationCutoff } }],
    },
  });
  const purgedStaleNotifications = await db.notification.deleteMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 90 * 86400000) } },
  });

  const result = {
    archivedAuditLogs: archived.count,
    purgedAuditLogs: purgedAuditLogs.count,
    purgedSessions: purgedSessions.count,
    purgedDeliveredNotifications: purgedDeliveredNotifications.count,
    purgedStaleNotifications: purgedStaleNotifications.count,
    retention: { auditArchiveDays: archiveDays, auditPurgeDays: purgeDays, sessionDays, notificationDays },
  };

  // ── Visibility: every sweep writes an auditable trail row so the Audit Log
  // page's Retention card can show "last sweep" + counts (RETENTION_SWEEP). ──
  try {
    await db.auditLog.create({
      data: {
        action: "RETENTION_SWEEP",
        entity: "System",
        entityId: "job-009",
        endpoint: "/api/retention-sweep",
        method: "CRON",
        ipAddress: "127.0.0.1",
        userAgent: "billing-cron/job-009",
        details: JSON.stringify(result),
      },
    });

    // Notify staff (ADMIN + SUPER_ADMIN) whenever data was actually pruned —
    // silent no-op sweeps stay silent.
    const totalChanged =
      archived.count + purgedAuditLogs.count + purgedSessions.count +
      purgedDeliveredNotifications.count + purgedStaleNotifications.count;
    if (totalChanged > 0) {
      const admins = await db.user.findMany({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" },
        select: { id: true },
      });
      if (admins.length > 0) {
        await db.notification.createMany({
          data: admins.map((u) => ({
            userId: u.id,
            type: "IN_APP" as const,
            category: "MAINTENANCE" as const,
            title: "Retention Sweep Completed",
            message: `Automated retention sweep (job-009): ${archived.count} audit log(s) archived, ${purgedAuditLogs.count} purged, ${purgedSessions.count} session(s) and ${purgedDeliveredNotifications.count + purgedStaleNotifications.count} notification(s) removed.`,
            status: "PENDING" as const,
          })),
        });
      }
    }
  } catch (e) {
    logger.error("Retention sweep audit-trail/notification write failed", { error: String(e) });
  }

  logger.info("Retention sweep complete", result);
  return result;
}

// ─── Job Registry ───────────────────────────────────────────

function getNextRun(cron: string): string {
  const now = new Date();
  const next = new Date(now);
  if (cron.includes("0 0 1 * *")) {
    // Monthly on 1st
    next.setMonth(next.getMonth() + 1, 1, 0, 0, 0, 0);
  } else if (cron.includes("0 0 * * *")) {
    // Daily midnight
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  } else if (cron.includes("0 6 * * *")) {
    // Daily 6 AM
    if (next.getHours() >= 6) next.setDate(next.getDate() + 1);
    next.setHours(6, 0, 0, 0);
  } else if (cron.includes("0 9 * * *")) {
    // Daily 9 AM
    if (next.getHours() >= 9) next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  } else if (cron.includes("0 2 * * *")) {
    // Daily 2 AM
    if (next.getHours() >= 2) next.setDate(next.getDate() + 1);
    next.setHours(2, 0, 0, 0);
  } else if (cron === "0 * * * *") {
    // Hourly (complaint SLA sweep)
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else if (cron === "30 7 * * *") {
    // Daily 7:30 AM (grace period sweep)
    if (next.getHours() > 7 || (next.getHours() === 7 && next.getMinutes() >= 30)) next.setDate(next.getDate() + 1);
    next.setHours(7, 30, 0, 0);
  } else if (cron === "30 4 * * *") {
    // Daily 4:30 AM (retention & archival sweep)
    if (next.getHours() > 4 || (next.getHours() === 4 && next.getMinutes() >= 30)) next.setDate(next.getDate() + 1);
    next.setHours(4, 30, 0, 0);
  } else {
    next.setMinutes(next.getMinutes() + 5, 0, 0);
  }
  return next.toISOString();
}

const jobs: ScheduledJob[] = [
  {
    id: "job-001",
    name: "Auto Invoice Generation",
    description: "Generate invoices for all active subscribers at billing cycle start",
    type: "auto-invoice",
    cron: "0 0 1 * *",
    enabled: true,
    nextRun: getNextRun("0 0 1 * *"),
    status: "idle",
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    history: [],
    handler: jobGenerateInvoices,
  },
  {
    id: "job-002",
    name: "Overdue Invoice Check",
    description: "Flag invoices past due date and calculate late fees",
    type: "overdue-check",
    cron: "0 0 * * *",
    enabled: true,
    nextRun: getNextRun("0 0 * * *"),
    status: "idle",
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    history: [],
    handler: jobCheckOverdue,
  },
  {
    id: "job-003",
    name: "Payment Reminder",
    description: "Send payment reminders for upcoming and overdue invoices",
    type: "reminder",
    cron: "0 9 * * *",
    enabled: true,
    nextRun: getNextRun("0 9 * * *"),
    status: "idle",
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    history: [],
    handler: jobSendReminders,
  },
  {
    id: "job-004",
    name: "Suspend Overdue Subscribers",
    description: "Suspend subscribers with >30 day overdue invoices",
    type: "suspension-check",
    cron: "0 6 * * *",
    enabled: true,
    nextRun: getNextRun("0 6 * * *"),
    status: "idle",
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    history: [],
    handler: jobSuspendOverdue,
  },
  {
    id: "job-005",
    name: "Usage Data Reset",
    description: "Reset monthly data usage counters on billing cycle date",
    type: "usage-reset",
    cron: "0 0 1 * *",
    enabled: true,
    nextRun: getNextRun("0 0 1 * *"),
    status: "idle",
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    history: [],
    handler: jobUsageReset,
  },
  {
    id: "job-006",
    name: "Expiry Enforcement",
    description: "Suspend + RADIUS-block subscribers whose plan validity lapsed beyond grace period [AUDIT-FIX F-05]",
    type: "expiry-enforcement",
    cron: "0 7 * * *",
    enabled: true,
    nextRun: getNextRun("0 7 * * *"),
    status: "idle",
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    history: [],
    handler: jobExpiryEnforcement,
  },
  {
    id: "job-007",
    name: "Complaint SLA Sweep",
    description: "Escalate complaints past SLA thresholds (L1/L2) + auto-raise priority on breach [AUDIT-FIX F-16/F-23]",
    type: "complaint-sla",
    cron: "0 * * * *",
    enabled: true,
    nextRun: getNextRun("0 * * * *"),
    status: "idle",
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    history: [],
    handler: jobComplaintSlaSweep,
  },
  {
    id: "job-008",
    name: "Grace Period Sweep",
    description: "Apply operator-granted grace windows: protect subscribers from suspension, send reminders, expire used windows [AUDIT-FIX F-16]",
    type: "grace-period",
    cron: "30 7 * * *",
    enabled: true,
    nextRun: getNextRun("30 7 * * *"),
    status: "idle",
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    history: [],
    handler: jobGracePeriodSweep,
  },
  {
    id: "job-009",
    name: "Retention & Archival Sweep",
    description: "Two-stage audit-log archival (mark 90d → purge 180d), prune dead sessions (30d) and delivered/stale notifications (60d/90d); windows configurable via RETENTION_* env vars [NEW-FEATURE]",
    type: "retention-sweep",
    cron: "30 4 * * *",
    enabled: true,
    nextRun: getNextRun("30 4 * * *"),
    status: "idle",
    totalRuns: 0,
    successCount: 0,
    failCount: 0,
    history: [],
    handler: jobRetentionSweep,
  },
];

// ─── Job Execution ──────────────────────────────────────────

async function executeJob(job: ScheduledJob, triggeredBy: string): Promise<JobExecution> {
  const execution: JobExecution = {
    id: `exec-${Date.now()}`,
    startedAt: new Date().toISOString(),
    status: "running",
  };
  job.history.unshift(execution);
  job.status = "running";
  job.totalRuns++;

  logger.info(`Job "${job.name}" started`, { executionId: execution.id, triggeredBy });

  try {
    const startTime = Date.now();
    const result = await job.handler();
    const durationMs = Date.now() - startTime;

    execution.completedAt = new Date().toISOString();
    execution.durationMs = durationMs;
    execution.status = "success";
    execution.result = result;
    job.successCount++;
    job.lastRun = execution.completedAt;
    job.nextRun = getNextRun(job.cron);
    job.status = "idle";

    logger.info(`Job "${job.name}" completed`, { durationMs, result });
  } catch (err) {
    execution.completedAt = new Date().toISOString();
    execution.durationMs = Date.now() - new Date(execution.startedAt).getTime();
    execution.status = "failed";
    execution.error = err instanceof Error ? err.message : String(err);
    job.failCount++;
    job.lastRun = execution.completedAt;
    job.nextRun = getNextRun(job.cron);
    job.status = "idle";

    logger.error(`Job "${job.name}" failed`, { error: execution.error });
  }

  return execution;
}

// ─── Schedule Checker (runs every minute) ───────────────────

setInterval(async () => {
  for (const job of jobs) {
    if (!job.enabled || job.status === "running") continue;
    try {
      const nextRun = new Date(job.nextRun);
      if (nextRun <= new Date()) {
        await executeJob(job, "scheduler");
      }
    } catch (err) {
      logger.error(`Schedule check error for "${job.name}"`, { error: String(err) });
    }
  }
}, 60000);

// ─── Heartbeat ──────────────────────────────────────────────

setInterval(() => {
  logger.info("heartbeat", {
    runningJobs: jobs.filter((j) => j.status === "running").length,
    enabledJobs: jobs.filter((j) => j.enabled).length,
    uptime: process.uptime(),
  });
}, 60000);

// ─── HTTP Server ────────────────────────────────────────────

Bun.serve({
  port: 3004,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check — no auth required
    if (path === "/api/health" && req.method === "GET") {
      return json({
        status: "ok",
        service: "billing-cron",
        version: "2.0.0",
        uptime: process.uptime(),
        activeJobs: jobs.filter((j) => j.status === "running").length,
        enabledJobs: jobs.filter((j) => j.enabled).length,
        totalJobs: jobs.length,
        timestamp: new Date().toISOString(),
      });
    }

    // Root — redirect to health
    if (path === "/" && req.method === "GET") {
      return json({
        status: "ok",
        service: "billing-cron",
        health: "/api/health",
        docs: "/api/jobs",
      });
    }

    // ── All remaining endpoints require auth ──
    let auth;
    try {
      auth = requireAuth(req);
    } catch {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── GET /api/jobs ──
    if (path === "/api/jobs" && req.method === "GET") {
      const type = url.searchParams.get("type") || "";
      let filtered = jobs;
      if (type) filtered = filtered.filter((j) => j.type === type);
      return json({
        jobs: filtered.map((j) => ({
          ...j,
          successRate: j.totalRuns > 0 ? +((j.successCount / j.totalRuns) * 100).toFixed(1) : 0,
        })),
        total: filtered.length,
        summary: {
          total: jobs.length,
          enabled: jobs.filter((j) => j.enabled).length,
          running: jobs.filter((j) => j.status === "running").length,
          totalExecutions: jobs.reduce((sum, j) => sum + j.totalRuns, 0),
        },
      });
    }

    // ── POST /api/jobs/:id/run ──
    const runMatch = path.match(/^\/api\/jobs\/(job-\d+)\/run$/);
    if (runMatch && req.method === "POST") {
      const jobId = runMatch[1];
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return jsonErr("Job not found", 404);
      if (job.status === "running") return jsonErr("Job is already running", 409);
      if (!job.enabled) return jsonErr("Job is disabled", 400);

      // Run async — return immediately
      executeJob(job, `manual:${auth.userId}`).catch((err) => {
        logger.error("Manual job trigger failed", { jobId, error: String(err) });
      });

      return json({
        success: true,
        message: `Job "${job.name}" started`,
        jobId: job.id,
        status: "running",
        triggeredBy: auth.userId,
        timestamp: new Date().toISOString(),
      });
    }

    // ── GET /api/jobs/:id/history ──
    const historyMatch = path.match(/^\/api\/jobs\/(job-\d+)\/history$/);
    if (historyMatch && req.method === "GET") {
      const jobId = historyMatch[1];
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return jsonErr("Job not found", 404);
      const limit = parseInt(url.searchParams.get("limit") || "20");
      return json({
        jobId: job.id,
        jobName: job.name,
        totalRuns: job.totalRuns,
        successRate: job.totalRuns > 0 ? +((job.successCount / job.totalRuns) * 100).toFixed(1) : 0,
        history: job.history.slice(0, limit),
      });
    }

    // ── POST /api/generate-invoices (direct trigger) ──
    if (path === "/api/generate-invoices" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const dryRun = body.dryRun === true;
      const invoiceJob = jobs.find((j) => j.type === "auto-invoice");

      if (invoiceJob && invoiceJob.status === "running") {
        return jsonErr("Invoice generation already in progress", 409);
      }

      if (dryRun) {
        const subscribers = await db.subscriber.count({ where: { status: "ACTIVE", planId: { not: null } } });
        return json({ success: true, dryRun: true, eligibleSubscribers: subscribers, timestamp: new Date().toISOString() });
      }

      if (invoiceJob) {
        executeJob(invoiceJob, `manual:${auth.userId}`).catch(() => {});
      }

      return json({ success: true, message: "Invoice generation started", dryRun: false, timestamp: new Date().toISOString() });
    }

    // ── POST /api/check-overdue (direct trigger) ──
    if (path === "/api/check-overdue" && req.method === "POST") {
      const overdueJob = jobs.find((j) => j.type === "overdue-check");
      if (overdueJob && overdueJob.status === "running") {
        return jsonErr("Overdue check already in progress", 409);
      }
      if (overdueJob) {
        executeJob(overdueJob, `manual:${auth.userId}`).catch(() => {});
      }
      return json({ success: true, message: "Overdue check started", timestamp: new Date().toISOString() });
    }

    // ── POST /api/send-reminders (direct trigger) ──
    if (path === "/api/send-reminders" && req.method === "POST") {
      const reminderJob = jobs.find((j) => j.type === "reminder");
      if (reminderJob && reminderJob.status === "running") {
        return jsonErr("Reminder job already in progress", 409);
      }
      if (reminderJob) {
        executeJob(reminderJob, `manual:${auth.userId}`).catch(() => {});
      }
      return json({ success: true, message: "Reminder job started", timestamp: new Date().toISOString() });
    }

    // ── POST /api/suspend-overdue (direct trigger) ──
    if (path === "/api/suspend-overdue" && req.method === "POST") {
      const suspendJob = jobs.find((j) => j.type === "suspension-check");
      if (suspendJob && suspendJob.status === "running") {
        return jsonErr("Suspension job already in progress", 409);
      }
      if (suspendJob) {
        executeJob(suspendJob, `manual:${auth.userId}`).catch(() => {});
      }
      return json({ success: true, message: "Suspension job started", timestamp: new Date().toISOString() });
    }

    // ── POST /api/expiry-enforcement (direct trigger) [AUDIT-FIX F-05] ──
    if (path === "/api/expiry-enforcement" && req.method === "POST") {
      const expiryJob = jobs.find((j) => j.type === "expiry-enforcement");
      if (expiryJob && expiryJob.status === "running") {
        return jsonErr("Expiry enforcement job already in progress", 409);
      }
      if (expiryJob) {
        executeJob(expiryJob, `manual:${auth.userId}`).catch(() => {});
      }
      return json({ success: true, message: "Expiry enforcement job started", timestamp: new Date().toISOString() });
    }

    // ── POST /api/retention-sweep (direct trigger) [NEW-FEATURE] ──
    if (path === "/api/retention-sweep" && req.method === "POST") {
      const retentionJob = jobs.find((j) => j.type === "retention-sweep");
      if (retentionJob && retentionJob.status === "running") {
        return jsonErr("Retention sweep already in progress", 409);
      }
      if (retentionJob) {
        executeJob(retentionJob, `manual:${auth.userId}`).catch(() => {});
      }
      return json({ success: true, message: "Retention & archival sweep started", timestamp: new Date().toISOString() });
    }

    // ── POST /api/usage-reset (direct trigger) ──
    if (path === "/api/usage-reset" && req.method === "POST") {
      const usageJob = jobs.find((j) => j.type === "usage-reset");
      if (usageJob && usageJob.status === "running") {
        return jsonErr("Usage reset already in progress", 409);
      }
      if (usageJob) {
        executeJob(usageJob, `manual:${auth.userId}`).catch(() => {});
      }
      return json({ success: true, message: "Usage reset started", timestamp: new Date().toISOString() });
    }

    // ── GET /api/next-run ──
    if (path === "/api/next-run" && req.method === "GET") {
      return json({
        nextRuns: jobs
          .filter((j) => j.enabled)
          .map((j) => ({
            jobId: j.id,
            name: j.name,
            type: j.type,
            cron: j.cron,
            nextRun: j.nextRun,
            lastRun: j.lastRun,
            countdown: Math.max(0, Math.floor((new Date(j.nextRun).getTime() - Date.now()) / 1000)),
          }))
          .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime()),
      });
    }

    return json({ error: "Not Found", path }, 404);
  },
});

logger.info("Billing Cron Service started on port 3004", { version: "2.0.0", jobs: jobs.length });
