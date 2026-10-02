/**
 * WiFi Auth Handler Types
 *
 * Shared interfaces and types for the WiFi authentication handler modules.
 * All handler functions receive an AuthContext containing the resolved
 * request data and portal configuration.
 */

import { NextRequest } from 'next/server';
import type { ExternalGatewayConfig } from '@/lib/wifi/utils/external-gateway';

/** Guest info payload from captive portal form */
export interface GuestInfoPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  passport?: string;
  bookingId?: string;
}

/** Marketing consent flags */
export interface MarketingConsent {
  emailConsent?: boolean;
  smsConsent?: boolean;
}

/** IP pool match result */
export interface MatchedPool {
  poolId: string;
  poolName: string;
  subnet: string | null;
  gateway: string | null;
  captivePortal: boolean;
  isDefault: boolean;
  /** NAT mode: 'private_masq' | 'private_snat' | 'public' */
  natMode: string;
  /** SNAT algorithm: 'round_robin' | 'hash_ip' | 'first_available' | null */
  snatAlgorithm: string | null;
  /** SNAT IP ranges: [{startIp, endIp}] | null */
  snatRanges: { startIp: string; endIp: string }[] | null;
  /** WAN interface to pin masquerade to (e.g. 'eth1'). Null = auto/MultiWAN decides. */
  natWanInterface: string | null;
  /** Enable hairpin NAT (DNAT for return traffic to SNAT IPs) */
  hairpinNat: boolean;
  /** Sticky SNAT: minutes to keep SNAT assignment after logout (0 = immediate release) */
  snatStickyMinutes: number;
}

/**
 * Portal configuration resolved from the CaptivePortal table.
 * Subset of fields used by auth handlers.
 */
export interface PortalConfig {
  id: string;
  propertyId: string;
  tenantId: string;
  sessionTimeout: number;
  maxBandwidthDown: number;
  maxBandwidthUp: number;
  roamingMode?: any;
  captchaEnabled: boolean;
  captchaSecretKey: string | null;
  idleTimeout?: number;
}

/**
 * Auth Context — all resolved variables shared across handler functions.
 * Built by the auth-router before dispatching to a specific handler.
 */
export interface AuthContext {
  /** Original NextRequest object */
  request: NextRequest;

  // ── Parsed request body fields ──
  method: string;
  portalSlug?: string;
  voucherCode?: string;
  roomNumber?: string;
  lastName?: string;
  username?: string;
  password?: string;
  phoneNumber?: string;
  email?: string;
  otpCode?: string;
  guestInfo?: GuestInfoPayload;
  normalizedGuestInfo?: GuestInfoPayload;
  marketingEmailConsent?: string;
  marketingSmsConsent?: string;
  macAddress?: string;
  fingerprintHash?: string;
  storageToken?: string;
  socialProvider?: string;
  socialToken?: string;
  captchaToken?: string;
  bodyClientIp?: string;

  // ── Resolved client info ──
  resolvedClientIp: string;
  effectiveMac?: string;
  deviceMac: string | null;
  clientIpForMac: string;

  // ── Portal configuration ──
  portal: PortalConfig | null;
  portalSessionTimeoutMin: number;
  bwDown: number;
  bwUp: number;

  // ── Gateway config ──
  externalGateway: ExternalGatewayConfig | null;

  // ── IP pool info ──
  portalPlanIpPoolId: string | null;
  portalPlanPoolIds: string[];
}

/** Valid authentication method names */
export const VALID_AUTH_METHODS = [
  'voucher',
  'room_number',
  'pms_credentials',
  'sms_otp',
  'email_otp',
  'open_access',
  'credentials',
  'ldap',
  'mac_auth',
  'social',
  'self_registration',
] as const;

export type AuthMethod = (typeof VALID_AUTH_METHODS)[number];
