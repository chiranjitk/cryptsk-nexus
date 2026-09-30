import { NextRequest, NextResponse } from 'next/server'
import { login } from '@/lib/auth'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/session'
import { recordUserSession } from '@/lib/session-store'
import { auditLogin } from "@/lib/services/audit-service";
import { rateLimit } from '@/lib/rate-limit'

// ============================================================
// POST /api/auth/login
// Authenticate user with email and password
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Rate limiting
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const { success: rateLimitOk, retryAfterMs } = rateLimit(`login:${clientIp}`, { maxRequests: 10, windowMs: 15 * 60 * 1000 });
    if (!rateLimitOk) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const result = await login(email, password)

    if (!result.success) {
      // Fire-and-forget audit for failed login
      auditLogin(request, "unknown", email, false).catch(() => {});
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 }
      )
    }

    // Create a signed session token and set it as an httpOnly cookie
    const sessionToken = await createSessionToken(result.user!.id)

    // [AUDIT-FIX F-19] Persist the session server-side (SHA-256 of the token only)
    // so it can be revoked from /api/auth/logout, change-password and user admin.
    await recordUserSession({
      userId: result.user!.id,
      token: sessionToken,
      ipAddress: clientIp,
      userAgent: request.headers.get('user-agent') || '',
      location: request.headers.get('cf-ipcountry') || request.headers.get('x-vercel-ip-country') || '',
    });

    const response = NextResponse.json({
      success: true,
      user: result.user,
      token: sessionToken,
    })

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })

    // Fire-and-forget audit for successful login
    auditLogin(request, result.user!.id, email, true).catch(() => {});
    return response
  } catch (error) {
    console.error('[API] Auth login error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
