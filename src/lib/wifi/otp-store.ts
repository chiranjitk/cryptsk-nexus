/**
 * OTP Store — Redis-first with PG fallback
 *
 * Wrapper that tries Redis first for reads, writes to both.
 * Falls back to PG (pg-otp-store.ts) when Redis is unavailable.
 */

// Re-export types from PG store
export type { OtpEntry, OtpRateEntry } from './pg-otp-store';

// Import PG functions
import {
  otpGet as pgOtpGet,
  otpSet as pgOtpSet,
  otpDelete as pgOtpDelete,
  otpIncrementAttempts as pgOtpIncrementAttempts,
  otpRateLimit as pgOtpRateLimit,
  otpCleanup as pgOtpCleanup,
  otpRateCleanup as pgOtpRateCleanup,
} from './pg-otp-store';

import type { OtpEntry } from './pg-otp-store';

/**
 * Get OTP — Redis first, PG fallback.
 */
export async function otpGet(key: string): Promise<OtpEntry | null> {
  try {
    const { getRedis, isRedisReady } = await import('@/lib/redis');
    if (isRedisReady()) {
      const client = await getRedis();
      if (client) {
        const data = await client.hGetAll(`otp:${key}`);
        if (data && data.code) {
          return {
            code: data.code,
            expiresAt: parseInt(data.expiresAt, 10),
            phone: data.phone || undefined,
            email: data.email || undefined,
            guestId: data.guestId || undefined,
            roomNumber: data.roomNumber || undefined,
            planId: data.planId || undefined,
            attempts: parseInt(data.attempts || '0', 10),
          };
        }
      }
    }
  } catch { /* fall through to PG */ }
  
  return pgOtpGet(key);
}

/**
 * Set OTP — write to both Redis and PG.
 */
export async function otpSet(key: string, entry: OtpEntry): Promise<void> {
  // Write to PG first (source of truth)
  await pgOtpSet(key, entry);
  
  // Also cache in Redis for fast reads
  try {
    const { getRedis, isRedisReady } = await import('@/lib/redis');
    if (isRedisReady()) {
      const client = await getRedis();
      if (client) {
        const ttlMs = entry.expiresAt - Date.now();
        const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
        const redisKey = `otp:${key}`;
        await client.hSet(redisKey, {
          code: entry.code,
          expiresAt: String(entry.expiresAt),
          phone: entry.phone || '',
          email: entry.email || '',
          guestId: entry.guestId || '',
          roomNumber: entry.roomNumber || '',
          planId: entry.planId || '',
          attempts: String(entry.attempts),
        });
        await client.expire(redisKey, ttlSec);
      }
    }
  } catch { /* non-critical */ }
}

/**
 * Delete OTP — remove from both.
 */
export async function otpDelete(key: string): Promise<void> {
  await pgOtpDelete(key);
  try {
    const { getRedis, isRedisReady } = await import('@/lib/redis');
    if (isRedisReady()) {
      const client = await getRedis();
      if (client) await client.del(`otp:${key}`);
    }
  } catch { /* non-critical */ }
}

/**
 * Increment OTP attempts.
 */
export async function otpIncrementAttempts(key: string): Promise<number> {
  const result = await pgOtpIncrementAttempts(key);
  // Update Redis cache (best effort)
  try {
    const { getRedis, isRedisReady } = await import('@/lib/redis');
    if (isRedisReady()) {
      const client = await getRedis();
      if (client) await client.hIncrBy(`otp:${key}`, 'attempts', 1);
    }
  } catch { /* non-critical */ }
  return result;
}

/**
 * OTP Rate Limit — Redis first, PG fallback.
 */
export async function otpRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  try {
    const { getRedis, isRedisReady } = await import('@/lib/redis');
    if (isRedisReady()) {
      const client = await getRedis();
      if (client) {
        const rateKey = `otprate:${key}`;
        const windowSec = Math.ceil(windowMs / 1000);
        const result = await client.eval(
          `local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then ttl = ARGV[1] end
return {current, ttl}`,
          { keys: [rateKey], arguments: [String(windowSec)] }
        ) as [number, number];
        if (result[0] > maxRequests) {
          return { allowed: false, retryAfterSec: result[1] };
        }
        return { allowed: true, retryAfterSec: 0 };
      }
    }
  } catch { /* fall through to PG */ }
  
  return pgOtpRateLimit(key, maxRequests, windowMs);
}

/**
 * Cleanup — both stores.
 */
export async function otpCleanup(): Promise<void> {
  await pgOtpCleanup();
  // Redis handles expiry automatically
}

export async function otpRateCleanup(): Promise<void> {
  await pgOtpRateCleanup();
}
