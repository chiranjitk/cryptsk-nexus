import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Type-safe fetch wrapper that:
 * 1. Checks res.ok and throws on non-2xx
 * 2. Returns parsed JSON
 * 3. Handles both {items:[], total:N} and bare [] responses
 */
export async function apiFetch<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const isBodyRequest = options?.method && options.method !== "GET" && options.method !== "HEAD";
  const headers: Record<string, string> = {};
  if (isBodyRequest) headers['Content-Type'] = 'application/json';
  if (options?.headers) {
    Object.assign(headers, typeof options.headers === 'object' ? options.headers : {});
  }
  // Attach Bearer token from localStorage (fallback for proxy/gateway environments where cookies are stripped)
  if (typeof window !== 'undefined' && !headers['Authorization']) {
    try {
      const token = localStorage.getItem('cryptsk_auth_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch { /* ignore */ }
  }
  return fetch(url, { ...options, headers, signal: AbortSignal.timeout(30000) }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  });
}

/**
 * Format number as currency (defaults to Indian Rupee)
 */
export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format number as Indian Rupee currency (backward-compatible alias)
 */
export const formatINR = (amount: number) => formatCurrency(amount, 'INR');

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T = any>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
