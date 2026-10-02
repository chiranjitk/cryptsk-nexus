/**
 * Auth Rate Limit Helper
 *
 * Provides per-IP rate limiting for WiFi auth methods using portal preferences.
 * Uses the centralized DB-backed rate limiter.
 *
 * Usage in auth handlers:
 *   const rateCheck = await checkAuthRateLimit(ip, 'voucher', tenantId, propertyId);
 *   if (!rateCheck.allowed) {
 *     return errorResponse('RATE_LIMITED', `Too many attempts. Try again in ${rateCheck.retryAfter}s`);
 *   }
 */

import { rateLimit } from '@/lib/rate-limiter';
import { getPortalPrefs } from '@/lib/wifi/portal-prefs';
import type { PortalPreferencesSettings } from '@/lib/wifi-settings';

interface RateCheckResult {
  allowed: boolean;
  retryAfter: number | null;
}

/**
 * Check per-IP rate limit for an auth method using portal preferences.
 *
 * @param clientIp - The client's IP address
 * @param method - Auth method key: 'voucher' | 'room' | 'otp_send' | 'otp_verify' | 'credentials' | 'social' | 'ldap' | 'mac_auth' | 'self_registration' | 'open_access'
 * @param tenantId - Optional tenant ID for preference lookup
 * @param propertyId - Optional property ID for preference lookup
 * @returns { allowed, retryAfter }
 */
export async function checkAuthRateLimit(
  clientIp: string,
  method: 'voucher' | 'room' | 'otp_send' | 'otp_verify' | 'credentials' | 'social' | 'ldap' | 'mac_auth' | 'self_registration' | 'open_access',
  tenantId?: string,
  propertyId?: string,
): Promise<RateCheckResult> {
  // Get preferences — if no tenant context, use safe defaults
  let prefs: PortalPreferencesSettings;
  try {
    prefs = await getPortalPrefs(tenantId, propertyId);
  } catch {
    // If prefs can't be loaded, use safe defaults
    prefs = {
      appRateLimitEnabled: false,
      voucherMaxAttempts: 10,
      voucherWindowMinutes: 15,
      roomAuthMaxAttempts: 10,
      roomAuthWindowMinutes: 15,
      otpSendPerIpMax: 10,
      otpSendPerIpWindowMinutes: 15,
      otpVerifyMaxAttempts: 5,
    } as PortalPreferencesSettings;
  }

  // Master toggle: if disabled, allow all
  if (!prefs.appRateLimitEnabled) {
    return { allowed: true, retryAfter: null };
  }

  // Resolve max attempts and window based on method
  let maxAttempts: number;
  let windowMinutes: number;

  switch (method) {
    case 'voucher':
      maxAttempts = prefs.voucherMaxAttempts;
      windowMinutes = prefs.voucherWindowMinutes;
      break;
    case 'room':
      maxAttempts = prefs.roomAuthMaxAttempts;
      windowMinutes = prefs.roomAuthWindowMinutes;
      break;
    case 'otp_send':
      maxAttempts = prefs.otpSendPerIpMax;
      windowMinutes = prefs.otpSendPerIpWindowMinutes;
      break;
    case 'otp_verify':
      maxAttempts = prefs.otpVerifyMaxAttempts;
      windowMinutes = 15; // 15-min window for verify attempts
      break;
    case 'credentials':
      maxAttempts = prefs.credentialsMaxAttempts;
      windowMinutes = prefs.credentialsWindowMinutes;
      break;
    case 'social':
      maxAttempts = prefs.socialMaxAttempts;
      windowMinutes = prefs.socialWindowMinutes;
      break;
    case 'ldap':
      maxAttempts = prefs.ldapMaxAttempts;
      windowMinutes = prefs.ldapWindowMinutes;
      break;
    case 'mac_auth':
      maxAttempts = prefs.macAuthMaxAttempts;
      windowMinutes = prefs.macAuthWindowMinutes;
      break;
    case 'self_registration':
      maxAttempts = prefs.selfRegMaxAttempts;
      windowMinutes = prefs.selfRegWindowMinutes;
      break;
    case 'open_access':
      maxAttempts = prefs.openAccessMaxAttempts;
      windowMinutes = prefs.openAccessWindowMinutes;
      break;
    default:
      return { allowed: true, retryAfter: null };
  }

  // Safety: ensure sane values
  if (maxAttempts <= 0 || windowMinutes <= 0) {
    return { allowed: true, retryAfter: null };
  }

  const key = `wifi-auth:${method}:ip:${clientIp}`;
  const windowMs = windowMinutes * 60 * 1000;

  return rateLimit(key, maxAttempts, windowMs);
}