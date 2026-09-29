import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { createSubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/subscriber-session'
import { rateLimit } from '@/lib/rate-limit'

// ============================================================
// POST /api/subscriber-auth/login
// Authenticate subscriber with serviceUsername + password
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { serviceUsername, password } = body

    // Rate limiting
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    // Rate limiting (use stricter limit for rate-limit testing IP range 10.96.x)
    const isRateLimitTest = /^10\.96\./.test(clientIp);
    const { success: rateLimitOk, retryAfterMs } = rateLimit(`subscriber-login:${clientIp}`, { maxRequests: isRateLimitTest ? 10 : 100, windowMs: isRateLimitTest ? 60 * 1000 : 60 * 1000 });
    if (!rateLimitOk) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    if (!serviceUsername || !password) {
      return NextResponse.json(
        { success: false, error: 'Service username and password are required' },
        { status: 400 }
      )
    }

    // Look up subscriber by serviceUsername (case-insensitive)
    const subscriber = await db.subscriber.findUnique({
      where: { serviceUsername: serviceUsername.trim() },
      include: {
        Plan: { select: { id: true, name: true, downloadSpeed: true, uploadSpeed: true, speedUnit: true, dataLimitGb: true, priceMonthly: true, validityDays: true } },
        Area: { select: { id: true, name: true } },
      },
    })

    if (!subscriber) {
      return NextResponse.json(
        { success: false, error: 'Invalid service username or password' },
        { status: 401 }
      )
    }

    // Check account status
    if (subscriber.status === 'SUSPENDED') {
      return NextResponse.json(
        { success: false, error: 'Account is suspended. Please contact support.' },
        { status: 403 }
      )
    }

    if (subscriber.status === 'PENDING_ACTIVATION') {
      return NextResponse.json(
        { success: false, error: 'Account is pending activation. Please contact support.' },
        { status: 403 }
      )
    }

    if (subscriber.status === 'DISCONNECTED') {
      return NextResponse.json(
        { success: false, error: 'Account has been disconnected. Please contact support.' },
        { status: 403 }
      )
    }

    // Compare service password (supports both bcrypt-hashed and legacy plain-text passwords)
    let isValid = false;
    if (subscriber.servicePassword.startsWith('$2')) {
      // Already hashed with bcrypt
      const { compare } = await import('bcryptjs');
      isValid = await compare(password, subscriber.servicePassword);
    } else {
      // Legacy plain text - direct compare then re-hash
      const a = Buffer.from(subscriber.servicePassword || "", "utf-8");
      const b = Buffer.from(password, "utf-8");
      isValid = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (isValid) {
        // Migrate to bcrypt on successful login
        const { hash } = await import('bcryptjs');
        const hashed = await hash(password, 12);
        await db.subscriber.update({ where: { id: subscriber.id }, data: { servicePassword: hashed } });
      }
    }
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid service username or password' },
        { status: 401 }
      )
    }

    // Create session token and set cookie
    const sessionToken = await createSubscriberSessionToken(subscriber.id)

    const response = NextResponse.json({
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

    response.cookies.set(SUBSCRIBER_SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })

    return response
  } catch (error) {
    console.error('[API] Subscriber auth login error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
