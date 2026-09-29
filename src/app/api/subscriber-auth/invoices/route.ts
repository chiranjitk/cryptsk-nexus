import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'

// ============================================================
// GET /api/subscriber-auth/invoices
// Get subscriber's invoices
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SUBSCRIBER_SESSION_COOKIE_NAME)?.value
    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const subscriberId = await verifySubscriberSessionToken(token)
    if (!subscriberId) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const where: Record<string, unknown> = { subscriberId }
    if (status && status !== 'ALL') {
      where.status = status
    }

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where,
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          grandTotal: true,
          paidAmount: true,
          balanceAmount: true,
          status: true,
          createdAt: true,
          paidAt: true,
          totalTax: true,
          discountAmount: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.invoice.count({ where }),
    ])

    // Calculate totals
    const totals = await db.invoice.aggregate({
      where: { subscriberId },
      _sum: { grandTotal: true, paidAmount: true },
    })
    const outstanding = await db.invoice.aggregate({
      where: { subscriberId, status: { notIn: ['PAID', 'CANCELLED'] } },
      _sum: { balanceAmount: true },
    })

    return NextResponse.json({
      success: true,
      invoices,
      pagination: { total, limit, offset, pages: Math.ceil(total / limit) },
      summary: {
        totalBilled: totals._sum.grandTotal || 0,
        totalPaid: totals._sum.paidAmount || 0,
        outstandingBalance: outstanding._sum.balanceAmount || 0,
      },
    })
  } catch (error) {
    console.error('[API] Subscriber invoices error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
