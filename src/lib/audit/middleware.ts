/**
 * CRYPTSK — Audit Log Middleware Stub
 *
 * Provides no-op shims for StaySuite's audit helpers (logWifi, etc.) so the
 * captive portal routes can import them without modification.
 * CRYPTSK routes use its own AuditLog model via @/lib/db directly when needed.
 */

import type { NextRequest } from 'next/server';

export function isValidUUID(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function safeUUID(value: string | undefined | null): string | undefined {
  return isValidUUID(value) ? (value as string) : undefined;
}

export function extractRequestContext(_request: NextRequest): {
  userId: string;
  tenantId: string;
  ipAddress: string;
  userAgent: string;
} {
  return {
    userId: 'system',
    tenantId: 'default',
    ipAddress: '127.0.0.1',
    userAgent: 'cryptsk-internal',
  };
}

// No-op logger — never throws, never blocks
export async function logWifi(
  _request: NextRequest,
  _action: string,
  _entityType: string,
  _entityId: string | undefined,
  _metadata?: Record<string, unknown>,
  _overrides?: { tenantId?: string; userId?: string; oldValue?: Record<string, unknown> },
): Promise<void> {
  return;
}

export async function logGeneric(
  _request: NextRequest,
  _action: string,
  _entityType: string,
  _entityId: string | undefined,
  _metadata?: Record<string, unknown>,
): Promise<void> {
  return;
}

export async function logAuth(
  _request: NextRequest,
  _action: string,
  _entityType: string,
  _entityId: string | undefined,
  _metadata?: Record<string, unknown>,
): Promise<void> {
  return;
}
