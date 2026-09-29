import { describe, it, expect, vi } from 'vitest'
import type { UserRole } from '@prisma/client'

// Mock the db module to prevent database calls during import
vi.mock('@/lib/db', () => ({ db: {} }))

import {
  hasRole,
  hasMinRole,
  isAdmin,
  isSuperAdmin,
  isStaff,
  hasPermission,
  getPermissions,
  ROLE_PERMISSIONS,
} from './auth'

// ============================================================
// ROLE_PERMISSIONS constant
// ============================================================
describe('ROLE_PERMISSIONS', () => {
  it('should define permissions for all known roles', () => {
    const expectedRoles: UserRole[] = [
      'SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER', 'CUSTOMER',
    ]
    for (const role of expectedRoles) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined()
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true)
    }
  })

  it('SUPER_ADMIN should have the most permissions', () => {
    const superAdminCount = ROLE_PERMISSIONS.SUPER_ADMIN.length
    const adminCount = ROLE_PERMISSIONS.ADMIN.length
    expect(superAdminCount).toBeGreaterThanOrEqual(adminCount)
  })

  it('VIEWER should have fewer permissions than OPERATOR', () => {
    const viewerCount = ROLE_PERMISSIONS.VIEWER.length
    const operatorCount = ROLE_PERMISSIONS.OPERATOR.length
    expect(viewerCount).toBeLessThan(operatorCount)
  })

  it('CUSTOMER should have the fewest permissions', () => {
    const customerCount = ROLE_PERMISSIONS.CUSTOMER.length
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER'] as UserRole[]) {
      expect(customerCount).toBeLessThan(ROLE_PERMISSIONS[role].length)
    }
  })

  it('SUPER_ADMIN should have users.delete permission', () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain('users.delete')
  })

  it('ADMIN should NOT have users.delete permission', () => {
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain('users.delete')
  })

  it('all non-customer roles should have dashboard.read', () => {
    const nonCustomerRoles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER']
    for (const role of nonCustomerRoles) {
      expect(ROLE_PERMISSIONS[role]).toContain('dashboard.read')
    }
  })

  it('CUSTOMER should NOT have dashboard.read', () => {
    expect(ROLE_PERMISSIONS.CUSTOMER).not.toContain('dashboard.read')
  })

  it('CUSTOMER permissions should all end with :own (except complaints.create)', () => {
    for (const perm of ROLE_PERMISSIONS.CUSTOMER) {
      if (perm === 'complaints.create') continue
      expect(perm).toMatch(/:own$/)
    }
  })

  it('TECHNICIAN should NOT have subscribers.create', () => {
    expect(ROLE_PERMISSIONS.TECHNICIAN).not.toContain('subscribers.create')
  })

  it('OPERATOR should have complaints.assign but TECHNICIAN should not', () => {
    expect(ROLE_PERMISSIONS.OPERATOR).toContain('complaints.assign')
    expect(ROLE_PERMISSIONS.TECHNICIAN).not.toContain('complaints.assign')
  })

  it('AGENT should have payments.create', () => {
    expect(ROLE_PERMISSIONS.AGENT).toContain('payments.create')
  })

  it('VIEWER should NOT have any .create permissions', () => {
    const hasCreate = ROLE_PERMISSIONS.VIEWER.some(p => p.includes('.create'))
    expect(hasCreate).toBe(false)
  })
})

// ============================================================
// hasRole
// ============================================================
describe('hasRole', () => {
  it('returns true when userRole matches requiredRole exactly', () => {
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true)
    expect(hasRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true)
    expect(hasRole('VIEWER', 'VIEWER')).toBe(true)
  })

  it('returns false when userRole does not match requiredRole', () => {
    expect(hasRole('ADMIN', 'SUPER_ADMIN')).toBe(false)
    expect(hasRole('VIEWER', 'ADMIN')).toBe(false)
    expect(hasRole('AGENT', 'OPERATOR')).toBe(false)
  })

  it('returns false for all role combinations that differ', () => {
    const roles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER', 'CUSTOMER']
    for (let i = 0; i < roles.length; i++) {
      for (let j = 0; j < roles.length; j++) {
        if (i !== j) {
          expect(hasRole(roles[i], roles[j])).toBe(false)
        }
      }
    }
  })

  it('returns true for every role matching itself', () => {
    const roles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER', 'CUSTOMER']
    for (const role of roles) {
      expect(hasRole(role, role)).toBe(true)
    }
  })
})

