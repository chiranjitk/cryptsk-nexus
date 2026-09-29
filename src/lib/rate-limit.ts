// Simple in-memory rate limiter
// For production, replace with Redis-backed solution

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

export function rateLimit(
  key: string,
  options: { maxRequests: number; windowMs: number }
): { success: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);
  
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { success: true, retryAfterMs: 0 };
  }
  
  if (entry.count >= options.maxRequests) {
    return { success: false, retryAfterMs: entry.resetAt - now };
  }
  
  entry.count++;
  return { success: true, retryAfterMs: 0 };
}
