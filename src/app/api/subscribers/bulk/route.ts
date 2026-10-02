import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditBulk } from "@/lib/services/audit-service";
import { requireAuth, permissionFor, AuthError } from "@/lib/api-auth";
import { unblockUserInFreeRADIUS, blockUserInFreeRADIUS, updateUserFreeRADIUSGroup } from "@/lib/radius-sync";
import { nextInvoiceNumber } from "@/lib/invoice-number";

const VALID_PAYMENT_MODES = ["CASH", "UPI", "ONLINE", "BANK_TRANSFER", "CHEQUE", "WALLET"];

// [AUDIT-FIX F-12] Invoice numbering moved to src/lib/invoice-number.ts (shared allocator).

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request as unknown as import("next/server").NextRequest);
    // [AUDIT-FIX F-20] Bulk operations mutate subscriber state en masse (renew,
    // change-plan, change-status, RADIUS block/unblock) — need subscribers.update.
    // A plain AuthError return is preserved for shape compatibility.
    try {
      await permissionFor(userId, "subscribers.update");
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
      throw error;
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
          include: { Plan: true },
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

        // ── [AUDIT-FIX F-15] Mid-cycle proration ──
        // Previously a plan swap never touched money: upgrade = free upgrade until the next
        // renewal, downgrade = customer keeps paying the old (higher) price for the rest of
        // the cycle. Now the unused portion of the current cycle is settled:
        //   delta = (days remaining × new plan daily rate) − (days remaining × old plan daily rate)
        // delta > 0 → adjustment invoice (SENT, due in grace days)
        // delta < 0 → credit note against the latest invoice of the cycle
        const prorate = payload.prorate !== false; // opt-out available for end-of-cycle switches
        let prorationInvoices = 0;
        let creditNotes = 0;
        let prorationDelta = 0;
        const prorationDetails: Array<{ code: string; delta: number; kind: string; number: string }> = [];
        if (prorate) {
          const now = new Date();
          const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
          const graceDays = settings?.gracePeriodDays || 5;
          for (const sub of changed) {
            const oldPlan = sub.Plan;
            if (!oldPlan || !sub.billingStartDate || sub.status === "DISCONNECTED") continue;

            const cycleDays = oldPlan.validityDays || 30;
            const diffDays = Math.floor((now.getTime() - sub.billingStartDate.getTime()) / 86400000);
            const cyclesCompleted = Math.max(0, Math.floor(diffDays / cycleDays));
            const cycleEnd = new Date(sub.billingStartDate.getTime() + (cyclesCompleted + 1) * cycleDays * 86400000);
            const daysRemaining = Math.ceil((cycleEnd.getTime() - now.getTime()) / 86400000);
            if (daysRemaining <= 0) continue; // cycle already over — next renewal bills the new plan

            const oldDaily = (oldPlan.priceMonthly || 0) / (oldPlan.validityDays || 30);
            const newDaily = (plan.priceMonthly || 0) / (plan.validityDays || 30);
            const creditForUnused = Math.round(oldDaily * daysRemaining * 100) / 100;
            const chargeForNew = Math.round(newDaily * daysRemaining * 100) / 100;
            const delta = Math.round((chargeForNew - creditForUnused) * 100) / 100;
            prorationDelta += delta;

            if (Math.abs(delta) < 0.01) continue; // no material difference

            if (delta > 0) {
              // Customer owes the difference for the rest of the cycle
              let createdInvoice = false;
              for (let attempt = 0; attempt < 5 && !createdInvoice; attempt++) {
                const invoiceNumber = await nextInvoiceNumber();
                try {
                  await db.invoice.create({
                    data: {
                      invoiceNumber,
                      subscriberId: sub.id,
                      planId: plan.id,
                      issueDate: now,
                      dueDate: new Date(now.getTime() + graceDays * 86400000),
                      periodStart: now,
                      periodEnd: cycleEnd,
                      description: `Plan change proration: ${oldPlan.name} → ${plan.name} (${daysRemaining} day(s) remaining in cycle)`,
                      subtotal: chargeForNew,
                      cgstAmount: Math.round(chargeForNew * (plan.cgstPercent ?? 9)) / 100,
                      sgstAmount: Math.round(chargeForNew * (plan.sgstPercent ?? 9)) / 100,
                      igstAmount: 0,
                      totalTax: Math.round(chargeForNew * ((plan.cgstPercent ?? 9) + (plan.sgstPercent ?? 9))) / 100,
                      totalAmount: delta,
                      grandTotal: delta,
                      balanceAmount: delta,
                      status: "SENT",
                      isProRata: true,
                      proRataDays: daysRemaining,
                    },
                  });
                  createdInvoice = true;
                  prorationInvoices++;
                  prorationDetails.push({ code: sub.code, delta, kind: "INVOICE", number: invoiceNumber });
                } catch (e: unknown) {
                  if ((e as { code?: string })?.code !== "P2002") throw e;
                }
              }
            } else {
              // Customer overpaid — issue a credit note for the difference against their latest invoice
              const latestInvoice = await db.invoice.findFirst({
                where: { subscriberId: sub.id, status: { in: ["PAID", "PARTIALLY_PAID", "SENT", "OVERDUE"] } },
                orderBy: { createdAt: "desc" },
                select: { id: true, invoiceNumber: true },
              });
              if (latestInvoice) {
                await db.creditNote.create({
                  data: {
                    invoiceId: latestInvoice.id,
                    amount: Math.abs(delta),
                    reason: `Plan downgrade proration: ${oldPlan.name} → ${plan.name} (${daysRemaining} day(s) remaining)`,
                    status: "ISSUED",
                  },
                });
                creditNotes++;
                prorationDetails.push({ code: sub.code, delta, kind: "CREDIT_NOTE", number: latestInvoice.invoiceNumber });
              }
            }
          }
        }

        result = {
          count: changed.length,
          radiusSynced,
          alreadyOnPlan: subs.length - changed.length,
          proration: {
            enabled: prorate,
            invoices: prorationInvoices,
            creditNotes,
            netDelta: prorationDelta,
            details: prorationDetails,
          },
        };
        break;
      }

      case "renew": {
        // Renewal = invoice (+ optional payment) + extend the billing cycle +
        // reactivate suspended/disconnected/pending subscribers + unblock RADIUS.
        const months = Math.max(1, Math.min(36, parseInt(String(payload.months), 10) || 1));
        const paymentMode = VALID_PAYMENT_MODES.includes(payload.paymentMode) ? payload.paymentMode : "CASH";
        const recordPayment = payload.recordPayment !== false;
        // [AUDIT-FIX F-13] Prepaid wallet renewal — the wallet was previously decorative
        // (only ever credited by refunds/credit notes, never debited). With useWallet=true,
        // renewal collects from the subscriber's prepaid balance instead of an external mode:
        // sufficient balance → debit + WALLET payment; insufficient → subscriber skipped.
        const useWallet = payload.useWallet === true;

        const subs = await db.subscriber.findMany({
          where: { id: { in: subscriberIds } },
          include: { Plan: true },
        });

        const summary = {
          renewed: 0,
          skipped: 0,
          reactivated: 0,
          totalCollected: 0,
          walletDebited: 0,
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

          // Wallet eligibility check (prepaid semantics) — must pass before any writes
          const walletEligible = useWallet && recordPayment && (sub.balance || 0) >= totalAmount;
          if (useWallet && recordPayment && !walletEligible) {
            summary.skipped++;
            summary.skippedNames.push(`${sub.name} — wallet ₹${(sub.balance || 0).toFixed(2)} < renewal ₹${totalAmount.toFixed(2)}`);
            continue;
          }
          const effectiveMode = walletEligible ? "WALLET" : paymentMode;

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
                    paymentMode: recordPayment ? effectiveMode : null,
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
                      paymentMode: effectiveMode,
                      status: "VERIFIED",
                      receiptNumber: `RCPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                      notes: walletEligible
                        ? `Renewal ${months} month(s) — ${plan.name} (${invoiceNumber}) [paid from prepaid wallet]`
                        : `Renewal ${months} month(s) — ${plan.name} (${invoiceNumber})`,
                    },
                  });
                  if (walletEligible) {
                    // [AUDIT-FIX F-13] Debit the prepaid wallet atomically inside the same
                    // transaction as the invoice + payment writes.
                    await tx.subscriber.update({
                      where: { id: sub.id },
                      data: { balance: { decrement: totalAmount } },
                    });
                  }
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
            if (walletEligible) summary.walletDebited++;
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
        walletDebited: result.walletDebited,
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
        proration: result.proration,
      });
    }
    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error("Bulk subscribers API error:", error);
    return NextResponse.json({ error: "Bulk operation failed" }, { status: 500 });
  }
}
