/**
 * Cryptsk — API Route Authentication Helper
 * Call `requireAuth(request)` at the top of any API route handler
 * to enforce authentication. Returns the user ID or throws a 401 error.
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     const userId = await requireAuth(req);
 *     // ... proceed with authenticated request
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session'
import { db } from '@/lib/db'
import { hasPermission as checkPermission } from '@/lib/auth'
import type { UserRole } from '@prisma/client'

export async function requireAuth(request: NextRequest): Promise<string> {
  // 1. Try cookie-based auth
  let sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // 2. Fallback: Bearer token in Authorization header (for proxy/gateway environments)
  if (!sessionToken) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      sessionToken = authHeader.substring(7);
    }
  }

  if (!sessionToken) {
    throw new AuthError('Authentication required. Please log in.', 401)
  }

  const userId = await verifySessionToken(sessionToken)

  if (!userId) {
    throw new AuthError('Session expired or invalid. Please log in again.', 401)
  }

  // Verify current account status — reject locked/suspended accounts
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { status: true },
  })

  if (!user || user.status !== 'ACTIVE') {
    throw new AuthError('Account is not active', 403)
  }

  return userId
}

/**
 * Optional auth — returns userId if authenticated, null if not.
 * Use for routes that work both authenticated and unauthenticated.
 */
export async function optionalAuth(request: NextRequest): Promise<string | null> {
  try {
    return await requireAuth(request)
  } catch {
    return null
  }
}

export class AuthError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number = 401) {
    super(message)
    this.statusCode = statusCode
  }
}

/**
 * Wrap an API handler with authentication check.
 * Usage:
 *   export const GET = withAuth(async (req, userId) => {
 *     // userId is guaranteed to be a valid string
 *     return NextResponse.json({ data: '...' })
 *   })
 */
export function withAuth(
  handler: (request: NextRequest, userId: string) => Promise<Response> | Response
) {
  return async (request: NextRequest): Promise<Response> => {
    try {
      const userId = await requireAuth(request)
      return handler(request, userId)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.statusCode }
        )
      }
      throw error
    }
  }
}

/**
 * Authenticated + RBAC check. Returns the user ID if the authenticated
 * user holds the required permission, otherwise throws 401/403.
 *
 * Usage:
 *   const userId = await requirePermission(request, 'users.create');
 */
export async function requirePermission(
  request: NextRequest,
  permission: string,
): Promise<string> {
  const userId = await requireAuth(request)

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  })

  if (!user) {
    throw new AuthError('User not found. Please log in again.', 401)
  }

  if (!checkPermission(user.role as UserRole, permission)) {
    throw new AuthError(
      `Insufficient permissions. Required: ${permission}`,
      403,
    )
  }

  return userId
}

/**
 * Returns the authenticated user's role. Useful when you need auth
 * + role info without a specific permission check.
 */
export async function getUserRole(request: NextRequest): Promise<{
  userId: string
  role: string
  status: string
}> {
  const userId = await requireAuth(request)

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  })

  if (!user) {
    throw new AuthError('User not found. Please log in again.', 401)
  }

  return { userId, role: user.role, status: user.status }
}
