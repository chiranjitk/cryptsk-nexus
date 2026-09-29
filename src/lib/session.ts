/**
 * Cryptsk — Session Token Utilities
 * Creates and verifies signed session tokens for API authentication.
 * Uses HMAC-SHA256 — compatible with both Node.js and Edge Runtime.
 */

// Cookie name for the session token
export const SESSION_COOKIE_NAME = 'cryptsk_session'

// Token expiry: 7 days in seconds
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

// Cached secret to avoid regenerating on every call (fixes 401 in dev)
let _cachedSecret: string | null = null

// Get the server secret from env or generate a random fallback (cached)
export function getSecret(): string {
  if (_cachedSecret) return _cachedSecret

  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 16) {
    _cachedSecret = secret
    return _cachedSecret
  }
  // Generate random fallback once and cache it
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const fallback = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  if (process.env.NODE_ENV === 'production') {
    console.error('[CRITICAL] SESSION_SECRET not set — using random fallback. All sessions will be invalidated on restart!')
    console.error('[CRITICAL] FATAL: SESSION_SECRET must be set in production (min 16 chars)')
  }
  _cachedSecret = fallback
  return _cachedSecret
}

/**
 * Async HMAC-SHA256 sign using Web Crypto API (works in Edge & Node.js)
 */
export async function hmacSign(data: string, secret: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', key, encoder.encode(data))
}

/**
 * Async HMAC-SHA256 verify using Web Crypto API
 */
export async function hmacVerify(data: string, signature: BufferSource, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(data))
}

/**
 * Create a signed session token
 * Format: base64url(payload) . base64url(signature)
 */
export async function createSessionToken(userId: string): Promise<string> {
  const secret = getSecret()
  const now = Math.floor(Date.now() / 1000)

  const payload = JSON.stringify({
    uid: userId,
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
 * Verify a session token and return the user ID if valid.
 */
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const secret = getSecret()
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
    const payload = JSON.parse(jsonStr) as { uid: string; iat: number; exp: number }

    // Check expiry
    const now = Math.floor(Date.now() / 1000)
    if (!payload.exp || now > payload.exp) return null

    return payload.uid
  } catch {
    return null
  }
}

/** ArrayBuffer → base64url string */
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** base64url string → ArrayBuffer */
export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Generate a cryptographically secure random password for RADIUS users.
 * Uses crypto.getRandomValues (available in both Edge and Node.js).
 */
export function generateSecurePassword(length: number = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => chars[b % chars.length]).join('')
}

export { SESSION_MAX_AGE_SECONDS }
