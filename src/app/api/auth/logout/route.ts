import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session'
import { extractSessionToken } from '@/lib/api-auth'
import { revokeSessionByToken } from '@/lib/session-store'

// ============================================================
// POST /api/auth/logout
// [AUDIT-FIX F-19] Revoke the session SERVER-SIDE (UserSession row marked
// logged_out) and clear the session cookie. Previously logout only cleared
// the cookie client-side — a copied token stayed valid for its full 7-day TTL.
// ============================================================

export async function POST(request: NextRequest) {
  const token = extractSessionToken(request)
  if (token) {
    // Best-effort revoke; never block the logout itself on DB errors
    await revokeSessionByToken(token).catch(() => {})
  }

  const response = NextResponse.json({
    success: true,
    message: 'Logged out',
  })

  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  return response
}
