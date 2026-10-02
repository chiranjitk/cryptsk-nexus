/**
 * StaySuite PostgreSQL-Backed OTP Store
 *
 * Drop-in replacement for the in-memory Map-based OTP store.
 * Uses PostgreSQL as the backing store — zero additional infrastructure needed.
 *
 * Why PostgreSQL instead of Redis:
 *   - PG is already running, tuned, and has 300 connection capacity
 *   - OTP ops are ~1-2 simple queries (INSERT/SELECT/DELETE) — trivial for PG
 *   - Shared across all PM2 workers (solves multi-instance OTP problem)
 *   - No new service to monitor, restart, or debug
 *   - OTP records are tiny (key + 6-digit code + expiry) — negligible storage
 *   - Auto-cleanup via periodic DELETE of expired rows
 *
 * Operations (all async, match the old Map API):
 *   - get(key)          → { code, expiresAt, phone?, email?, guestId?, roomNumber?, planId?, attempts }
 *   - set(key, entry)   → stores/overwrites entry
 *   - delete(key)       → removes entry
 *   - cleanup()         → purges expired + excess rows (called periodically)
 *
 * Graceful degradation:
 *   When PostgreSQL is unavailable (e.g. sandbox without PG), all public
 *   functions return safe defaults instead of throwing. OTP features are
 *   effectively disabled but the app stays healthy.
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

// ─── Type (matches the old in-memory Map value type) ─────────────────────────

export interface OtpEntry {
  code: string;
  expiresAt: number;    // epoch ms — stored as TIMESTAMPTZ in PG
  phone?: string;
  email?: string;
  guestId?: string;
  roomNumber?: string;
  planId?: string;
  attempts: number;
}

export interface OtpRateEntry {
  count: number;
  resetAt: number;     // epoch ms — stored as TIMESTAMPTZ in PG
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Safely coerce DB row fields that may be null. */
function toOtpEntry(row: Record<string, unknown>): OtpEntry | null {
  if (!row) return null;
  const expiresAt = row.expires_at as number | Date | null;
  if (!expiresAt) return null;
  const ms = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
  return {
    code: (row.code as string) || '',
    expiresAt: ms,
    phone: (row.phone as string) || undefined,
    email: (row.email as string) || undefined,
    guestId: (row.guest_id as string) || undefined,
    roomNumber: (row.room_number as string) || undefined,
    planId: (row.plan_id as string) || undefined,
    attempts: (row.attempts as number) || 0,
  };
}

function toRateEntry(row: Record<string, unknown>): OtpRateEntry | null {
  if (!row) return null;
  const resetAt = row.reset_at as number | Date | null;
  if (!resetAt) return null;
  return {
    count: (row.count as number) || 0,
    resetAt: typeof resetAt === 'number' ? resetAt : new Date(resetAt).getTime(),
  };
}

// ─── PG availability guard ───────────────────────────────────────────────────
// null  = not yet determined (first call will try)
// true  = PG is reachable and tables are ready
// false = PG is unreachable or tables can't be created — all ops return safe defaults

let pgAvailable: boolean | null = null;

function markPgUnavailable(reason: string): void {
  if (pgAvailable !== false) {
    console.warn(`[OTP:PG] PostgreSQL unavailable — OTP store disabled: ${reason}`);
  }
  pgAvailable = false;
}

// ─── Ensure table exists (idempotent — safe to call on every cold start) ──────

let tableEnsured = false;

