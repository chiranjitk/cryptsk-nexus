/**
 * Tenant Context Helper
 * 
 * This module provides helper functions to get tenant context from authenticated sessions.
 * All APIs should use these helpers instead of hardcoded tenantId values.
 * 
 * Multi-Tenant Architecture:
 * - Each user belongs to ONE tenant (via user.tenantId)
 * - Session contains user info including tenantId
 * - Platform admins can access all tenants (isPlatformAdmin = true)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Non-blocking audit log helper — fire-and-forget so it never blocks the request.
 * For platform admin bypasses, we use the admin's actual tenantId (always valid FK)
 * rather than a hardcoded system UUID that doesn't exist in the Tenant table.
 */
function logAdminAction(userId: string, action: string, resource: string, tenantId: string): void {
  db.auditLog
    .create({
      data: {
        tenantId, // admin's own tenant — guaranteed valid FK
        userId,
        module: 'auth',
        action: 'admin_permission_bypass',
        entityType: resource,
        newValue: 'Platform admin permission bypass',
      },
    })
    .catch(() => {});
}

/**
 * Non-blocking audit log for permission-denied attempts.
 */
function logPermissionDenied(
  userId: string,
  requiredPermissions: string,
  context: TenantContext
): void {
  db.auditLog
    .create({
      data: {
        tenantId: context.tenantId,
        userId,
        module: 'auth',
        action: 'access_denied',
        entityType: 'permission_check',
        newValue: JSON.stringify({ required: requiredPermissions, role: context.role }),
      },
    })
    .catch(() => {});
}

export interface TenantContext {
  userId: string;
  tenantId: string;
  isPlatformAdmin: boolean;
  role: string;
  permissions: string[];
}

/**
 * Get tenant context from session
 * Returns null if not authenticated
 */
export async function getTenantContext(request: NextRequest): Promise<TenantContext | null> {
  const token = request.cookies.get('session_token')?.value;
  
  if (!token) {
    return null;
  }

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          tenantId: true,
          roleId: true,
          isPlatformAdmin: true,
          role: {
            select: {
              name: true,
              permissions: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  // Check user is not deleted
  if (session.user.deletedAt) {
    return null;
  }

  // Parse permissions
  let permissions: string[] = [];
  if (session.user.role?.permissions) {
    try {
      permissions = JSON.parse(session.user.role.permissions);
    } catch {
      permissions = [];
    }
  }

  // Check if platform admin (has isPlatformAdmin flag set to true)
  const isPlatformAdmin = session.user.isPlatformAdmin === true;

  // SECURITY: Enforce tenant status — block access for suspended/expired/cancelled tenants
  // Platform admins bypass this check (they manage tenants, not use them)
  const tenantStatus = session.user.tenant?.status;
  if (!isPlatformAdmin && tenantStatus) {
    const blockedStatuses = ['suspended', 'suspended_license', 'cancelled', 'past_due', 'expired'];
    if (blockedStatuses.includes(tenantStatus)) {
      return null; // Session treated as invalid for blocked tenants
    }
  }

  // Platform admin tenant override: if the platform admin has selected an active
  // tenant via the sidebar switcher, respect that choice for data scoping.
  // The frontend sets an `active_tenant_id` cookie when the admin switches.
  let effectiveTenantId = session.user.tenantId;
  if (isPlatformAdmin) {
    const activeTenantId = request.cookies.get('active_tenant_id')?.value;
    if (activeTenantId && activeTenantId !== session.user.tenantId) {
      // Validate the tenant exists (lightweight existence check)
      const activeTenant = await db.tenant.findUnique({
        where: { id: activeTenantId, deletedAt: null },
        select: { id: true },
      });
      if (activeTenant) {
        effectiveTenantId = activeTenantId;
      }
    }
  }

  // Set audit actor context for Prisma audit logging extension
  // This ensures ALL Prisma writes during this request are automatically audited
  try {
    const { setAuditActor, setAuditTenant } = await import('@/lib/prisma-audit-logging');
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || undefined;
    const userAgent = request.headers.get('user-agent') ?? undefined;
    setAuditActor(session.user.id, ipAddress, userAgent);
    setAuditTenant(effectiveTenantId);
  } catch { /* non-blocking — audit context is best-effort */ }

  return {
    userId: session.user.id,
    tenantId: effectiveTenantId,
    isPlatformAdmin,
    role: session.user.role?.name || 'staff',
    permissions,
  };
}

/**
 * Get tenantId from session
 * Use this for simple cases where you just need the tenant ID
 */
export async function getTenantIdFromSession(request: NextRequest): Promise<string | null> {
  const context = await getTenantContext(request);
  return context?.tenantId || null;
}

/**
 * Require authentication - returns 401 if not authenticated
 * Use this at the start of API routes
 */
export async function requireAuth(request: NextRequest): Promise<TenantContext | NextResponse> {
  const context = await getTenantContext(request);
  
  if (!context) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 }
    );
  }

  return context;
}

