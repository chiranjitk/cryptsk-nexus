import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'

// ============================================================
// GET /api/subscriber-auth/me
// Get current subscriber's profile
// ============================================================

async function getSubscriberFromRequest(request: NextRequest) {
  const token = request.cookies.get(SUBSCRIBER_SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const subscriberId = await verifySubscriberSessionToken(token)
  if (!subscriberId) return null

  return db.subscriber.findUnique({
    where: { id: subscriberId },
    include: {
      Plan: { select: { id: true, name: true, downloadSpeed: true, uploadSpeed: true, speedUnit: true, dataLimitGb: true, priceMonthly: true, validityDays: true } },
      Area: { select: { id: true, name: true } },
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const subscriber = await getSubscriberFromRequest(request)

    if (!subscriber) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      Subscriber: {
        id: subscriber.id,
        code: subscriber.code,
        name: subscriber.name,
        email: subscriber.email,
        phone: subscriber.phone,
        altPhone: subscriber.altPhone,
        address: subscriber.address,
        area: subscriber.Area,
        landmark: subscriber.landmark,
        pincode: subscriber.pincode,
        connectionType: subscriber.connectionType,
        status: subscriber.status,
        serviceUsername: subscriber.serviceUsername,
        ipType: subscriber.ipType,
        ipAddress: subscriber.ipAddress,
        macAddress: subscriber.macAddress,
        plan: subscriber.Plan ? {
          id: subscriber.Plan.id,
          name: subscriber.Plan.name,
          speedDown: subscriber.Plan.downloadSpeed,
          speedUp: subscriber.Plan.uploadSpeed,
          speedUnit: subscriber.Plan.speedUnit || 'Mbps',
          dataLimitGb: subscriber.Plan.dataLimitGb,
          price: subscriber.Plan.priceMonthly || 0,
          billingCycle: 'MONTHLY',
        } : null,
        activationDate: subscriber.activationDate,
        billingStartDate: subscriber.billingStartDate,
        balance: subscriber.balance,
        currentSpeedDown: subscriber.currentSpeedDown,
        currentSpeedUp: subscriber.currentSpeedUp,
        currentCycleDataUsed: subscriber.currentCycleDataUsed,
        lastAuthAt: subscriber.lastAuthAt,
        lastAuthResult: subscriber.lastAuthResult,
        radiusEnabled: subscriber.radiusEnabled,
        routerRented: subscriber.routerRented,
        routerSerial: subscriber.routerSerial,
        routerDeposit: subscriber.routerDeposit,
        createdAt: subscriber.createdAt,
      },
    })
  } catch (error) {
    console.error('[API] Subscriber auth me error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
