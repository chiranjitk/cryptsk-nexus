/**
 * WiFi Auto-Provisioning Service
 * 
 * Automatically provisions and deprovisions WiFi access based on booking events.
 * This service connects booking state changes to the WiFi module.
 * 
 * Flow:
 * - Check-in → Create WiFiUser with credentials → Sync to FreeRADIUS
 * - Check-out → Disable WiFiUser → Update FreeRADIUS
 * 
 * DO: Automatically provision WiFi on check-in
 * DO: Log all provisioning events
 * DO: Handle errors gracefully
 * DO NOT: Block check-in/check-out if WiFi provisioning fails
 */

import { db } from '@/lib/db';

import { wifiUserService } from './wifi-user-service';
import {
  BookingCheckedInEvent,
  BookingCheckedOutEvent,
  BookingCancelledEvent,
  bookingEventEmitter
} from '@/lib/events/booking-events';
import {
  generateCredentials,
  getDefaultCredentialPolicy,
  type CredentialPolicy,
} from './credential-engine';

// Import logProvisioning as standalone function for DB-persisted logging
const { logProvisioning } = wifiUserService;

export interface WiFiProvisioningResult {
  success: boolean;
  wifiUserId?: string;
  username?: string;
  password?: string;
  validFrom?: Date;
  validUntil?: Date;
  error?: string;
}

export interface WiFiDeprovisioningResult {
  success: boolean;
  wifiUserId?: string;
  error?: string;
}

export interface ProvisioningLogEntry {
  id: string;
  timestamp: Date;
  action: 'provision' | 'deprovision' | 'update' | 'error';
  bookingId: string;
  guestId?: string;
  wifiUserId?: string;
  username?: string;
  status: 'success' | 'failed' | 'partial';
  details: string;
  error?: string;
}

/**
 * Default bandwidth fallback (10 Mbps / 5 Mbps)
 * Used ONLY when no plan is configured anywhere (room type or AAA default).
 * Admins should configure a default plan in WiFi AAA settings to avoid this fallback.
 */
const DEFAULT_BANDWIDTH = { download: 10000000, upload: 5000000 };

// ─── Self-heal corrupt UUIDs in WiFiAAAConfig (runs once) ─────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let aaaHealed = false;