/**
 * Require platform admin - returns 403 if not platform admin
 * Use this for admin-only routes like tenant management
 */
export async function requirePlatformAdmin(request: NextRequest): Promise<TenantContext | NextResponse> {
  const context = await getTenantContext(request);
  
  if (!context) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 }
    );
  }

  if (!context.isPlatformAdmin) {
    return NextResponse.json(
      { success: false, error: 'Platform admin access required' },
      { status: 403 }
    );
  }

  return context;
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(context: TenantContext, permission: string): boolean {
  if (context.isPlatformAdmin) {
    logAdminAction(context.userId, 'admin_permission_bypass', permission, context.tenantId);
    return true;
  }
  if (context.permissions.includes('*')) return true;
  
  // Check for wildcard module permission (e.g., 'bookings.*')
  const [module] = permission.split('.');
  if (context.permissions.includes(`${module}.*`)) return true;
  
  return context.permissions.includes(permission);
}

/**
 * Require a specific permission - returns 403 if not authorized
 */
export async function requirePermission(
  request: NextRequest, 
  permission: string
): Promise<TenantContext | NextResponse> {
  const context = await requireAuth(request);
  
  if (context instanceof NextResponse) {
    return context;
  }

  if (!hasPermission(context, permission)) {
    logPermissionDenied(context.userId, permission, context);
    // Log permission-denied attempts for security monitoring (GAP-18)
    try {
      await db.auditLog.create({
        data: {
          tenantId: context.tenantId,
          userId: context.userId,
          module: 'security',
          action: 'access_denied',
          entityType: 'permission',
          newValue: JSON.stringify({ permission, role: context.role, isPlatformAdmin: context.isPlatformAdmin }),
        },
      });
    } catch (_logError) {
      // Don't let logging failure break the auth check — suppress FK/enum errors silently
    }

    return NextResponse.json(
      { success: false, error: `Permission denied: ${permission}` },
      { status: 403 }
    );
  }

  return context;
}

/**
 * Build a where clause with tenant isolation
 * Use this for all database queries that should be tenant-scoped
 */
export function tenantWhere(
  context: TenantContext, 
  additionalWhere: Record<string, unknown> = {}
): Record<string, unknown> {
  // Platform admins can see all tenants' data if they explicitly request it
  // But by default, they still see their own tenant's data
  return {
    tenantId: context.tenantId,
    ...additionalWhere,
  };
}

/**
 * For admin APIs that need to query across tenants
 * Only platform admins can use this
 */
export async function getOptionalTenantFilter(
  request: NextRequest,
  context: TenantContext
): Promise<string> {
  // Platform admins can override via query param or the active tenant cookie.
  // The cookie is already resolved in getTenantContext(), so context.tenantId
  // already reflects the switched tenant. Query param overrides cookie.
  if (context.isPlatformAdmin) {
    const searchParams = request.nextUrl.searchParams;
    const requestedTenantId = searchParams.get('tenantId');
    if (requestedTenantId) {
      return requestedTenantId;
    }
  }
  
  // Otherwise, use the effective tenant (already resolved with active_tenant_id cookie)
  return context.tenantId;
}

/**
 * Resolve propertyId for an API request.
 * Uses the provided value if present and valid UUID; otherwise auto-detects the first
 * property belonging to the tenant. Returns null only if no property exists.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolvePropertyId(
  context: TenantContext,
  explicitId?: string | null,
): Promise<string | null> {
  if (explicitId && UUID_RE.test(explicitId)) return explicitId;
  // explicitId was provided but is not a valid UUID — fall back to auto-detection
  const prop = await db.property.findFirst({
    where: { tenantId: context.tenantId },
    select: { id: true },
  });
  return prop?.id ?? null;
}

/**
 * Get the on-prem property ID for the given tenant.
 * Each tenant can have at most one on-prem gateway property.
 * Returns { id: string } if found, or { id: '', error: NextResponse } if not.
 */
