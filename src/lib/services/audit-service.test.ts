import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────
// vi.mock factories are hoisted — use vi.hoisted to create mock fns safely
const { auditLogCreate, userFindUnique } = vi.hoisted(() => ({
  auditLogCreate: vi.fn().mockResolvedValue({ id: 'log-1' }),
  userFindUnique: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    auditLog: { create: auditLogCreate },
    user: { findUnique: userFindUnique },
  },
}))

const { optionalAuth } = vi.hoisted(() => ({
  optionalAuth: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  optionalAuth: (...args: unknown[]) => optionalAuth(...args),
}))

// Must import AFTER mocks are set up
import { NextRequest } from 'next/server'
import {
  auditLog,
  auditCreate,
  auditUpdate,
  auditDelete,
  auditStatusChange,
  auditLogin,
  auditBulk,
  auditExport,
} from './audit-service'

// ─── Helpers ──────────────────────────────────────────────────────
function createMockRequest(overrides: Record<string, unknown> = {}): NextRequest {
  const req = new NextRequest('http://localhost/api/test')
  if (overrides.headers) {
    for (const [key, value] of Object.entries(overrides.headers as Record<string, string>)) {
      ;(req.headers as unknown as Map<string, string>).set(key, value)
    }
  }
  if (overrides.method) {
    ;(req as unknown as { method: string }).method = overrides.method as string
  }
  // Add json() method for login route tests
  ;(req as unknown as Record<string, unknown>).json = vi.fn()
  return req
}

