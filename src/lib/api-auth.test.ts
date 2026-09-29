/**
 * Production unit tests for the API Auth helpers (api-auth.ts)
 *
 * Covers: AuthError class, requireAuth, optionalAuth, withAuth wrapper,
 * requirePermission, getUserRole — including missing cookies, invalid sessions,
 * permission denied, user not found, and unexpected errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { AuthError, requireAuth, optionalAuth, withAuth, requirePermission, getUserRole } from '@/lib/api-auth'

// ─── Mocks ────────────────────────────────────────────────────

// Mock @/lib/db
vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

// Mock @/lib/session
vi.mock('@/lib/session', () => ({
  verifySessionToken: vi.fn(),
  SESSION_COOKIE_NAME: 'cryptsk_session',
}))

// Mock @/lib/auth (hasPermission)
vi.mock('@/lib/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

import { verifySessionToken } from '@/lib/session'
import { db } from '@/lib/db'
import { hasPermission } from '@/lib/auth'

const mockVerifySessionToken = vi.mocked(verifySessionToken)
const mockFindUnique = vi.mocked(db.user.findUnique)
const mockHasPermission = vi.mocked(hasPermission)

// ─── Helpers ──────────────────────────────────────────────────

function createRequest(overrides: { cookies?: Record<string, string>; url?: string } = {}): NextRequest {
  const url = overrides.url || 'http://localhost/api/test'
  const req = new NextRequest(url)

  if (overrides.cookies) {
    // Override the mocked cookies.get
    ;(req.cookies as any).get = vi.fn((name: string) => {
      const value = overrides.cookies![name]
      return value ? { value } : undefined
    })
  }

  return req
}

// ─── Tests ────────────────────────────────────────────────────

describe('AuthError', () => {
  it('should be an instance of Error', () => {
    const err = new AuthError('test')
    expect(err).toBeInstanceOf(Error)
  })

  it('should have default statusCode of 401', () => {
    const err = new AuthError('Unauthorized')
    expect(err.statusCode).toBe(401)
  })

  it('should accept custom statusCode', () => {
    const err = new AuthError('Forbidden', 403)
    expect(err.statusCode).toBe(403)
  })

  it('should preserve the error message', () => {
    const err = new AuthError('Custom error message')
    expect(err.message).toBe('Custom error message')
  })

  it('should accept status 500', () => {
    const err = new AuthError('Internal error', 500)
    expect(err.statusCode).toBe(500)
  })

  it('should have correct name property', () => {
    const err = new AuthError('test')
    expect(err.name).toBe('Error')
  })
})

// ═══════════════════════════════════════════════════════════════
// requireAuth
// ═══════════════════════════════════════════════════════════════

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw AuthError when session cookie is missing', async () => {
    const req = createRequest({ cookies: {} })

    await expect(requireAuth(req)).rejects.toThrow(AuthError)
    await expect(requireAuth(req)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Authentication required. Please log in.',
    })
  })

  it('should throw AuthError when session cookie value is empty', async () => {
    const req = createRequest({ cookies: { cryptsk_session: '' } })

    await expect(requireAuth(req)).rejects.toThrow(AuthError)
  })

  it('should throw AuthError when session token is invalid', async () => {
    mockVerifySessionToken.mockResolvedValue(null)
    const req = createRequest({ cookies: { cryptsk_session: 'invalid-token' } })

    await expect(requireAuth(req)).rejects.toThrow(AuthError)
    await expect(requireAuth(req)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Session expired or invalid. Please log in again.',
    })
  })

  it('should return userId when session token is valid', async () => {
    mockVerifySessionToken.mockResolvedValue('user-123')
    const req = createRequest({ cookies: { cryptsk_session: 'valid-token' } })

    const userId = await requireAuth(req)

    expect(userId).toBe('user-123')
  })

  it('should call verifySessionToken with the cookie value', async () => {
    mockVerifySessionToken.mockResolvedValue('user-456')
    const req = createRequest({ cookies: { cryptsk_session: 'my-session-token' } })

    await requireAuth(req)

    expect(mockVerifySessionToken).toHaveBeenCalledWith('my-session-token')
  })

  it('should handle different cookie names (not match)', async () => {
    const req = createRequest({ cookies: { other_cookie: 'some-value' } })

    await expect(requireAuth(req)).rejects.toThrow(AuthError)
    expect(mockVerifySessionToken).not.toHaveBeenCalled()
  })

  it('should handle verifySessionToken throwing an error', async () => {
    mockVerifySessionToken.mockRejectedValue(new Error('DB connection error'))
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    // The error from verifySessionToken should propagate as-is
    await expect(requireAuth(req)).rejects.toThrow('DB connection error')
  })
})

// ═══════════════════════════════════════════════════════════════
// optionalAuth
// ═══════════════════════════════════════════════════════════════

describe('optionalAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return userId when authenticated', async () => {
    mockVerifySessionToken.mockResolvedValue('user-123')
    const req = createRequest({ cookies: { cryptsk_session: 'valid-token' } })

    const result = await optionalAuth(req)

    expect(result).toBe('user-123')
  })

  it('should return null when no session cookie', async () => {
    const req = createRequest({ cookies: {} })

    const result = await optionalAuth(req)

    expect(result).toBeNull()
  })

  it('should return null when session is invalid', async () => {
    mockVerifySessionToken.mockResolvedValue(null)
    const req = createRequest({ cookies: { cryptsk_session: 'invalid' } })

    const result = await optionalAuth(req)

    expect(result).toBeNull()
  })

  it('should return null when session verification throws', async () => {
    mockVerifySessionToken.mockRejectedValue(new Error('DB error'))
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    const result = await optionalAuth(req)

    expect(result).toBeNull()
  })

  it('should never throw', async () => {
    mockVerifySessionToken.mockImplementation(() => {
      throw new Error('Unexpected error')
    })
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    // Should catch and return null
    const result = await optionalAuth(req)
    expect(result).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// withAuth
// ═══════════════════════════════════════════════════════════════

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call handler with userId when authenticated', async () => {
    mockVerifySessionToken.mockResolvedValue('user-123')
    const req = createRequest({ cookies: { cryptsk_session: 'valid-token' } })
    const handler = vi.fn().mockResolvedValue({ json: async () => ({ success: true }), status: 200 })

    const wrapped = withAuth(handler)
    await wrapped(req)

    expect(handler).toHaveBeenCalledWith(req, 'user-123')
  })

  it('should return 401 JSON response when not authenticated', async () => {
    const req = createRequest({ cookies: {} })
    const handler = vi.fn()

    const wrapped = withAuth(handler)
    const response = await wrapped(req)

    expect(handler).not.toHaveBeenCalled()
    const body = await (response as any).json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('Authentication required')
    expect((response as any).status).toBe(401)
  })

  it('should return 401 when session is invalid', async () => {
    mockVerifySessionToken.mockResolvedValue(null)
    const req = createRequest({ cookies: { cryptsk_session: 'bad-token' } })
    const handler = vi.fn()

    const wrapped = withAuth(handler)
    const response = await wrapped(req)

    expect(handler).not.toHaveBeenCalled()
    const body = await (response as any).json()
    expect(body.success).toBe(false)
    expect((response as any).status).toBe(401)
  })

  it('should propagate non-AuthError exceptions', async () => {
    mockVerifySessionToken.mockRejectedValue(new Error('DB crash'))
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })
    const handler = vi.fn()

    const wrapped = withAuth(handler)

    await expect(wrapped(req)).rejects.toThrow('DB crash')
    expect(handler).not.toHaveBeenCalled()
  })

  it('should return handler response when successful', async () => {
    mockVerifySessionToken.mockResolvedValue('user-123')
    const req = createRequest({ cookies: { cryptsk_session: 'valid' } })
    const mockResponse = { json: async () => ({ data: 'test' }), status: 200 }
    const handler = vi.fn().mockResolvedValue(mockResponse)

    const wrapped = withAuth(handler)
    const response = await wrapped(req)

    expect(response).toBe(mockResponse)
  })

  it('should handle handler returning response synchronously', async () => {
    mockVerifySessionToken.mockResolvedValue('user-456')
    const req = createRequest({ cookies: { cryptsk_session: 'valid' } })
    const mockResponse = { json: async () => ({ ok: true }), status: 200 }
    const handler = vi.fn().mockReturnValue(mockResponse)

    const wrapped = withAuth(handler)
    const response = await wrapped(req)

    expect(handler).toHaveBeenCalledWith(req, 'user-456')
    expect(response).toBe(mockResponse)
  })

  it('should return 401 with proper error message for expired session', async () => {
    mockVerifySessionToken.mockResolvedValue(null)
    const req = createRequest({ cookies: { cryptsk_session: 'expired' } })
    const handler = vi.fn()

    const wrapped = withAuth(handler)
    const response = await wrapped(req)

    const body = await (response as any).json()
    expect(body.error).toContain('Session expired')
  })
})

// ═══════════════════════════════════════════════════════════════
// requirePermission
// ═══════════════════════════════════════════════════════════════

describe('requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw AuthError when not authenticated', async () => {
    const req = createRequest({ cookies: {} })

    await expect(requirePermission(req, 'subscribers.create')).rejects.toThrow(AuthError)
  })

  it('should throw AuthError when user not found in DB', async () => {
    mockVerifySessionToken.mockResolvedValue('user-deleted')
    mockFindUnique.mockResolvedValue(null)
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    await expect(requirePermission(req, 'subscribers.create')).rejects.toMatchObject({
      statusCode: 401,
      message: 'User not found. Please log in again.',
    })
  })

  it('should throw AuthError with 403 when user lacks permission', async () => {
    mockVerifySessionToken.mockResolvedValue('user-op')
    mockFindUnique.mockResolvedValue({ role: 'OPERATOR', status: 'ACTIVE' })
    mockHasPermission.mockReturnValue(false)
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    await expect(requirePermission(req, 'users.delete')).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('should include permission name in 403 error message', async () => {
    mockVerifySessionToken.mockResolvedValue('user-op')
    mockFindUnique.mockResolvedValue({ role: 'OPERATOR', status: 'ACTIVE' })
    mockHasPermission.mockReturnValue(false)
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    await expect(requirePermission(req, 'users.delete')).rejects.toMatchObject({
      message: 'Insufficient permissions. Required: users.delete',
    })
  })

  it('should return userId when user has permission', async () => {
    mockVerifySessionToken.mockResolvedValue('user-admin')
    mockFindUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' })
    mockHasPermission.mockReturnValue(true)
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    const userId = await requirePermission(req, 'subscribers.create')

    expect(userId).toBe('user-admin')
  })

  it('should query DB with correct userId', async () => {
    mockVerifySessionToken.mockResolvedValue('user-specific-id')
    mockFindUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' })
    mockHasPermission.mockReturnValue(true)
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    await requirePermission(req, 'subscribers.read')

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-specific-id' },
      select: { role: true, status: true },
    })
  })

  it('should pass correct role and permission to hasPermission', async () => {
    mockVerifySessionToken.mockResolvedValue('user-id')
    mockFindUnique.mockResolvedValue({ role: 'SUPER_ADMIN', status: 'ACTIVE' })
    mockHasPermission.mockReturnValue(true)
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    await requirePermission(req, 'network.backup')

    expect(mockHasPermission).toHaveBeenCalledWith('SUPER_ADMIN', 'network.backup')
  })

  it('should handle DB errors gracefully', async () => {
    mockVerifySessionToken.mockResolvedValue('user-db-error')
    mockFindUnique.mockRejectedValue(new Error('Database unavailable'))
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    // DB error should propagate
    await expect(requirePermission(req, 'subscribers.read')).rejects.toThrow('Database unavailable')
  })
})

// ═══════════════════════════════════════════════════════════════
// getUserRole
// ═══════════════════════════════════════════════════════════════

describe('getUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw AuthError when not authenticated', async () => {
    const req = createRequest({ cookies: {} })

    await expect(getUserRole(req)).rejects.toThrow(AuthError)
  })

  it('should throw AuthError when user not found', async () => {
    mockVerifySessionToken.mockResolvedValue('deleted-user')
    mockFindUnique.mockResolvedValue(null)
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    await expect(getUserRole(req)).rejects.toMatchObject({
      statusCode: 401,
      message: 'User not found. Please log in again.',
    })
  })

  it('should return userId, role, and status', async () => {
    mockVerifySessionToken.mockResolvedValue('user-role-test')
    mockFindUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' })
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    const result = await getUserRole(req)

    expect(result).toEqual({
      userId: 'user-role-test',
      role: 'ADMIN',
      status: 'ACTIVE',
    })
  })

  it('should handle SUSPENDED user status', async () => {
    mockVerifySessionToken.mockResolvedValue('user-suspended')
    mockFindUnique.mockResolvedValue({ role: 'OPERATOR', status: 'SUSPENDED' })
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    const result = await getUserRole(req)

    expect(result.status).toBe('SUSPENDED')
    expect(result.role).toBe('OPERATOR')
  })

  it('should handle INACTIVE user status', async () => {
    mockVerifySessionToken.mockResolvedValue('user-inactive')
    mockFindUnique.mockResolvedValue({ role: 'AGENT', status: 'INACTIVE' })
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    const result = await getUserRole(req)

    expect(result.status).toBe('INACTIVE')
    expect(result.role).toBe('AGENT')
  })

  it('should handle LOCKED user status', async () => {
    mockVerifySessionToken.mockResolvedValue('user-locked')
    mockFindUnique.mockResolvedValue({ role: 'TECHNICIAN', status: 'LOCKED' })
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    const result = await getUserRole(req)

    expect(result.status).toBe('LOCKED')
    expect(result.role).toBe('TECHNICIAN')
  })

  it('should query DB with correct select fields', async () => {
    mockVerifySessionToken.mockResolvedValue('user-id')
    mockFindUnique.mockResolvedValue({ role: 'SUPER_ADMIN', status: 'ACTIVE' })
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    await getUserRole(req)

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: { role: true, status: true },
    })
  })

  it('should propagate DB errors', async () => {
    mockVerifySessionToken.mockResolvedValue('user-error')
    mockFindUnique.mockRejectedValue(new Error('Connection lost'))
    const req = createRequest({ cookies: { cryptsk_session: 'token' } })

    await expect(getUserRole(req)).rejects.toThrow('Connection lost')
  })
})