async function ensureAaaConfigHealed(): Promise<void> {
  if (aaaHealed) return;
  aaaHealed = true;
  try {
    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, "tenantId", "propertyId", "defaultPlanId", "lastSyncId" FROM "WiFiAAAConfig"`
    );
    for (const row of rows) {
      const fixes: string[] = [];
      for (const col of ['tenantId', 'propertyId', 'defaultPlanId', 'lastSyncId'] as const) {
        const val = row[col];
        if (val !== null && val !== undefined && typeof val === 'string' && !UUID_RE.test(val)) {
          fixes.push(`"${col}" = NULL`);
          console.warn(`[Provisioning] Corrupt UUID in AAA row ${row.id}: ${col} = ${JSON.stringify(val)} → NULL`);
        }
      }
      if (fixes.length > 0 && typeof row.id === 'string' && UUID_RE.test(row.id)) {
        await db.$executeRawUnsafe(
          `UPDATE "WiFiAAAConfig" SET ${fixes.join(', ')} WHERE id = '${row.id}'::uuid`
        );
        console.log(`[Provisioning] Repaired ${fixes.length} corrupt UUID(s) in AAA row ${row.id}`);
      }
    }
  } catch (err) {
    console.error('[Provisioning] AAA UUID heal failed (non-fatal):', err instanceof Error ? err.message : err);
    aaaHealed = false;
  }
}

class WiFiProvisioningService {
  private provisioningLogs: ProvisioningLogEntry[] = [];
  private maxLogEntries = 1000;

  constructor() {
    // Register event handlers
    this.registerEventHandlers();
  }

  /**
   * Register event handlers for booking events
   */
  private registerEventHandlers(): void {
    // Handle check-in event
    bookingEventEmitter.on('booking.checked_in', async (event) => {
      try {
        await this.handleCheckIn(event as BookingCheckedInEvent);
      } catch (error) {
        console.error('Error handling check-in event for WiFi provisioning:', error);
      }
    });

    // Handle check-out event
    bookingEventEmitter.on('booking.checked_out', async (event) => {
      try {
        await this.handleCheckOut(event as BookingCheckedOutEvent);
      } catch (error) {
        console.error('Error handling check-out event for WiFi deprovisioning:', error);
      }
    });

    // Handle cancellation event
    bookingEventEmitter.on('booking.cancelled', async (event) => {
      try {
        await this.handleCancellation(event as BookingCancelledEvent);
      } catch (error) {
        console.error('Error handling cancellation event for WiFi deprovisioning:', error);
      }
    });

    // HIGH-017B: Handle no-show event — deprovision WiFi for no-show guests
    bookingEventEmitter.on('booking.no_show', async (event) => {
      try {
        console.log(`[HIGH-017B] No-show event received for booking ${event.bookingId} — deprovisioning WiFi`);
        await this.deprovisionWiFiForBooking(event.bookingId);
      } catch (error) {
        console.error('Error handling no-show event for WiFi deprovisioning:', error);
      }
    });
  }

  /**
   * MED-008: Get configurable checkout grace period in hours.
   * Reads WiFiAAAConfig.checkoutGraceHours (default: 1 hour).
   * Falls back to any config if no property-specific config exists.
   */
  private async getCheckoutGraceHours(propertyId: string, tenantId?: string): Promise<number> {
    try {
      await ensureAaaConfigHealed();
      let config = await db.wiFiAAAConfig.findUnique({
        where: { propertyId },
        select: { checkoutGraceHours: true },
      });
      if (!config && tenantId) {
        config = await db.wiFiAAAConfig.findFirst({
          where: { tenantId },
          select: { checkoutGraceHours: true },
        });
      }
      if (!config) {
        config = await db.wiFiAAAConfig.findFirst({
          select: { checkoutGraceHours: true },
        });
      }
      // Default: 1 hour (was hardcoded 12 hours)
      const graceHours = config?.checkoutGraceHours;
      if (graceHours !== null && graceHours !== undefined && graceHours > 0) {
        return graceHours;
      }
      return 1;
    } catch {
      return 1; // safe default — 1 hour grace period
    }
  }

  /**
   * Check if auto-provision on check-in is enabled for a property.
   * Reads the WiFiAAAConfig.autoProvisionOnCheckin flag.
   * Falls back to any config if no property-specific config exists.
   * Default is true (enabled) when no config is found.
   */
  private async isAutoProvisionEnabled(propertyId: string): Promise<boolean> {
    try {
      await ensureAaaConfigHealed();
      let config = await db.wiFiAAAConfig.findUnique({
        where: { propertyId },
        select: { autoProvisionOnCheckin: true },
      });
      if (!config) {
        config = await db.wiFiAAAConfig.findFirst({
          select: { autoProvisionOnCheckin: true },
        });
      }
      return config?.autoProvisionOnCheckin !== false;
    } catch {
      return true; // safe default — don't break provisioning on DB error
    }
  }

  /**
   * Check if auto-deprovision on check-out is enabled for a property.
   * Reads the WiFiAAAConfig.autoDeprovisionOnCheckout flag.
   * Falls back to any config if no property-specific config exists.
   * Default is true (enabled) when no config is found.
   */
  private async isAutoDeprovisionEnabled(propertyId: string): Promise<boolean> {
    try {
      await ensureAaaConfigHealed();
      let config = await db.wiFiAAAConfig.findUnique({
        where: { propertyId },
        select: { autoDeprovisionOnCheckout: true },
      });
      if (!config) {
        config = await db.wiFiAAAConfig.findFirst({
          select: { autoDeprovisionOnCheckout: true },
        });
      }
      return config?.autoDeprovisionOnCheckout !== false;
    } catch {
      return true; // safe default — don't break deprovisioning on DB error
    }
  }

  /**
   * Handle check-in event - provision WiFi access
   * NOTE: This is a FALLBACK handler. The direct check-in routes (bookings/[id] and kiosk)
   * already call provisionWiFiForBooking() directly. This handler only fires if those
   * routes fail to provision, or if the event is emitted from another source.
   */
  private async handleCheckIn(event: BookingCheckedInEvent): Promise<void> {
    console.log(`[WiFi Provisioning] Processing check-in EVENT for booking ${event.bookingId}`);

    // Respect autoProvisionOnCheckin toggle — skip if disabled
    if (!(await this.isAutoProvisionEnabled(event.propertyId))) {
      console.log(`[WiFi Provisioning] Auto-provision is DISABLED for property ${event.propertyId} — skipping check-in provisioning for booking ${event.bookingId}`);
      return;
    }

    // Check if WiFi user already exists for this booking
    const existingUser = await wifiUserService.getUserByBooking(event.bookingId);
    if (existingUser) {
      const hasRadCheck = existingUser.radCheck && existingUser.radCheck.length > 0;
      const hasRadReply = existingUser.radReply && existingUser.radReply.length > 0;

      if (hasRadCheck && hasRadReply && existingUser.status === 'active') {
        // Check if the user was JUST created by the direct provisioning (within last 30 seconds).
        // The direct check-in routes call provisionWiFiForBooking() BEFORE emitting this event.
        // If the user was recently created, skip to avoid duplicate provisioning.
        const ageMs = Date.now() - new Date(existingUser.createdAt).getTime();
        if (ageMs < 30000) {
          console.log(`[WiFi Provisioning] WiFi user ${existingUser.username} was just created ${Math.round(ageMs)}ms ago by direct provisioning — skipping event-based provisioning`);
          return;
        }

        // User exists but was NOT recently created — it's from a previous check-in.
        // The direct provisioning already handles re-provisioning when format changes,
        // so log and skip here to avoid double-provisioning.
        console.log(`[WiFi Provisioning] WiFi user ${existingUser.username} already exists for booking ${event.bookingId} (age: ${Math.round(ageMs / 1000)}s). Skipping event-based provisioning — direct route handles this.`);
        return;
      }

      // Ghost user — clean up before re-provisioning
      console.log(`[WiFi Provisioning] WiFi user exists but missing RADIUS credentials (radCheck: ${existingUser.radCheck?.length || 0}, radReply: ${existingUser.radReply?.length || 0}, status: ${existingUser.status}). Re-provisioning for booking ${event.bookingId}`);
      try {
        await wifiUserService.deprovisionUser(existingUser.id);
      } catch (cleanupError) {
        console.warn(`[WiFi Provisioning] Failed to clean up ghost user ${existingUser.id}, will attempt fresh provision anyway:`, cleanupError);
      }
    }

    // Provision new WiFi user
    const result = await this.provisionWiFiForBooking({
      bookingId: event.bookingId,
      tenantId: event.tenantId,
      propertyId: event.propertyId,
      guestId: event.guestId,
      guestName: event.guestName,
      roomTypeId: event.roomTypeId,
      roomTypeName: event.roomTypeName,
      checkIn: event.checkIn,
      checkOut: event.checkOut,
      roomNumber: event.assignedRoomNumber,
      guestPhone: event.guestPhone,
      guestEmail: event.guestEmail,
    });

    if (result.success) {
      console.log(`[WiFi Provisioning] Successfully provisioned WiFi for booking ${event.bookingId}: ${result.username}`);
    } else {
      console.error(`[WiFi Provisioning] Failed to provision WiFi for booking ${event.bookingId}: ${result.error}`);
    }
  }

  /**
   * Handle check-out event - deprovision WiFi access
   */
  private async handleCheckOut(event: BookingCheckedOutEvent): Promise<void> {
    console.log(`[WiFi Provisioning] Processing check-out for booking ${event.bookingId}`);

    // Respect autoDeprovisionOnCheckout toggle — skip if disabled
    if (!(await this.isAutoDeprovisionEnabled(event.propertyId))) {
      console.log(`[WiFi Provisioning] Auto-deprovision is DISABLED for property ${event.propertyId} — skipping check-out deprovisioning for booking ${event.bookingId}`);
      return;
    }

    const result = await this.deprovisionWiFiForBooking(event.bookingId);

    if (result.success) {
      console.log(`[WiFi Provisioning] Successfully deprovisioned WiFi for booking ${event.bookingId}`);
    } else {
      console.error(`[WiFi Provisioning] Failed to deprovision WiFi for booking ${event.bookingId}: ${result.error}`);
    }
  }

  /**
   * Handle cancellation event - deprovision WiFi access
   */
  private async handleCancellation(event: BookingCancelledEvent): Promise<void> {
    console.log(`[WiFi Provisioning] Processing cancellation for booking ${event.bookingId}`);

    // Respect autoDeprovisionOnCheckout toggle — skip if disabled
    if (!(await this.isAutoDeprovisionEnabled(event.propertyId))) {
      console.log(`[WiFi Provisioning] Auto-deprovision is DISABLED for property ${event.propertyId} — skipping cancellation deprovisioning for booking ${event.bookingId}`);
      return;
    }

    const result = await this.deprovisionWiFiForBooking(event.bookingId);

    if (result.success) {
      console.log(`[WiFi Provisioning] Successfully deprovisioned WiFi for cancelled booking ${event.bookingId}`);
    } else if (result.error !== 'No WiFi user found for this booking') {
      console.error(`[WiFi Provisioning] Failed to deprovision WiFi for cancelled booking ${event.bookingId}: ${result.error}`);
    }
  }

  /**
   * Provision WiFi access for a booking
   */
  async provisionWiFiForBooking(input: {
    bookingId: string;
    tenantId: string;
    propertyId: string;
    guestId: string;
    guestName: string;
    roomTypeId: string;
    roomTypeName: string;
    checkIn: Date;
    checkOut: Date;
    roomNumber?: string;
    guestPhone?: string | null;
    guestEmail?: string | null;
    guestPassport?: string | null;
    /** HIGH-021: When true, skip deprovisioning existing WiFi user (for safe room move) */
    skipDeprovision?: boolean;
    /** Per-PMS credential policy override (from PmsIntegrationConfig.credentialPolicyOverride) */
    credentialPolicyOverride?: Record<string, unknown> | null;
  }): Promise<WiFiProvisioningResult> {
    try {
      // ─────────────────────────────────────────────────────────────────────
      // EXISTING USER CHECK — Always deprovision and re-provision on check-in
      // to ensure the CURRENT credential policy is applied. If the admin
      // changes the username format (e.g. from room_random to mobile), the
      // next check-in must use the new format — not reuse an old username.
      //
      // The event handler (handleCheckIn) skips if the user was created within
      // the last 30 seconds to avoid double-provisioning with the direct call.
      //
      // HIGH-021: skipDeprovision flag allows safe room move — create new
      // credentials BEFORE deprovisioning old ones, so a transient failure
      // never leaves the guest with no WiFi.
      // ─────────────────────────────────────────────────────────────────────
      if (!input.skipDeprovision) {
        const existingUser = await wifiUserService.getUserByBooking(input.bookingId);
        if (existingUser) {
          const hasRadCheck = existingUser.radCheck && existingUser.radCheck.length > 0;
          const hasRadReply = existingUser.radReply && existingUser.radReply.length > 0;

          if (hasRadCheck && hasRadReply && existingUser.status === 'active') {
            // Fully provisioned user exists — deprovision to apply current credential policy
            console.log(`[WiFi Provisioning] Deprovisioning existing user ${existingUser.username} (created: ${existingUser.createdAt.toISOString()}) to apply current credential policy for booking ${input.bookingId}`);
            try {
              await wifiUserService.deprovisionUser(existingUser.id);
            } catch (cleanupError) {
              console.warn(`[WiFi Provisioning] Failed to deprovision existing user ${existingUser.id}:`, cleanupError);
            }
          } else {
            // Ghost user — clean up before re-provisioning
            console.log(`[WiFi Provisioning] Cleaning up ghost WiFi user ${existingUser.id} (radCheck: ${existingUser.radCheck?.length || 0}, radReply: ${existingUser.radReply?.length || 0}, status: ${existingUser.status})`);
            try {
              await wifiUserService.deprovisionUser(existingUser.id);
            } catch (cleanupError) {
              console.warn(`[WiFi Provisioning] Failed to clean up ghost user ${existingUser.id}:`, cleanupError);
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // PLAN SELECTION — Priority Chain:
      //   1. Room Type → WiFi Plan (Tier 2: per-room-type mapping)
      //   2. AAA Config → Default Plan (Tier 1: property-level default)
      //   3. AAA Config → Default Bandwidth (legacy fallback, no plan record)
      //   4. System Fallback (10M/5M hardcoded, no plan record)
      // ─────────────────────────────────────────────────────────────────────
      let planId: string | undefined;
      let planValidityDays = 1;
      let planValidityMinutes = 1440;
      let planDataLimit: number | undefined;
      let planSessionLimit: number | undefined;
      let planIdleTimeoutSec: number | undefined;
      let bandwidth = { ...DEFAULT_BANDWIDTH }; // fallback
      let planSource = 'fallback'; // track where the plan came from

      console.log(`[WiFi Provisioning] Resolving plan for booking ${input.bookingId} (roomTypeId: ${input.roomTypeId || 'none'}, propertyId: ${input.propertyId})`);

      // Tier 2: Check if room type has a WiFi plan assigned
      if (input.roomTypeId) {
        const roomType = await db.roomType.findUnique({
          where: { id: input.roomTypeId },
          select: { wifiPlanId: true },
        });
        console.log(`[WiFi Provisioning] Tier 2 — roomType.wifiPlanId: ${roomType?.wifiPlanId || 'not set'}`);
        if (roomType?.wifiPlanId) {
          const roomTypePlan = await db.wiFiPlan.findFirst({
            where: { id: roomType.wifiPlanId, status: 'active' },
            select: {
              id: true, downloadSpeed: true, uploadSpeed: true,
              validityDays: true, validityMinutes: true, dataLimit: true, maxDevices: true, sessionLimit: true, name: true,
              idleTimeoutSec: true,
            },
          });
          if (roomTypePlan) {
            planId = roomTypePlan.id;
            planValidityDays = roomTypePlan.validityDays || 1;
            planValidityMinutes = roomTypePlan.validityMinutes || roomTypePlan.validityDays * 1440;
            planDataLimit = roomTypePlan.dataLimit;
            planSessionLimit = roomTypePlan.maxDevices || roomTypePlan.sessionLimit;
            planIdleTimeoutSec = roomTypePlan.idleTimeoutSec ?? undefined;
            bandwidth = {
              download: roomTypePlan.downloadSpeed * 1000000, // Mbps → bps
              upload: roomTypePlan.uploadSpeed * 1000000,
            };
            planSource = `room-type:${roomTypePlan.name}`;
            console.log(`[WiFi Provisioning] Plan selected from Room Type: "${roomTypePlan.name}" (${roomTypePlan.downloadSpeed}M/${roomTypePlan.uploadSpeed}M)`);
          }
        }
      }

      // Tier 1: Check AAA config default plan (if room type had no plan)
      //   - First try property-specific config
      //   - Fall back to ANY config for the same tenant (multi-property setups
      //     where the admin configured the plan on a different property page)
      if (!planId) {
        const aaaConfig = await db.wiFiAAAConfig.findUnique({
          where: { propertyId: input.propertyId },
          select: { defaultPlanId: true },
        });
        console.log(`[WiFi Provisioning] Tier 1 — property(${input.propertyId}) defaultPlanId: ${aaaConfig?.defaultPlanId || 'not set'}`);

        // Resolve the effective plan: try property-specific first, then tenant fallback
        let effectivePlanId = aaaConfig?.defaultPlanId;
        if (!effectivePlanId) {
          // Tenant-level fallback: find any AAA config for this tenant with a default plan
          const tenantConfigs = await db.wiFiAAAConfig.findMany({
            where: { tenantId: input.tenantId, defaultPlanId: { not: null } },
            select: { defaultPlanId: true, propertyId: true },
            take: 1,
          });
          if (tenantConfigs.length > 0) {
            effectivePlanId = tenantConfigs[0].defaultPlanId;
            console.log(`[WiFi Provisioning] Tier 1 — FALLBACK to tenant config (property ${tenantConfigs[0].propertyId}), defaultPlanId: ${effectivePlanId}`);
          }
        }

        if (effectivePlanId) {
          const defaultPlan = await db.wiFiPlan.findFirst({
            where: { id: effectivePlanId, status: 'active' },
            select: {
              id: true, downloadSpeed: true, uploadSpeed: true,
              validityDays: true, validityMinutes: true, dataLimit: true, maxDevices: true, sessionLimit: true, name: true,
              idleTimeoutSec: true,
            },
          });
          if (defaultPlan) {
            planId = defaultPlan.id;
            planValidityDays = defaultPlan.validityDays || 1;
            planValidityMinutes = defaultPlan.validityMinutes || defaultPlan.validityDays * 1440;
            planDataLimit = defaultPlan.dataLimit;
            planSessionLimit = defaultPlan.maxDevices || defaultPlan.sessionLimit;
            planIdleTimeoutSec = defaultPlan.idleTimeoutSec ?? undefined;
            bandwidth = {
              download: defaultPlan.downloadSpeed * 1000000,
              upload: defaultPlan.uploadSpeed * 1000000,
            };
            planSource = `aaa-default:${defaultPlan.name}`;
            console.log(`[WiFi Provisioning] Plan selected from AAA Default: "${defaultPlan.name}" (${defaultPlan.downloadSpeed}M/${defaultPlan.uploadSpeed}M)`);
          }
        }
      }

      // Fallback: Use AAA config default bandwidth (no plan record)
      if (!planId) {
        // Try property-specific first, then tenant fallback
        let aaaConfig = await db.wiFiAAAConfig.findUnique({
          where: { propertyId: input.propertyId },
          select: { defaultDownloadSpeed: true, defaultUploadSpeed: true },
        });
        if (!aaaConfig) {
          // Tenant fallback: use any config for this tenant
          aaaConfig = await db.wiFiAAAConfig.findFirst({
            where: { tenantId: input.tenantId },
            select: { defaultDownloadSpeed: true, defaultUploadSpeed: true },
          });
        }
        if (aaaConfig) {
          bandwidth = {
            download: (aaaConfig.defaultDownloadSpeed || 10) * 1000000,
            upload: (aaaConfig.defaultUploadSpeed || 10) * 1000000,
          };
          planSource = `aaa-bandwidth:${aaaConfig.defaultDownloadSpeed}M/${aaaConfig.defaultUploadSpeed}M`;
        }
        console.warn(`[WiFi Provisioning] No plan configured — using AAA default bandwidth (${bandwidth.download / 1000000}M/${bandwidth.upload / 1000000}M). Configure a WiFi plan in Room Type or AAA Settings.`);
      }

      // ─── PLAN SELECTION SUMMARY ─────────────────────────────────────────
      console.log(`[WiFi Provisioning] ✓ Plan resolved for booking ${input.bookingId}: source=${planSource}, planId=${planId || 'none'}, bandwidth=${bandwidth.download / 1000000}M/${bandwidth.upload / 1000000}M, validity=${planValidityMinutes}m`);
      if (!planId) {
        console.warn(`[WiFi Provisioning] ⚠ No WiFi plan assigned — user will get raw bandwidth only (no plan tracking, no data limits). Set a default plan in AAA Configuration > Auth tab.`);
      }
      // ────────────────────────────────────────────────────────────────────

      // Load credential policy from WiFiAAAConfig (also with tenant fallback)
      const credentialPolicy = await this.loadCredentialPolicy(input.propertyId, input.tenantId, input.credentialPolicyOverride);

      console.log(`[WiFi Provisioning] Credential policy for booking ${input.bookingId}: usernameFormat=${credentialPolicy.usernameFormat}, passwordFormat=${credentialPolicy.passwordFormat}, separator=${credentialPolicy.credentialSeparator}, guestPhone=${input.guestPhone || '(none)'}, guestEmail=${input.guestEmail || '(none)'}, roomNumber=${input.roomNumber || '(none)'}`);

      // Generate username & password based on configured format
      // GuestContext must include ALL guest data fields that credential-engine supports
      const { username, password } = generateCredentials(credentialPolicy, {
        firstName: input.guestName?.split(' ')[0],
        lastName: input.guestName?.split(' ').slice(1).join(' '),
        mobile: input.guestPhone,
        email: input.guestEmail,
        passport: input.guestPassport,
        roomNumber: input.roomNumber,
        bookingId: input.bookingId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
      }, input.bookingId);

      console.log(`[WiFi Provisioning] Generated credentials for booking ${input.bookingId}: username=${username}`);

      // MED-008: Calculate validity with configurable grace period
      //   validUntil: capped at checkout + grace period.
      //     Default grace: 1 hour (configurable per property via WiFiAAAConfig.checkoutGraceHours)
      //     The account lifetime is tied to the BOOKING, not the plan.
      //     (autoDeprovisionOnCheckout will delete credentials at checkout; this is the safety net.)
      const graceHours = await this.getCheckoutGraceHours(input.propertyId, input.tenantId);
      const checkoutGrace = new Date(input.checkOut.getTime() + graceHours * 60 * 60 * 1000);
      const validUntil = checkoutGrace;

      // Session timeout: MIN(plan validity, remaining time until checkout+grace)
      //   This ensures the NAS forces re-auth before the account expires.
      //   A 30-day plan on a 3-day stay gets sessionTimeout = ~3 days (not 30).
      //   After re-auth, FreeRADIUS re-checks account validity and rejects if expired.
      const now = new Date();
      const remainingMs = Math.max(0, checkoutGrace.getTime() - now.getTime());
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      const sessionTimeoutMinutes = Math.min(planValidityMinutes, remainingMinutes);

      console.log(`[WiFi Provisioning] Validity: validUntil=${validUntil.toISOString()} (checkout+${graceHours}h), sessionTimeout=${sessionTimeoutMinutes}m (min of plan=${planValidityMinutes}m, remaining=${remainingMinutes}m)`);

      // Create WiFi user with RADIUS credentials
      const result = await wifiUserService.provisionUser({
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        guestId: input.guestId,
        bookingId: input.bookingId,
        username,
        password,
        planId,
        validFrom: new Date(),
        validUntil,
        userType: 'guest',
        downloadSpeed: bandwidth.download,
        uploadSpeed: bandwidth.upload,
        sessionTimeoutMinutes, // plan-based session timeout (minutes)
        sessionLimit: planSessionLimit, // max concurrent sessions from plan
        dataLimit: planDataLimit, // data cap from plan (MB)
        idleTimeoutSeconds: planIdleTimeoutSec, // idle timeout from plan (seconds)
      });

      // Check data cap status (warn if approaching limit)
      try {
        const capStatus = await wifiUserService.getDataCapStatus(username);
        if (capStatus.isApproachingCap) {
          console.warn(`[WiFi Provisioning] User ${username} is approaching data cap: ${capStatus.usagePercent.toFixed(1)}% used`);
        }
        if (capStatus.isOverCap) {
          console.warn(`[WiFi Provisioning] User ${username} is OVER data cap. Disconnecting existing sessions.`);
          await wifiUserService.disconnectUser(username);
        }
      } catch (capError) {
        // Non-blocking — data cap check is advisory only
        console.warn('[WiFi Provisioning] Data cap check failed (non-blocking):', capError);
      }

      // Log successful provisioning to DB
      await logProvisioning({
        action: 'provision',
        username: result.credentials.username,
        propertyId: input.propertyId,
        tenantId: input.tenantId,
        guestId: input.guestId,
        bookingId: input.bookingId,
        result: 'success',
        details: `WiFi provisioned for ${input.guestName} - Room ${input.roomNumber || 'TBD'} [plan: ${planSource}]`,
      });

      return {
        success: true,
        wifiUserId: result.wifiUser.id,
        username: result.credentials.username,
        password: result.credentials.password,
        validFrom: result.credentials.validFrom,
        validUntil: result.credentials.validUntil,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log failed provisioning to DB
      await logProvisioning({
        action: 'provision',
        username: `pending_${input.bookingId?.slice(-6)}`,
        propertyId: input.propertyId,
        tenantId: input.tenantId,
        guestId: input.guestId,
        bookingId: input.bookingId,
        result: 'failed',
        details: `Failed to provision WiFi for ${input.guestName}`,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Deprovision WiFi access for a booking
   */
  async deprovisionWiFiForBooking(bookingId: string): Promise<WiFiDeprovisioningResult> {
    try {
      // Find WiFi user for this booking
      const wifiUser = await wifiUserService.getUserByBooking(bookingId);
      
      if (!wifiUser) {
        // Not an error - might not have WiFi access
        return {
          success: true,
          error: 'No WiFi user found for this booking',
        };
      }

      // Deprovision the user
      await wifiUserService.deprovisionUser(wifiUser.id);

      // CoA disconnect active sessions (non-blocking)
      try {
        await wifiUserService.disconnectUser(wifiUser.username);
        console.log(`[WiFi Provisioning] Sent CoA disconnect for ${wifiUser.username}`);
      } catch (coaError) {
        console.warn(`[WiFi Provisioning] CoA disconnect failed for ${wifiUser.username} (non-blocking):`, coaError);
      }

      // Log successful deprovisioning to DB
      await logProvisioning({
        action: 'deprovision',
        username: wifiUser.username,
        propertyId: wifiUser.propertyId,
        tenantId: wifiUser.tenantId,
        bookingId,
        result: 'success',
        details: `WiFi deprovisioned for user ${wifiUser.username}`,
      });

      return {
        success: true,
        wifiUserId: wifiUser.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log failed deprovisioning to DB
      await logProvisioning({
        action: 'deprovision',
        username: `unknown_${bookingId?.slice(-6)}`,
        propertyId: 'unknown',
        bookingId,
        result: 'failed',
        details: 'Failed to deprovision WiFi',
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Load credential policy from WiFiAAAConfig for a property.
   * Falls back to tenant-level config if no property-specific config exists.
   * 
   * IMPORTANT: Logs a ⚠ WARNING whenever the resolved usernameFormat differs
   * from what the admin configured, to catch silent fallbacks early.
   * 
   * Per-PMS override: if `override` is provided (from PmsIntegrationConfig.credentialPolicyOverride),
   * its keys are merged ON TOP of the AAA config, so a connection can force a specific
   * usernameFormat (e.g. lastname_room for OPERA) without changing the property-wide AAA policy.
   */
  private async loadCredentialPolicy(propertyId: string, tenantId: string, override?: Record<string, unknown> | null): Promise<CredentialPolicy> {
    try {
      console.log(`[WiFi Credential Policy] Loading for propertyId=${propertyId}, tenantId=${tenantId}${override ? ', with PMS override' : ''}`);

      // Try property-specific config first
      let config = await db.wiFiAAAConfig.findUnique({
        where: { propertyId },
      });

      if (config) {
        console.log(`[WiFi Credential Policy] ✓ Found property-specific config: id=${config.id}, usernameFormat=${JSON.stringify(config.usernameFormat)}, propertyId=${config.propertyId}`);
      } else {
        console.warn(`[WiFi Credential Policy] ⚠ No config found for propertyId=${propertyId} — trying tenant fallback`);

        // Tenant-level fallback: use any config for the same tenant
        const tenantConfigs = await db.wiFiAAAConfig.findMany({
          where: { tenantId },
          select: { id: true, propertyId: true, usernameFormat: true },
        });
        console.log(`[WiFi Credential Policy] Tenant has ${tenantConfigs.length} AAA config(s): ${tenantConfigs.map(c => `{propertyId: ${c.propertyId}, usernameFormat: ${JSON.stringify(c.usernameFormat)}}`).join(', ') || 'none'}`);

        config = tenantConfigs.length > 0
          ? await db.wiFiAAAConfig.findFirst({ where: { tenantId } })
          : null;

        if (config) {
          console.warn(`[WiFi Credential Policy] ⚠ Using tenant-fallback config from propertyId=${config.propertyId} (usernameFormat=${JSON.stringify(config.usernameFormat)}) — the booking's propertyId=${propertyId} has NO config. Save the AAA settings for the correct property!`);
        }
      }

      if (config) {
        const rawFormat = config.usernameFormat;
        const resolvedFormat = rawFormat || 'room_random';

        // WARN if the DB value is null/empty and we're silently falling back
        if (!rawFormat) {
          console.warn(`[WiFi Credential Policy] ⚠ usernameFormat is NULL/EMPTY in DB for config id=${config.id}, propertyId=${config.propertyId}. Falling back to 'room_random'. This means the admin's credential format setting was NOT saved properly!`);
        }

        // WARN if format is room_random (default) — might indicate the setting was never changed or save failed
        if (resolvedFormat === 'room_random') {
          console.warn(`[WiFi Credential Policy] ⚠ Using 'room_random' format for propertyId=${config.propertyId}. If the admin intended a different format (e.g., 'mobile'), the save may have failed or the wrong property's config is being used.`);
        }

        console.log(`[WiFi Credential Policy] Resolved: usernameFormat=${resolvedFormat}, passwordFormat=${config.passwordFormat || 'random_alphanumeric'}, separator=${config.credentialSeparator || '_'}`);

        const policy: CredentialPolicy = {
          usernameFormat: resolvedFormat,
          usernamePrefix: config.usernamePrefix,
          usernameCase: (config.usernameCase as 'lowercase' | 'uppercase' | 'as_is') || 'lowercase',
          usernameMinLength: config.usernameMinLength || 4,
          usernameMaxLength: config.usernameMaxLength || 32,
          passwordFormat: config.passwordFormat || 'random_alphanumeric',
          passwordFixedValue: config.passwordFixedValue,
          passwordLength: config.passwordLength || 8,
          passwordIncludeUppercase: config.passwordIncludeUppercase !== false,
          passwordIncludeNumbers: config.passwordIncludeNumbers !== false,
          passwordIncludeSymbols: config.passwordIncludeSymbols || false,
          credentialSeparator: config.credentialSeparator || '_',
          duplicateUsernameAction: (config.duplicateUsernameAction as 'append_random' | 'reject' | 'overwrite') || 'append_random',
        };

        // Apply per-PMS override (from PmsIntegrationConfig.credentialPolicyOverride).
        // Only known keys override; unknown keys are ignored to avoid breaking the policy shape.
        if (override && typeof override === 'object') {
          if (typeof override.usernameFormat === 'string' && override.usernameFormat.trim()) {
            console.log(`[WiFi Credential Policy] PMS override: usernameFormat ${policy.usernameFormat} → ${override.usernameFormat}`);
            policy.usernameFormat = override.usernameFormat;
          }
          if (typeof override.usernamePrefix === 'string') policy.usernamePrefix = override.usernamePrefix;
          if (typeof override.credentialSeparator === 'string') policy.credentialSeparator = override.credentialSeparator;
          if (typeof override.passwordFormat === 'string') policy.passwordFormat = override.passwordFormat;
          if (typeof override.usernameCase === 'string') policy.usernameCase = override.usernameCase as CredentialPolicy['usernameCase'];
        }

        return policy;
      }

      console.error(`[WiFi Credential Policy] ✗ NO AAA config found for propertyId=${propertyId} OR tenantId=${tenantId}. Using hardcoded default (room_random). The admin MUST save the AAA Configuration before check-in will use the correct format!`);
    } catch (error) {
      console.error('[WiFi Credential Policy] ✗ Failed to load credential policy:', error);
    }
    return getDefaultCredentialPolicy();
  }

  /**
   * Log a provisioning event
   */
  private logEvent(entry: Omit<ProvisioningLogEntry, 'id' | 'timestamp'> & { timestamp?: Date }): void {
    const logEntry: ProvisioningLogEntry = {
      id: `log_${Date.now()}_${crypto.getRandomValues(new Uint8Array(3)).reduce((s, b) => s + b.toString(36), '')}`,
      timestamp: entry.timestamp || new Date(),
      action: entry.action,
      bookingId: entry.bookingId,
      guestId: entry.guestId,
      wifiUserId: entry.wifiUserId,
      username: entry.username,
      status: entry.status,
      details: entry.details,
      error: entry.error,
    };

    this.provisioningLogs.push(logEntry);

    // Keep only the last N entries
    if (this.provisioningLogs.length > this.maxLogEntries) {
      this.provisioningLogs = this.provisioningLogs.slice(-this.maxLogEntries);
    }

    // Also log to console for debugging
    const logLevel = entry.status === 'failed' ? 'error' : 'info';
    console[logLevel](`[WiFi Provisioning] ${entry.action.toUpperCase()}: ${entry.details}`, {
      bookingId: entry.bookingId,
      username: entry.username,
      status: entry.status,
      error: entry.error,
    });
  }

  /**
   * Get provisioning logs
   */
  getLogs(options?: { 
    bookingId?: string; 
    action?: 'provision' | 'deprovision' | 'update' | 'error';
    limit?: number;
  }): ProvisioningLogEntry[] {
    let logs = [...this.provisioningLogs];

    if (options?.bookingId) {
      logs = logs.filter(log => log.bookingId === options.bookingId);
    }

    if (options?.action) {
      logs = logs.filter(log => log.action === options.action);
    }

    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.limit) {
      logs = logs.slice(0, options.limit);
    }

    return logs;
  }

  /**
   * Get WiFi credentials for a booking
   */
  async getWiFiCredentialsForBooking(bookingId: string): Promise<{
    username: string;
    password: string;
    validUntil: Date;
    status: string;
  } | null> {
    const wifiUser = await wifiUserService.getUserByBooking(bookingId);
    
    if (!wifiUser) {
      return null;
    }

    return {
      username: wifiUser.username,
      password: wifiUser.password,
      validUntil: wifiUser.validUntil,
      status: wifiUser.status,
    };
  }

  /**
   * Handle WiFi handoff during room move.
   * De-provisions old WiFi credentials and re-provisions with the new room number.
   * This is called AFTER the PMS room move succeeds (non-blocking).
   *
   * The re-provisioning also picks up any plan changes if the new room type
   * has a different WiFi plan assigned.
   *
   * HIGH-021: When USE_NEW_WIFI_LIFECYCLE is enabled, uses safe ordering:
   * create new credentials FIRST, then deprovision old ones. If new credential
   * creation fails, old credentials remain intact (guest keeps WiFi access).
   *
   * @param bookingId - The booking that was moved
   * @param newRoomNumber - The new room number (explicit, since booking.room may not be refreshed yet)
   * @returns Structured result with success/failure status and WiFi user details
   */
  async handleWifiRoomMove(
    bookingId: string,
    newRoomNumber: string
  ): Promise<{ success: boolean; message: string; username?: string; oldUsername?: string }> {
    const useNewLifecycle = process.env.USE_NEW_WIFI_LIFECYCLE === 'true';

    if (useNewLifecycle) {
      return this.handleWifiRoomMoveAtomic(bookingId, newRoomNumber);
    }

    // ── Legacy behavior: deprovision first, then provision (unsafe on transient failure) ──
    try {
      // Fetch the booking fresh — by this point the PMS transaction has already
      // updated roomId, roomTypeId, roomRate, so we get the new room type info
      const booking = await db.booking.findUnique({
        where: { id: bookingId },
        include: {
          primaryGuest: true,
          room: { select: { id: true, number: true } },
          roomType: true,
          property: { select: { id: true, name: true } },
        },
      });

      if (!booking) {
        return { success: false, message: 'Booking not found for WiFi handoff' };
      }

      if (booking.status !== 'checked_in') {
        return { success: false, message: `Booking status is '${booking.status}', expected 'checked_in'` };
      }

      // Check if a WiFi user exists for this booking
      const existingWifiUser = await wifiUserService.getUserByBooking(bookingId);
      if (!existingWifiUser) {
        console.log(`[RoomMove WiFi] No active WiFi user found for booking ${bookingId} — nothing to hand off`);
        return { success: true, message: 'No active WiFi user for this booking — no handoff needed' };
      }

      const oldUsername = existingWifiUser.username;
      console.log(`[RoomMove WiFi] Handoff for booking ${bookingId}: deprovisioning old user '${oldUsername}' and re-provisioning for room ${newRoomNumber}`);

      // Re-provision using provisionWiFiForBooking — this method already handles:
      //   1. Deprovisioning the existing WiFi user (old credentials)
      //   2. Plan selection based on (new) room type
      //   3. Credential generation with the new room number
      //   4. RADIUS sync
      const result = await this.provisionWiFiForBooking({
        bookingId: booking.id,
        tenantId: booking.tenantId,
        propertyId: booking.propertyId,
        guestId: booking.primaryGuestId,
        guestName: `${booking.primaryGuest.firstName} ${booking.primaryGuest.lastName}`,
        roomTypeId: booking.roomTypeId,
        roomTypeName: booking.roomType.name,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        roomNumber: newRoomNumber,
        guestPhone: booking.primaryGuest.phone,
        guestEmail: booking.primaryGuest.email,
      });

      if (result.success) {
        console.log(`[RoomMove WiFi] Handoff successful for booking ${bookingId}: '${oldUsername}' → '${result.username}' (room ${newRoomNumber})`);
        await logProvisioning({
          action: 'update',
          username: result.username,
          propertyId: booking.propertyId,
          tenantId: booking.tenantId,
          guestId: booking.primaryGuestId,
          bookingId,
          result: 'success',
          details: `Room move WiFi handoff: '${oldUsername}' → '${result.username}' (room ${newRoomNumber})`,
        });
        return {
          success: true,
          message: `WiFi credentials updated for room ${newRoomNumber}`,
          username: result.username,
          oldUsername,
        };
      } else {
        console.error(`[RoomMove WiFi] Handoff failed for booking ${bookingId}: ${result.error}`);
        await logProvisioning({
          action: 'update',
          username: oldUsername,
          propertyId: booking.propertyId,
          tenantId: booking.tenantId,
          guestId: booking.primaryGuestId,
          bookingId,
          result: 'failed',
          details: `Room move WiFi handoff failed: '${oldUsername}' could not be re-provisioned`,
          error: result.error,
        });
        return {
          success: false,
          message: `WiFi handoff failed: ${result.error}`,
          oldUsername,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[RoomMove WiFi] Handoff error for booking ${bookingId}:`, error);
      return {
        success: false,
        message: `WiFi handoff error: ${errorMessage}`,
      };
    }
  }

  /**
   * HIGH-021: Atomic WiFi room move — create new credentials FIRST, deprovision old AFTER.
   * Ensures a transient failure during provisioning never leaves the guest with no WiFi.
   *
   * Flow:
   *   1. Fetch booking + existing WiFi user (backup old info)
   *   2. Provision new WiFi user with skipDeprovision=true (old user stays active)
   *   3. On SUCCESS: deprovision old user + CoA disconnect
   *   4. On FAILURE: rollback — attempt to deprovision partially-created new user, keep old
   */
  private async handleWifiRoomMoveAtomic(
    bookingId: string,
    newRoomNumber: string
  ): Promise<{ success: boolean; message: string; username?: string; oldUsername?: string }> {
    try {
      // Fetch the booking fresh
      const booking = await db.booking.findUnique({
        where: { id: bookingId },
        include: {
          primaryGuest: true,
          room: { select: { id: true, number: true } },
          roomType: true,
          property: { select: { id: true, name: true } },
        },
      });

      if (!booking) {
        return { success: false, message: 'Booking not found for WiFi handoff' };
      }

      if (booking.status !== 'checked_in') {
        return { success: false, message: `Booking status is '${booking.status}', expected 'checked_in'` };
      }

      // Check if a WiFi user exists for this booking
      const existingWifiUser = await wifiUserService.getUserByBooking(bookingId);
      if (!existingWifiUser) {
        console.log(`[RoomMove WiFi] No active WiFi user found for booking ${bookingId} — nothing to hand off`);
        return { success: true, message: 'No active WiFi user for this booking — no handoff needed' };
      }

      const oldUserId = existingWifiUser.id;
      const oldUsername = existingWifiUser.username;
      console.log(`[RoomMove WiFi][HIGH-021] Atomic handoff for booking ${bookingId}: provisioning new credentials FIRST (old user '${oldUsername}' stays active until new is confirmed)`);

      // Step 1: Provision new WiFi user WITHOUT deprovisioning old (skipDeprovision: true)
      const newResult = await this.provisionWiFiForBooking({
        bookingId: booking.id,
        tenantId: booking.tenantId,
        propertyId: booking.propertyId,
        guestId: booking.primaryGuestId,
        guestName: `${booking.primaryGuest.firstName} ${booking.primaryGuest.lastName || ''}`.trim(),
        roomTypeId: booking.roomTypeId,
        roomTypeName: booking.roomType.name,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        roomNumber: newRoomNumber,
        guestPhone: booking.primaryGuest.phone,
        guestEmail: booking.primaryGuest.email,
        skipDeprovision: true, // HIGH-021: Keep old credentials alive until new ones are confirmed
      });

      if (!newResult.success) {
        // New provisioning failed — old user is still intact, guest retains WiFi access
        console.error(`[RoomMove WiFi][HIGH-021] New provisioning failed for booking ${bookingId}: ${newResult.error}. Old user '${oldUsername}' is UNAFFECTED.`);
        await logProvisioning({
          action: 'update',
          username: oldUsername,
          propertyId: booking.propertyId,
          tenantId: booking.tenantId,
          guestId: booking.primaryGuestId,
          bookingId,
          result: 'failed',
          details: `[HIGH-021] Atomic room move WiFi handoff failed: new credentials could not be created. Old credentials preserved for guest continuity.`,
          error: newResult.error,
        });
        return {
          success: false,
          message: `WiFi handoff failed: ${newResult.error}. Old credentials preserved — guest still has WiFi access.`,
          oldUsername,
        };
      }

      // Step 2: New provisioning succeeded — now safely deprovision old user
      console.log(`[RoomMove WiFi][HIGH-021] New credentials created successfully (${newResult.username}). Now deprovisioning old user '${oldUsername}'...`);
      try {
        await wifiUserService.deprovisionUser(oldUserId);

        // CoA disconnect old sessions (non-blocking)
        try {
          await wifiUserService.disconnectUser(oldUsername);
          console.log(`[RoomMove WiFi][HIGH-021] CoA disconnect sent for old user '${oldUsername}'`);
        } catch (coaError) {
          console.warn(`[RoomMove WiFi][HIGH-021] CoA disconnect failed for old user '${oldUsername}' (non-blocking):`, coaError);
        }

        console.log(`[RoomMove WiFi][HIGH-021] Atomic handoff successful for booking ${bookingId}: '${oldUsername}' → '${newResult.username}' (room ${newRoomNumber})`);
        await logProvisioning({
          action: 'update',
          username: newResult.username,
          propertyId: booking.propertyId,
          tenantId: booking.tenantId,
          guestId: booking.primaryGuestId,
          bookingId,
          result: 'success',
          details: `[HIGH-021] Atomic room move WiFi handoff: '${oldUsername}' → '${newResult.username}' (room ${newRoomNumber})`,
        });
        return {
          success: true,
          message: `WiFi credentials updated for room ${newRoomNumber}`,
          username: newResult.username,
          oldUsername,
        };
      } catch (deprovisionErr) {
        // CRITICAL: Old deprovision failed — we now have TWO active WiFi users
        // Attempt rollback: deprovision the NEW user to leave only the old one
        console.error(`[RoomMove WiFi][HIGH-021] CRITICAL: Old user deprovision failed AFTER new user was created. Both users may be active. Attempting rollback...`, deprovisionErr);
        try {
          if (newResult.wifiUserId) {
            await wifiUserService.deprovisionUser(newResult.wifiUserId);
            console.log(`[RoomMove WiFi][HIGH-021] Rollback successful: deprovisioned new user '${newResult.username}'. Old user '${oldUsername}' remains active.`);
          }
        } catch (rollbackErr) {
          console.error(`[RoomMove WiFi][HIGH-021] ROLLBACK FAILED: Both old ('${oldUsername}') and new ('${newResult.username}') WiFi users may be active. Manual cleanup required.`, rollbackErr);
        }

        await logProvisioning({
          action: 'update',
          username: oldUsername,
          propertyId: booking.propertyId,
          tenantId: booking.tenantId,
          guestId: booking.primaryGuestId,
          bookingId,
          result: 'partial',
          details: `[HIGH-021] Atomic room move WiFi handoff partial failure: new credentials created but old deprovision failed. Rollback attempted.`,
          error: deprovisionErr instanceof Error ? deprovisionErr.message : String(deprovisionErr),
        });
        return {
          success: false,
          message: `WiFi handoff partial failure — old credentials preserved, new credentials may need manual cleanup`,
          username: newResult.username,
          oldUsername,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[RoomMove WiFi][HIGH-021] Atomic handoff error for booking ${bookingId}:`, error);
      return {
        success: false,
        message: `WiFi handoff error: ${errorMessage}`,
      };
    }
  }

  /**
   * Manually trigger provisioning for a booking (for retry or manual override)
   */
  async manualProvision(bookingId: string): Promise<WiFiProvisioningResult> {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: {
        primaryGuest: true,
        roomType: true,
        room: true,
        property: true,
      },
    });

    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.status !== 'checked_in') {
      return { success: false, error: 'Booking is not checked in' };
    }

    return this.provisionWiFiForBooking({
      bookingId: booking.id,
      tenantId: booking.tenantId,
      propertyId: booking.propertyId,
      guestId: booking.primaryGuestId,
      guestName: `${booking.primaryGuest.firstName} ${booking.primaryGuest.lastName}`,
      roomTypeId: booking.roomTypeId,
      roomTypeName: booking.roomType.name,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      roomNumber: booking.room?.number,
      guestPhone: booking.primaryGuest.phone,
      guestEmail: booking.primaryGuest.email,
    });
  }

  /**
   * Manually trigger deprovisioning for a booking (for retry or manual override)
   */
  async manualDeprovision(bookingId: string): Promise<WiFiDeprovisioningResult> {
    return this.deprovisionWiFiForBooking(bookingId);
  }
}

