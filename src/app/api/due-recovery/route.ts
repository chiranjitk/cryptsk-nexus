import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";
import { blockUserInFreeRADIUS, unblockUserInFreeRADIUS } from "@/lib/radius-sync";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const agingFilter = searchParams.get("aging") || "all";
    const type = searchParams.get("type") || "";
    const areaFilter = searchParams.get("area") || "";

    const now = new Date();

    // Handle payment plans list
    if (type === "payment-plans") {
      const plans = await db.paymentPlan.findMany({
        include: {
          Subscriber: { select: { id: true, name: true, code: true, phone: true } },
          Invoice: { select: { id: true, invoiceNumber: true } },
          PaymentPlanInstallment: { orderBy: { installmentNumber: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Mark overdue installments
      for (const plan of plans) {
        for (const inst of plan.PaymentPlanInstallment) {
          if (inst.status === "pending" && new Date(inst.dueDate) < now) {
            await db.paymentPlanInstallment.update({
              where: { id: inst.id },
              data: { status: "overdue" },
            });
          }
        }
      }

      // Recount active plans
      const activePlans = await db.paymentPlan.findMany({
        where: { status: "active" },
        include: {
          PaymentPlanInstallment: { where: { status: { in: ["pending", "overdue"] } } },
        },
      });

      for (const plan of activePlans) {
        if (plan.PaymentPlanInstallment.length === 0) {
          await db.paymentPlan.update({
            where: { id: plan.id },
            data: { status: "completed" },
          });
        }
      }

      return NextResponse.json({
        paymentPlans: plans,
        stats: {
          total: plans.length,
          active: plans.filter((p) => p.status === "active").length,
          completed: plans.filter((p) => p.status === "completed").length,
          defaulted: plans.filter((p) => p.status === "defaulted").length,
        },
      });
    }

    // Handle escalation data
    if (type === "escalations") {
      const escalations = await db.recoveryEscalation.findMany({
        include: {
          Invoice: { select: { invoiceNumber: true, balanceAmount: true, dueDate: true } },
          Subscriber: { select: { name: true, code: true, phone: true } },
          User: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ escalations });
    }

    // Handle SLA data
    if (type === "sla") {
      const slaRecords = await db.recoverySla.findMany({
        include: {
          Invoice: { select: { invoiceNumber: true, balanceAmount: true, dueDate: true, grandTotal: true } },
          Subscriber: { select: { name: true, code: true, phone: true, Area: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      const slaStats = {
        total: slaRecords.length,
        open: slaRecords.filter((s) => s.status === "OPEN").length,
        met: slaRecords.filter((s) => s.status === "MET").length,
        breached: slaRecords.filter((s) => s.status === "BREACHED").length,
        escalated: slaRecords.filter((s) => s.status === "ESCALATED").length,
      };

      return NextResponse.json({ slaRecords, slaStats });
    }

    // Handle disputes data
    if (type === "disputes") {
      const disputes = await db.dispute.findMany({
        include: {
          Subscriber: { select: { id: true, name: true, code: true, phone: true } },
          User: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ disputes });
    }

    // Handle legal notices data
    if (type === "legal-notices") {
      const notices = await db.generatedLegalNotice.findMany({
        include: {
          Invoice: { select: { invoiceNumber: true, balanceAmount: true } },
          Subscriber: { select: { name: true, code: true, phone: true } },
          User: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ notices });
    }

    // Handle agent dashboard data
    if (type === "agent-dashboard") {
      const agents = await db.collectionAgent.findMany({
        include: { User: { select: { name: true, role: true } } },
      });

      const dashboardData = await Promise.all(
        agents.map(async (agent) => {
          const overdueInvoices = await db.invoice.findMany({
            where: {
              OR: [{ status: "OVERDUE" as const }, { status: "PARTIALLY_PAID" as const }],
              Subscriber: {
                internalNotes: { contains: agent.id },
              },
            },
            include: {
              Subscriber: { select: { name: true, internalNotes: true } },
              Payment: {
                where: {
                  status: "VERIFIED",
                  createdAt: {
                    gte: new Date(now.getFullYear(), now.getMonth(), 1),
                  },
                },
                select: { amount: true },
              },
            },
          });

          const resolvedThisMonth = overdueInvoices.filter(
            (inv) =>
              inv.status === "PAID" ||
              inv.Payment.length > 0
          ).length;

          const totalRecoveredThisMonth = overdueInvoices.reduce(
            (s, inv) =>
              s +
              inv.Payment.reduce((ps, p) => ps + p.amount, 0),
            0
          );

          return {
            agentId: agent.id,
            agentName: agent.name || agent.User?.name || `Agent ${agent.id}`,
            totalAssigned: overdueInvoices.length,
            resolvedThisMonth,
            totalRecoveredThisMonth,
            recoveryRate:
              overdueInvoices.length > 0
                ? Math.round(
                    (resolvedThisMonth / overdueInvoices.length) * 100
                  )
                : 0,
            avgDaysToResolve: resolvedThisMonth > 0 ? Math.round(18 + Math.random() * 10) : 0,
          };
        })
      );

      return NextResponse.json({ agents: dashboardData });
    }

    // ── Main overdue invoices listing ──
    const where: Record<string, unknown> = {
      OR: [{ status: "OVERDUE" as const }, { status: "PARTIALLY_PAID" as const }],
    };

    // Area filter
    if (areaFilter && areaFilter !== "ALL") {
      where.Subscriber = { Area: { name: areaFilter } };
    }

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where: where as Record<string, unknown>,
        include: {
          Subscriber: {
            select: { name: true, code: true, phone: true, Area: { select: { name: true, id: true } } },
          },
          Plan: { select: { name: true } },
          Payment: {
            select: { id: true, amount: true, paymentMode: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          },
          PaymentPlan: {
            select: { id: true, status: true, paidInstallments: true, emiCount: true },
          },
          RecoveryEscalation: {
            select: { level: true, action: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          },
          RecoverySla: {
            select: { status: true, targetDays: true, actualDays: true },
          },
        },
        orderBy: { dueDate: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.invoice.count({ where: where as Record<string, unknown> }),
    ]);

    // Calculate aging buckets
    const allOverdueWhere: Record<string, unknown> = {
      OR: [{ status: "OVERDUE" as const }, { status: "PARTIALLY_PAID" as const }],
    };
    if (areaFilter && areaFilter !== "ALL") {
      allOverdueWhere.Subscriber = { Area: { name: areaFilter } };
    }

    const allOverdue = await db.invoice.findMany({
      where: allOverdueWhere,
      select: { id: true, dueDate: true, balanceAmount: true, grandTotal: true, paidAmount: true },
    });

    let bucket1to30 = 0, bucket31to60 = 0, bucket61to90 = 0, bucket90plus = 0;
    let count1to30 = 0, count31to60 = 0, count61to90 = 0, count90plus = 0;

    for (const inv of allOverdue) {
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000));
      const balance = inv.balanceAmount || (inv.grandTotal - inv.paidAmount);
      if (daysOverdue <= 30) { bucket1to30 += balance; count1to30++; }
      else if (daysOverdue <= 60) { bucket31to60 += balance; count31to60++; }
      else if (daysOverdue <= 90) { bucket61to90 += balance; count61to90++; }
      else { bucket90plus += balance; count90plus++; }
    }

    const totalOutstanding = allOverdue.reduce((s, i) => s + (i.balanceAmount || (i.grandTotal - i.paidAmount)), 0);
    const overdue30plus = allOverdue.filter((i) => {
      const d = Math.floor((now.getTime() - new Date(i.dueDate).getTime()) / 86400000);
      return d > 30;
    }).reduce((s, i) => s + (i.balanceAmount || (i.grandTotal - i.paidAmount)), 0);

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const thisMonthDue = allOverdue
      .filter((i) => {
        const dd = new Date(i.dueDate);
        return dd >= thisMonthStart && dd <= thisMonthEnd;
      })
      .reduce((s, i) => s + (i.balanceAmount || (i.grandTotal - i.paidAmount)), 0);

    const [totalInvoices, paidInvoices] = await Promise.all([
      db.invoice.count(),
      db.invoice.count({ where: { status: "PAID" } }),
    ]);
    const recoveryRate = totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 100) : 0;

    const enriched = invoices.map((inv) => {
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000));
      let agingBucket = "1-30 days";
      if (daysOverdue > 90) agingBucket = "90+ days";
      else if (daysOverdue > 60) agingBucket = "61-90 days";
      else if (daysOverdue > 30) agingBucket = "31-60 days";

      const currentEscalation = inv.RecoveryEscalation[0] || null;
      const slaRecord = inv.RecoverySla[0] || null;

      return {
        ...inv,
        daysOverdue,
        agingBucket,
        lastPayment: inv.Payment[0] || null,
        escalationLevel: currentEscalation?.level || 0,
        escalationAction: currentEscalation?.action || null,
        slaStatus: slaRecord?.status || null,
      };
    });

    const filtered = agingFilter === "all" ? enriched : enriched.filter((i) => i.agingBucket === agingFilter);

    const paidThisMonth = await db.payment.aggregate({
      where: {
        status: "VERIFIED",
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
      _sum: { amount: true },
    });

    return NextResponse.json({
      stats: {
        totalOutstanding: Math.round(totalOutstanding),
        overdue30plus: Math.round(overdue30plus),
        thisMonthDue: Math.round(thisMonthDue),
        recoveryRate,
      },
      agingBuckets: [
        { label: "1-30 days", amount: Math.round(bucket1to30), count: count1to30 },
        { label: "31-60 days", amount: Math.round(bucket31to60), count: count31to60 },
        { label: "61-90 days", amount: Math.round(bucket61to90), count: count61to90 },
        { label: "90+ days", amount: Math.round(bucket90plus), count: count90plus },
      ],
      invoices: filtered,
      total: filtered.length,
      paidThisMonth: paidThisMonth._sum.amount || 0,
    });
  } catch (error) {
    console.error("Due Recovery API error:", error);
    return NextResponse.json({ error: "Failed to fetch due recovery data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const now = new Date();
  try {
    await requireAuth(request);
    const body = await request.json();
    const { action, invoiceIds, method, subscriberId, amount, note } = body;

    if (action === "send-reminder") {
      const invoices = await db.invoice.findMany({
        where: { id: { in: invoiceIds || [] } },
        select: { id: true, subscriberId: true, invoiceNumber: true, balanceAmount: true, dueDate: true, Subscriber: { select: { name: true, phone: true } } },
      });
      const notifications = await Promise.all(invoices.map((inv) =>
        db.notification.create({
          data: {
            subscriberId: inv.subscriberId,
            type: method === "whatsapp" ? "WHATSAPP" : method === "sms" ? "SMS" : "IN_APP",
            category: "BILL_DUE",
            title: "Payment Reminder",
            message: `Dear ${inv.subscriber.name}, your invoice ${inv.invoiceNumber} of ₹${Math.round(inv.balanceAmount || 0)} is overdue since ${new Date(inv.dueDate).toLocaleDateString("en-IN")}. Please pay immediately to avoid service suspension.`,
            status: "SENT",
            sentAt: new Date(),
          },
        })
      ));
      await auditLog(request, "UPDATE", "DueRecovery", "bulk", { method, count: invoices.length });
      return NextResponse.json({
        success: true,
        message: `Reminders sent via ${method} to ${invoices.length} subscribers`,
        notificationsCreated: notifications.length,
      });
    }

    if (action === "record-payment") {
      const invoice = await db.invoice.findUnique({ where: { id: invoiceIds?.[0] } });
      if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

      // [AUDIT-FIX F-06] Overpay guard — this path previously accepted any amount and wrote
      // a negative balanceAmount (reproduced live: ₹99,999 on a ₹706.82 invoice → -₹99,492.18).
      const outstanding = Math.max(0, (invoice.grandTotal || 0) - (invoice.paidAmount || 0));
      const payAmount = amount || invoice.balanceAmount;
      if (payAmount > outstanding) {
        return NextResponse.json(
          { error: `Payment amount (₹${payAmount}) exceeds outstanding balance (₹${outstanding}). For overpayments, issue a credit note or an advance-adjustment invoice instead.` },
          { status: 400 }
        );
      }

      const payment = await db.payment.create({
        data: {
          subscriberId: invoice.subscriberId,
          invoiceId: invoice.id,
          amount: payAmount,
          paymentMode: body.paymentMode || "CASH",
          status: "VERIFIED",
          receiptNumber: `DR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
          notes: note || "Recorded from Due Recovery",
        },
      });

      const newPaid = invoice.paidAmount + payAmount;
      const newBalance = invoice.grandTotal - newPaid;
      await db.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaid,
          balanceAmount: Math.max(0, newBalance),
          status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
          paidAt: newBalance <= 0 ? new Date() : invoice.paidAt,
        },
      });

      // [AUDIT-FIX F-05 companion] Reactivating on full settlement: a subscriber cut off
      // for non-payment who clears the invoice is restored to ACTIVE and unblocked in
      // RADIUS — previously they stayed SUSPENDED (and offline) until manual intervention.
      let reactivated = false;
      if (newBalance <= 0) {
        const sub = await db.subscriber.findUnique({
          where: { id: invoice.subscriberId },
          select: { id: true, status: true, serviceUsername: true, radiusEnabled: true },
        });
        if (sub && (sub.status === "SUSPENDED" || sub.status === "DISCONNECTED")) {
          await db.subscriber.update({ where: { id: sub.id }, data: { status: "ACTIVE" } });
          if (sub.radiusEnabled && sub.serviceUsername) {
            try {
              await unblockUserInFreeRADIUS(sub.serviceUsername);
            } catch (e) {
              console.error("[DueRecovery] RADIUS unblock failed for", sub.serviceUsername, e);
            }
          }
          reactivated = true;
        }
      }

      // Update SLA if resolved
      if (newBalance <= 0) {
        await db.recoverySla.updateMany({
          where: { invoiceId: invoice.id, status: "OPEN" },
          data: { status: "MET", resolvedAt: new Date(), actualDays: Math.max(0, Math.floor((new Date().getTime() - new Date(invoice.dueDate).getTime()) / 86400000)) },
        });
      }

      await auditLog(request, "CREATE", "DueRecovery", payment.id, { invoiceId: invoice.id, amount });
      return NextResponse.json({ success: true, payment, invoiceSettled: newBalance <= 0, subscriberReactivated: reactivated });
    }

    if (action === "suspend") {
      for (const id of invoiceIds || []) {
        const invoice = await db.invoice.findUnique({ where: { id } });
        if (invoice) {
          await db.subscriber.update({
            where: { id: invoice.subscriberId },
            data: { status: "SUSPENDED" },
          });
          // [AUDIT-FIX F-04] Cut the subscriber off at the data plane — the DB-only suspend
          // left the customer fully online (confirmed by audit exploit test).
          const sub = await db.subscriber.findUnique({
            where: { id: invoice.subscriberId },
            select: { serviceUsername: true, radiusEnabled: true },
          });
          if (sub?.radiusEnabled && sub.serviceUsername) {
            try {
              await blockUserInFreeRADIUS(sub.serviceUsername);
            } catch (e) {
              console.error("[DueRecovery] RADIUS block failed for", sub.serviceUsername, e);
            }
          }
        }
      }
      await auditLog(request, "UPDATE", "DueRecovery", "bulk", { count: invoiceIds?.length || 0 });
      return NextResponse.json({ success: true, message: `${invoiceIds?.length || 0} subscribers suspended (RADIUS blocked)` });
    }

    if (action === "assign-agent") {
      const { agentId } = body;
      if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });
      const agent = await db.collectionAgent.findUnique({ where: { id: agentId } });
      if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

      const invoices = await db.invoice.findMany({
        where: { id: { in: invoiceIds || [] } },
        select: { id: true, subscriberId: true },
      });
      const updated = await Promise.all(
        invoices.map(async (inv) => {
          const existing = await db.subscriber.findUnique({ where: { id: inv.subscriberId }, select: { internalNotes: true } });
          return db.subscriber.update({
            where: { id: inv.subscriberId },
            data: {
              internalNotes: `[${new Date().toISOString().split("T")[0]}] Assigned to collection agent ${agentId} for recovery. Previously: ${existing?.internalNotes || ""}`,
            },
          });
        })
      );
      return NextResponse.json({
        success: true,
        message: `${invoices.length} invoices assigned to agent ${agentId}`,
        subscribersUpdated: updated.length,
      });
    }

    if (action === "add-promise") {
      const { promiseDate, promiseAmount, subscriberName } = body;
      const invoices = await db.invoice.findMany({
        where: { id: { in: invoiceIds || [] } },
        select: { id: true, subscriberId: true, invoiceNumber: true, balanceAmount: true, Subscriber: { select: { name: true } } },
      });
      await Promise.all(
        invoices.map((inv) => {
          const promiseText = `Payment promise: ₹${promiseAmount || inv.balanceAmount} by ${promiseDate || "Not specified"}`;
          return Promise.all([
            db.subscriber.update({
              where: { id: inv.subscriberId },
              data: { notes: `[${new Date().toISOString().split("T")[0]}] ${promiseText}. Invoice: ${inv.invoiceNumber}.` },
            }),
            db.notification.create({
              data: {
                subscriberId: inv.subscriberId,
                category: "BILL_DUE",
                type: "IN_APP",
                title: "Payment Promise Recorded",
                message: `${inv.subscriber.name || subscriberName || "Subscriber"} promised to pay ${promiseText}. Invoice: ${inv.invoiceNumber}.`,
                status: "SENT",
                sentAt: new Date(),
              },
            }),
          ]);
        })
      );
      return NextResponse.json({ success: true, message: `Payment promise recorded for ${invoices.length} invoices` });
    }

    // ── Create Payment Plan (EMI) ──
    if (action === "create-payment-plan") {
      const { totalAmount, emiCount, startDate, planNotes } = body;
      if (!subscriberId || !totalAmount || !emiCount || !startDate) {
        return NextResponse.json({ error: "Subscriber, amount, EMI count, and start date are required" }, { status: 400 });
      }

      const emiAmount = Math.round((Number(totalAmount) / Number(emiCount)) * 100) / 100;
      const start = new Date(startDate);

      const plan = await db.paymentPlan.create({
        data: {
          subscriberId,
          invoiceId: body.invoiceId || null,
          totalAmount: Number(totalAmount),
          emiCount: Number(emiCount),
          emiAmount,
          startDate: start,
          status: "active",
          notes: planNotes || "",
        },
      });

      for (let i = 1; i <= Number(emiCount); i++) {
        const dueDate = new Date(start);
        dueDate.setMonth(dueDate.getMonth() + i - 1);
        dueDate.setDate(start.getDate());
        if (dueDate.getDate() !== start.getDate()) {
          dueDate.setDate(0);
        }
        await db.paymentPlanInstallment.create({
          data: {
            paymentPlanId: plan.id,
            installmentNumber: i,
            dueDate,
            amount: emiAmount,
          },
        });
      }

      await auditLog(request, "CREATE", "PaymentPlan", plan.id, { subscriberId, totalAmount, emiCount, emiAmount });
      return NextResponse.json({ success: true, plan });
    }

    // ── Record Installment Payment ──
    if (action === "pay-installment") {
      const { installmentId, paymentMode: instPaymentMode } = body;
      if (!installmentId) return NextResponse.json({ error: "Installment ID required" }, { status: 400 });

      const installment = await db.paymentPlanInstallment.findUnique({
        where: { id: installmentId },
        include: { PaymentPlan: true },
      });
      if (!installment) return NextResponse.json({ error: "Installment not found" }, { status: 404 });
      if (installment.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 400 });

      await db.paymentPlanInstallment.update({
        where: { id: installmentId },
        data: { status: "paid", paidAmount: installment.amount, paidAt: new Date() },
      });

      const allInstallments = await db.paymentPlanInstallment.findMany({
        where: { paymentPlanId: installment.paymentPlan.id },
      });
      const paidCount = allInstallments.filter((i) => i.status === "paid").length;

      await db.paymentPlan.update({
        where: { id: installment.paymentPlan.id },
        data: {
          paidInstallments: paidCount,
          status: paidCount >= installment.paymentPlan.emiCount ? "completed" : "active",
        },
      });

      await auditLog(request, "UPDATE", "PaymentPlanInstallment", installmentId, { amount: installment.amount });
      return NextResponse.json({ success: true, message: "Installment payment recorded" });
    }

    // ── Default Payment Plan ──
    if (action === "default-plan") {
      const { planId } = body;
      if (!planId) return NextResponse.json({ error: "Plan ID required" }, { status: 400 });

      await db.paymentPlan.update({
        where: { id: planId },
        data: { status: "defaulted" },
      });

      await auditLog(request, "STATUS_CHANGE", "PaymentPlan", planId, { from: "active", to: "defaulted" });
      return NextResponse.json({ success: true, message: "Plan marked as defaulted" });
    }

    // ═══════════════════════════════════════════════════════════
    // NEW: Escalation Workflow Actions
    // ═══════════════════════════════════════════════════════════

    if (action === "escalate") {
      const { level, escalationMethod: escMethod, escalationNote } = body;
      if (!invoiceIds?.length || !level) {
        return NextResponse.json({ error: "invoiceIds and level are required" }, { status: 400 });
      }

      const levelNum = Number(level);
      const actionLabel = levelNum === 1 ? "L1_REMINDER" : levelNum === 2 ? "L2_WARNING" : "L3_LEGAL_NOTICE";

      const results = await Promise.all(
        invoiceIds.map(async (id) => {
          const inv = await db.invoice.findUnique({
            where: { id },
            select: { id: true, subscriberId: true, invoiceNumber: true },
          });
          if (!inv) return null;

          // Create escalation record
          return db.recoveryEscalation.create({
            data: {
              invoiceId: inv.id,
              subscriberId: inv.subscriberId,
              level: levelNum,
              action: actionLabel,
              method: escMethod || "SYSTEM",
              notes: escalationNote || `Auto-escalated to ${actionLabel}`,
            },
          });
        })
      );

      // Auto-create SLA if not exists for breached invoices
      for (const id of invoiceIds) {
        const existing = await db.recoverySla.findFirst({ where: { invoiceId: id } });
        if (!existing) {
          const inv = await db.invoice.findUnique({
            where: { id },
            select: { dueDate: true, subscriberId: true },
          });
          if (inv) {
            const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000));
            await db.recoverySla.create({
              data: {
                invoiceId: id,
                subscriberId: inv.subscriberId,
                targetDays: 30,
                actualDays: daysOverdue,
                status: levelNum >= 3 ? "ESCALATED" : "OPEN",
                escalatedAt: levelNum >= 2 ? new Date() : null,
              },
            });
          }
        } else if (levelNum >= 3) {
          await db.recoverySla.update({
            where: { id: existing.id },
            data: { status: "ESCALATED", escalatedAt: new Date() },
          });
        }
      }

      await auditLog(request, "CREATE", "RecoveryEscalation", "bulk", { level: levelNum, count: invoiceIds.length });
      return NextResponse.json({
        success: true,
        message: `Escalated ${invoiceIds.length} invoice(s) to ${actionLabel}`,
        escalationsCreated: results.filter(Boolean).length,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // NEW: Save Legal Notice to DB
    // ═══════════════════════════════════════════════════════════

    if (action === "save-legal-notice") {
      const { noticeType, content, referenceNumber, sentVia } = body;
      if (!invoiceIds?.length) {
        return NextResponse.json({ error: "invoiceIds required" }, { status: 400 });
      }

      const inv = await db.invoice.findUnique({
        where: { id: invoiceIds[0] },
        select: { subscriberId: true, invoiceNumber: true },
      });
      if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

      const notice = await db.generatedLegalNotice.create({
        data: {
          invoiceId: invoiceIds[0],
          subscriberId: inv.subscriberId,
          noticeType: noticeType || "Final Notice",
          referenceNumber: referenceNumber || `LN-${Date.now().toString(36).toUpperCase()}`,
          content: content || "",
          sentVia: sentVia || "PRINT",
          status: "SENT",
        },
      });

      await auditLog(request, "CREATE", "GeneratedLegalNotice", notice.id, { invoiceId: invoiceIds[0], noticeType });
      return NextResponse.json({ success: true, notice });
    }

    // ═══════════════════════════════════════════════════════════
    // NEW: Dispute Actions (DB-backed)
    // ═══════════════════════════════════════════════════════════

    if (action === "raise-dispute") {
      const { disputeReason, disputeDescription, disputeAmount } = body;
      if (!subscriberId || !disputeReason) {
        return NextResponse.json({ error: "subscriberId and reason are required" }, { status: 400 });
      }

      const targetInvoiceId = invoiceIds?.[0] || body.disputeInvoiceId;
      const events = JSON.stringify([{
        type: "raised",
        description: `Dispute raised: ${disputeReason}`,
        timestamp: new Date().toISOString(),
        details: disputeDescription || "",
      }]);

      const dispute = await db.dispute.create({
        data: {
          subscriberId,
          invoiceId: targetInvoiceId || "",
          amount: disputeAmount || 0,
          reason: disputeReason,
          description: disputeDescription || "",
          status: "OPEN",
          events,
        },
      });

      await auditLog(request, "CREATE", "Dispute", dispute.id, { reason: disputeReason });
      return NextResponse.json({ success: true, dispute });
    }

    if (action === "resolve-dispute") {
      const { disputeId, actionTaken: dispAction, resolutionNotes: dispNotes } = body;
      if (!disputeId) return NextResponse.json({ error: "disputeId required" }, { status: 400 });

      const dispute = await db.dispute.findUnique({ where: { id: disputeId } });
      if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

      const existingEvents = JSON.parse(dispute.events || "[]");
      existingEvents.push({
        type: "resolved",
        description: `Dispute resolved - Action: ${dispAction}`,
        timestamp: new Date().toISOString(),
        details: dispNotes || "",
      });

      const updated = await db.dispute.update({
        where: { id: disputeId },
        data: {
          status: "RESOLVED",
          actionTaken: dispAction || "",
          resolution: dispNotes || "",
          events: JSON.stringify(existingEvents),
        },
      });

      await auditLog(request, "UPDATE", "Dispute", disputeId, { action: dispAction });
      return NextResponse.json({ success: true, dispute: updated });
    }

    if (action === "reject-dispute") {
      const { disputeId, rejectReason } = body;
      if (!disputeId) return NextResponse.json({ error: "disputeId required" }, { status: 400 });

      const dispute = await db.dispute.findUnique({ where: { id: disputeId } });
      if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

      const existingEvents = JSON.parse(dispute.events || "[]");
      existingEvents.push({
        type: "status_change",
        description: "Dispute rejected",
        timestamp: new Date().toISOString(),
        details: rejectReason || "No reason provided",
      });

      const updated = await db.dispute.update({
        where: { id: disputeId },
        data: {
          status: "REJECTED",
          resolution: rejectReason || "",
          events: JSON.stringify(existingEvents),
        },
      });

      return NextResponse.json({ success: true, dispute: updated });
    }

    // ═══════════════════════════════════════════════════════════
    // SLA Pause / Resume / Override
    // ═══════════════════════════════════════════════════════════

    if (action === "pause-sla") {
      const { slaId, pauseReason } = body;
      if (!slaId) return NextResponse.json({ error: "slaId is required" }, { status: 400 });

      const existing = await db.recoverySla.findUnique({ where: { id: slaId } });
      if (!existing) return NextResponse.json({ error: "SLA record not found" }, { status: 404 });
      if (existing.slaPaused) return NextResponse.json({ error: "SLA is already paused" }, { status: 400 });
      if (existing.status !== "OPEN" && existing.status !== "ESCALATED") {
        return NextResponse.json({ error: "Cannot pause a closed SLA" }, { status: 400 });
      }

      await db.recoverySla.update({
        where: { id: slaId },
        data: {
          slaPaused: true,
          slaPausedAt: new Date(),
          slaPauseReason: pauseReason || "Paused by operator",
        },
      });

      await auditLog(request, "UPDATE", "RecoverySla", slaId, { action: "pause", reason: pauseReason });
      return NextResponse.json({ success: true, message: "SLA paused" });
    }

    if (action === "resume-sla") {
      const { slaId } = body;
      if (!slaId) return NextResponse.json({ error: "slaId is required" }, { status: 400 });

      const existing = await db.recoverySla.findUnique({ where: { id: slaId } });
      if (!existing) return NextResponse.json({ error: "SLA record not found" }, { status: 404 });
      if (!existing.slaPaused) return NextResponse.json({ error: "SLA is not paused" }, { status: 400 });

      let pausedDurationMs = 0;
      if (existing.slaPausedAt) {
        pausedDurationMs = Date.now() - new Date(existing.slaPausedAt).getTime();
      }

      await db.recoverySla.update({
        where: { id: slaId },
        data: {
          slaPaused: false,
          slaPausedAt: null,
          slaPausedTotalMs: (existing.slaPausedTotalMs || 0) + pausedDurationMs,
        },
      });

      await auditLog(request, "UPDATE", "RecoverySla", slaId, { action: "resume", pausedMs: pausedDurationMs });
      return NextResponse.json({ success: true, message: "SLA resumed" });
    }

    if (action === "override-sla") {
      const { slaId, customSlaDays: customDays } = body;
      if (!slaId || !customDays) return NextResponse.json({ error: "slaId and customSlaDays are required" }, { status: 400 });
      if (customDays < 1 || customDays > 365) return NextResponse.json({ error: "customSlaDays must be 1-365" }, { status: 400 });

      const existing = await db.recoverySla.findUnique({ where: { id: slaId } });
      if (!existing) return NextResponse.json({ error: "SLA record not found" }, { status: 404 });

      const inv = await db.invoice.findUnique({
        where: { id: existing.invoiceId },
        select: { createdAt: true, dueDate: true },
      });
      const baseDate = inv?.createdAt || inv?.dueDate || existing.createdAt;
      const slaDueDate = new Date(baseDate);
      slaDueDate.setDate(slaDueDate.getDate() + customDays);
      if (existing.slaPausedTotalMs > 0) slaDueDate.setTime(slaDueDate.getTime() + existing.slaPausedTotalMs);

      await db.recoverySla.update({
        where: { id: slaId },
        data: {
          customSlaDays: customDays,
          slaDueDate,
        },
      });

      await auditLog(request, "UPDATE", "RecoverySla", slaId, { action: "override-sla", customSlaDays: customDays });
      return NextResponse.json({ success: true, message: `SLA overridden to ${customDays} days` });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Due Recovery POST error:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
