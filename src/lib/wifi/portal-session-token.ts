/**
 * CP-HIGH-10: Server-signed session tokens for captive portal.
 *
 * Replaces client-generated UUIDs with HMAC-signed tokens that bind
 * the session to a username and IP address, preventing token forgery.
 *
 * Token format: base64url({username}|{ip}|{sessionId}|{expiry})}.{hmac}
 * Secret: CP_SESSION_TOKEN_SECRET env var (auto-generated if absent)
 */

import crypto from 'crypto';

let _secret: string | undefined;

function getSecret(): string {
  if (!_secret) {
    _secret = process.env.CP_SESSION_TOKEN_SECRET;
    if (!_secret) {
      // Generate a persistent secret on first use and log a warning.
      // In production, CP_SESSION_TOKEN_SECRET should be set explicitly.
      _secret = crypto.randomBytes(32).toString('hex');
      // Only warn once per process — not on every request
      if (!globalThis._cpTokenWarned) {
        globalThis._cpTokenWarned = true;
        console.warn('[CP Session Token] CP_SESSION_TOKEN_SECRET not set — using ephemeral secret. Tokens will not survive server restart. Set this env var in production.');
      }
    }
  }
  return _secret;
}

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours (matches typical session timeout)

export function createPortalSessionToken(params: {
  username: string;
  ip?: string;
  sessionId?: string;
  ttlSeconds?: number;
}): string {
  const secret = getSecret();
  const ttl = params.ttlSeconds ?? TOKEN_TTL_SECONDS;
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const payload = [params.username, params.ip ?? '*', params.sessionId ?? '*', expiry].join('|');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + signature;
}

export function verifyPortalSessionToken(
  token: string,
  expectedUsername?: string,
  expectedIp?: string,
): { valid: boolean; username?: string; ip?: string; sessionId?: string; expired?: boolean } {
  try {
    const dotIndex = token.lastIndexOf('.');
    if (dotIndex < 0) return { valid: false };

    const payloadB64 = token.substring(0, dotIndex);
    const signatureB64 = token.substring(dotIndex + 1);

    const payload = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const secret = getSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');

    if (signatureB64 !== expectedSig) return { valid: false };

    const parts = payload.split('|');
    if (parts.length < 4) return { valid: false };

    const [username, ip, sessionId, expiryStr] = parts;
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry)) return { valid: false };

    const now = Math.floor(Date.now() / 1000);
    if (now > expiry) return { valid: false, username, ip, sessionId, expired: true };

    // If caller provides expected username/IP, verify they match
    if (expectedUsername && username !== expectedUsername) return { valid: false };
    if (expectedIp && ip !== '*' && ip !== expectedIp) return { valid: false };

    return { valid: true, username, ip, sessionId };
  } catch {
    return { valid: false };
  }
}