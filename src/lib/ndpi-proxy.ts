/**
 * Cryptsk — nDPI Daemon Proxy Helper
 *
 * Provides a centralized, resilient way to call the nDPI daemon
 * (port 3031) from Next.js API routes. Handles:
 *   - Connection refused / ECONNREFUSED (daemon not running)
 *   - 404 / 401 / 5xx from daemon
 *   - Timeouts
 *   - Response parsing with graceful JSON fallback
 */

const NDPI_DAEMON_BASE = "http://localhost:3031";

// NOTE: Module-level caching works for long-running Node.js processes but will not persist
// across serverless function invocations (e.g., Vercel Edge). This is acceptable for our deployment model.
let daemonOnline: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

async function checkDaemonHealth(): Promise<boolean> {
  const now = Date.now();
  if (daemonOnline !== null && now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return daemonOnline;
  }
  try {
    const res = await fetch(`${NDPI_DAEMON_BASE}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    daemonOnline = res.ok;
  } catch {
    daemonOnline = false;
  }
  lastHealthCheck = now;
  return daemonOnline;
}

interface NdpiProxyOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

interface NdpiResult {
  ok: boolean;
  status: number;
  data: unknown;
  daemonOffline?: boolean;
}

/**
 * Proxy a request to the nDPI daemon on port 3031.
 *
 * @param path  - API path on the daemon (e.g. "/api/apps", "/api/stats")
 * @param options - method, body, timeout, extra headers
 * @returns NdpiResult with ok, status, data, and optional daemonOffline flag
 */
export async function ndpiProxy(
  path: string,
  options: NdpiProxyOptions = {}
): Promise<NdpiResult> {
  const { method = "GET", body, timeoutMs = 10000, headers = {} } = options;

  const online = await checkDaemonHealth();
  if (!online) {
    return {
      ok: false,
      status: 503,
      data: { error: "nDPI daemon is offline", daemonOnline: false },
      daemonOffline: true,
    };
  }

  try {
    const res = await fetch(`${NDPI_DAEMON_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text().catch(() => "");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    daemonOnline = false;
    return {
      ok: false,
      status: 503,
      data: { error: `nDPI daemon connection failed: ${message}`, daemonOnline: false },
      daemonOffline: true,
    };
  }
}

/**
 * Bypass the health-check cache and proxy directly.
 * Useful for the combined /api/ndpi endpoint that needs to
 * call multiple daemon paths without redundant health checks.
 */
export async function ndpiProxyDirect(
  path: string,
  options: NdpiProxyOptions = {}
): Promise<NdpiResult> {
  const { method = "GET", body, timeoutMs = 10000, headers = {} } = options;

  try {
    const res = await fetch(`${NDPI_DAEMON_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text().catch(() => "");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 503,
      data: { error: `nDPI daemon connection failed: ${message}`, daemonOnline: false },
      daemonOffline: true,
    };
  }
}
