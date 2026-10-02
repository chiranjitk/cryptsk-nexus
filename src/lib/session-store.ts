/**
 * Cryptsk — DB-backed session store
 * [AUDIT-FIX F-19] Session tokens used to be pure stateless HMACs — impossible to
 * revoke (password change / role demotion / staff termination had no effect until
 * the 7-day TTL elapsed). Every login now records a UserSession row keyed by the
 * SHA-256 of the token, and requireAuth validates against it, so:
 *   - logout revokes the exact token server-side
 *   - password change revokes every OTHER session of the user
 *   - deactivating / demoting / deleting a user revokes all their sessions
 * Only the hash is stored — a DB leak cannot be replayed as a session.
 */

import { createHash } from 'crypto'
import { db } from '@/lib/db'

export type ParsedUserAgent = {
  device: string
  browser: string
}

/** SHA-256 hex of the raw token — the only thing we persist. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Naive but useful UA parsing so the sessions UI can show device/browser. */
export function parseUserAgent(ua: string): ParsedUserAgent {
  const s = (ua || '').slice(0, 250)
  let browser = 'Unknown'
  if (/edg\//i.test(s)) browser = 'Edge'
  else if (/opr\/|opera/i.test(s)) browser = 'Opera'
  else if (/chrome\//i.test(s)) browser = 'Chrome'
  else if (/firefox\//i.test(s)) browser = 'Firefox'
  else if (/safari\//i.test(s)) browser = 'Safari'
  else if (/curl|wget|postman|insomnia|httpie/i.test(s)) browser = 'API Client'

  let device = 'Desktop'
  if (/iphone|ipod/i.test(s)) device = 'iPhone'
  else if (/ipad/i.test(s)) device = 'iPad'
  else if (/android.*mobile/i.test(s)) device = 'Android Phone'
  else if (/android/i.test(s)) device = 'Android Tablet'
  else if (/mobile/i.test(s)) device = 'Mobile'
  else if (/bot|crawler|spider/i.test(s)) device = 'Bot'

  return { device, browser }
}

/**
 * Record a fresh login session. Best-effort: if the write fails we still
 * return so login succeeds (fail-open on provisioning, fail-closed on auth).
 */
export async function recordUserSession(params: {
  userId: string
  token: string
  ipAddress?: string
  userAgent?: string
  location?: string
}): Promise<void> {
  try {
    const { device, browser } = parseUserAgent(params.userAgent || '')
    await db.userSession.create({
      data: {
        userId: params.userId,
        tokenHash: hashToken(params.token),
        ipAddress: params.ipAddress || '',
        userAgent: (params.userAgent || '').slice(0, 250),
        device,
        browser,
        location: params.location || '',
        status: 'active',
      },
    })
  } catch (error) {
    console.error('[session-store] Failed to record session:', error)
  }
}

/** Mark the session for this exact token as logged out (idempotent). */
export async function revokeSessionByToken(token: string): Promise<void> {
  try {
    const tokenHash = hashToken(token)
    const session = await db.userSession.findUnique({ where: { tokenHash } })
    if (!session || session.status !== 'active') return
    const duration = Math.max(0, Math.floor((Date.now() - session.loginAt.getTime()) / 1000))
    await db.userSession.update({
      where: { id: session.id },
      data: { status: 'logged_out', logoutAt: new Date(), duration },
    })
  } catch (error) {
    console.error('[session-store] Failed to revoke session:', error)
  }
}

/**
 * Revoke ALL active sessions of a user. Pass `exceptTokenHash` to keep the
 * caller's own session alive (used by change-password).
 * Returns the number of sessions revoked.
 */
export async function revokeAllUserSessions(userId: string, exceptTokenHash?: string): Promise<number> {
  try {
    const where = {
      userId,
      status: 'active',
      ...(exceptTokenHash ? { tokenHash: { not: exceptTokenHash } } : {}),
    }
    const active = await db.userSession.findMany({ where, select: { id: true, loginAt: true } })
    if (active.length === 0) return 0
    const now = new Date()
    await db.$transaction(
      active.map((s) =>
        db.userSession.update({
          where: { id: s.id },
          data: {
            status: 'revoked',
            logoutAt: now,
            duration: Math.max(0, Math.floor((now.getTime() - s.loginAt.getTime()) / 1000)),
          },
        })
      )
    )
    return active.length
  } catch (error) {
    console.error('[session-store] Failed to revoke user sessions:', error)
    return 0
  }
}

/** Best-effort fire-and-forget variant for use inside request handlers. */
export function revokeAllUserSessionsAsync(userId: string, exceptTokenHash?: string): void {
  revokeAllUserSessions(userId, exceptTokenHash).catch(() => {})
}