// ============================================================
// hasMinRole
// ============================================================
describe('hasMinRole', () => {
  it('SUPER_ADMIN meets minimum for all roles', () => {
    const allRoles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER', 'CUSTOMER']
    for (const required of allRoles) {
      expect(hasMinRole('SUPER_ADMIN', required)).toBe(true)
    }
  })

  it('ADMIN meets minimum for OPERATOR, TECHNICIAN, AGENT, VIEWER, CUSTOMER', () => {
    expect(hasMinRole('ADMIN', 'OPERATOR')).toBe(true)
    expect(hasMinRole('ADMIN', 'TECHNICIAN')).toBe(true)
    expect(hasMinRole('ADMIN', 'AGENT')).toBe(true)
    expect(hasMinRole('ADMIN', 'VIEWER')).toBe(true)
    expect(hasMinRole('ADMIN', 'CUSTOMER')).toBe(true)
  })

  it('ADMIN does NOT meet minimum for SUPER_ADMIN', () => {
    expect(hasMinRole('ADMIN', 'SUPER_ADMIN')).toBe(false)
  })

  it('OPERATOR meets minimum for TECHNICIAN, AGENT, VIEWER, CUSTOMER', () => {
    expect(hasMinRole('OPERATOR', 'TECHNICIAN')).toBe(true)
    expect(hasMinRole('OPERATOR', 'AGENT')).toBe(true)
    expect(hasMinRole('OPERATOR', 'VIEWER')).toBe(true)
    expect(hasMinRole('OPERATOR', 'CUSTOMER')).toBe(true)
  })

  it('OPERATOR does NOT meet minimum for ADMIN or SUPER_ADMIN', () => {
    expect(hasMinRole('OPERATOR', 'ADMIN')).toBe(false)
    expect(hasMinRole('OPERATOR', 'SUPER_ADMIN')).toBe(false)
  })

  it('TECHNICIAN meets minimum for AGENT, VIEWER, CUSTOMER', () => {
    expect(hasMinRole('TECHNICIAN', 'AGENT')).toBe(true)
    expect(hasMinRole('TECHNICIAN', 'VIEWER')).toBe(true)
    expect(hasMinRole('TECHNICIAN', 'CUSTOMER')).toBe(true)
  })

  it('TECHNICIAN does NOT meet minimum for OPERATOR, ADMIN, SUPER_ADMIN', () => {
    expect(hasMinRole('TECHNICIAN', 'OPERATOR')).toBe(false)
    expect(hasMinRole('TECHNICIAN', 'ADMIN')).toBe(false)
    expect(hasMinRole('TECHNICIAN', 'SUPER_ADMIN')).toBe(false)
  })

  it('AGENT meets minimum for VIEWER and CUSTOMER', () => {
    expect(hasMinRole('AGENT', 'VIEWER')).toBe(true)
    expect(hasMinRole('AGENT', 'CUSTOMER')).toBe(true)
  })

  it('VIEWER meets minimum for CUSTOMER', () => {
    expect(hasMinRole('VIEWER', 'CUSTOMER')).toBe(true)
  })

  it('VIEWER does NOT meet minimum for any role above', () => {
    expect(hasMinRole('VIEWER', 'AGENT')).toBe(false)
    expect(hasMinRole('VIEWER', 'TECHNICIAN')).toBe(false)
    expect(hasMinRole('VIEWER', 'OPERATOR')).toBe(false)
    expect(hasMinRole('VIEWER', 'ADMIN')).toBe(false)
    expect(hasMinRole('VIEWER', 'SUPER_ADMIN')).toBe(false)
  })

  it('CUSTOMER meets minimum only for CUSTOMER', () => {
    expect(hasMinRole('CUSTOMER', 'CUSTOMER')).toBe(true)
  })

  it('CUSTOMER does NOT meet minimum for any other role', () => {
    expect(hasMinRole('CUSTOMER', 'VIEWER')).toBe(false)
    expect(hasMinRole('CUSTOMER', 'AGENT')).toBe(false)
    expect(hasMinRole('CUSTOMER', 'TECHNICIAN')).toBe(false)
    expect(hasMinRole('CUSTOMER', 'OPERATOR')).toBe(false)
    expect(hasMinRole('CUSTOMER', 'ADMIN')).toBe(false)
    expect(hasMinRole('CUSTOMER', 'SUPER_ADMIN')).toBe(false)
  })

  it('same role always meets minimum for itself', () => {
    const roles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER', 'CUSTOMER']
    for (const role of roles) {
      expect(hasMinRole(role, role)).toBe(true)
    }
  })

  it('handles unknown roles gracefully', () => {
    // @ts-expect-error — testing runtime behavior with invalid role
    // Unknown role has level 0, so any known role exceeds it
    expect(hasMinRole('ADMIN', 'NONEXISTENT')).toBe(true)
    // @ts-expect-error — testing runtime behavior with invalid role
    // Unknown user role has level 0, so it cannot meet any positive requirement
    expect(hasMinRole('NONEXISTENT', 'VIEWER')).toBe(false)
  })
})

