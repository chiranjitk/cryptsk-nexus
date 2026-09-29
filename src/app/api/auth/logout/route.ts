import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session'

// ============================================================
// POST /api/auth/logout
// Invalidate the client-side session and clear the session cookie
// ============================================================

export async function POST() {
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
