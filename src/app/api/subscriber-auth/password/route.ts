import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'
import { compare, hash } from 'bcryptjs'
import { rateLimit } from '@/lib/rate-limit'

// ============================================================
// PUT /api/subscriber-auth/password
// Change subscriber's service password
// ============================================================

export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get(SUBSCRIBER_SESSION_COOKIE_NAME)?.value
    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const subscriberId = await verifySubscriberSessionToken(token)
    if (!subscriberId) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 })
    }

    // Rate limiting
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const { success: rateLimitOk, retryAfterMs } = rateLimit(`subscriber-password-change:${clientIp}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
    if (!rateLimitOk) {
      return NextResponse.json(
        { success: false, error: 'Too many password change attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, error: 'Current password and new password are required' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: 'New password must be at least 6 characters' }, { status: 400 })
    }

    if (newPassword.length > 64) {
      return NextResponse.json({ success: false, error: 'New password must not exceed 64 characters' }, { status: 400 })
    }

    // Get current subscriber with password
    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      select: { servicePassword: true },
    })

    if (!subscriber) {
      return NextResponse.json({ success: false, error: 'Subscriber not found' }, { status: 404 })
    }

    // Verify current password (support both bcrypt hash and legacy plain-text)
    const storedPassword = subscriber.servicePassword
    let isPasswordValid = false
    if (storedPassword.startsWith('$2')) {
      // bcrypt hash — use bcrypt compare
      isPasswordValid = await compare(currentPassword, storedPassword)
    } else {
      // Legacy plain-text — timing-safe comparison, then auto-migrate
      isPasswordValid = storedPassword.length === currentPassword.length && crypto.timingSafeEqual(Buffer.from(storedPassword), Buffer.from(currentPassword))
    }

    if (!isPasswordValid) {
      return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 401 })
    }

    // Hash new password with bcrypt before storing
    const hashedPassword = await hash(newPassword, 12)

    // Update password
    await db.subscriber.update({
      where: { id: subscriberId },
      data: { servicePassword: hashedPassword },
    })

    return NextResponse.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    console.error('[API] Subscriber password change error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