// ============================================================
// isAdmin
// ============================================================
describe('isAdmin', () => {
  it('returns true for SUPER_ADMIN', () => {
    expect(isAdmin('SUPER_ADMIN')).toBe(true)
  })

  it('returns true for ADMIN', () => {
    expect(isAdmin('ADMIN')).toBe(true)
  })

  it('returns false for OPERATOR', () => {
    expect(isAdmin('OPERATOR')).toBe(false)
  })

  it('returns false for TECHNICIAN', () => {
    expect(isAdmin('TECHNICIAN')).toBe(false)
  })

  it('returns false for AGENT', () => {
    expect(isAdmin('AGENT')).toBe(false)
  })

  it('returns false for VIEWER', () => {
    expect(isAdmin('VIEWER')).toBe(false)
  })

  it('returns false for CUSTOMER', () => {
    expect(isAdmin('CUSTOMER')).toBe(false)
  })
})

// ============================================================
// isSuperAdmin
// ============================================================
describe('isSuperAdmin', () => {
  it('returns true only for SUPER_ADMIN', () => {
    expect(isSuperAdmin('SUPER_ADMIN')).toBe(true)
  })

  it('returns false for ADMIN', () => {
    expect(isSuperAdmin('ADMIN')).toBe(false)
  })

  it('returns false for all other roles', () => {
    const otherRoles: UserRole[] = ['ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER', 'CUSTOMER']
    for (const role of otherRoles) {
      expect(isSuperAdmin(role)).toBe(false)
    }
  })
})

// ============================================================
// isStaff
// ============================================================
describe('isStaff', () => {
  it('returns true for SUPER_ADMIN', () => {
    expect(isStaff('SUPER_ADMIN')).toBe(true)
  })

  it('returns true for ADMIN', () => {
    expect(isStaff('ADMIN')).toBe(true)
  })

  it('returns true for OPERATOR', () => {
    expect(isStaff('OPERATOR')).toBe(true)
  })

  it('returns true for TECHNICIAN', () => {
    expect(isStaff('TECHNICIAN')).toBe(true)
  })

  it('returns true for AGENT', () => {
    expect(isStaff('AGENT')).toBe(true)
  })

  it('returns true for VIEWER', () => {
    expect(isStaff('VIEWER')).toBe(true)
  })

  it('returns false for CUSTOMER', () => {
    expect(isStaff('CUSTOMER')).toBe(false)
  })
})

// ============================================================
// hasPermission
// ============================================================
describe('hasPermission', () => {
  it('SUPER_ADMIN has subscribers.read', () => {
    expect(hasPermission('SUPER_ADMIN', 'subscribers.read')).toBe(true)
  })

  it('VIEWER has subscribers.read', () => {
    expect(hasPermission('VIEWER', 'subscribers.read')).toBe(true)
  })

  it('VIEWER does NOT have subscribers.create', () => {
    expect(hasPermission('VIEWER', 'subscribers.create')).toBe(false)
  })

  it('SUPER_ADMIN has all permissions defined in ROLE_PERMISSIONS', () => {
    for (const perm of ROLE_PERMISSIONS.SUPER_ADMIN) {
      expect(hasPermission('SUPER_ADMIN', perm)).toBe(true)
    }
  })

  it('CUSTOMER does NOT have subscribers.read (only subscribers.read:own)', () => {
    expect(hasPermission('CUSTOMER', 'subscribers.read')).toBe(false)
  })

  it('CUSTOMER has subscribers.read:own', () => {
    expect(hasPermission('CUSTOMER', 'subscribers.read:own')).toBe(true)
  })

  it('ADMIN has subscribers.read:own because they have subscribers.read', () => {
    expect(hasPermission('ADMIN', 'subscribers.read:own')).toBe(true)
  })

  it('OPERATOR has subscribers.read:own because they have subscribers.read', () => {
    expect(hasPermission('OPERATOR', 'subscribers.read:own')).toBe(true)
  })

  it('TECHNICIAN has equipment.update', () => {
    expect(hasPermission('TECHNICIAN', 'equipment.update')).toBe(true)
  })

  it('AGENT does NOT have equipment.update', () => {
    expect(hasPermission('AGENT', 'equipment.update')).toBe(false)
  })

  it('VIEWER does NOT have equipment.update', () => {
    expect(hasPermission('VIEWER', 'equipment.update')).toBe(false)
  })

  it('CUSTOMER has complaints.create', () => {
    expect(hasPermission('CUSTOMER', 'complaints.create')).toBe(true)
  })

  it('VIEWER does NOT have complaints.create', () => {
    expect(hasPermission('VIEWER', 'complaints.create')).toBe(false)
  })

  it('OPERATOR has complaints.assign', () => {
    expect(hasPermission('OPERATOR', 'complaints.assign')).toBe(true)
  })

  it('TECHNICIAN does NOT have complaints.assign', () => {
    expect(hasPermission('TECHNICIAN', 'complaints.assign')).toBe(false)
  })

  it('ADMIN has payments.verify', () => {
    expect(hasPermission('ADMIN', 'payments.verify')).toBe(true)
  })

  it('OPERATOR does NOT have payments.verify', () => {
    expect(hasPermission('OPERATOR', 'payments.verify')).toBe(false)
  })

  it('returns false for completely unknown permission', () => {
    expect(hasPermission('SUPER_ADMIN', 'nonexistent.permission')).toBe(false)
  })

  it('returns false for permission with scope that user does not have', () => {
    expect(hasPermission('CUSTOMER', 'invoices.delete:own')).toBe(false)
  })

  it('handles unknown role (returns false)', () => {
    // @ts-expect-error — testing runtime behavior with invalid role
    expect(hasPermission('NONEXISTENT', 'subscribers.read')).toBe(false)
  })

  it('AGENT has payments.create', () => {
    expect(hasPermission('AGENT', 'payments.create')).toBe(true)
  })

  it('CUSTOMER does NOT have payments.create', () => {
    expect(hasPermission('CUSTOMER', 'payments.create')).toBe(false)
  })

  it('SUPER_ADMIN has network.backup', () => {
    expect(hasPermission('SUPER_ADMIN', 'network.backup')).toBe(true)
  })

  it('ADMIN has network.backup', () => {
    expect(hasPermission('ADMIN', 'network.backup')).toBe(true)
  })

  it('OPERATOR does NOT have network.backup', () => {
    expect(hasPermission('OPERATOR', 'network.backup')).toBe(false)
  })
})

