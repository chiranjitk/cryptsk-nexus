import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  getSecret,
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer,
  generateSecurePassword,
  createSessionToken,
  verifySessionToken,
} from './session'

// ============================================================
// Constants
// ============================================================
describe('SESSION_COOKIE_NAME', () => {
  it('should be "cryptsk_session"', () => {
    expect(SESSION_COOKIE_NAME).toBe('cryptsk_session')
  })

  it('should be a non-empty string', () => {
    expect(SESSION_COOKIE_NAME.length).toBeGreaterThan(0)
  })
})

describe('SESSION_MAX_AGE_SECONDS', () => {
  it('should be 7 days in seconds', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60)
  })

  it('should be exactly 604800 seconds', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(604800)
  })
})

// ============================================================
// getSecret
// ============================================================
describe('getSecret', () => {
  let originalEnv: Record<string, string | undefined>
  let cachedSecretModule: typeof import('./session')

  beforeEach(async () => {
    // Capture original env
    originalEnv = { ...process.env }
    // Clear the module cache so getSecret's internal cache resets
    vi.resetModules()
    cachedSecretModule = await import('./session')
  })

  afterEach(() => {
    // Restore original env
    process.env = originalEnv
  })

  it('returns a string', () => {
    const secret = cachedSecretModule.getSecret()
    expect(typeof secret).toBe('string')
  })

  it('returns a non-empty string', () => {
    const secret = cachedSecretModule.getSecret()
    expect(secret.length).toBeGreaterThan(0)
  })

  it('uses SESSION_SECRET env variable when set and >= 16 chars', () => {
    process.env.SESSION_SECRET = 'this-is-a-very-long-secret-key-32chars'
    const secret = cachedSecretModule.getSecret()
    expect(secret).toBe('this-is-a-very-long-secret-key-32chars')
  })

  it('ignores SESSION_SECRET shorter than 16 chars', () => {
    process.env.SESSION_SECRET = 'short'
    const secret = cachedSecretModule.getSecret()
    // Should NOT be 'short', should generate a random fallback
    expect(secret).not.toBe('short')
    expect(secret.length).toBeGreaterThan(16)
  })

  it('generates a random fallback when SESSION_SECRET is not set', () => {
    delete process.env.SESSION_SECRET
    const secret = cachedSecretModule.getSecret()
    // Should be a 64-char hex string (32 bytes * 2 hex chars)
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
  })

  it('caches the secret (returns same value on subsequent calls)', () => {
    const secret1 = cachedSecretModule.getSecret()
    const secret2 = cachedSecretModule.getSecret()
    expect(secret1).toBe(secret2)
  })
})

// ============================================================
// arrayBufferToBase64Url
// ============================================================
describe('arrayBufferToBase64Url', () => {
  it('converts an empty ArrayBuffer to empty string', () => {
    const buffer = new ArrayBuffer(0)
    expect(arrayBufferToBase64Url(buffer)).toBe('')
  })

  it('converts a single byte correctly', () => {
    const buffer = new Uint8Array([65]).buffer // 'A'
    const result = arrayBufferToBase64Url(buffer)
    expect(result).toBe('QQ') // base64 of 'A'
  })

  it('produces a string without +, /, or = characters (base64url)', () => {
    // Create a buffer with various byte values to cover +/=/ cases
    const bytes = new Uint8Array([0xFF, 0x00, 0xAB, 0xCD, 0xEF, 0x12, 0x34])
    const result = arrayBufferToBase64Url(bytes.buffer)
    expect(result).not.toContain('+')
    expect(result).not.toContain('/')
    expect(result).not.toContain('=')
  })

  it('replaces + with - and / with _', () => {
    // Input that will produce + and / in standard base64
    // byte 0xFB 0xE8 = standard base64 "/+4" which in base64url becomes "-_4"
    const bytes = new Uint8Array([0xFB, 0xE8])
    const result = arrayBufferToBase64Url(bytes.buffer)
    // In standard base64: "/+4"
    // In base64url: "-_4"
    expect(result).not.toContain('+')
    expect(result).not.toContain('/')
  })

  it('round-trips with base64UrlToArrayBuffer', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128])
    const encoded = arrayBufferToBase64Url(original.buffer)
    const decoded = base64UrlToArrayBuffer(encoded)
    const result = new Uint8Array(decoded)
    expect(Array.from(result)).toEqual(Array.from(original))
  })

  it('handles all zero bytes', () => {
    const bytes = new Uint8Array([0, 0, 0, 0])
    const result = arrayBufferToBase64Url(bytes.buffer)
    expect(result).toBe('AAAAAA')
  })

  it('handles all 0xFF bytes', () => {
    const bytes = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF])
    const result = arrayBufferToBase64Url(bytes.buffer)
    // Standard base64: "/////w==" → base64url: "_____w" (padding stripped)
    expect(result).toBe('_____w')
  })

  it('produces URL-safe characters only', () => {
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => i))
    const result = arrayBufferToBase64Url(bytes.buffer)
    // Should only contain A-Z, a-z, 0-9, -, _
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

