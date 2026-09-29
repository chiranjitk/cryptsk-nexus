import { NextResponse } from 'next/server'
import { SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'

// ============================================================
// POST /api/subscriber-auth/logout
// Clear subscriber session cookie
// ============================================================

export async function POST() {
  try {
    const response = NextResponse.json({ success: true })

    response.cookies.set(SUBSCRIBER_SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })

    return response
  } catch (error) {
    console.error('[API] Subscriber auth logout error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
