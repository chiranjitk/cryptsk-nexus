/**
 * Pre-Arrival WiFi Delivery Scheduler
 *
 * Cron Job #5 for StaySuite HospitalityOS.
 *
 * Scans all enabled WiFiPreArrivalConfig records, identifies confirmed bookings
 * whose check-in date falls within the configured delivery window, generates
 * WiFi credentials (when autoGenerateCreds is enabled), queues notification
 * records (email/SMS) in pending state, and marks bookings as preArrivalSent
 * to prevent duplicate delivery.
 *
 * IMPORTANT: This service only QUEUES the delivery. The actual send is handled
 * by the existing /api/wifi/pre-arrival/send route (or a separate notification
 * worker that processes pending NotificationLog records).
 *
 * Usage:
 *   import { processPreArrivalDelivery } from '@/lib/wifi/services/pre-arrival-scheduler';
 *   const result = await processPreArrivalDelivery();
 *   // { processed: number; credentialsGenerated: number; notificationsQueued: number }
 */

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { randomBytes } from 'crypto';
import { sendEmailForTenant } from '@/lib/adapters/email';
import { sendSMSForTenant } from '@/lib/adapters/sms';
import type { EmailOptions } from '@/lib/adapters/email';
import type { SMSOptions } from '@/lib/adapters/sms';

// ─── Return Type ────────────────────────────────────────────────────

export interface PreArrivalDeliveryResult {
  processed: number;
  credentialsGenerated: number;
  notificationsQueued: number;
}

// ─── Password Generator (lightweight, no confusing chars) ───────────

function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// ─── Core Logic ─────────────────────────────────────────────────────

/**
 * Process pre-arrival WiFi delivery for all enabled properties.
 *
 * Algorithm:
 *  1. Fetch every enabled WiFiPreArrivalConfig.
 *  2. For each config, build a delivery window:
 *       windowStart = NOW()
 *       windowEnd   = NOW() + hoursBeforeArrival hours
 *  3. Query confirmed bookings whose checkIn falls inside the window and
 *     that have not yet been sent (preArrivalSent is false or null).
 *  4. For each matching booking (defensive try/catch per booking):
 *     a. If autoGenerateCreds → create a WiFiUser record.
 *     b. If sendEmail and guest has email → create a pending NotificationLog (email).
 *     c. If sendSms   and guest has phone → create a pending NotificationLog (sms).
 *     d. Mark booking.preArrivalSent = true.
 *  5. Return aggregate counts.
 */
