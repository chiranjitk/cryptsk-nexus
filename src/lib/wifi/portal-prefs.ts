import { getWifiSettings, type PortalPreferencesSettings } from '@/lib/wifi-settings';

/**
 * Cached preferences reader for server-side use in auth routes.
 * Falls back to hardcoded defaults when no tenantId is available
 * (e.g., legacy endpoints that don't have tenant context yet).
 *
 * Usage in auth routes:
 *   const prefs = await getPortalPrefs(tenantId);
 *   const otpExpiry = prefs.otpExpirySeconds;   // was hardcoded 300
 *   const macValidity = prefs.macAuthValidityDays; // was hardcoded 30
 */

// Multi-tenant in-memory cache (keyed by tenantId:propertyId)
const _cache = new Map<string, { prefs: PortalPreferencesSettings; ts: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

function cacheKey(tenantId?: string, propertyId?: string): string {
  return `${tenantId || '_'}:${propertyId || '_'}`;
}

export async function getPortalPrefs(
  tenantId?: string,
  propertyId?: string,
): Promise<PortalPreferencesSettings> {
  // If no tenant context, return defaults (legacy endpoint fallback)
  if (!tenantId) {
    return getWifiSettings('00000000-0000-0000-0000-000000000000', 'portal_preferences', propertyId);
  }

  const key = cacheKey(tenantId, propertyId);
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.prefs;
  }

  const prefs = await getWifiSettings(tenantId, 'portal_preferences', propertyId);
  _cache.set(key, { prefs, ts: Date.now() });
  return prefs;
}

/**
 * Clear the in-memory cache (useful after a PUT to portal-preferences).
 * If tenantId/propertyId provided, clears only that entry; otherwise clears all.
 */
export function clearPortalPrefsCache(tenantId?: string, propertyId?: string): void {
  if (tenantId) {
    _cache.delete(cacheKey(tenantId, propertyId));
  } else {
    _cache.clear();
  }
}

/**
 * Get the default preferences (used as fallback when tenant has no saved prefs).
 */
export async function getPortalPrefsDefaults(): Promise<PortalPreferencesSettings> {
  // Dynamic import to avoid circular deps
  const { PORTAL_PREFERENCES_DEFAULTS } = await import('@/lib/wifi-settings');
  return { ...PORTAL_PREFERENCES_DEFAULTS };
}