/**
 * CRYPTSK — Tenant Context Stub
 *
 * Adapted from StaySuite's tenant-context.ts. CRYPTSK is single-tenant, so
 * requirePermission always returns an admin context (no actual auth check).
 * This allows StaySuite captive portal routes to import the helper without
 * modification.
 *
 * StaySuite signature:
 *   export async function requirePermission(req, permission): Promise<TenantContext | NextResponse>
 */

import { NextRequest, NextResponse } from 'next/server';

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: string;
  isPlatformAdmin: boolean;
  propertyId?: string;
  permissions: string[];
}

/**
 * Always returns an admin context. CRYPTSK is single-tenant — no auth check.
 */
export async function requirePermission(
  _request: NextRequest,
  _permission: string,
): Promise<TenantContext | NextResponse> {
  return {
    userId: 'system',
    tenantId: 'default',
    role: 'ADMIN',
    isPlatformAdmin: true,
    propertyId: 'default',
    permissions: ['*'],
  };
}

/**
 * Lower-level helper — same behaviour.
 */
export async function requireAuth(_request: NextRequest): Promise<TenantContext | NextResponse> {
  return {
    userId: 'system',
    tenantId: 'default',
    role: 'ADMIN',
    isPlatformAdmin: true,
    propertyId: 'default',
    permissions: ['*'],
  };
}

export function hasPermission(_ctx: TenantContext | null | undefined, _permission: string): boolean {
  return true;
}

export function hasAnyPermission(_ctx: TenantContext | null | undefined, _permissions: string[]): boolean {
  return true;
}

export async function getUserProfile(_request: NextRequest): Promise<TenantContext | null> {
  return {
    userId: 'system',
    tenantId: 'default',
    role: 'ADMIN',
    isPlatformAdmin: true,
    propertyId: 'default',
    permissions: ['*'],
  };
}

export async function requireProperty(_request: NextRequest): Promise<{ propertyId: string } | NextResponse> {
  return { propertyId: 'default' };
}

/**
 * Stub: StaySuite resolves a property ID from request context. CRYPTSK is
 * single-tenant, so we just return 'default'. The function is named
 * `resolvePropertyId` to satisfy StaySuite imports.
 */
export async function resolvePropertyId(_request: NextRequest): Promise<string> {
  return 'default';
}