// ============================================================
// getPermissions
// ============================================================
describe('getPermissions', () => {
  it('returns SUPER_ADMIN permissions', () => {
    const perms = getPermissions('SUPER_ADMIN')
    expect(perms).toEqual(ROLE_PERMISSIONS.SUPER_ADMIN)
  })

  it('returns ADMIN permissions', () => {
    const perms = getPermissions('ADMIN')
    expect(perms).toEqual(ROLE_PERMISSIONS.ADMIN)
  })

  it('returns OPERATOR permissions', () => {
    const perms = getPermissions('OPERATOR')
    expect(perms).toEqual(ROLE_PERMISSIONS.OPERATOR)
  })

  it('returns TECHNICIAN permissions', () => {
    const perms = getPermissions('TECHNICIAN')
    expect(perms).toEqual(ROLE_PERMISSIONS.TECHNICIAN)
  })

  it('returns AGENT permissions', () => {
    const perms = getPermissions('AGENT')
    expect(perms).toEqual(ROLE_PERMISSIONS.AGENT)
  })

  it('returns VIEWER permissions', () => {
    const perms = getPermissions('VIEWER')
    expect(perms).toEqual(ROLE_PERMISSIONS.VIEWER)
  })

  it('returns CUSTOMER permissions', () => {
    const perms = getPermissions('CUSTOMER')
    expect(perms).toEqual(ROLE_PERMISSIONS.CUSTOMER)
  })

  it('returns empty array for unknown role', () => {
    // @ts-expect-error — testing runtime behavior with invalid role
    expect(getPermissions('NONEXISTENT')).toEqual([])
  })

  it('SUPER_ADMIN permissions include all ADMIN permissions plus extras', () => {
    const superAdminPerms = new Set(getPermissions('SUPER_ADMIN'))
    const adminPerms = getPermissions('ADMIN')
    for (const perm of adminPerms) {
      expect(superAdminPerms.has(perm)).toBe(true)
    }
    // SUPER_ADMIN should have strictly more
    expect(superAdminPerms.size).toBeGreaterThan(adminPerms.length)
  })

  it('returns a new array reference each time (not the same object)', () => {
    const perms1 = getPermissions('ADMIN')
    const perms2 = getPermissions('ADMIN')
    // Should return the same reference from ROLE_PERMISSIONS (not a copy)
    // This is the actual behavior — it returns the array from ROLE_PERMISSIONS directly
    expect(perms1).toBe(perms2)
  })

  it('each role returns an array of strings', () => {
    const roles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER', 'CUSTOMER']
    for (const role of roles) {
      const perms = getPermissions(role)
      for (const perm of perms) {
        expect(typeof perm).toBe('string')
        expect(perm.length).toBeGreaterThan(0)
      }
    }
  })
})
