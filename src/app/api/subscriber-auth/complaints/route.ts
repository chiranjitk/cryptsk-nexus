import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'

// ============================================================
// GET /api/subscriber-auth/complaints — List subscriber's complaints
// POST /api/subscriber-auth/complaints — Create new complaint
// ============================================================

async function getSubscriberId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(SUBSCRIBER_SESSION_COOKIE_NAME)?.value
  if (!token) return null
  return verifySubscriberSessionToken(token)
}

export async function GET(request: NextRequest) {
  try {
    const subscriberId = await getSubscriberId(request)
    if (!subscriberId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const where: Record<string, unknown> = { subscriberId }
    if (status && status !== 'ALL') {
      where.status = status
    }

    const [complaints, total] = await Promise.all([
      db.complaint.findMany({
        where,
        select: {
          id: true,
          ticketNumber: true,
          type: true,
          priority: true,
          status: true,
          description: true,
          resolutionNotes: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
          customerRating: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.complaint.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      complaints,
      pagination: { total, limit, offset, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[API] Subscriber complaints GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const subscriberId = await getSubscriberId(request)
    if (!subscriberId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { subject, description, priority, type } = body

    if (!description) {
      return NextResponse.json(
        { success: false, error: 'Description is required' },
        { status: 400 }
      )
    }

    if (description.length > 5000) {
      return NextResponse.json(
        { success: false, error: 'Description must not exceed 5000 characters' },
        { status: 400 }
      )
    }

    const complaint = await db.complaint.create({
      data: {
        subscriberId,
        ticketNumber: `CMP-${Date.now()}`,
        description: description.trim(),
        type: type || 'OTHER',
        priority: priority || 'P3_MEDIUM',
        status: 'OPEN',
      },
      select: {
        id: true,
        ticketNumber: true,
        type: true,
        priority: true,
        status: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ success: true, complaint }, { status: 201 })
  } catch (error) {
    console.error('[API] Subscriber complaints POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