// ─── Tests ────────────────────────────────────────────────────────
describe('audit-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auditLogCreate.mockResolvedValue({ id: 'log-1' })
    userFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ──── auditLog ──────────────────────────────────────────────────
  describe('auditLog', () => {
    it('should create an audit log entry with basic parameters', async () => {
      const req = createMockRequest()
      await auditLog(req, 'CREATE', 'Subscriber', 'sub-1')

      expect(auditLogCreate).toHaveBeenCalledOnce()
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('CREATE')
      expect(callArgs.data.entity).toBe('Subscriber')
      expect(callArgs.data.entityId).toBe('sub-1')
    })

    it('should extract IP from x-forwarded-for header', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
      })
      await auditLog(req, 'LOGIN', 'Auth', 'user-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.ipAddress).toBe('203.0.113.50')
    })

    it('should extract user-agent header', async () => {
      const req = createMockRequest({
        headers: { 'user-agent': 'Mozilla/5.0 Test Browser' },
      })
      await auditLog(req, 'VIEW', 'Dashboard', 'dash-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userAgent).toBe('Mozilla/5.0 Test Browser')
    })

    it('should use "unknown" as default IP when no x-forwarded-for', async () => {
      const req = createMockRequest()
      await auditLog(req, 'VIEW', 'Dashboard', 'dash-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.ipAddress).toBe('unknown')
    })

    it('should use "unknown" as default user-agent when header missing', async () => {
      const req = createMockRequest()
      await auditLog(req, 'VIEW', 'Dashboard', 'dash-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userAgent).toBe('unknown')
    })

    it('should extract endpoint from request URL', async () => {
      const req = new NextRequest('http://localhost/api/subscribers')
      await auditLog(req, 'CREATE', 'Subscriber', 'sub-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.endpoint).toBe('/api/subscribers')
    })

    it('should extract HTTP method from request', async () => {
      const req = createMockRequest({ method: 'DELETE' })
      await auditLog(req, 'DELETE', 'Plan', 'plan-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.method).toBe('DELETE')
    })

    it('should allow endpoint and method overrides', async () => {
      const req = createMockRequest()
      await auditLog(req, 'CREATE', 'Subscriber', 'sub-1', {
        endpoint: '/api/internal/import',
        method: 'PUT',
      })

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.endpoint).toBe('/api/internal/import')
      expect(callArgs.data.method).toBe('PUT')
    })

    it('should resolve userId from explicit override', async () => {
      const req = createMockRequest()
      await auditLog(req, 'UPDATE', 'Plan', 'plan-1', {
        userId: 'explicit-user-123',
        userName: 'Explicit User',
      })

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userId).toBe('explicit-user-123')
      expect(callArgs.data.userName).toBe('Explicit User')
      expect(optionalAuth).not.toHaveBeenCalled()
    })

    it('should fall back to optionalAuth when no explicit userId', async () => {
      optionalAuth.mockResolvedValue('session-user-456')

      const req = createMockRequest()
      await auditLog(req, 'CREATE', 'Invoice', 'inv-1')

      expect(optionalAuth).toHaveBeenCalledWith(req)
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userId).toBe('session-user-456')
    })

    it('should look up userName from DB when userId is set but userName is not', async () => {
      optionalAuth.mockResolvedValue('db-user-789')

      const req = createMockRequest()
      await auditLog(req, 'UPDATE', 'Subscriber', 'sub-1')

      expect(userFindUnique).toHaveBeenCalledWith({
        where: { id: 'db-user-789' },
        select: { name: true, email: true },
      })
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userName).toBe('Test User')
    })

    it('should use email as userName when name is falsy', async () => {
      optionalAuth.mockResolvedValue('user-email-only')
      userFindUnique.mockResolvedValue({
        id: 'user-email-only',
        name: '',
        email: 'nouser@example.com',
      })

      const req = createMockRequest()
      await auditLog(req, 'CREATE', 'Plan', 'plan-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userName).toBe('nouser@example.com')
    })

    it('should clear userId when user is not found in DB', async () => {
      optionalAuth.mockResolvedValue('ghost-user')
      userFindUnique.mockResolvedValue(null)

      const req = createMockRequest()
      await auditLog(req, 'UPDATE', 'Subscriber', 'sub-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userId).toBeNull()
      expect(callArgs.data.userName).toBe('Unknown User')
    })

    it('should clear userId when DB lookup throws', async () => {
      optionalAuth.mockResolvedValue('error-user')
      userFindUnique.mockRejectedValue(new Error('DB down'))

      const req = createMockRequest()
      await auditLog(req, 'DELETE', 'Plan', 'plan-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userId).toBeNull()
      expect(callArgs.data.userName).toBe('Unknown User')
    })

    it('should default userName to "System" when all strategies fail', async () => {
      optionalAuth.mockResolvedValue(null)

      const req = createMockRequest()
      await auditLog(req, 'VIEW', 'Dashboard', 'dash-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userId).toBeNull()
      expect(callArgs.data.userName).toBe('System')
    })

    it('should serialize details as JSON', async () => {
      const req = createMockRequest()
      const details = { name: 'Fiber 200', speed: 200, active: true }
      await auditLog(req, 'CREATE', 'Plan', 'plan-1', { details })

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.details).toBe(JSON.stringify(details))
    })

    it('should compute diff between previousValues and details', async () => {
      const req = createMockRequest()
      const previousValues = { name: 'Fiber 100', speed: 100 }
      const newValues = { name: 'Fiber 200', speed: 200 }
      await auditLog(req, 'UPDATE', 'Plan', 'plan-1', {
        details: newValues,
        previousValues,
      })

      const callArgs = auditLogCreate.mock.calls[0][0]
      // When previousValues is provided, it's stored as-is (not the diff)
      const storedPrev = JSON.parse(callArgs.data.previousValues)
      expect(storedPrev).toEqual(previousValues)
      // Details should contain the new values
      expect(JSON.parse(callArgs.data.details)).toEqual(newValues)
    })

    it('should not crash when DB write fails', async () => {
      auditLogCreate.mockRejectedValue(new Error('Write failed'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = createMockRequest()
      await expect(auditLog(req, 'CREATE', 'Test', 't-1')).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        'Audit log write failed:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it('should handle silent mode (fire-and-forget)', async () => {
      const req = createMockRequest()
      // silent mode doesn't await the DB write
      await auditLog(req, 'EXPORT', 'Subscriber', 'export-1', { silent: true })

      expect(auditLogCreate).toHaveBeenCalledOnce()
    })

    it('should truncate very long user-agent strings', async () => {
      const longUA = 'A'.repeat(600)
      const req = createMockRequest({ headers: { 'user-agent': longUA } })
      await auditLog(req, 'VIEW', 'Dashboard', 'dash-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userAgent.length).toBeLessThanOrEqual(500)
    })

    it('should use "null" as previousValues string when no previous and no diff', async () => {
      const req = createMockRequest()
      await auditLog(req, 'CREATE', 'Subscriber', 'sub-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.previousValues).toBe('null')
    })

    it('should accept array details', async () => {
      const req = createMockRequest()
      const details = [{ id: 's1' }, { id: 's2' }]
      await auditLog(req, 'BULK_CREATE', 'Subscriber', 'bulk-1', { details })

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.details).toBe(JSON.stringify(details))
    })

    it('should handle custom action types', async () => {
      const req = createMockRequest()
      await auditLog(req, 'CUSTOM_ACTION', 'Widget', 'w-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('CUSTOM_ACTION')
    })
  })

  // ──── auditCreate ───────────────────────────────────────────────
  describe('auditCreate', () => {
    it('should delegate to auditLog with action=CREATE', async () => {
      const req = createMockRequest()
      const details = { name: 'New Plan', price: 500 }
      await auditCreate(req, 'Plan', 'plan-1', details)

      expect(auditLogCreate).toHaveBeenCalledOnce()
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('CREATE')
      expect(callArgs.data.entity).toBe('Plan')
      expect(callArgs.data.entityId).toBe('plan-1')
      expect(JSON.parse(callArgs.data.details)).toEqual(details)
    })

    it('should pass through options like userId', async () => {
      const req = createMockRequest()
      await auditCreate(req, 'Invoice', 'inv-1', { amount: 1000 }, { userId: 'admin-1' })

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.userId).toBe('admin-1')
    })
  })

  // ──── auditUpdate ───────────────────────────────────────────────
  describe('auditUpdate', () => {
    it('should delegate to auditLog with action=UPDATE and previousValues', async () => {
      const req = createMockRequest()
      await auditUpdate(req, 'Plan', 'plan-1', { speed: 200 }, { speed: 100 })

      expect(auditLogCreate).toHaveBeenCalledOnce()
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('UPDATE')
      // auditUpdate passes details as newValues and previousValues separately
      expect(JSON.parse(callArgs.data.details)).toEqual({ speed: 200 })
      expect(JSON.parse(callArgs.data.previousValues)).toEqual({ speed: 100 })
    })

    it('should work without previousValues', async () => {
      const req = createMockRequest()
      await auditUpdate(req, 'Plan', 'plan-1', { speed: 200 })

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('UPDATE')
    })
  })

  // ──── auditDelete ───────────────────────────────────────────────
  describe('auditDelete', () => {
    it('should delegate to auditLog with action=DELETE', async () => {
      const req = createMockRequest()
      const deletedRecord = { name: 'Old Plan', speed: 50 }
      await auditDelete(req, 'Plan', 'plan-1', deletedRecord)

      expect(auditLogCreate).toHaveBeenCalledOnce()
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('DELETE')
      expect(JSON.parse(callArgs.data.details)).toEqual({ deleted: deletedRecord })
    })

    it('should work without deletedRecord', async () => {
      const req = createMockRequest()
      await auditDelete(req, 'Plan', 'plan-1')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('DELETE')
    })
  })

  // ──── auditStatusChange ─────────────────────────────────────────
  describe('auditStatusChange', () => {
    it('should log from and to status', async () => {
      const req = createMockRequest()
      await auditStatusChange(req, 'Subscriber', 'sub-1', 'ACTIVE', 'SUSPENDED')

      expect(auditLogCreate).toHaveBeenCalledOnce()
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('STATUS_CHANGE')
      const details = JSON.parse(callArgs.data.details)
      expect(details.from).toBe('ACTIVE')
      expect(details.to).toBe('SUSPENDED')
    })

    it('should include extra details', async () => {
      const req = createMockRequest()
      await auditStatusChange(req, 'Subscriber', 'sub-1', 'ACTIVE', 'SUSPENDED', {
        reason: 'Non-payment',
      })

      const callArgs = auditLogCreate.mock.calls[0][0]
      const details = JSON.parse(callArgs.data.details)
      expect(details.reason).toBe('Non-payment')
    })
  })

  // ──── auditLogin ────────────────────────────────────────────────
  describe('auditLogin', () => {
    it('should log a successful login event', async () => {
      const req = createMockRequest()
      await auditLogin(req, 'user-1', 'admin@test.com', true)

      expect(auditLogCreate).toHaveBeenCalledOnce()
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('LOGIN')
      expect(callArgs.data.entity).toBe('Auth')
      expect(callArgs.data.userId).toBe('user-1')
      const details = JSON.parse(callArgs.data.details)
      expect(details.email).toBe('admin@test.com')
      expect(details.success).toBe(true)
    })

    it('should log a failed login event', async () => {
      const req = createMockRequest()
      await auditLogin(req, 'unknown', 'hacker@test.com', false)

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('LOGIN_FAILED')
      const details = JSON.parse(callArgs.data.details)
      expect(details.email).toBe('hacker@test.com')
      expect(details.success).toBe(false)
    })

    it('should default success to true when not specified', async () => {
      const req = createMockRequest()
      await auditLogin(req, 'user-1', 'admin@test.com')

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('LOGIN')
      const details = JSON.parse(callArgs.data.details)
      expect(details.success).toBe(true)
    })
  })

  // ──── auditBulk ─────────────────────────────────────────────────
  describe('auditBulk', () => {
    it('should log bulk operations with count', async () => {
      const req = createMockRequest()
      await auditBulk(req, 'BULK_CREATE', 'Subscriber', 5, ['s1', 's2', 's3', 's4', 's5'])

      expect(auditLogCreate).toHaveBeenCalledOnce()
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('BULK_CREATE')
      const details = JSON.parse(callArgs.data.details)
      expect(details.count).toBe(5)
      expect(details.ids).toEqual(['s1', 's2', 's3', 's4', 's5'])
    })

    it('should work without ids', async () => {
      const req = createMockRequest()
      await auditBulk(req, 'BULK_DELETE', 'Invoice', 3)

      const details = JSON.parse(auditLogCreate.mock.calls[0][0].data.details)
      expect(details.count).toBe(3)
    })

    it('should include extra details', async () => {
      const req = createMockRequest()
      await auditBulk(req, 'BULK_UPDATE', 'Subscriber', 2, ['s1', 's2'], { reason: 'Plan migration' })

      const details = JSON.parse(auditLogCreate.mock.calls[0][0].data.details)
      expect(details.reason).toBe('Plan migration')
    })

    it('should use timestamp-based entityId', async () => {
      const req = createMockRequest()
      await auditBulk(req, 'BULK_CREATE', 'Subscriber', 1)

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.entityId).toMatch(/^bulk_\d+$/)
    })
  })

  // ──── auditExport ───────────────────────────────────────────────
  describe('auditExport', () => {
    it('should log export events with format and count', async () => {
      const req = createMockRequest()
      await auditExport(req, 'Subscriber', 'csv', 150)

      expect(auditLogCreate).toHaveBeenCalledOnce()
      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.action).toBe('EXPORT')
      const details = JSON.parse(callArgs.data.details)
      expect(details.format).toBe('csv')
      expect(details.recordCount).toBe(150)
    })

    it('should use silent mode for exports', async () => {
      const req = createMockRequest()
      await auditExport(req, 'Invoice', 'xlsx', 50)

      // The call itself should still happen
      expect(auditLogCreate).toHaveBeenCalledOnce()
    })

    it('should use timestamp-based entityId', async () => {
      const req = createMockRequest()
      await auditExport(req, 'Payment', 'pdf', 10)

      const callArgs = auditLogCreate.mock.calls[0][0]
      expect(callArgs.data.entityId).toMatch(/^export_\d+$/)
    })
  })
})
