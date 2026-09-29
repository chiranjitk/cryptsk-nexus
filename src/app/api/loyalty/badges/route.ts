import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { db } from '@/lib/db';

// Badge definitions
const BADGE_DEFINITIONS = [
  { key: 'early_bird', name: 'Early Bird', description: 'Activated within 24h of registration', icon: 'Bird' },
  { key: 'loyal_customer', name: 'Loyal Customer', description: 'Active for 12+ months', icon: 'Heart' },
  { key: 'power_user', name: 'Power User', description: 'Used 80%+ of plan data consistently', icon: 'Zap' },
  { key: 'referral_champion', name: 'Referral Champion', description: 'Referred 3+ subscribers', icon: 'Users' },
  { key: 'streak_master', name: 'Streak Master', description: '6+ consecutive on-time payments', icon: 'Flame' },
  { key: 'high_roller', name: 'High Roller', description: 'Top 10% by total payment amount', icon: 'Crown' },
  { key: 'zero_dues', name: 'Zero Dues', description: 'Never had an overdue invoice', icon: 'ShieldCheck' },
  { key: 'quick_payer', name: 'Quick Payer', description: 'Average payment within 3 days of invoice date', icon: 'Timer' },
];

async function handler(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'GET') {
    return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    await requireAuth(req);

    // Fetch all data needed for badge computation
    const subscribers = await db.subscriber.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        activationDate: true,
        currentCycleDataUsed: true,
        planId: true,
        Plan: { select: { dataLimitGb: true, priceMonthly: true } },
        Payment: {
          select: { amount: true, status: true, createdAt: true, invoiceId: true, Invoice: { select: { dueDate: true, status: true } } },
          orderBy: { createdAt: 'desc' },
        },
        Invoice: {
          select: { dueDate: true, status: true, paidAmount: true },
          orderBy: { issueDate: 'desc' },
        },
        referrals: { select: { id: true, status: true } },
      },
    });

    // Fetch loyalty members to map subscriberId -> memberId
    const loyaltyMembers = await db.loyaltyMember.findMany({
      select: { id: true, subscriberId: true, tier: true, totalPoints: true },
    });
    const loyaltyMap = new Map<string, { id: string; tier: string; totalPoints: number }>();
    for (const lm of loyaltyMembers) {
      loyaltyMap.set(lm.subscriberId, { id: lm.id, tier: lm.tier || 'Bronze', totalPoints: lm.totalPoints || 0 });
    }

    // ── Precompute data for badges ──

    // 1. Early Bird: activated within 24h of registration
    const earlyBirdIds = new Set<string>();
    for (const sub of subscribers) {
      if (sub.activationDate && sub.createdAt) {
        const diffMs = new Date(sub.activationDate).getTime() - new Date(sub.createdAt).getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours >= 0 && diffHours <= 24) {
          earlyBirdIds.add(sub.id);
        }
      }
    }

    // 2. Loyal Customer: active for 12+ months
    const loyalCustomerIds = new Set<string>();
    const now = new Date();
    for (const sub of subscribers) {
      if (sub.activationDate) {
        const monthsActive = (now.getFullYear() - new Date(sub.activationDate).getFullYear()) * 12 +
          (now.getMonth() - new Date(sub.activationDate).getMonth());
        if (monthsActive >= 12) {
          loyalCustomerIds.add(sub.id);
        }
      }
    }

    // 3. Power User: 80%+ of plan data consistently
    // (we check currentCycleDataUsed against dataLimitGb)
    const powerUserIds = new Set<string>();
    for (const sub of subscribers) {
      if (sub.Plan?.dataLimitGb && sub.Plan.dataLimitGb > 0 && sub.currentCycleDataUsed > 0) {
        const usageRatio = sub.currentCycleDataUsed / (sub.Plan.dataLimitGb * 1024); // dataLimitGb to MB
        if (usageRatio >= 0.8) {
          powerUserIds.add(sub.id);
        }
      }
    }

    // 4. Referral Champion: Referred 3+ subscribers
    const referralChampionIds = new Set<string>();
    for (const sub of subscribers) {
      if (sub.referrals && sub.referrals.length >= 3) {
        referralChampionIds.add(sub.id);
      }
    }

    // 5. Streak Master: 6+ consecutive on-time payments
    const streakMasterIds = new Set<string>();
    for (const sub of subscribers) {
      if (!sub.payments || sub.payments.length === 0) continue;
      const verifiedPayments = sub.payments
        .filter((p) => p.status === 'VERIFIED')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      if (verifiedPayments.length === 0) continue;

      // Calculate max consecutive months
      let streak = 0;
      for (let i = verifiedPayments.length - 1; i >= 0; i--) {
        const payDate = new Date(verifiedPayments[i].createdAt);
        const payMonth = payDate.getFullYear() * 12 + payDate.getMonth();
        const prevMonth = i > 0
          ? new Date(verifiedPayments[i - 1].createdAt).getFullYear() * 12 + new Date(verifiedPayments[i - 1].createdAt).getMonth()
          : -1;

        if (i === verifiedPayments.length - 1) {
          const currentMonth = now.getFullYear() * 12 + now.getMonth();
          if (payMonth >= currentMonth - 1) streak = 1;
        } else {
          if (prevMonth === payMonth - 1) streak++;
          else break;
        }
      }
      if (streak >= 6) streakMasterIds.add(sub.id);
    }

    // 6. High Roller: Top 10% by total payment amount
    const paymentTotals = subscribers.map((sub) => ({
      subscriberId: sub.id,
      totalPaid: (sub.payments || []).filter((p) => p.status === 'VERIFIED').reduce((s, p) => s + (p.amount || 0), 0),
    })).sort((a, b) => b.totalPaid - a.totalPaid);

    const highRollerCutoff = Math.max(1, Math.ceil(paymentTotals.length * 0.1));
    const highRollerIds = new Set<string>();
    for (let i = 0; i < highRollerCutoff && i < paymentTotals.length; i++) {
      if (paymentTotals[i].totalPaid > 0) highRollerIds.add(paymentTotals[i].subscriberId);
    }

    // 7. Zero Dues: Never had an overdue invoice
    const zeroDuesIds = new Set<string>();
    for (const sub of subscribers) {
      const hasOverdue = (sub.invoices || []).some((inv) => inv.status === 'OVERDUE');
      if (!hasOverdue && sub.invoices && sub.invoices.length > 0) {
        zeroDuesIds.add(sub.id);
      }
    }

    // 8. Quick Payer: Average payment within 3 days of invoice due date
    const quickPayerIds = new Set<string>();
    for (const sub of subscribers) {
      const paymentsWithInvoice = (sub.payments || []).filter(
        (p) => p.status === 'VERIFIED' && p.Invoice && p.Invoice.dueDate
      );
      if (paymentsWithInvoice.length === 0) continue;

      let totalDays = 0;
      let count = 0;
      for (const p of paymentsWithInvoice) {
        const payDate = new Date(p.createdAt).getTime();
        const dueDate = new Date(p.invoice!.dueDate).getTime();
        const daysDiff = (payDate - dueDate) / (1000 * 60 * 60 * 24);
        // Payment must be on or before due date (negative or zero days = early/on-time)
        if (daysDiff <= 3) {
          totalDays += daysDiff;
          count++;
        }
      }
      if (count >= 2 && paymentsWithInvoice.length > 0) {
        const avgDays = totalDays / count;
        if (avgDays <= 3) {
          quickPayerIds.add(sub.id);
        }
      }
    }

    // ── Build badge result ──
    const badgeSets: Record<string, Set<string>> = {
      early_bird: earlyBirdIds,
      loyal_customer: loyalCustomerIds,
      power_user: powerUserIds,
      referral_champion: referralChampionIds,
      streak_master: streakMasterIds,
      high_roller: highRollerIds,
      zero_dues: zeroDuesIds,
      quick_payer: quickPayerIds,
    };

    const badges = BADGE_DEFINITIONS.map((def) => {
      const earnerIds = badgeSets[def.key];
      const earners = subscribers
        .filter((s) => earnerIds.has(s.id))
        .map((s) => {
          const lm = loyaltyMap.get(s.id);
          return {
            subscriberId: s.id,
            subscriberName: s.name || 'Unknown',
            tier: lm?.tier || 'Bronze',
            totalPoints: lm?.totalPoints || 0,
          };
        });

      return {
        key: def.key,
        name: def.name,
        description: def.description,
        icon: def.icon,
        earnedCount: earners.length,
        earners,
      };
    });

    return NextResponse.json({
      success: true,
      data: { badges },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('[Loyalty Badges API Error]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export { handler as GET, handler as OPTIONS };