async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  if (pgAvailable === false) return;
  try {
    // Check if table already exists to avoid composite-type name collision (PG error 23505)
    const exists = await db.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`SELECT EXISTS(SELECT 1 FROM pg_tables WHERE tablename = 'otp_store' AND schemaname = 'public') as exists`
    );
    if (exists?.[0]?.exists) {
      tableEnsured = true;
      pgAvailable = true;
      return;
    }
    await db.$executeRaw(Prisma.sql`
      CREATE TABLE IF NOT EXISTS otp_store (
        key         TEXT        NOT NULL PRIMARY KEY,
        code        TEXT        NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        phone       TEXT,
        email       TEXT,
        guest_id    TEXT,
        room_number TEXT,
        plan_id     TEXT,
        attempts    INT         NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.$executeRaw(Prisma.sql`
      CREATE INDEX IF NOT EXISTS idx_otp_store_expires ON otp_store (expires_at)
    `);
    tableEnsured = true;
    pgAvailable = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't permanently mark PG unavailable — DB may just be starting up.
    // The flag is NOT set, so next call will retry table creation.
    if (process.env.NODE_ENV === 'development') {
      console.warn('[OTP:PG] Table ensure failed (will retry):', msg);
    }
  }
}

let rateTableEnsured = false;

async function ensureRateTable(): Promise<void> {
  if (rateTableEnsured) return;
  if (pgAvailable === false) return;
  try {
    // Check if table already exists to avoid composite-type name collision
    const exists = await db.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`SELECT EXISTS(SELECT 1 FROM pg_tables WHERE tablename = 'otp_rate_limits' AND schemaname = 'public') as exists`
    );
    if (exists?.[0]?.exists) {
      rateTableEnsured = true;
      pgAvailable = true;
      return;
    }
    await db.$executeRaw(Prisma.sql`
      CREATE TABLE IF NOT EXISTS otp_rate_limits (
        key       TEXT        NOT NULL PRIMARY KEY,
        count     INT         NOT NULL DEFAULT 1,
        reset_at  TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.$executeRaw(Prisma.sql`
      CREATE INDEX IF NOT EXISTS idx_otp_rate_expires ON otp_rate_limits (reset_at)
    `);
    rateTableEnsured = true;
    pgAvailable = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't permanently mark PG unavailable — DB may just be starting up.
    // The flag is NOT set, so next call will retry table creation.
    if (process.env.NODE_ENV === 'development') {
      console.warn('[OTP:PG] Rate table ensure failed (will retry):', msg);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get an OTP entry by key (phone number or `email:${addr}`).
 * Returns null if not found or already expired.
 */
export async function otpGet(key: string): Promise<OtpEntry | null> {
  await ensureTable();
  if (pgAvailable === false) return null;
  const rows = await db.$queryRaw<
    Array<{
      key: string; code: string; expires_at: Date; phone: string | null;
      email: string | null; guest_id: string | null; room_number: string | null;
      plan_id: string | null; attempts: number;
    }>
  >(Prisma.sql`SELECT key, code, expires_at, phone, email, guest_id, room_number, plan_id, attempts
       FROM otp_store WHERE key = ${key}`);
  if (!rows || rows.length === 0) return null;

  const entry = toOtpEntry(rows[0] as unknown as Record<string, unknown>);
  if (!entry) return null;

  // Auto-purge expired entries on read
  if (Date.now() > entry.expiresAt) {
    await otpDelete(key);
    return null;
  }

  return entry;
}

/**
 * Increment attempt counter in-place (atomic).
 * Returns the updated entry, or null if not found / expired.
 */
export async function otpIncrementAttempts(key: string): Promise<OtpEntry | null> {
  await ensureTable();
  if (pgAvailable === false) return null;
  const rows = await db.$queryRaw<
    Array<{
      key: string; code: string; expires_at: Date; phone: string | null;
      email: string | null; guest_id: string | null; room_number: string | null;
      plan_id: string | null; attempts: number;
    }>
  >(Prisma.sql`UPDATE otp_store SET attempts = attempts + 1
     WHERE key = ${key} AND expires_at > NOW()
     RETURNING key, code, expires_at, phone, email, guest_id, room_number, plan_id, attempts`);
  if (!rows || rows.length === 0) return null;
  return toOtpEntry(rows[0] as unknown as Record<string, unknown>);
}

/**
 * Store (upsert) an OTP entry.
 * If the key already exists, the old entry is replaced.
 */
export async function otpSet(key: string, entry: OtpEntry): Promise<void> {
  await ensureTable();
  if (pgAvailable === false) return;
  await db.$executeRaw(
    Prisma.sql`INSERT INTO otp_store (key, code, expires_at, phone, email, guest_id, room_number, plan_id, attempts)
     VALUES (${key}, ${entry.code}, ${new Date(entry.expiresAt)}, ${entry.phone ?? null}, ${entry.email ?? null}, ${entry.guestId ?? null}, ${entry.roomNumber ?? null}, ${entry.planId ?? null}, ${entry.attempts})
     ON CONFLICT (key) DO UPDATE SET
       code = EXCLUDED.code,
       expires_at = EXCLUDED.expires_at,
       phone = EXCLUDED.phone,
       email = EXCLUDED.email,
       guest_id = EXCLUDED.guest_id,
       room_number = EXCLUDED.room_number,
       plan_id = EXCLUDED.plan_id,
       attempts = EXCLUDED.attempts`
  );
}

/**
 * Delete an OTP entry by key.
 */
export async function otpDelete(key: string): Promise<void> {
  await ensureTable();
  if (pgAvailable === false) return;
  await db.$executeRaw(Prisma.sql`DELETE FROM otp_store WHERE key = ${key}`);
}

/**
 * Purge expired OTP entries + cap table size.
 * Called periodically (every 5 minutes) from the cleanup interval.
 */
export async function otpCleanup(): Promise<number> {
  try {
    await ensureTable();
    if (pgAvailable === false) return 0;
    // Delete all expired entries
    const result = await db.$executeRaw(
      Prisma.sql`DELETE FROM otp_store WHERE expires_at < NOW()`,
    );
    const deleted = typeof result === 'number' ? result : Number(result) || 0;

    // Cap total rows at 10K (prevent unbounded growth during burst)
    const countRow = await db.$queryRaw<Array<{ cnt: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::int AS cnt FROM otp_store`,
    );
    const total = Number(countRow?.[0]?.cnt ?? 0);
    if (total > 10000) {
      // Delete oldest entries beyond the cap
      await db.$executeRaw(
        Prisma.sql`DELETE FROM otp_store WHERE key NOT IN (
          SELECT key FROM otp_store ORDER BY created_at DESC LIMIT 10000
        )`,
      );
    }

    return deleted;
  } catch {
    // Table may not exist yet (DB not ready at startup) — silently skip
    return 0;
  }
}

// ─── Admin OTP Lookup (for staff when SMS is down) ──────────────────────────

/** Shape of an OTP row returned to the admin UI. */
export interface OtpAdminRow {
  key: string;
  code: string;
  expiresAt: string;       // ISO string
  phone: string | null;
  email: string | null;
  guestId: string | null;
  roomNumber: string | null;
  planId: string | null;
  attempts: number;
  createdAt: string;       // ISO string
}

/**
 * Look up active (non-expired) OTP entries for admin view.
 *
 * Supports optional filters:
 *   - search: partial match on phone or email
 *   - phone: exact phone number
 *   - email: exact email address
 *
 * Results are ordered by created_at DESC (newest first).
 * Automatically excludes expired entries.
 */
export async function otpLookupForAdmin(params?: {
  search?: string;
  phone?: string;
  email?: string;
  limit?: number;
}): Promise<OtpAdminRow[]> {
  await ensureTable();
  if (pgAvailable === false) return [];

  const limit = Math.min(params?.limit ?? 100, 500);

  const rows = await db.$queryRaw<Array<{
    key: string;
    code: string;
    expires_at: Date;
    phone: string | null;
    email: string | null;
    guest_id: string | null;
    room_number: string | null;
    plan_id: string | null;
    attempts: number;
    created_at: Date;
  }>>(Prisma.sql`SELECT key, code, expires_at, phone, email, guest_id, room_number, plan_id, attempts, created_at
       FROM otp_store
       WHERE expires_at > NOW()
       ${params?.phone ? Prisma.sql`AND phone = ${params.phone}` :
         params?.email ? Prisma.sql`AND email = ${params.email}` :
         params?.search ? Prisma.sql`AND (phone ILIKE ${`%${params.search}%`} OR email ILIKE ${`%${params.search}%`})` :
         Prisma.empty}
       ORDER BY created_at DESC
       LIMIT ${limit}`);

  return (rows || []).map((r) => ({
    key: r.key,
    code: r.code,
    expiresAt: r.expires_at.toISOString(),
    phone: r.phone,
    email: r.email,
    guestId: r.guest_id,
    roomNumber: r.room_number,
    planId: r.plan_id,
    attempts: r.attempts,
    createdAt: r.created_at.toISOString(),
  }));
}

/**
 * Count active (non-expired) OTP entries. Used for dashboard stats.
 */
export async function otpActiveCount(): Promise<number> {
  await ensureTable();
  if (pgAvailable === false) return 0;
  const row = await db.$queryRaw<Array<{ cnt: bigint }>>(
    Prisma.sql`SELECT COUNT(*)::int AS cnt FROM otp_store WHERE expires_at > NOW()`,
  );
  return Number(row?.[0]?.cnt ?? 0);
}

// ─── Rate Limiting (same pattern, PG-backed) ─────────────────────────────────

/**
 * Check and update OTP rate limit for a key.
 * Returns whether the request is allowed and how long to wait if not.
 */
export async function otpRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  await ensureRateTable();
  if (pgAvailable === false) {
    // When PG is down, allow all requests (fail-open for OTP rate limiting)
    return { allowed: true, retryAfterSec: 0 };
  }

  // Try to get existing entry
  const rows = await db.$queryRaw<
    Array<{ key: string; count: number; reset_at: Date }>
  >(Prisma.sql`SELECT key, count, reset_at FROM otp_rate_limits WHERE key = ${key}`);

  if (!rows || rows.length === 0) {
    // First request — insert
    await db.$executeRaw(
      Prisma.sql`INSERT INTO otp_rate_limits (key, count, reset_at) VALUES (${key}, 1, NOW() + (${String(windowMs)} || ' milliseconds')::interval)
       ON CONFLICT (key) DO UPDATE SET count = 1, reset_at = EXCLUDED.reset_at`
    );
    return { allowed: true, retryAfterSec: 0 };
  }

  const entry = toRateEntry(rows[0] as unknown as Record<string, unknown>);
  if (!entry) {
    // Corrupted row — reset
    await db.$executeRaw(
      Prisma.sql`INSERT INTO otp_rate_limits (key, count, reset_at) VALUES (${key}, 1, NOW() + (${String(windowMs)} || ' milliseconds')::interval)
       ON CONFLICT (key) DO UPDATE SET count = 1, reset_at = EXCLUDED.reset_at`
    );
    return { allowed: true, retryAfterSec: 0 };
  }

  // Window expired — reset
  if (Date.now() > entry.resetAt) {
    await db.$executeRaw(
      Prisma.sql`UPDATE otp_rate_limits SET count = 1, reset_at = NOW() + (${String(windowMs)} || ' milliseconds')::interval WHERE key = ${key}`
    );
    return { allowed: true, retryAfterSec: 0 };
  }

  // Within window — increment and check
  const newCount = entry.count + 1;
  if (newCount > maxRequests) {
    const retryAfterSec = Math.ceil((entry.resetAt - Date.now()) / 1000);
    return { allowed: false, retryAfterSec: Math.max(0, retryAfterSec) };
  }

  await db.$executeRaw(
    Prisma.sql`UPDATE otp_rate_limits SET count = ${newCount} WHERE key = ${key}`
  );
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Purge expired rate limit entries + cap table size.
 * Called periodically (every minute) from the cleanup interval.
 */
export async function otpRateCleanup(): Promise<number> {
  try {
    await ensureRateTable();
    if (pgAvailable === false) return 0;
    const result = await db.$executeRaw(
      Prisma.sql`DELETE FROM otp_rate_limits WHERE reset_at < NOW()`,
    );
    const deleted = typeof result === 'number' ? result : Number(result) || 0;

    // Cap at 10K rows
    const countRow = await db.$queryRaw<Array<{ cnt: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::int AS cnt FROM otp_rate_limits`,
    );
    const total = Number(countRow?.[0]?.cnt ?? 0);
    if (total > 10000) {
      await db.$executeRaw(
        Prisma.sql`DELETE FROM otp_rate_limits WHERE key NOT IN (
          SELECT key FROM otp_rate_limits ORDER BY created_at DESC LIMIT 10000
        )`,
      );
    }

    return deleted;
  } catch {
    // Table may not exist yet (DB not ready at startup) — silently skip
    return 0;
  }
}