import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditBulk } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { unblockUserInFreeRADIUS, blockUserInFreeRADIUS, updateUserFreeRADIUSGroup } from "@/lib/radius-sync";

const VALID_PAYMENT_MODES = ["CASH", "UPI", "ONLINE", "BANK_TRANSFER", "CHEQUE", "WALLET"];

/**
 * Generate the next sequential invoice number (INV-00001, INV-00002, ...).
 * Uses MAX of the numeric part across invoices so numbering stays dense
 * even after deletions. Caller is responsible for retrying on P2002.
 */
async function nextInvoiceNumber(): Promise<string> {
  const maxInv = await db.invoice.findFirst({
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });
  let nextNum = 1;
  if (maxInv?.invoiceNumber) {
    const match = maxInv.invoiceNumber.match(/INV-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `INV-${String(nextNum).padStart(5, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await request.json();
    const { action, subscriberIds, ...payload } = body;

    if (!action || !subscriberIds || !Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      return NextResponse.json({ error: "Action and subscriberIds are required" }, { status: 400 });
    }

    let result;

    switch (action) {
      case "change-status": {
        const newStatus = payload.status;
        if (!newStatus) {
          return NextResponse.json({ error: "Status is required for change-status action" }, { status: 400 });
        }
        // [AUDIT-FIX F-11] Validate against the subscriber status enum — updateMany
        // previously accepted any arbitrary string and silently corrupted status data.
        const VALID_STATUSES = ["ACTIVE", "SUSPENDED", "DISCONNECTED", "TRIAL", "PENDING_ACTIVATION"];
        if (!VALID_STATUSES.includes(newStatus)) {
          return NextResponse.json({ error: `Invalid status "${newStatus}". Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
        }
        result = await db.subscriber.updateMany({
          where: { id: { in: subscriberIds } },
          data: { status: newStatus },
        });
        // [AUDIT-FIX F-04] Propagate enforcement to the data plane: bulk suspend/disconnect
        // previously left radcheck untouched, so cut-off subscribers kept authenticating.
        const affected = await db.subscriber.findMany({
          where: { id: { in: subscriberIds }, serviceUsername: { not: "" }, radiusEnabled: true },
          select: { id: true, serviceUsername: true },
        });
        const shouldBlock = newStatus === "SUSPENDED" || newStatus === "DISCONNECTED";
        const radiusErrors: string[] = [];
        for (const s of affected) {
          if (!s.serviceUsername) continue;
          try {
            if (shouldBlock) await blockUserInFreeRADIUS(s.serviceUsername);
            else await unblockUserInFreeRADIUS(s.serviceUsername);
          } catch (e) {
            radiusErrors.push(`${s.serviceUsername}: ${(e as Error).message}`);
          }
        }
        return NextResponse.json({
          action: "change-status",
          updated: result.count,
          radiusSynced: affected.length,
          ...(radiusErrors.length > 0 && { radiusErrors, warning: "Some RADIUS blocks failed — verify FreeRADIUS connectivity" }),
        });
      }

      case "assign-plan": {
        const planId = payload.planId;
        if (!planId) {
          return NextResponse.json({ error: "planId is required for assign-plan action" }, { status: 400 });
        }
        result = await db.subscriber.updateMany({
          where: { id: { in: subscriberIds } },
          data: { planId },
        });
        break;
      }

      case "enable-radius": {
        // Bulk enable RADIUS: set radiusEnabled=true and create thin RadiusUser records
        const subscribers = await db.subscriber.findMany({
          where: { id: { in: subscriberIds } },
          select: { id: true },
        });
        await db.subscriber.updateMany({
          where: { id: { in: subscriberIds } },
          data: { radiusEnabled: true },
        });
        // Create RadiusUser records for subscribers that don't have one
        const existingRadiusUsers = await db.radiusUser.findMany({
          where: { subscriberId: { in: subscribers.map((s) => s.id) } },
          select: { subscriberId: true },
        });
        const existingIds = new Set(existingRadiusUsers.map((r) => r.subscriberId));
        const toCreate = subscribers.filter((s) => !existingIds.has(s.id));
        if (toCreate.length > 0) {
          await db.radiusUser.createMany({
            data: toCreate.map((s) => ({ subscriberId: s.id })),
          });
        }
        result = { count: subscriberIds.length };
        break;
      }

      case "disable-radius": {
        // Bulk disable RADIUS: set radiusEnabled=false and delete RadiusUser records
        await db.subscriber.updateMany({
          where: { id: { in: subscriberIds } },
          data: { radiusEnabled: false },
        });
        await db.radiusUser.deleteMany({
          where: { subscriberId: { in: subscriberIds } },
        });
        result = { count: subscriberIds.length };
        break;
      }

      case "export": {
        // Return subscriber data for CSV export
        const subscribers = await db.subscriber.findMany({
          where: { id: { in: subscriberIds } },
          include: {
            Area: { select: { name: true } },
            Plan: { select: { name: true } },
            RadiusGroup: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        // Format for CSV export
        const csvData = subscribers.map((s) => ({
          code: s.code,
          name: s.name,
          phone: s.phone,
          email: s.email,
          area: s.Area?.name || "",
          plan: s.Plan?.name || "",
          status: s.status,
          connectionType: s.connectionType,
          serviceUsername: s.serviceUsername,
          ipAddress: s.ipAddress,
          macAddress: s.macAddress,
          radiusEnabled: s.radiusEnabled,
          radiusGroup: s.RadiusGroup?.name || "",
          activationDate: s.activationDate?.toISOString().split("T")[0] || "",
          balance: s.balance,
          createdAt: s.createdAt.toISOString().split("T")[0],
        }));

        return NextResponse.json({ action: "export", data: csvData });
      }

      case "change-plan": {
        // Rich plan change: updates plan + provisioned speeds + re-syncs the
        // RADIUS group from the new plan (unlike legacy "assign-plan" which
        // only updates planId). Subscribers already on the plan are no-ops.
        const planId = payload.planId;
        if (!planId) {
          return NextResponse.json({ error: "planId is required for change-plan action" }, { status: 400 });
        }
        const plan = await db.plan.findUnique({
          where: { id: planId },
          include: { RadiusGroup: { select: { name: true } } },
        });
        if (!plan) {
          return NextResponse.json({ error: "Plan not found" }, { status: 404 });
        }
        const subs = await db.subscriber.findMany({
          where: { id: { in: subscriberIds } },
          select: { id: true, planId: true, serviceUsername: true, radiusEnabled: true },
        });
        const changed = subs.filter((s) => s.planId !== planId);
        if (changed.length > 0) {
          await db.subscriber.updateMany({
            where: { id: { in: changed.map((s) => s.id) } },
            data: {
              planId,
              currentSpeedDown: plan.downloadSpeed || 0,
              currentSpeedUp: plan.uploadSpeed || 0,
            },
          });
        }
        // Re-sync radusergroup so the new plan's rate-limit group takes effect
        let radiusSynced = 0;
        for (const sub of changed) {
          if (sub.radiusEnabled && sub.serviceUsername) {
            try {
              await updateUserFreeRADIUSGroup(sub.serviceUsername, plan.RadiusGroup?.name || null);
              radiusSynced++;
            } catch (e) {
              console.error("[Bulk change-plan] RADIUS group sync failed for", sub.serviceUsername, e);
            }
          }
        }
        result = { count: changed.length, radiusSynced, alreadyOnPlan: subs.length - changed.length };
        break;
      }

      case "renew": {
        // Renewal = invoice (+ optional payment) + extend the billing cycle +
        // reactivate suspended/disconnected/pending subscribers + unblock RADIUS.
        const months = Math.max(1, Math.min(36, parseInt(String(payload.months), 10) || 1));
        const paymentMode = VALID_PAYMENT_MODES.includes(payload.paymentMode) ? payload.paymentMode : "CASH";
        const recordPayment = payload.recordPayment !== false;

        const subs = await db.subscriber.findMany({
          where: { id: { in: subscriberIds } },
          include: { Plan: true },
        });

        const summary = {
          renewed: 0,
          skipped: 0,
          reactivated: 0,
          totalCollected: 0,
          invoiceNumbers: [] as string[],
          skippedNames: [] as string[],
        };

        for (const sub of subs) {
          const plan = sub.Plan;
          if (!plan) {
            summary.skipped++;
            summary.skippedNames.push(sub.name);
            continue;
          }

          // Cycle price with quarterly/half-yearly/yearly discounts when available
          let basePrice = plan.priceMonthly * months;
          if (months === 3 && plan.priceQuarterly) basePrice = plan.priceQuarterly;
          else if (months === 6 && plan.priceHalfYearly) basePrice = plan.priceHalfYearly;
          else if (months === 12 && plan.priceYearly) basePrice = plan.priceYearly;

          const cycleDays = plan.validityDays || 30;
          const totalDays = cycleDays * months;
          const cgstPct = plan.cgstPercent ?? 9;
          const sgstPct = plan.sgstPercent ?? 9;
          const igstPct = plan.igstPercent ?? 0;
          const cgst = Math.round(basePrice * cgstPct) / 100;
          const sgst = Math.round(basePrice * sgstPct) / 100;
          const igst = Math.round(basePrice * igstPct) / 100;
          const totalAmount = Math.round((basePrice + cgst + sgst + igst) * 100) / 100;

          // Reactivation classification (used by the transaction below)
          const restoring = sub.status === "SUSPENDED" || sub.status === "DISCONNECTED";
          const activating = sub.status === "PENDING_ACTIVATION";

          // Renewal period rules [AUDIT-FIX F-08]:
          //  - ACTIVE/TRIAL subscriber (in service): start at the next cycle boundary so
          //    they never lose paid days (original intent).
          //  - SUSPENDED/DISCONNECTED/PENDING subscriber (not in service): start NOW.
          //    Previously a future cycleEnd was applied to expired subscribers too, granting
          //    up to a full cycle of free service between reconnection and the paid period.
          const now = new Date();
          let periodStart = new Date(now);
          if (sub.billingStartDate && (sub.status === "ACTIVE" || sub.status === "TRIAL")) {
            const diffDays = Math.floor((now.getTime() - sub.billingStartDate.getTime()) / 86400000);
            const cyclesCompleted = Math.max(0, Math.floor(diffDays / cycleDays));
            const cycleEnd = new Date(sub.billingStartDate.getTime() + (cyclesCompleted + 1) * cycleDays * 86400000);
            if (cycleEnd.getTime() > periodStart.getTime()) periodStart = cycleEnd;
          }
          const periodEnd = new Date(periodStart.getTime() + totalDays * 86400000);
          // Billing anchor such that next-billing-date math lands exactly on periodEnd
          const newBillingStart = new Date(periodStart.getTime() + cycleDays * (months - 1) * 86400000);

          // [AUDIT-FIX F-10] Invoice + payment + subscriber update now run in ONE transaction —
          // previously a failure between writes left a "PAID" invoice with no payment record
          // (or vice versa) and the loop just continued to the next subscriber.
          let invoiceNumber = "";
          let createdInvoiceId: string | null = null;
          for (let attempt = 0; attempt < 5 && !createdInvoiceId; attempt++) {
            invoiceNumber = await nextInvoiceNumber();
            try {
              createdInvoiceId = await db.$transaction(async (tx) => {
                const inv = await tx.invoice.create({
                  data: {
                    invoiceNumber,
                    subscriberId: sub.id,
                    planId: plan.id,
                    issueDate: now,
                    dueDate: now,
                    periodStart,
                    periodEnd,
                    description: `Renewal — ${plan.name} × ${months} month${months > 1 ? "s" : ""}`,
                    subtotal: basePrice,
                    cgstAmount: cgst,
                    sgstAmount: sgst,
                    igstAmount: igst,
                    totalTax: cgst + sgst + igst,
                    totalAmount,
                    grandTotal: totalAmount,
                    status: recordPayment ? "PAID" : "DRAFT",
                    paidAmount: recordPayment ? totalAmount : 0,
                    balanceAmount: recordPayment ? 0 : totalAmount,
                    paymentMode: recordPayment ? paymentMode : null,
                    paidAt: recordPayment ? now : null,
                    cgstRate: cgstPct,
                    sgstRate: sgstPct,
                    igstRate: igstPct,
                  },
                });
                if (recordPayment) {
                  // [AUDIT-FIX F-09] Payment now carries invoiceId — bulk-renew payments were
                  // previously orphaned (invoiceId: null), breaking revenue reconciliation.
                  await tx.payment.create({
                    data: {
                      subscriberId: sub.id,
                      invoiceId: inv.id,
                      amount: totalAmount,
                      paymentMode,
                      status: "VERIFIED",
                      receiptNumber: `RCPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                      notes: `Renewal ${months} month(s) — ${plan.name} (${invoiceNumber})`,
                    },
                  });
                }
                await tx.subscriber.update({
                  where: { id: sub.id },
                  data: {
                    billingStartDate: newBillingStart,
                    ...(restoring && { status: "ACTIVE" }),
                    ...(activating && { status: "ACTIVE", activationDate: sub.activationDate ?? now }),
                  },
                });
                return inv.id;
              });
            } catch (e: unknown) {
              if ((e as { code?: string })?.code !== "P2002") throw e;
            }
          }
          if (!createdInvoiceId) {
            summary.skipped++;
            summary.skippedNames.push(sub.name);
            continue;
          }
          if (recordPayment) {
            summary.totalCollected += totalAmount;
          }
          if ((restoring || activating) && sub.radiusEnabled && sub.serviceUsername) {
            try {
              await unblockUserInFreeRADIUS(sub.serviceUsername);
            } catch (e) {
              console.error("[Bulk renew] RADIUS unblock failed for", sub.serviceUsername, e);
            }
          }
          if (restoring || activating) summary.reactivated++;

          summary.renewed++;
          summary.invoiceNumbers.push(invoiceNumber);
        }

        result = { count: summary.renewed, ...summary };
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    await auditBulk(request, "BULK_UPDATE", "Subscriber", result.count, subscriberIds);
    if (action === "renew") {
      return NextResponse.json({
        success: true,
        updated: result.count,
        renewed: result.renewed,
        skipped: result.skipped,
        reactivated: result.reactivated,
        totalCollected: result.totalCollected,
        invoiceNumbers: result.invoiceNumbers,
        skippedNames: result.skippedNames,
      });
    }
    if (action === "change-plan") {
      return NextResponse.json({
        success: true,
        updated: result.count,
        radiusSynced: result.radiusSynced,
        alreadyOnPlan: result.alreadyOnPlan,
      });
    }
    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error("Bulk subscribers API error:", error);
    return NextResponse.json({ error: "Bulk operation failed" }, { status: 500 });
  }
}
