import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

// ============================================================
// CRYPTSK Nexus — Password reset token helpers (T10-a)
// SECURITY: the raw token (32 random bytes → 64-hex) is NEVER
// persisted. Only its SHA-256 hex hash is stored in
// password_reset_tokens.token_hash, and reset links carry the
// RAW token — the DB alone can never reconstruct a usable link.
// ============================================================

/** Reset links stay valid for 60 minutes. */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** Fresh one-time token — returned to the caller / embedded in the link. */
export function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hex of the raw token — this is the ONLY thing we store. */
export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Expiry = now + TTL (default 60 minutes). */
export function resetExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
}

/**
 * Build the reset link "<origin>/?reset=<raw>".
 * Honors reverse-proxy headers (x-forwarded-proto / x-forwarded-host)
 * and falls back to the request origin when they are absent.
 */
export function buildResetLink(req: NextRequest, rawToken: string): string {
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host");
  const origin = proto && host ? `${proto}://${host}` : req.nextUrl.origin;
  return `${origin}/?reset=${rawToken}`;
}
