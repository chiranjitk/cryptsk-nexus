/**
 * WiFi Billing Engine
 *
 * Processes daily WiFi charges for active guests with paid plans.
 * Supports four billing models: flat, usage, tiered, and hybrid.
 * Auto-posts charges to guest folios and generates invoice records.
 *
 * Billing models:
 * - flat:   Fixed daily plan fee (e.g., $5/day)
 * - usage:  Pay-per-MB (e.g., $0.01/MB)
 * - tiered: Base plan fee + overage for exceeding included data
 * - hybrid: Base plan fee + overage for exceeding included data
 *           (same as tiered but semantic difference in description)
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { generateFolioNumber, generateInvoiceNumber } from '@/lib/billing/number-generation';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface BillingResult {
  processed: number;
  postedToFolio: number;
  errors: string[];
  totalCharged: number;
  skipped: number;
}

export interface BillingSummary {
  totalBilled: number;
  totalPending: number;
  totalPosted: number;
  totalInvoiced: number;
  totalVoided: number;
  byChargeType: Record<string, number>;
  thisMonth: number;
  lastMonth: number;
  lineCount: number;
}

export interface GuestChargeInput {
  wifiUserId: string;
  username: string;
  guestId?: string | null;
  bookingId?: string | null;
  tenantId: string;
  propertyId?: string | null;
  planId?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Get the start of the current month */
function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/** Get the start of the previous month */
function startOfLastMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
}

/** Get the end of the previous month */
function endOfLastMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
}

/** Calculate charge based on the billing model */
function calculateCharge(params: {
  billingModel: string;
  planPrice: number;
  planName: string;
  usageMb: number;
  includedDataMb: number;
  pricePerMb: number;
}): { amount: number; description: string; chargeType: string } {
  const { billingModel, planPrice, planName, usageMb, includedDataMb, pricePerMb } = params;

  switch (billingModel) {
    case 'usage':
      return {
        amount: round2(usageMb * pricePerMb),
        description: `WiFi Usage — ${usageMb.toFixed(1)} MB @ $${pricePerMb}/MB`,
        chargeType: 'data_overage',
      };

    case 'tiered': {
      const overageMb = Math.max(0, usageMb - includedDataMb);
      const overageCost = round2(overageMb * pricePerMb);
      return {
        amount: round2(planPrice + overageCost),
        description: `WiFi ${planName} (Base $${planPrice.toFixed(2)}) + ${overageMb.toFixed(1)} MB overage`,
        chargeType: 'plan_fee',
      };
    }

    case 'hybrid': {
      const overageMb = Math.max(0, usageMb - includedDataMb);
      const overageCost = round2(overageMb * pricePerMb);
      return {
        amount: round2(planPrice + overageCost),
        description: includedDataMb > 0
          ? `WiFi ${planName} (${Math.min(usageMb, includedDataMb).toFixed(0)}/${includedDataMb} MB included + $${overageCost.toFixed(2)} overage)`
          : `WiFi ${planName} (${usageMb.toFixed(1)} MB @ $${planPrice.toFixed(2)})`,
        chargeType: 'plan_fee',
      };
    }

    case 'flat':
    default:
      return {
        amount: round2(planPrice),
        description: `WiFi Plan — ${planName} (Daily)`,
        chargeType: 'plan_fee',
      };
  }
}

/** Recalculate folio totals after adding a line item */
async function recalculateFolio(folioId: string): Promise<void> {
  const allItems = await db.folioLineItem.findMany({ where: { folioId } });
  const subtotal = round2(allItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0));
  const taxes = round2(allItems.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0));
  const folio = await db.folio.findUnique({ where: { id: folioId } });
  if (!folio) return;

  const totalAmount = round2(subtotal + taxes - Number(folio.discount || 0));
  const balance = round2(totalAmount - Number(folio.paidAmount || 0));

  await db.folio.update({
    where: { id: folioId },
    data: { subtotal, taxes, totalAmount, balance },
  });
}

// ─── Core Billing Engine ───────────────────────────────────────────────────────