export async function processPreArrivalDelivery(): Promise<PreArrivalDeliveryResult> {
  const result: PreArrivalDeliveryResult = {
    processed: 0,
    credentialsGenerated: 0,
    notificationsQueued: 0,
  };

  try {
    // ── Step 1: Fetch all enabled pre-arrival configs ─────────────────
    const configs = await db.wiFiPreArrivalConfig.findMany({
      where: { enabled: true },
    });

    if (configs.length === 0) {
      console.log('[PreArrivalScheduler] No enabled pre-arrival configs found — nothing to process.');
      return result;
    }

    console.log(`[PreArrivalScheduler] Found ${configs.length} enabled pre-arrival config(s).`);

    const now = new Date();

    // ── Step 2-4: Process each config ────────────────────────────────
    for (const config of configs) {
      try {
        // Calculate delivery window
        const windowStart = now;
        const windowEnd = new Date(now.getTime() + config.hoursBeforeArrival * 60 * 60 * 1000);

        console.log(
          `[PreArrivalScheduler] Processing property ${config.propertyId} (tenant ${config.tenantId}): ` +
          `window = ${windowStart.toISOString()} .. ${windowEnd.toISOString()}, ` +
          `hoursBeforeArrival = ${config.hoursBeforeArrival}`,
        );

        // ── Step 3: Find eligible bookings ────────────────────────────
        const bookings = await db.booking.findMany({
          where: {
            tenantId: config.tenantId,
            propertyId: config.propertyId,
            status: 'confirmed',
            checkIn: {
              gte: windowStart,
              lte: windowEnd,
            },
            preArrivalSent: false,
          },
          include: {
            primaryGuest: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            property: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        if (bookings.length === 0) {
          console.log(`[PreArrivalScheduler] No eligible bookings for property ${config.propertyId}.`);
          continue;
        }

        console.log(`[PreArrivalScheduler] Found ${bookings.length} eligible booking(s) for property ${config.propertyId}.`);

        // ── Step 4: Process each booking (defensive — one failure must not stop all) ──
        for (const booking of bookings) {
          try {
            // Advisory lock per booking to prevent concurrent processing
            // (e.g. multi-pod deployments or overlapping cron executions)
            // M12 FIX: Use a hash of the full UUID instead of first 4 chars
            // (16^4 = 65K possible IDs → high collision risk with many bookings).
            // FNV-1a-inspired 32-bit hash distributes across the full int32 space.
            let h = 0x811c9dc5;
            for (let i = 0; i < (booking.id as string).length; i++) {
              h ^= (booking.id as string).charCodeAt(i);
              h = Math.imul(h, 0x01000193);
            }
            const lockId = Math.abs(h >>> 0);

            // Non-blocking lock: if another process is already handling this booking, skip it
            const lockResult = await db.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>(
              Prisma.sql`SELECT pg_try_advisory_lock(${Math.abs(lockId)}) as pg_try_advisory_lock`
            );
            const lockAcquired = lockResult[0]?.pg_try_advisory_lock ?? false;
            if (!lockAcquired) {
              console.log(`[PreArrivalScheduler] Skipping booking ${booking.id} — lock held by another process`);
              continue;
            }
            try {
              await processBooking(booking, config, result);
            } finally {
              await db.$executeRaw(Prisma.sql`SELECT pg_advisory_unlock(${Math.abs(lockId)})`);
            }
          } catch (bookingError) {
            console.error(
              `[PreArrivalScheduler] Error processing booking ${booking.id} ` +
              `(confirmation: ${booking.confirmationCode}):`,
              bookingError,
            );
            // Continue with next booking
          }
        }
      } catch (configError) {
        console.error(
          `[PreArrivalScheduler] Error processing config for property ${config.propertyId}:`,
          configError,
        );
        // Continue with next config
      }
    }
  } catch (error) {
    console.error('[PreArrivalScheduler] Unhandled error in processPreArrivalDelivery:', error);
  }

  console.log(
    `[PreArrivalScheduler] Completed: processed=${result.processed}, ` +
    `credentialsGenerated=${result.credentialsGenerated}, ` +
    `notificationsQueued=${result.notificationsQueued}`,
  );

  return result;
}

// ─── Per-Booking Processing ─────────────────────────────────────────

/**
 * Process a single booking:
 *  - Generate WiFi credentials if configured
 *  - Queue pending notifications (email + SMS)
 *  - Mark booking as preArrivalSent
 */
async function processBooking(
  booking: {
    id: string;
    tenantId: string;
    propertyId: string;
    confirmationCode: string;
    checkIn: Date;
    checkOut: Date;
    primaryGuest: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
    };
    property: {
      id: string;
      name: string;
    };
  },
  config: {
    tenantId: string;
    propertyId: string;
    autoGenerateCreds: boolean;
    sendEmail: boolean;
    sendSms: boolean;
    planId: string | null;
  },
  result: PreArrivalDeliveryResult,
): Promise<void> {
  const guest = booking.primaryGuest;
  const property = booking.property;
  const wifiUsername = `guest_${guest.firstName.toLowerCase().replace(/[^a-z]/g, '')}_${booking.confirmationCode.toLowerCase()}`;

  // Track whether at least one channel succeeded
  let anyChannelSucceeded = false;

  // ── 4a: Generate WiFi credentials (inside transaction for atomicity) ──
  if (config.autoGenerateCreds) {
    try {
      await db.$transaction(async (tx) => {
        // Check if a WiFi user already exists for this booking (avoid duplicates)
        const existingUser = await tx.wiFiUser.findFirst({
          where: {
            bookingId: booking.id,
            status: 'active',
          },
        });

        if (!existingUser) {
          // Build a unique username
          let finalUsername = wifiUsername;
          let counter = 1;
          while (await tx.wiFiUser.findUnique({ where: { username: finalUsername } })) {
            finalUsername = `${wifiUsername}${counter}`;
            counter++;
          }

          const password = generatePassword();

          // Determine validity from plan (if configured) or booking dates
          const validFrom = new Date();
          let validUntil = new Date(booking.checkOut);
          if (booking.checkOut <= validFrom) {
            validUntil.setDate(validUntil.getDate() + 1);
          }

          if (config.planId) {
            const plan = await tx.wiFiPlan.findUnique({
              where: { id: config.planId },
              select: { validityMinutes: true },
            });
            if (plan?.validityMinutes) {
              validUntil = new Date(validFrom.getTime() + plan.validityMinutes * 60 * 1000);
            }
          }

          await tx.wiFiUser.create({
            data: {
              tenantId: config.tenantId,
              propertyId: config.propertyId,
              username: finalUsername,
              password,
              guestId: guest.id,
              bookingId: booking.id,
              userType: 'guest',
              planId: config.planId,
              validFrom,
              validUntil,
              status: 'active',
            },
          });

          result.credentialsGenerated++;
          console.log(
            `[PreArrivalScheduler] Generated WiFi credentials for booking ${booking.id}: ` +
            `username=${finalUsername}`,
          );
        } else {
          console.log(
            `[PreArrivalScheduler] WiFi user already exists for booking ${booking.id} (${existingUser.username}) — skipping credential generation.`,
          );
        }
      });
    } catch (credError) {
      console.error(
        `[PreArrivalScheduler] Failed to generate credentials for booking ${booking.id}:`,
        credError,
      );
      // Don't abort — still queue notifications if possible
    }
  }

  // ── 4b: Send REAL email notification ─────────────────────────────
  if (config.sendEmail && guest.email) {
    try {
      // Look up the WiFi user credentials for the email body
      const wifiUser = await db.wiFiUser.findFirst({
        where: { bookingId: booking.id, status: 'active' },
        select: { username: true, password: true },
      });

      const ssid = `${property.name.replace(/[^a-zA-Z0-9]/g, '')}_Guest`;
      const emailText = wifiUser
        ? `Dear ${guest.firstName},\n\nYour WiFi at ${property.name}:\nNetwork: ${ssid}\nUsername: ${wifiUser.username}\nPassword: ${wifiUser.password}\n\nCheck-in: ${new Date(booking.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}\nCheck-out: ${new Date(booking.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\nConfirmation: ${booking.confirmationCode}\n\nEnjoy your stay!`
        : `WiFi credentials are being prepared for ${guest.firstName} ${guest.lastName}. They will be available at check-in.`;

      const emailOpts: EmailOptions = {
        to: guest.email,
        subject: `Your WiFi Credentials for ${property.name}`,
        recipientId: guest.id,
        text: emailText,
        html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px"><h2 style="color:#0d9488">${property.name}</h2><p>Dear ${guest.firstName},</p>${wifiUser ? `<div style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#0f766e;font-weight:600">WiFi Access Details</p><p style="margin:4px 0">Network: <strong>${ssid}</strong></p><p style="margin:4px 0">Username: <strong>${wifiUser.username}</strong></p><p style="margin:4px 0">Password: <strong>${wifiUser.password}</strong></p></div>` : ''}<p style="color:#6b7280;font-size:13px">Check-in: ${new Date(booking.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} | Check-out: ${new Date(booking.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p><p style="color:#6b7280;font-size:13px">Confirmation: ${booking.confirmationCode}</p></body></html>`,
      };

      const emailResult = await sendEmailForTenant(config.tenantId, emailOpts);
      const emailStatus = emailResult.success ? 'sent' : 'failed';

      await db.notificationLog.create({
        data: {
          tenantId: config.tenantId,
          recipientType: 'guest',
          recipientId: guest.id,
          recipientEmail: guest.email,
          channel: 'email',
          subject: emailOpts.subject,
          body: emailText,
          status: emailStatus,
          sentAt: emailResult.success ? new Date() : null,
          errorMessage: emailResult.error,
          externalId: emailResult.messageId,
        },
      });

      result.notificationsQueued++;
      if (emailResult.success) anyChannelSucceeded = true;
      console.log(
        `[PreArrivalScheduler] Email ${emailStatus} to ${guest.email} for booking ${booking.id}` +
        (emailResult.messageId ? ` (${emailResult.messageId})` : '') +
        (emailResult.error ? ` — ${emailResult.error}` : ''),
      );
    } catch (emailError) {
      console.error(
        `[PreArrivalScheduler] Failed to send email for booking ${booking.id}:`,
        emailError,
      );
    }
  }

  // ── 4c: Send REAL SMS notification ─────────────────────────────────
  if (config.sendSms && guest.phone) {
    try {
      const wifiUser = await db.wiFiUser.findFirst({
        where: { bookingId: booking.id, status: 'active' },
        select: { username: true, password: true },
      });

      const ssid = `${property.name.replace(/[^a-zA-Z0-9]/g, '')}_Guest`;
      const smsMessage = wifiUser
        ? `Your WiFi at ${property.name}: Network: ${ssid}, Username: ${wifiUser.username}, Password: ${wifiUser.password}`
        : `Your WiFi credentials at ${property.name} will be available at check-in.`;

      const smsOpts: SMSOptions = {
        to: guest.phone,
        message: smsMessage,
        recipientId: guest.id,
      };

      const smsResult = await sendSMSForTenant(config.tenantId, smsOpts);
      const smsStatus = smsResult.success ? 'sent' : 'failed';

      await db.notificationLog.create({
        data: {
          tenantId: config.tenantId,
          recipientType: 'guest',
          recipientId: guest.id,
          recipientPhone: guest.phone,
          channel: 'sms',
          subject: '[WiFi Pre-Arrival] WiFi Credentials',
          body: smsMessage,
          status: smsStatus,
          sentAt: smsResult.success ? new Date() : null,
          errorMessage: smsResult.error,
          externalId: smsResult.messageId,
        },
      });

      result.notificationsQueued++;
      if (smsResult.success) anyChannelSucceeded = true;
      console.log(
        `[PreArrivalScheduler] SMS ${smsStatus} to ${guest.phone} for booking ${booking.id}` +
        (smsResult.messageId ? ` (${smsResult.messageId})` : '') +
        (smsResult.error ? ` — ${smsResult.error}` : ''),
      );
    } catch (smsError) {
      console.error(
        `[PreArrivalScheduler] Failed to send SMS for booking ${booking.id}:`,
        smsError,
      );
    }
  }

  // ── 4d: Mark booking as sent (only if at least one channel succeeded) ──
  result.processed++;
  if (anyChannelSucceeded) {
    await db.booking.update({
      where: { id: booking.id },
      data: { preArrivalSent: true },
    });
    console.log(
      `[PreArrivalScheduler] ✓ Booking ${booking.id} (${booking.confirmationCode}) processed and marked as preArrivalSent.`,
    );
  } else {
    console.warn(
      `[PreArrivalScheduler] ✗ Booking ${booking.id} (${booking.confirmationCode}): all notification channels failed — NOT marked as preArrivalSent.`,
    );
  }
}

// ─── Preview / Count Helpers ────────────────────────────────────────

/**
 * Count bookings that are currently within the delivery window across all
 * enabled properties but have NOT yet been sent.
 *
 * Used by the GET handler on the cron endpoint to provide visibility into
 * upcoming deliveries without actually processing them.
 */
export async function countUpcomingDeliveries(): Promise<{
  total: number;
  byProperty: Array<{ propertyId: string; tenantId: string; hoursBeforeArrival: number; count: number }>;
}> {
  const configs = await db.wiFiPreArrivalConfig.findMany({
    where: { enabled: true },
    select: {
      tenantId: true,
      propertyId: true,
      hoursBeforeArrival: true,
    },
  });

  const now = new Date();
  let total = 0;
  const byProperty: Array<{ propertyId: string; tenantId: string; hoursBeforeArrival: number; count: number }> = [];

  for (const config of configs) {
    const windowEnd = new Date(now.getTime() + config.hoursBeforeArrival * 60 * 60 * 1000);

    const count = await db.booking.count({
      where: {
        tenantId: config.tenantId,
        propertyId: config.propertyId,
        status: 'confirmed',
        checkIn: {
          gte: now,
          lte: windowEnd,
        },
        preArrivalSent: false,
      },
    });

    if (count > 0) {
      byProperty.push({
        propertyId: config.propertyId,
        tenantId: config.tenantId,
        hoursBeforeArrival: config.hoursBeforeArrival,
        count,
      });
      total += count;
    }
  }

  return { total, byProperty };
}
