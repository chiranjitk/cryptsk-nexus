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
    include: { plan: true },
  });

  let generated = 0;
  let totalAmount = 0;
  let totalTax = 0;

  for (const sub of subscribers) {
    if (!sub.plan) continue;
    const plan = sub.plan;

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
    const prefix = settings?.invoicePrefix || "INV";
    const separator = settings?.invoiceSeparator || "-";
    const padding = settings?.invoiceNumberPadding || 4;
    const invoiceCount = await db.invoice.count();
    const invoiceNumber = `${prefix}${separator}${String(invoiceCount + 1).padStart(padding, "0")}`;

    const subtotal = plan.priceMonthly;
    const cgstAmount = subtotal * (plan.cgstPercent / 100);
    const sgstAmount = subtotal * (plan.sgstPercent / 100);
    const totalTaxVal = cgstAmount + sgstAmount;
    const grandTotal = subtotal + totalTaxVal;

    await db.invoice.create({
      data: {
        invoiceNumber,
        subscriberId: sub.id,
        planId: plan.id,
        issueDate: now,
        dueDate: new Date(now.getTime() + (settings?.gracePeriodDays || 5) * 86400000),
        periodStart: monthStart,
        periodEnd: monthEnd,
        description: `${plan.name} - Monthly Subscription`,
        subtotal,
        cgstAmount,
        sgstAmount,
        totalTax: totalTaxVal,
        totalAmount: subtotal,
        grandTotal,
        balanceAmount: grandTotal,
        status: "DRAFT",
      },
    });

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
    include: { subscriber: true },
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
    include: { subscriber: true },
  });

  // Find invoices overdue for 1-3 days
  const overdueRecent = await db.invoice.findMany({
    where: {
      status: "OVERDUE",
      dueDate: { gte: reminderThreshold },
      balanceAmount: { gt: 0 },
    },
    include: { subscriber: true },
  });

  let queued = 0;

  // Queue notifications for upcoming due
  for (const inv of upcoming) {
    if (!inv.subscriber) continue;
    await db.notification.create({
      data: {
        subscriberId: inv.subscriber.id,
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
    if (!inv.subscriber) continue;
    await db.notification.create({
      data: {
        subscriberId: inv.subscriber.id,
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
    include: { subscriber: true },
    distinct: ["subscriberId"],
  });

  let suspended = 0;
  for (const inv of overdueInvoices) {
    if (!inv.subscriber || inv.subscriber.status !== "ACTIVE") continue;

    await db.subscriber.update({
      where: { id: inv.subscriber.id },
      data: { status: "SUSPENDED" },
    });

    // Create notification
    await db.notification.create({
      data: {
        subscriberId: inv.subscriber.id,
        type: "IN_APP",
        category: "BILL_DUE",
        title: "Service Suspended",
        message: `Your service has been suspended due to unpaid invoice ${inv.invoiceNumber} (₹${inv.balanceAmount}). Please pay to reactivate.`,
        status: "PENDING",
      },
    });

    suspended++;
  }

  logger.info("Suspension job complete", { checked: overdueInvoices.length, suspended });
  return { checked: overdueInvoices.length, suspended };
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
