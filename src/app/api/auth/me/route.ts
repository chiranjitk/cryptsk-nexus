import { NextRequest, NextResponse } from 'next/server'
import { getUserById } from '@/lib/auth'
import { requireAuth, AuthError } from '@/lib/api-auth'

// ============================================================
// GET /api/auth/me
// Get current user info from session (not query param)
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request)

    const user = await getUserById(userId)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    if (user.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: `Account is ${user.status.toLowerCase()}` },
        { status: 403 }
      )
    }

    const meta = {
      role: user.role,
      isAdmin: user.role === 'SUPER_ADMIN' || user.role === 'ADMIN',
    }

    return NextResponse.json({
      success: true,
      user,
      meta,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      )
    }
    console.error('[API] Auth me error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