export async function getOnPremPropertyId(
  context: TenantContext,
): Promise<{ id: string; error?: NextResponse }> {
  const onPrem = await db.property.findFirst({
    where: { tenantId: context.tenantId, deploymentMode: 'on_prem' },
    select: { id: true },
  });
  if (!onPrem) {
    return {
      id: '',
      error: NextResponse.json(
        { success: false, error: 'No on-prem property configured. This feature requires a local gateway deployment.' },
        { status: 400 },
      ),
    };
  }
  return { id: onPrem.id };
}

/**
 * Full user profile — drop-in replacement for deprecated auth-helpers.getUserFromRequest.
 * Returns the same shape (id, email, name, roleName, tenant, etc.) but uses
 * getTenantContext internally, so platform-admin active_tenant_id override works.
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  roleId: string | null;
  roleName: string;
  permissions: string[];
  tenantId: string;
  tenant: { id: string; name: string; slug: string; plan: string | null; status: string };
  isPlatformAdmin: boolean;
}

export async function getUserProfile(request: NextRequest): Promise<UserProfile | null> {
  const token = request.cookies.get('session_token')?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
          roleId: true,
          tenantId: true,
          status: true,
          deletedAt: true,
          isPlatformAdmin: true,
          role: {
            select: { name: true, permissions: true },
          },
          tenant: {
            select: { id: true, name: true, slug: true, plan: true, status: true },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;
  const user = session.user;
  if (user.status !== 'active' || user.deletedAt) return null;

  let permissions: string[] = [];
  if (user.role?.permissions) {
    try { permissions = JSON.parse(user.role.permissions); } catch { permissions = []; }
  }

  const isPlatformAdmin = user.isPlatformAdmin === true;
  let effectiveTenantId = user.tenantId;
  if (isPlatformAdmin) {
    const activeTenantId = request.cookies.get('active_tenant_id')?.value;
    if (activeTenantId && activeTenantId !== user.tenantId) {
      const activeTenant = await db.tenant.findUnique({
        where: { id: activeTenantId, deletedAt: null },
        select: { id: true },
      });
      if (activeTenant) effectiveTenantId = activeTenantId;
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    roleId: user.roleId,
    roleName: user.role?.name || 'staff',
    permissions,
    tenantId: effectiveTenantId,
    tenant: user.tenant,
    isPlatformAdmin,
  };
}

/**
 * Check if user has any of the specified permissions.
 * Supports both TenantContext (role) and UserProfile (roleName) for backward compatibility.
 */
export function hasAnyPermission(
  user: { permissions: string[]; roleName?: string; role?: string; isPlatformAdmin?: boolean },
  permissions: string[]
): boolean {
  if (user.isPlatformAdmin) return true;
  const roleName = user.role || user.roleName;
  if (roleName === 'admin' || user.permissions.includes('*')) return true;
  return permissions.some(p =>
    (user as unknown as TenantContext).permissions
      ? hasPermission(user as unknown as TenantContext, p)
      : user.permissions.includes(p)
  );
}

/**
 * Require on-prem property for API routes that need local gateway features.
 * Returns the on-prem property ID if found, or a 403 response if:
 *   - No on-prem property exists for the tenant
 *   - The explicitly provided propertyId belongs to a remote property
 * Use this at the start of DNS, DHCP, Firewall, Network, etc. API routes.
 */
export async function requireOnPremProperty(
  context: TenantContext,
  explicitId?: string | null,
): Promise<{ id: string } | NextResponse> {
  // If an explicit propertyId was provided, verify it is on-prem
  if (explicitId && UUID_RE.test(explicitId)) {
    const prop = await db.property.findFirst({
      where: { id: explicitId, tenantId: context.tenantId },
      select: { id: true, deploymentMode: true },
    });
    if (!prop) {
      return NextResponse.json(
        { success: false, error: 'Property not found' },
        { status: 404 },
      );
    }
    if (prop.deploymentMode !== 'on_prem') {
      return NextResponse.json(
        { success: false, error: 'This feature requires an on-prem gateway deployment. Your selected property is remote.' },
        { status: 403 },
      );
    }
    return { id: prop.id };
  }

  // No explicit ID — find the tenant's on-prem property
  const result = await getOnPremPropertyId(context);
  if (result.error) return result.error;
  return { id: result.id };
}