/**
 * Run daily WiFi billing for all active, billable guests.
 *
 * Filters: only active WiFi users with validUntil >= now, linked to
 * a booking or a paid plan. Free plans (price <= 0) are skipped.
 *
 * For each billable user:
 *   1. Calculate data usage from totalBytesIn + totalBytesOut
 *   2. Apply billing model pricing (flat/usage/tiered/hybrid)
 *   3. Create a WiFiInvoiceLine record
 *   4. Post charge to guest folio (if booking exists)
 *   5. Update folio totals
 */
export async function runDailyWiFiBilling(tenantId?: string): Promise<BillingResult> {
  const result: BillingResult = { processed: 0, postedToFolio: 0, errors: [], totalCharged: 0, skipped: 0 };

  try {
    const where: Prisma.WiFiUserWhereInput = {
      status: 'active',
      validUntil: { gte: new Date() },
      OR: [
        { bookingId: { not: null } },
        { planId: { not: null } },
      ],
      ...(tenantId ? { tenantId } : {}),
    };

    const users = await db.wiFiUser.findMany({
      where,
      include: {
        plan: true,
      },
    });

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // H-35 FIX: Process users in parallel batches instead of sequentially.
    // Process 10 users at a time to balance parallelism with DB connection limits.
    const BATCH_SIZE = 10;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (user) => {
          try {
            result.processed++;
            const plan = user.plan;

            // Skip free plans
            if (!plan || plan.price <= 0) {
              result.skipped++;
              return;
            }

            // HIGH-015: Skip WiFi fee if included in room rate
            if (plan.includedInRoomRate) {
              console.log(`[WiFiBilling] Skipping WiFi fee for session — included in room rate`);
              result.skipped++;
              return;
            }

            // Calculate usage DELTA (not cumulative) — only bill data consumed since last billing run
            const totalBytesIn = Number(user.totalBytesIn || 0n);
            const totalBytesOut = Number(user.totalBytesOut || 0);
            const lastBilledIn = Number(user.lastBilledBytesIn || 0n);
            const lastBilledOut = Number(user.lastBilledBytesOut || 0n);
            const deltaBytesIn = Math.max(0, totalBytesIn - lastBilledIn);
            const deltaBytesOut = Math.max(0, totalBytesOut - lastBilledOut);
            const usageMb = round2((deltaBytesIn + deltaBytesOut) / (1024 * 1024));

        // Use lastBilledAt for period start (or createdAt for first run)
        const periodStart = user.lastBilledAt || user.createdAt;

        // Apply billing model pricing
        const billingModel = plan.billingModel || 'flat';
        const includedDataMb = plan.includedDataMb || 0;
        const pricePerMb = plan.pricePerMb || 0;

        const { amount, description, chargeType } = calculateCharge({
          billingModel,
          planPrice: plan.price,
          planName: plan.name,
          usageMb,
          includedDataMb,
          pricePerMb,
        });

        if (amount <= 0) {
          result.skipped++;
          return;
        }

        result.totalCharged = round2(result.totalCharged + amount);

        // Create WiFiInvoiceLine
        const invoiceLine = await db.wiFiInvoiceLine.create({
          data: {
            tenantId: user.tenantId,
            propertyId: user.propertyId,
            guestId: user.guestId,
            bookingId: user.bookingId,
            wifiUserId: user.id,
            periodStart,
            periodEnd: now,
            chargeType,
            description,
            quantity: 1,
            unitPrice: amount,
            totalAmount: amount,
            currency: plan.currency || 'USD',
            dataUsedMb: usageMb,
            planId: plan.id,
            status: 'pending',
          },
        });

        // Snapshot current usage counters (prevent re-billing same data)
        await db.wiFiUser.update({
          where: { id: user.id },
          data: {
            lastBilledBytesIn: user.totalBytesIn,
            lastBilledBytesOut: user.totalBytesOut,
            lastBilledAt: now,
          },
        });

        // Post to folio if booking exists
        if (user.bookingId) {
          // Find or create folio
          let folio = await db.folio.findFirst({
            where: {
              bookingId: user.bookingId,
              status: { in: ['open', 'partially_paid'] },
            },
            orderBy: { createdAt: 'desc' },
          });

          if (!folio) {
            // Try to get booking details for folio creation
            const booking = await db.booking.findUnique({
              where: { id: user.bookingId },
              select: { propertyId: true, primaryGuestId: true, tenantId: true },
            });

            if (booking) {
              folio = await db.folio.create({
                data: {
                  tenantId: booking.tenantId,
                  propertyId: booking.propertyId,
                  bookingId: user.bookingId,
                  guestId: booking.primaryGuestId,
                  folioNumber: generateFolioNumber('WIFI'),
                  status: 'open',
                },
              });
            }
          }

          if (folio) {
            // Look up property tax rate
            let taxRate = 0;
            try {
              const propSettings = await db.property.findUnique({
                where: { id: folio.propertyId },
                select: { defaultTaxRate: true, taxComponents: true },
              });
              if (propSettings) {
                if (propSettings.taxComponents) {
                  const tc = JSON.parse(propSettings.taxComponents);
                  if (Array.isArray(tc) && tc.length > 0) {
                    taxRate = tc.reduce((s: number, c: { rate: number }) => s + (c.rate || 0), 0) / 100;
                  } else {
                    taxRate = (propSettings.defaultTaxRate || 0) / 100;
                  }
                } else {
                  taxRate = (propSettings.defaultTaxRate || 0) / 100;
                }
              }
            } catch { /* use 0 tax */ }

            const taxAmount = round2(amount * taxRate);
            const lineTotal = round2(amount + taxAmount);

            // Create folio line item
            const folioLineItem = await db.folioLineItem.create({
              data: {
                folioId: folio.id,
                description,
                category: 'wifi',
                quantity: 1,
                unitPrice: amount,
                totalAmount: lineTotal,
                taxAmount,
                serviceDate: now,
                referenceType: 'wifi_billing',
                referenceId: invoiceLine.id,
                itemCurrency: plan.currency || 'USD',
                postedBy: 'system',
              },
            });

            // Update invoice line status
            await db.wiFiInvoiceLine.update({
              where: { id: invoiceLine.id },
              data: {
                status: 'posted',
                postedToFolioAt: now,
                folioLineItemId: folioLineItem.id,
              },
            });

            // Recalculate folio totals
            await recalculateFolio(folio.id);
            result.postedToFolio++;
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`User ${user.username}: ${message}`);
      }
    })
  );

      // Process batch results - count failures from settled promises
      for (const r of batchResults) {
        if (r.status === 'rejected') {
          result.errors.push(`Unexpected error: ${r.reason}`);
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(`Billing engine error: ${message}`);
  }

  return result;
}

// ─── Invoice Generation ────────────────────────────────────────────────────────

/**
 * Generate a WiFi-only invoice for a booking's folio.
 * Creates an Invoice record with all WiFi line items from the folio.
 */
export async function generateWiFiInvoice(bookingId: string, tenantId: string) {
  const folio = await db.folio.findFirst({
    where: {
      bookingId,
      tenantId,
      status: { in: ['open', 'partially_paid'] },
    },
  });

  if (!folio) {
    return null;
  }

  const wifiLineItems = await db.folioLineItem.findMany({
    where: {
      folioId: folio.id,
      category: 'wifi',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (wifiLineItems.length === 0) {
    return null;
  }

  // Get guest name
  const guest = folio.guestId
    ? await db.guest.findUnique({
        where: { id: folio.guestId },
        select: { firstName: true, lastName: true, email: true },
      })
    : null;

  const wifiTotal = round2(wifiLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0));

  const invoice = await db.invoice.create({
    data: {
      tenantId,
      invoiceNumber: generateInvoiceNumber('WIFI'),
      folioId: folio.id,
      customerName: guest ? `${guest.firstName} ${guest.lastName}` : 'Guest',
      customerEmail: guest?.email,
      subtotal: wifiTotal,
      taxes: round2(wifiLineItems.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0)),
      totalAmount: wifiTotal,
      currency: wifiLineItems[0]?.itemCurrency || 'USD',
      status: 'draft',
      notes: 'WiFi charges auto-generated by billing engine',
      lineItems: JSON.stringify(
        wifiLineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalAmount: Number(item.totalAmount),
          taxRate: Number(item.taxRate || 0),
          taxAmount: Number(item.taxAmount || 0),
        }))
      ),
    },
  });

  // Mark related WiFiInvoiceLines as invoiced
  const wifiInvoiceLineIds = await db.wiFiInvoiceLine.findMany({
    where: {
      bookingId,
      status: 'posted',
    },
    select: { id: true },
  });

  if (wifiInvoiceLineIds.length > 0) {
    await db.wiFiInvoiceLine.updateMany({
      where: { id: { in: wifiInvoiceLineIds.map(l => l.id) } },
      data: { status: 'invoiced' },
    });
  }

  return invoice;
}

