/**
 * Social Authentication Helpers for WiFi Captive Portal
 * Manages OAuth state tokens and creates WiFi sessions from social login
 */

import crypto from 'crypto';
import globalCache from '@/lib/cache';
import { db } from '@/lib/db';

// ── State Token Cache (TTL: 15 minutes) ──────────────────

interface SocialAuthState {
  tenantId: string;
  propertyId: string;
  provider: string;
  macAddress?: string;
  createdAt: number;
}

// 15 minutes accounts for slow OAuth providers and mobile network delays
// in captive portal environments where the device may have limited connectivity.
const STATE_TOKEN_TTL = 15 * 60; // 15 minutes (900s)

/**
 * Generate a cryptographically secure state token for OAuth flows.
 * Stores tenant/property context for callback verification.
 */
export async function generateStateToken(
  tenantId: string,
  propertyId: string,
  provider: string,
  macAddress?: string
): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex');
  const data: SocialAuthState = {
    tenantId,
    propertyId,
    provider,
    macAddress,
    createdAt: Date.now(),
  };
  globalCache.set(`wifi:oauth:${state}`, data, STATE_TOKEN_TTL);
  return state;
}

/**
 * Verify an OAuth state token and return the stored context.
 * Returns null if invalid, expired, or not found.
 */
export async function verifyStateToken(
  state: string
): Promise<{ tenantId: string; propertyId: string; provider: string; macAddress?: string } | null> {
  const data = globalCache.get<SocialAuthState>(`wifi:oauth:${state}`);
  if (!data) return null;
  // Consume the token (one-time use)
  globalCache.delete(`wifi:oauth:${state}`);
  return {
    tenantId: data.tenantId,
    propertyId: data.propertyId,
    provider: data.provider,
    macAddress: data.macAddress,
  };
}

/**
 * Create a WiFi session after successful social authentication.
 */
export async function createWiFiSocialSession(params: {
  tenantId: string;
  propertyId: string;
  provider: string;
  email: string;
  name: string;
  macAddress?: string;
}): Promise<{
  session: {
    id: string;
    macAddress: string;
    authMethod: string;
    status: string;
    startTime: Date;
  };
}> {
  const { tenantId, propertyId, provider, email, name, macAddress } = params;

  // Find default WiFi plan for the property
  const plan = await db.wiFiPlan.findFirst({
    where: {
      tenantId,
      propertyId,
      isActive: true,
      isDefault: true,
    },
    select: { id: true },
  });

  // Use provided MAC or generate a placeholder
  const sessionMac = macAddress || `soc:${crypto.randomBytes(4).toString('hex')}`;

  // Create WiFi session
  const session = await db.wiFiSession.create({
    data: {
      tenant: { connect: { id: tenantId } },
...(plan?.id ? { plan: { connect: { id: plan.id } } } : {}),
      macAddress: sessionMac,
      username: email,
      authMethod: `social_${provider}`,
      status: 'active',
      deviceName: `Social Login (${name})`,
    },
    select: {
      id: true,
      macAddress: true,
      authMethod: true,
      status: true,
      startTime: true,
    },
  });

  return { session };
}