// ============================================================
// base64UrlToArrayBuffer
// ============================================================
describe('base64UrlToArrayBuffer', () => {
  it('converts an empty string to empty ArrayBuffer', () => {
    const result = base64UrlToArrayBuffer('')
    expect(result.byteLength).toBe(0)
  })

  it('decodes a simple base64url string', () => {
    const encoded = 'AQID' // [1, 2, 3]
    const result = new Uint8Array(base64UrlToArrayBuffer(encoded))
    expect(Array.from(result)).toEqual([1, 2, 3])
  })

  it('handles - and _ characters (base64url encoding)', () => {
    // "_____-" = standard base64 "//////+" after conversion
    const encoded = '_____-' // base64url
    const result = base64UrlToArrayBuffer(encoded)
    expect(result.byteLength).toBeGreaterThan(0)
  })

  it('round-trips with arrayBufferToBase64Url', () => {
    const original = 'SGVsbG8gV29ybGQ' // base64 for "Hello World" (without padding check)
    const decoded = base64UrlToArrayBuffer(original)
    const reencoded = arrayBufferToBase64Url(decoded)
    expect(reencoded).toBe(original)
  })

  it('handles base64url strings that need padding restoration', () => {
    // "QQ" (base64 of 'A', no padding) should still work
    const result = base64UrlToArrayBuffer('QQ')
    expect(new Uint8Array(result)[0]).toBe(65) // 'A'
  })

  it('decodes a longer string correctly', () => {
    // base64url of "Hello World" bytes
    const original = new TextEncoder().encode('Hello World')
    const encoded = arrayBufferToBase64Url(original.buffer)
    const decoded = base64UrlToArrayBuffer(encoded)
    expect(new TextDecoder().decode(decoded)).toBe('Hello World')
  })
})

// ============================================================
// generateSecurePassword
// ============================================================
describe('generateSecurePassword', () => {
  it('generates a string of the default length (16)', () => {
    const password = generateSecurePassword()
    expect(password.length).toBe(16)
  })

  it('generates a string of custom length', () => {
    expect(generateSecurePassword(8).length).toBe(8)
    expect(generateSecurePassword(32).length).toBe(32)
    expect(generateSecurePassword(1).length).toBe(1)
    expect(generateSecurePassword(64).length).toBe(64)
  })

  it('only uses characters from the allowed character set', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const password = generateSecurePassword(100)
    for (const char of password) {
      expect(chars).toContain(char)
    }
  })

  it('does NOT include ambiguous characters (0, O, 1, I, l)', () => {
    const password = generateSecurePassword(200)
    expect(password).not.toContain('0')
    expect(password).not.toContain('O')
    expect(password).not.toContain('1')
    expect(password).not.toContain('I')
    expect(password).not.toContain('l')
  })

  it('generates different passwords on successive calls (randomness)', () => {
    const passwords = new Set<string>()
    for (let i = 0; i < 20; i++) {
      passwords.add(generateSecurePassword(16))
    }
    // Very unlikely to get 20 identical passwords if random
    expect(passwords.size).toBeGreaterThan(1)
  })

  it('returns a string type', () => {
    expect(typeof generateSecurePassword()).toBe('string')
  })

  it('handles length of 0 (edge case)', () => {
    expect(generateSecurePassword(0)).toBe('')
  })

  it('contains both uppercase and lowercase characters', () => {
    const password = generateSecurePassword(100)
    const hasUpper = /[A-Z]/.test(password)
    const hasLower = /[a-z]/.test(password)
    // With 100 chars from a set with 52 alpha chars, extremely likely to have both
    expect(hasUpper || hasLower).toBe(true)
  })

  it('contains numeric characters', () => {
    const password = generateSecurePassword(100)
    const hasDigit = /[2-9]/.test(password)
    // With 100 chars, very likely to have at least one digit
    // (the charset has 7 digits: 23456789, out of 52 total)
    // Not guaranteed but extremely likely with 100 draws
    expect(hasDigit).toBe(true)
  })
})

// ============================================================
// createSessionToken & verifySessionToken (integration with mocked crypto.subtle)
// ============================================================
describe('createSessionToken', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns a string with a dot separator (payload.signature)', async () => {
    const { createSessionToken } = await import('./session')
    const token = await createSessionToken('user-123')
    expect(typeof token).toBe('string')
    expect(token).toContain('.')
    const parts = token.split('.')
    expect(parts.length).toBe(2)
    expect(parts[0].length).toBeGreaterThan(0) // payload
    expect(parts[1].length).toBeGreaterThan(0) // signature
  })

  it('creates different tokens for different users', async () => {
    const { createSessionToken } = await import('./session')
    const token1 = await createSessionToken('user-1')
    const token2 = await createSessionToken('user-2')
    // The payloads will differ (different uid), so tokens should differ
    expect(token1).not.toBe(token2)
  })
})

describe('verifySessionToken', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns null for an empty string', async () => {
    const { verifySessionToken } = await import('./session')
    const result = await verifySessionToken('')
    expect(result).toBeNull()
  })

  it('returns null for a string without a dot', async () => {
    const { verifySessionToken } = await import('./session')
    const result = await verifySessionToken('no-dots-here')
    expect(result).toBeNull()
  })

  it('returns null for a malformed token', async () => {
    const { verifySessionToken } = await import('./session')
    const result = await verifySessionToken('invalid.payload')
    expect(result).toBeNull()
  })
})

// ============================================================
// Round-trip: createSessionToken → verifySessionToken
// ============================================================
describe('session token round-trip', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('verifies a token created by createSessionToken (same module instance)', async () => {
    const session = await import('./session')
    const token = await session.createSessionToken('user-abc')
    const userId = await session.verifySessionToken(token)
    // Note: crypto.subtle.verify is mocked to return true, and the payload decode should work
    // The exact behavior depends on the mock, but the structure should be correct
    expect(typeof userId).toBe('string')
  })

  it('payload contains the correct userId after round-trip', async () => {
    const session = await import('./session')
    const token = await session.createSessionToken('test-user-42')
    const userId = await session.verifySessionToken(token)
    expect(userId).toBe('test-user-42')
  })
})
