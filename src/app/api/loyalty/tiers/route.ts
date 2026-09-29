import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { db } from '@/lib/db';

// Tier thresholds based on totalPoints
const TIER_THRESHOLDS = [
  { name: 'Bronze', minPoints: 0, maxPoints: 999, multiplier: 1, discount: 0, benefits: ['1x points earning rate'] },
  { name: 'Silver', minPoints: 1000, maxPoints: 4999, multiplier: 1.2, discount: 0, benefits: ['1.2x points earning rate', 'Free support priority'] },
  { name: 'Gold', minPoints: 5000, maxPoints: 14999, multiplier: 1.5, discount: 5, benefits: ['1.5x points earning rate', '5% discount on add-ons', 'Priority support'] },
  { name: 'Platinum', minPoints: 15000, maxPoints: Infinity, multiplier: 2, discount: 10, benefits: ['2x points earning rate', '10% discount on all services', 'Priority support', 'Exclusive rewards access'] },
];

function calculateTier(totalPoints: number): string {
  if (totalPoints >= 15000) return 'Platinum';
  if (totalPoints >= 5000) return 'Gold';
  if (totalPoints >= 1000) return 'Silver';
  return 'Bronze';
}

async function getHandler(req: NextRequest) {
  try {
    await requireAuth(req);

    const allMembers = await db.loyaltyMember.findMany({
      select: { id: true, subscriberId: true, totalPoints: true, tier: true, Subscriber: { select: { name: true } } },
    });

    // Count members per tier
    const tierCounts = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
    for (const m of allMembers) {
      const t = (m.tier || 'Bronze') as keyof typeof tierCounts;
      if (t in tierCounts) tierCounts[t]++;
    }

    // Build tier info with thresholds and member counts
    const tiers = TIER_THRESHOLDS.map((t) => ({
      name: t.name,
      minPoints: t.minPoints,
      maxPoints: t.maxPoints === Infinity ? '∞' : t.maxPoints,
      multiplier: t.multiplier,
      discount: t.discount,
      benefits: t.benefits,
      memberCount: tierCounts[t.name as keyof typeof tierCounts] || 0,
    }));

    return NextResponse.json({
      success: true,
      data: { tiers, totalMembers: allMembers.length },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('[Loyalty Tiers GET Error]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

async function putHandler(req: NextRequest) {
  try {
    await requireAuth(req);

    const body = await req.json();

    // Recalculate all member tiers based on current totalPoints
    const allMembers = await db.loyaltyMember.findMany({
      select: { id: true, totalPoints: true, tier: true },
    });

    const updates: Array<{ id: string; oldTier: string; newTier: string }> = [];
    const changes: { Bronze: number; Silver: number; Gold: number; Platinum: number } = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };

    for (const member of allMembers) {
      const newTier = calculateTier(member.totalPoints || 0);
      if (newTier !== member.tier) {
        updates.push({ id: member.id, oldTier: member.tier || 'Bronze', newTier });
        changes[newTier as keyof typeof changes]++;
      }
    }

    // Batch update tiers
    if (updates.length > 0) {
      await Promise.all(
        updates.map((u) =>
          db.loyaltyMember.update({ where: { id: u.id }, data: { tier: u.newTier } })
        )
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        recalculated: updates.length,
        changes,
        updatedMembers: updates.map((u) => ({
          memberId: u.id,
          oldTier: u.oldTier,
          newTier: u.newTier,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error('[Loyalty Tiers PUT Error]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

async function optionsHandler() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(req: NextRequest) { return getHandler(req); }
export async function PUT(req: NextRequest) { return putHandler(req); }
export async function OPTIONS() { return optionsHandler(); }
