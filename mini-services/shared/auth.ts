// Cryptsk — Shared Auth Utilities for Mini-Services
// Uses the same HMAC-SHA256 session verification as the Next.js app
// Compatible with the session token format in src/lib/session.ts

import { createHmac, timingSafeEqual, randomBytes } from "crypto";

const SESSION_COOKIE_NAME = "cryptsk_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  // Generate random fallback (changes on restart, acceptable for dev)
  const fallback = randomBytes(32).toString("hex");
  if (process.env.NODE_ENV === "production") {
    console.error("[CRITICAL] SESSION_SECRET not set — using random fallback");
  }
  return fallback;
}

/**
 * Verify a session token created by the Next.js app.
 * Token format: base64url(payload).base64url(signature)
 * Signature: HMAC-SHA256(secret, payloadB64)
 */
export function verifySession(
  token: string
): { userId: string; email?: string; role?: string } | null {
  try {
    const dotIndex = token.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const payloadB64 = token.substring(0, dotIndex);
    const signatureB64 = token.substring(dotIndex + 1);

    // Compute expected HMAC-SHA256 signature
    const expectedSig = createHmac("sha256", getSecret())
      .update(payloadB64)
      .digest("base64url");

    const sigBuf = Buffer.from(signatureB64, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

    // Decode payload
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = Buffer.from(base64, "base64").toString();
    const payload = JSON.parse(jsonStr) as {
      uid?: string;
      sub?: string;
      email?: string;
      role?: string;
      exp?: number;
    };

    // Check expiry (payload.exp is in seconds)
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || now > payload.exp) return null;

    const userId = payload.uid || payload.sub;
    if (!userId) return null;

    return {
      userId,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/**
 * Extract and verify session from request cookie.
 * Throws on auth failure — use for protected endpoints.
 */
export function requireAuth(req: Request): {
  userId: string;
  email?: string;
  role?: string;
} {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(
    new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`)
  );
  if (!match) throw new Error("Unauthorized: No session cookie");
  const session = verifySession(match[1]);
  if (!session) throw new Error("Unauthorized: Invalid or expired session");
  return session;
}

/**
 * Optional auth — returns null instead of throwing.
 * Use for endpoints that work but return extra data when authenticated.
 */
export function optionalAuth(req: Request): {
  userId: string;
  email?: string;
  role?: string;
} | null {
  try {
    return requireAuth(req);
  } catch {
    return null;
  }
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
  "Access-Control-Allow-Credentials": "true",
};

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };
