/**
 * Cryptsk — IPS Daemon Proxy Helper
 *
 * Provides a centralized, resilient way to call the IPS daemon
 * (port 3030) from Next.js API routes. Handles:
 *   - Connection refused / ECONNREFUSED (daemon not running)
 *   - 404 / 401 / 5xx from daemon
 *   - Timeouts
 */

const IPS_DAEMON_BASE = "http://localhost:3030";

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
    const res = await fetch(`${IPS_DAEMON_BASE}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    daemonOnline = res.ok;
  } catch {
    daemonOnline = false;
  }
  lastHealthCheck = now;
  return daemonOnline;
}

interface IpsProxyOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

interface IpsResult {
  ok: boolean;
  status: number;
  data: any;
  daemonOffline?: boolean;
}

/**
 * Proxy a request to the IPS daemon on port 3030.
 */
export async function ipsProxy(
  path: string,
  options: IpsProxyOptions = {}
): Promise<IpsResult> {
  const { method = "GET", body, timeoutMs = 10000, headers = {} } = options;

  const online = await checkDaemonHealth();
  if (!online) {
    return {
      ok: false,
      status: 503,
      data: { error: "IPS daemon is offline", daemonOffline: true },
      daemonOffline: true,
    };
  }

  try {
    const res = await fetch(`${IPS_DAEMON_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text().catch(() => "");
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    daemonOnline = false;
    return {
      ok: false,
      status: 503,
      data: { error: `IPS daemon connection failed: ${err.message}`, daemonOffline: true },
      daemonOffline: true,
    };
  }
}
