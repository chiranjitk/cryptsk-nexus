/**
 * Cryptsk — Subscriber Session Utilities
 * Thin wrapper around the core session system for subscriber self-care portal.
 * Uses a separate cookie name so admin and subscriber sessions don't collide.
 */

import {
  SESSION_MAX_AGE_SECONDS,
  getSecret,
  hmacSign,
  hmacVerify,
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer,
} from '@/lib/session'

// Separate cookie name for subscriber sessions (avoids collision with admin session)
export const SUBSCRIBER_SESSION_COOKIE_NAME = 'cryptsk_subscriber_session'

/**
 * Create a signed session token for a subscriber.
 * Uses a separate payload format with a type discriminator to prevent cross-portal forgery.
 */
export async function createSubscriberSessionToken(subscriberId: string): Promise<string> {
  // Build token manually with subscriber type discriminator
  const secret = getSecret()
  const now = Math.floor(Date.now() / 1000)

  const payload = JSON.stringify({
    uid: subscriberId,
    type: "subscriber",
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  })

  // base64url encode the payload
  const payloadB64 = btoa(payload)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  // HMAC-SHA256 signature
  const sigBuffer = await hmacSign(payloadB64, secret)
  const signature = arrayBufferToBase64Url(sigBuffer)

  return `${payloadB64}.${signature}`
}

/**
 * Verify a subscriber session token and return the subscriber ID if valid.
 * Rejects tokens that don't have the subscriber type discriminator.
 */
export async function verifySubscriberSessionToken(token: string): Promise<string | null> {
  const secret = getSecret()
  try {
    const dotIndex = token.lastIndexOf('.')
    if (dotIndex === -1) return null

    const payloadB64 = token.substring(0, dotIndex)
    const signatureB64 = token.substring(dotIndex + 1)

    // Decode signature from base64url to ArrayBuffer
    const signatureBuffer = base64UrlToArrayBuffer(signatureB64)

    // Verify HMAC signature
    const valid = await hmacVerify(payloadB64, signatureBuffer, secret)
    if (!valid) return null

    // Decode payload
    const jsonStr = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    const decoded = JSON.parse(jsonStr) as { uid: string; type: string; iat: number; exp: number }

    // Verify this is a subscriber token, not an admin token
    if (decoded.type !== "subscriber") return null

    // Check expiry
    const now = Math.floor(Date.now() / 1000)
    if (!decoded.exp || now > decoded.exp) return null

    return decoded.uid
  } catch {
    return null
  }
}

export { SESSION_MAX_AGE_SECONDS }
