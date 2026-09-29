import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'

// GET /api/subscriber-auth/plans — List active plans (PUBLIC - no auth required)
export async function GET(request: NextRequest) {
  try {
    // This endpoint is public — no authentication required for plan comparison
    // Subscribers who aren't logged in should still see available plans

    const plans = await db.plan.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        description: true,
        downloadSpeed: true,
        uploadSpeed: true,
        speedUnit: true,
        dataLimitGb: true,
        priceMonthly: true,
        priceQuarterly: true,
        priceHalfYearly: true,
        priceYearly: true,
        isPopular: true,
        category: true,
        validityDays: true,
        _count: { select: { Subscriber: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
    })

    return NextResponse.json({ success: true, plans })
  } catch (error) {
    console.error('[API] Subscriber plans GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
