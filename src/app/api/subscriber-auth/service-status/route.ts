import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'

// ============================================================
// GET /api/subscriber-auth/service-status
// Get subscriber's service/connection status
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

    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
    })

    if (!subscriber) {
      return NextResponse.json({ success: false, error: 'Subscriber not found' }, { status: 404 })
    }

    // Determine connection status based on last auth and account status
    const isOnline = subscriber.lastAuthResult === 'success' &&
      subscriber.lastAuthAt &&
      (Date.now() - subscriber.lastAuthAt.getTime()) < (24 * 60 * 60 * 1000)

    const plan = subscriber.planId ? await db.plan.findUnique({ where: { id: subscriber.planId } }) : null
    const area = subscriber.areaId ? await db.area.findUnique({ where: { id: subscriber.areaId } }) : null

    return NextResponse.json({
      success: true,
      service: {
        connectionType: subscriber.connectionType,
        accountStatus: subscriber.status,
        isOnline,
        serviceUsername: subscriber.serviceUsername,
        ipConfiguration: {
          type: subscriber.ipType,
          address: subscriber.ipAddress || 'Assigned dynamically',
          macAddress: subscriber.macAddress || 'Not set',
        },
        speeds: {
          currentDown: subscriber.currentSpeedDown,
          currentUp: subscriber.currentSpeedUp,
          planDown: plan?.downloadSpeed || 0,
          planUp: plan?.uploadSpeed || 0,
        },
        plan: plan ? {
          name: plan.name,
          speedDown: plan.downloadSpeed,
          speedUp: plan.uploadSpeed,
          speedUnit: plan.speedUnit || 'Mbps',
          dataLimitGb: plan.dataLimitGb,
        } : null,
        authentication: {
          lastAuthAt: subscriber.lastAuthAt,
          lastAuthResult: subscriber.lastAuthResult,
          radiusEnabled: subscriber.radiusEnabled,
          sessionTimeout: subscriber.sessionTimeout,
          idleTimeout: subscriber.idleTimeout,
        },
        equipment: {
          routerRented: subscriber.routerRented,
          routerSerial: subscriber.routerSerial || 'N/A',
          routerDeposit: subscriber.routerDeposit,
        },
        location: {
          area: area?.name || 'Not assigned',
        },
      },
    })
  } catch (error) {
    console.error('[API] Subscriber service-status error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
