/**
 * Cryptsk - Authentication Utility Functions
 * Provides login, user retrieval, and role-based permission checks
 */

import { compare } from 'bcryptjs'
import { db } from './db'
import type { UserRole, UserStatus } from '@prisma/client'

// In-memory brute-force protection (reset on server restart)
// In development mode, brute-force lockout is disabled to prevent testing friction.
// In production, 5 failed attempts triggers a 15-minute lockout.
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

function isBruteForceEnabled(): boolean {
  return process.env.NODE_ENV === 'production'
}

// ============================================================
// TYPES
// ============================================================

export interface AuthUser {
  id: string
  email: string
  name: string
  phone: string
  role: UserRole
  status: UserStatus
  avatarUrl: string
  twoFactorEnabled: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

export interface LoginResult {
  success: boolean
  user?: AuthUser
  error?: string
}

// ============================================================
// ROLE HIERARCHY (higher number = more permissions)
// ============================================================

const ROLE_LEVELS: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  OPERATOR: 60,
  TECHNICIAN: 40,
  AGENT: 30,
  VIEWER: 10,
  CUSTOMER: 5,
}

// ============================================================
// HELPER: Transform Prisma user to AuthUser
// ============================================================

function toAuthUser(user: {
  id: string
  email: string
  name: string
  phone: string
  role: UserRole
  status: UserStatus
  avatarUrl: string
  twoFactorEnabled: boolean
  lastLoginAt: Date | null
  createdAt: Date
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  }
}

// ============================================================
// AUTH FUNCTIONS
// ============================================================

/**
 * Authenticate user with email and password
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    if (!email || !password) {
      return { success: false, error: 'Email and password are required' }
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (!user) {
      return { success: false, error: 'Invalid email or password' }
    }

    if (user.status === 'LOCKED') {
      return { success: false, error: 'Account is locked. Contact administrator.' }
    }

    if (user.status === 'INACTIVE') {
      return { success: false, error: 'Account is inactive. Contact administrator.' }
    }

    if (user.status === 'SUSPENDED') {
      return { success: false, error: 'Account is suspended. Contact administrator.' }
    }

    // Check if account is temporarily locked due to brute-force attempts (production only)
    if (isBruteForceEnabled()) {
      const attempts = failedAttempts.get(user.email)
      if (attempts && attempts.lockedUntil > Date.now()) {
        return { success: false, error: 'Account temporarily locked due to too many failed attempts. Try again later.' }
      }
    }

    const isPasswordValid = await compare(password, user.password)
    if (!isPasswordValid) {
      // Track failed attempt (production only — skip in dev to avoid accidental lockouts)
      if (isBruteForceEnabled()) {
        const current = failedAttempts.get(user.email) || { count: 0, lockedUntil: 0 }
        current.count += 1
        if (current.count >= 5) {
          current.lockedUntil = Date.now() + 15 * 60 * 1000 // 15 min lockout
        }
        failedAttempts.set(user.email, current)
      }
      return { success: false, error: 'Invalid email or password' }
    }

    // Successful login - clear failed attempts
    failedAttempts.delete(user.email)

    // Update last login (best-effort, don't fail if DB is readonly)
    try {
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
    } catch {
      // Ignore write errors (e.g., readonly DB in sandbox)
    }

    return {
      success: true,
      user: toAuthUser(user),
    }
  } catch (error) {
    console.error('[Auth] Login error:', error)
    return { success: false, error: 'Internal server error' }
  }
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<AuthUser | null> {
  try {
    const user = await db.user.findUnique({
      where: { id },
    })

    if (!user) return null

    return toAuthUser(user)
  } catch (error) {
    console.error('[Auth] getUserById error:', error)
    return null
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  try {
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (!user) return null

    return toAuthUser(user)
  } catch (error) {
    console.error('[Auth] getUserByEmail error:', error)
    return null
  }
}

// ============================================================
// ROLE & PERMISSION FUNCTIONS
// ============================================================

/**
 * Check if a user has a specific role
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return userRole === requiredRole
}

/**
 * Check if a user's role is at or above the required level
 */
export function hasMinRole(userRole: UserRole, requiredRole: UserRole): boolean {
  const userLevel = ROLE_LEVELS[userRole] ?? 0
  const requiredLevel = ROLE_LEVELS[requiredRole] ?? 0
  return userLevel >= requiredLevel
}

/**
 * Check if user is an admin (SUPER_ADMIN or ADMIN)
 */
export function isAdmin(userRole: UserRole): boolean {
  return userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
}

/**
 * Check if user is a super admin
 */
export function isSuperAdmin(userRole: UserRole): boolean {
  return userRole === 'SUPER_ADMIN'
}

/**
 * Check if user is staff (any internal role except CUSTOMER)
 */
export function isStaff(userRole: UserRole): boolean {
  return ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'TECHNICIAN', 'AGENT', 'VIEWER'].includes(userRole)
}

