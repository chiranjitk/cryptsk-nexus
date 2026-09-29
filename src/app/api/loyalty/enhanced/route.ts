import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

async function handler(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'GET') {
    return NextResponse.json(
      { success: false, error: 'Method not allowed' },
      { status: 405 }
    );
  }

  try {
    await requireAuth(req);

    // 1. Tier distribution
    const allMembers = await db.loyaltyMember.findMany({
      include: {
        Subscriber: { select: { name: true, activationDate: true, createdAt: true } },
      },
    });

    // Fetch payments separately for streak analysis (avoid complex nested query)
    const recentPayments = await db.payment.findMany({
      where: { status: 'VERIFIED', createdAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
      select: { subscriberId: true, amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group payments by subscriberId
    const paymentsBySubscriber = new Map<string, typeof recentPayments>();
    for (const p of recentPayments) {
      if (!paymentsBySubscriber.has(p.subscriberId)) {
        paymentsBySubscriber.set(p.subscriberId, []);
      }
      paymentsBySubscriber.get(p.subscriberId)!.push(p);
    }

    const tierDistribution = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
    for (const m of allMembers) {
      const t = (m.tier || 'Bronze') as keyof typeof tierDistribution;
      if (t in tierDistribution) tierDistribution[t]++;
    }

    // 2. Points economy
    const totalEarned = allMembers.reduce((s, m) => s + (m.totalPoints || 0), 0);
    const totalRedeemed = allMembers.reduce((s, m) => s + (m.redeemedPoints || 0), 0);
    const totalAvailable = allMembers.reduce((s, m) => s + (m.availablePoints || 0), 0);
    const avgPerMember = allMembers.length > 0 ? Math.round(totalEarned / allMembers.length) : 0;

    // 3. Engagement metrics: active members (earned in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Count members with points activity in last 30 days
    const activeMembersData = await db.pointsHistory.groupBy({
      by: ['memberId'],
      where: {
        actionType: 'Earned',
        createdAt: { gte: thirtyDaysAgo },
      },
    });
    const activeMembersCount = activeMembersData.length;

    // Redemption rate: members who have redeemed at least once
    const membersWithRedemptions = await db.rewardRedemption.groupBy({
      by: ['memberId'],
    });
    const redemptionRate = allMembers.length > 0
      ? Math.round((membersWithRedemptions.length / allMembers.length) * 100)
      : 0;

    // 4. Top earners leaderboard (top 10 by totalPoints)
    const topEarners = [...allMembers]
      .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
      .slice(0, 10)
      .map((m, i) => ({
        rank: i + 1,
        id: m.id,
        subscriberId: m.subscriberId,
        subscriberName: m.Subscriber?.name || 'Unknown',
        totalPoints: m.totalPoints || 0,
        availablePoints: m.availablePoints || 0,
        tier: m.tier || 'Bronze',
      }));

    // 5. Redemption trends: Monthly redemptions for last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyRedemptions = await db.rewardRedemption.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, pointsUsed: true },
    });

    const redemptionsByMonth: Record<string, { count: number; points: number }> = {};
    for (const r of monthlyRedemptions) {
      const key = r.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!redemptionsByMonth[key]) redemptionsByMonth[key] = { count: 0, points: 0 };
      redemptionsByMonth[key].count++;
      redemptionsByMonth[key].points += r.pointsUsed || 0;
    }

    const redemptionTrends = Object.entries(redemptionsByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        label: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        count: data.count,
        points: data.points,
      }));

    // 6. Streak analysis: consecutive on-time payments
    const streakData = await analyzePaymentStreaks(allMembers, paymentsBySubscriber);

    return NextResponse.json({
      success: true,
      data: {
        tierDistribution,
        pointsEconomy: {
          totalEarned,
          totalRedeemed,
          totalAvailable,
          avgPerMember,
        },
        engagement: {
          totalMembers: allMembers.length,
          activeMembersLast30Days: activeMembersCount,
          redemptionRate,
        },
        topEarners,
        redemptionTrends,
        streakAnalysis: streakData,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('[Loyalty Enhanced API Error]', error, (error as Error)?.message, (error as Error)?.stack);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function analyzePaymentStreaks(
  members: {
    id: string;
    subscriberId: string;
    Subscriber: {
      name: string | null;
      activationDate: Date | null;
    } | null;
  }[],
  paymentsBySubscriber: Map<string, { amount: number; createdAt: Date }[]>
) {
  const streakMembers: Array<{
    memberId: string;
    subscriberId: string;
    subscriberName: string;
    streakLength: number;
    streakLabel: string;
  }> = [];

  const streakDistribution = { 'No Streak': 0, 'Active Streak (3+)': 0, 'Gold Streak (6+)': 0, 'Platinum Streak (12+)': 0 };

  for (const member of members) {
    if (!member.Subscriber?.payments || member.Subscriber.payments.length === 0) {
      streakDistribution['No Streak']++;
      continue;
    }

    const verifiedPayments = paymentsBySubscriber.get(member.subscriberId) || [];

    if (verifiedPayments.length === 0) {
      streakDistribution['No Streak']++;
      continue;
    }

    // Calculate consecutive months of on-time payment
    let streak = 0;
    let maxStreak = 0;
    const now = new Date();

    for (let i = verifiedPayments.length - 1; i >= 0; i--) {
      const payDate = new Date(verifiedPayments[i].createdAt);
      const payMonth = payDate.getFullYear() * 12 + payDate.getMonth();
      const prevMonth = i > 0
        ? new Date(verifiedPayments[i - 1].createdAt).getFullYear() * 12 + new Date(verifiedPayments[i - 1].createdAt).getMonth()
        : -1;

      if (i === verifiedPayments.length - 1) {
        // Check if the latest payment is within the current or previous month
        const currentMonth = now.getFullYear() * 12 + now.getMonth();
        if (payMonth >= currentMonth - 1) {
          streak = 1;
        }
      } else {
        if (prevMonth === payMonth - 1) {
          streak++;
        } else {
          break;
        }
      }
      maxStreak = Math.max(maxStreak, streak);
    }

    if (maxStreak === streak && streak > 0) {
      // Use current active streak
    } else {
      streak = maxStreak;
    }

    let streakLabel = 'No Streak';
    if (streak >= 12) {
      streakLabel = 'Platinum Streak';
      streakDistribution['Platinum Streak (12+)']++;
    } else if (streak >= 6) {
      streakLabel = 'Gold Streak';
      streakDistribution['Gold Streak (6+)']++;
    } else if (streak >= 3) {
      streakLabel = 'Active Streak';
      streakDistribution['Active Streak (3+)']++;
    } else {
      streakDistribution['No Streak']++;
    }

    if (streak >= 3) {
      streakMembers.push({
        memberId: member.id,
        subscriberId: member.subscriberId,
        subscriberName: member.Subscriber?.name || 'Unknown',
        streakLength: streak,
        streakLabel,
      });
    }
  }

  // Sort streak members by streak length descending
  streakMembers.sort((a, b) => b.streakLength - a.streakLength);

  return {
    members: streakMembers,
    distribution: streakDistribution,
    totalWithStreaks: streakMembers.length,
  };
}

export { handler as GET, handler as OPTIONS };
