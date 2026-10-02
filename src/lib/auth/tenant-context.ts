/**
 * Tenant Context Helper — CRYPTSK Nexus (single-tenant)
 * Wraps CRYPTSK's requireAuth for StaySuite-derived captive portal routes.
 * tenantId is always 'default' — CRYPTSK has no multi-tenancy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export interface TenantContext {
  userId: string;
  tenantId: string;
  isPlatformAdmin: boolean;
  role: string;
  permissions: string[];
}

export async function getTenantContext(request: NextRequest): Promise<TenantContext | null> {
  try {
    const userId = await requireAuth(request);
    if (!userId) return null;
    return { userId, tenantId: 'default', isPlatformAdmin: true, role: 'SUPER_ADMIN', permissions: ['*'] };
  } catch { return null; }
}

export async function requirePermission(request: NextRequest, _permission: string): Promise<TenantContext | NextResponse> {
  try {
    const userId = await requireAuth(request);
    if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    return { userId, tenantId: 'default', isPlatformAdmin: true, role: 'SUPER_ADMIN', permissions: ['*'] };
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || 'Auth failed' }, { status: e.statusCode || 401 });
  }
}

export function hasPermission(_context: TenantContext, _permission: string): boolean { return true; }
export function hasAnyPermission(_context: TenantContext, _permissions: string[]): boolean { return true; }
export async function requireAnyPermission(request: NextRequest, _permissions: string[]): Promise<TenantContext | NextResponse> { return requirePermission(request, '*'); }
export async function getUserProfile(request: NextRequest): Promise<TenantContext | null> { return getTenantContext(request); }