/**
 * Define permission sets for each role
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: [
    // Subscribers
    'subscribers.read', 'subscribers.create', 'subscribers.update', 'subscribers.delete',
    // Plans
    'plans.read', 'plans.create', 'plans.update', 'plans.delete',
    // Invoices
    'invoices.read', 'invoices.create', 'invoices.update', 'invoices.delete',
    // Payments
    'payments.read', 'payments.create', 'payments.update', 'payments.delete', 'payments.verify',
    // Complaints
    'complaints.read', 'complaints.create', 'complaints.update', 'complaints.delete', 'complaints.assign',
    // Network
    'network.read', 'network.create', 'network.update', 'network.delete', 'network.backup',
    // Areas
    'areas.read', 'areas.create', 'areas.update', 'areas.delete',
    // Users
    'users.read', 'users.create', 'users.update', 'users.delete',
    // Settings
    'settings.read', 'settings.update',
    // Reports
    'reports.read', 'reports.export',
    // Technicians
    'technicians.read', 'technicians.create', 'technicians.update', 'technicians.delete',
    // Agents
    'agents.read', 'agents.create', 'agents.update', 'agents.delete',
    // Equipment
    'equipment.read', 'equipment.create', 'equipment.update', 'equipment.delete',
    // Installations
    'installations.read', 'installations.create', 'installations.update', 'installations.delete',
    // Vouchers
    'vouchers.read', 'vouchers.create', 'vouchers.update', 'vouchers.delete',
    // Promotions
    'promotions.read', 'promotions.create', 'promotions.update', 'promotions.delete',
    // Dashboard
    'dashboard.read',
  ],
  ADMIN: [
    'subscribers.read', 'subscribers.create', 'subscribers.update', 'subscribers.delete',
    'plans.read', 'plans.create', 'plans.update', 'plans.delete',
    'invoices.read', 'invoices.create', 'invoices.update', 'invoices.delete',
    'payments.read', 'payments.create', 'payments.update', 'payments.delete', 'payments.verify',
    'complaints.read', 'complaints.create', 'complaints.update', 'complaints.delete', 'complaints.assign',
    'network.read', 'network.create', 'network.update', 'network.delete', 'network.backup',
    'areas.read', 'areas.create', 'areas.update', 'areas.delete',
    'users.read', 'users.create', 'users.update',
    'settings.read', 'settings.update',
    'reports.read', 'reports.export',
    'technicians.read', 'technicians.create', 'technicians.update',
    'agents.read', 'agents.create', 'agents.update',
    'equipment.read', 'equipment.create', 'equipment.update', 'equipment.delete',
    'installations.read', 'installations.create', 'installations.update',
    'vouchers.read', 'vouchers.create', 'vouchers.update',
    'promotions.read', 'promotions.create', 'promotions.update',
    'dashboard.read',
  ],
  OPERATOR: [
    'subscribers.read', 'subscribers.create', 'subscribers.update',
    'plans.read',
    'invoices.read', 'invoices.create', 'invoices.update',
    'payments.read', 'payments.create', 'payments.update',
    'complaints.read', 'complaints.create', 'complaints.update', 'complaints.assign',
    'network.read',
    'areas.read',
    'users.read',
    'settings.read',
    'reports.read',
    'technicians.read',
    'agents.read',
    'equipment.read',
    'installations.read', 'installations.create', 'installations.update',
    'vouchers.read', 'vouchers.create',
    'promotions.read',
    'dashboard.read',
  ],
  TECHNICIAN: [
    'subscribers.read',
    'plans.read',
    'invoices.read',
    'complaints.read', 'complaints.update',
    'network.read',
    'areas.read',
    'equipment.read', 'equipment.update',
    'installations.read', 'installations.update',
    'dashboard.read',
  ],
  AGENT: [
    'subscribers.read',
    'invoices.read',
    'payments.read', 'payments.create',
    'areas.read',
    'reports.read',
    'dashboard.read',
  ],
  VIEWER: [
    'subscribers.read',
    'plans.read',
    'invoices.read',
    'payments.read',
    'complaints.read',
    'network.read',
    'areas.read',
    'reports.read',
    'dashboard.read',
  ],
  CUSTOMER: [
    'subscribers.read:own',
    'invoices.read:own',
    'payments.read:own',
    'complaints.read:own', 'complaints.create',
  ],
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(userRole: UserRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[userRole] || []

  // Check if permission already has :own scope
  if (permissions.includes(permission)) return true;

  // Handle :own scope
  const colonIdx = permission.lastIndexOf(':');
  if (colonIdx > 0) {
    const scope = permission.substring(colonIdx + 1);
    if (scope === 'own') {
      const base = permission.substring(0, colonIdx);
      // Check if user has the base permission (e.g., "subscribers.read" grants "subscribers.read:own")
      if (permissions.includes(base)) return true;
      // Also check wildcard
      const dotIdx = base.lastIndexOf('.');
      if (dotIdx > 0) {
        const wildcard = base.substring(0, dotIdx) + '.*';
        if (permissions.includes(wildcard)) return true;
      }
    }
  }

  // Check wildcard (e.g., "subscribers.read" matches "subscribers.*")
  const dotIdx = permission.lastIndexOf('.');
  if (dotIdx > 0) {
    const wildcard = permission.substring(0, dotIdx) + '.*';
    if (permissions.includes(wildcard)) return true;
  }

  return false
}

/**
 * Get all permissions for a role
 */
export function getPermissions(userRole: UserRole): string[] {
  return ROLE_PERMISSIONS[userRole] || []
}

/**
 * Verify user session (placeholder for future JWT/session implementation)
 * For now, simply checks if user exists and is active
 */
export async function verifySession(userId: string): Promise<AuthUser | null> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
    })

    if (!user || user.status !== 'ACTIVE') return null

    return toAuthUser(user)
  } catch (error) {
    console.error('[Auth] verifySession error:', error)
    return null
  }
}