// ─── Billing Summary ───────────────────────────────────────────────────────────

/**
 * Get billing summary for a tenant.
 * Returns totals by status, charge type, and monthly comparisons.
 */
export async function getBillingSummary(tenantId: string, propertyId?: string): Promise<BillingSummary> {
  const baseWhere: Record<string, unknown> = { tenantId };
  if (propertyId) baseWhere.propertyId = propertyId;
  const [all, pending, posted, invoiced, voided, thisMonthLines, lastMonthLines, byChargeType] =
    await Promise.all([
      // Total billed (all non-voided)
      db.wiFiInvoiceLine.aggregate({
        where: { ...baseWhere, status: { not: 'voided' } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // Pending
      db.wiFiInvoiceLine.aggregate({
        where: { ...baseWhere, status: 'pending' },
        _sum: { totalAmount: true },
      }),
      // Posted
      db.wiFiInvoiceLine.aggregate({
        where: { ...baseWhere, status: 'posted' },
        _sum: { totalAmount: true },
      }),
      // Invoiced
      db.wiFiInvoiceLine.aggregate({
        where: { ...baseWhere, status: 'invoiced' },
        _sum: { totalAmount: true },
      }),
      // Voided
      db.wiFiInvoiceLine.aggregate({
        where: { ...baseWhere, status: 'voided' },
        _sum: { totalAmount: true },
      }),
      // This month
      db.wiFiInvoiceLine.aggregate({
        where: {
          ...baseWhere,
          createdAt: { gte: startOfMonth() },
          status: { not: 'voided' },
        },
        _sum: { totalAmount: true },
      }),
      // Last month
      db.wiFiInvoiceLine.aggregate({
        where: {
          ...baseWhere,
          createdAt: { gte: startOfLastMonth(), lt: startOfMonth() },
          status: { not: 'voided' },
        },
        _sum: { totalAmount: true },
      }),
      // Group by charge type
      db.wiFiInvoiceLine.groupBy({
        by: ['chargeType'],
        where: { ...baseWhere, status: { not: 'voided' } },
        _sum: { totalAmount: true },
      }),
    ]);

  const byChargeTypeMap: Record<string, number> = {};
  for (const row of byChargeType) {
    byChargeTypeMap[row.chargeType] = Number(row._sum.totalAmount || 0);
  }

  return {
    totalBilled: round2(Number(all._sum.totalAmount || 0)),
    totalPending: round2(Number(pending._sum.totalAmount || 0)),
    totalPosted: round2(Number(posted._sum.totalAmount || 0)),
    totalInvoiced: round2(Number(invoiced._sum.totalAmount || 0)),
    totalVoided: round2(Number(voided._sum.totalAmount || 0)),
    byChargeType: byChargeTypeMap,
    thisMonth: round2(Number(thisMonthLines._sum.totalAmount || 0)),
    lastMonth: round2(Number(lastMonthLines._sum.totalAmount || 0)),
    lineCount: all._count || 0,
  };
}