/**
 * Extend WiFi validity when a booking is extended (late checkout, date change, etc.).
 * Updates WiFiUser.validUntil and RadReply Session-Timeout to match the new checkout + grace.
 *
 * Called by:
 *   - Late checkout approval (POST/PUT /api/bookings/late-checkout)
 *   - Booking update when checkOut date changes (PUT/PATCH /api/bookings/[id])
 *
 * @param bookingId — the booking whose checkout was extended
 * @param newCheckout — the new checkout date
 * @param graceHours — hours after checkout before WiFi expires (default: from config, MED-008: 1h)
 */
export async function extendWifiValidity(
  bookingId: string,
  newCheckout: Date,
  graceHours?: number,
  /** HIGH-021: Optional Prisma transaction client for atomic booking+WiFi extension */
  tx?: Parameters<Parameters<typeof db.$transaction>[0]>[0],
): Promise<{ success: boolean; error?: string }> {
  try {
    // HIGH-021: Use provided transaction client or create a new one
    const execute = tx
      ? (fn: (client: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<void>) => fn(tx)
      : (fn: (client: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<void>) => db.$transaction(fn);

    return execute(async (txClient) => {
      const wifiUser = await txClient.wiFiUser.findFirst({
        where: { bookingId, status: { in: ['active', 'suspended'] } },
        select: { id: true, username: true, propertyId: true, tenantId: true },
      });

      if (!wifiUser) {
        console.log(`[WiFi Extension] No active WiFi user found for booking ${bookingId} — nothing to extend`);
        return { success: true }; // No user to extend is not an error
      }

      // MED-008: Resolve grace hours from config if not explicitly provided
      const effectiveGraceHours = graceHours ?? await wifiProvisioningService.getCheckoutGraceHours(wifiUser.propertyId, wifiUser.tenantId);
      const newValidUntil = new Date(newCheckout.getTime() + effectiveGraceHours * 60 * 60 * 1000);
      const now = new Date();
      const remainingMs = Math.max(0, newValidUntil.getTime() - now.getTime());
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      const sessionTimeoutSec = remainingMinutes * 60;

      console.log(`[WiFi Extension][HIGH-021] Extending WiFi validity for booking ${bookingId} to ${newValidUntil.toISOString()} (sessionTimeout: ${sessionTimeoutSec}s, grace: ${effectiveGraceHours}h)`);
      // 1. Update WiFiUser.validUntil
      await txClient.wiFiUser.update({
        where: { id: wifiUser.id },
        data: {
          validUntil: newValidUntil,
          radiusSynced: true,
          radiusSyncedAt: new Date(),
        },
      });

      // 2. Update RadReply Session-Timeout (per-user override)
      const existingTimeout = await txClient.radReply.findFirst({
        where: {
          username: wifiUser.username,
          attribute: 'Session-Timeout',
        },
      });

      if (existingTimeout) {
        await txClient.radReply.update({
          where: { id: existingTimeout.id },
          data: { value: String(sessionTimeoutSec) },
        });
      } else {
        await txClient.radReply.create({
          data: {
            username: wifiUser.username,
            attribute: 'Session-Timeout',
            op: ':=',
            value: String(sessionTimeoutSec),
            isActive: true,
          },
        });
      }

      // 3. Update Cryptsk-Session-Timeout if present
      const existingCryptskTimeout = await txClient.radReply.findFirst({
        where: {
          username: wifiUser.username,
          attribute: 'Cryptsk-Session-Timeout',
        },
      });

      if (existingCryptskTimeout) {
        await txClient.radReply.update({
          where: { id: existingCryptskTimeout.id },
          data: { value: String(sessionTimeoutSec) },
        });
      }

      return { success: true };
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[WiFi Extension] Failed to extend WiFi validity for booking ${bookingId}:`, msg);
    return { success: false, error: msg };
  }
}

// Singleton instance
export const wifiProvisioningService = new WiFiProvisioningService();

// Export type for external use
// (ProvisioningLogEntry is already exported at the interface declaration)
