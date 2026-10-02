/**
 * Tenant Context Helper — CRYPTSK Nexus adaptation
 * 
 * CRYPTSK is single-tenant (no Tenant model). This module wraps CRYPTSK's
 * requireAuth to provide a compatible TenantContext for StaySuite-derived
 * captive portal routes.
 * 
 * tenantId is always 'default' — routes that reference it in Prisma queries
 * should have tenantId removed from their where/create clauses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export interface TenantContext {
  userId: string;
  tenantId: string; // always 'default' — CRYPTSK is single-tenant
  isPlatformAdmin: boolean;
  role: string;
  permissions: string[];
}

/**
 * Get tenant context from session — wraps CRYPTSK's requireAuth
 */
export async function getTenantContext(request: NextRequest): Promise<TenantContext | null> {
  try {
    const userId = await requireAuth(request);
    if (!userId) return null;
    return {
      userId,
      tenantId: 'default',
      isPlatformAdmin: true,
      role: 'SUPER_ADMIN',
      permissions: ['*'],
    };
  } catch {
    return null;
  }
}

/**
 * Require a specific permission — in CRYPTSK, all authenticated users are admins
 * Returns TenantContext on success, NextResponse (401) on failure
 */
export async function requirePermission(request: NextRequest, _permission: string): Promise<TenantContext | NextResponse> {
  try {
    const userId = await requireAuth(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }
    return {
      userId,
      tenantId: 'default',
      isPlatformAdmin: true,
      role: 'SUPER_ADMIN',
      permissions: ['*'],
    };
  } catch (e: any) {
    const status = e.statusCode || 401;
    return NextResponse.json(
      { success: false, error: e.message || 'Authentication failed' },
      { status }
    );
  }
}

/**
 * Check if a context has a permission — always true in CRYPTSK (admin mode)
 */
export function hasPermission(context: TenantContext, _permission: string): boolean {
  return true;
}

/**
 * Check if a context has any of the given permissions — always true in CRYPTSK
 */
export function hasAnyPermission(context: TenantContext, _permissions: string[]): boolean {
  return true;
}

/**
 * Require any of the given permissions
 */
export async function requireAnyPermission(request: NextRequest, _permissions: string[]): Promise<TenantContext | NextResponse> {
  return requirePermission(request, '*');
}

/**
 * Get user profile — simplified for CRYPTSK
 */
export async function getUserProfile(request: NextRequest): Promise<TenantContext | null> {
  return getTenantContext(request);
}
