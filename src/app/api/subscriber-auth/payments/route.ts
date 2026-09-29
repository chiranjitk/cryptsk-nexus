import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'

// ============================================================
// GET /api/subscriber-auth/payments
// Get subscriber's payments
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
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where: { subscriberId },
        select: {
          id: true,
          amount: true,
          paymentMode: true,
          status: true,
          transactionRef: true,
          receiptNumber: true,
          bankName: true,
          notes: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.payment.count({ where: { subscriberId } }),
    ])

    // This month total
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthTotal = await db.payment.aggregate({
      where: { subscriberId, createdAt: { gte: monthStart }, status: 'VERIFIED' },
      _sum: { amount: true },
    })

    // This year total
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const thisYearTotal = await db.payment.aggregate({
      where: { subscriberId, createdAt: { gte: yearStart }, status: 'VERIFIED' },
      _sum: { amount: true },
    })

    return NextResponse.json({
      success: true,
      payments,
      pagination: { total, limit, offset, pages: Math.ceil(total / limit) },
      summary: {
        totalPaidThisMonth: thisMonthTotal._sum.amount || 0,
        totalPaidThisYear: thisYearTotal._sum.amount || 0,
      },
    })
  } catch (error) {
    console.error('[API] Subscriber payments error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================
// POST /api/subscriber-auth/payments
// Create a payment from the subscriber self-care portal
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SUBSCRIBER_SESSION_COOKIE_NAME)?.value
    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const subscriberId = await verifySubscriberSessionToken(token)
    if (!subscriberId) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 })
    }

    const body = await request.json()
    const { amount, invoiceId, paymentMode } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'A valid amount is required' }, { status: 400 })
    }

    if (amount > 1000000) {
      return NextResponse.json({ success: false, error: 'Amount cannot exceed ₹10,00,000' }, { status: 400 })
    }

    // Verify subscriber exists
    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      select: { id: true, name: true, code: true },
    })

    if (!subscriber) {
      return NextResponse.json({ success: false, error: 'Subscriber not found' }, { status: 404 })
    }

    // Verify invoice belongs to subscriber if provided
    if (invoiceId) {
      const invoice = await db.invoice.findFirst({
        where: { id: invoiceId, subscriberId },
        select: { id: true, invoiceNumber: true },
      })
      if (!invoice) {
        return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 })
      }
    }

    // Create receipt number
    const payCount = await db.payment.count()
    const receiptNumber = `RCT${String(payCount + 1).padStart(6, '0')}`

    // Create payment record
    const payment = await db.payment.create({
      data: {
        subscriberId,
        invoiceId: invoiceId || null,
        amount,
        paymentMode: paymentMode || 'ONLINE',
        transactionRef: `SELF-CARE-${Date.now()}`,
        receiptNumber,
        status: 'PENDING',
        notes: 'Payment initiated via Self-Care Portal',
      },
      select: {
        id: true,
        amount: true,
        receiptNumber: true,
        status: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      payment,
    }, { status: 201 })
  } catch (error) {
    console.error('[API] Subscriber payments POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
