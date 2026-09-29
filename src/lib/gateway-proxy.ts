/**
 * Cryptsk — Gateway Service Proxy Helper
 *
 * Provides a centralized, resilient way to call the gateway-service
 * (port 3005) from Next.js API routes. Handles:
 *   - Connection refused / ECONNREFUSED (gateway not running)
 *   - 404 / 401 / 5xx from gateway
 *   - Timeouts
 *
 * All errors are handled gracefully — no console.error spam in production.
 */

const GATEWAY_BASE = process.env.GATEWAY_URL || "http://localhost:3005";

/** Cache the gateway health status to avoid repeated failed connections
 * NOTE: Module-level caching works for long-running Node.js processes but will not persist
 * across serverless function invocations (e.g., Vercel Edge). This is acceptable for our deployment model. */
let gatewayOnline: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 30_000; // Re-check every 30s

async function checkGatewayHealth(): Promise<boolean> {
  const now = Date.now();
  if (gatewayOnline !== null && now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return gatewayOnline;
  }
  try {
    const res = await fetch(`${GATEWAY_BASE}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    gatewayOnline = res.ok;
  } catch {
    gatewayOnline = false;
  }
  lastHealthCheck = now;
  return gatewayOnline;
}

interface GatewayProxyOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  /** If true, returns { error: "Gateway offline", gatewayOffline: true } instead of throwing */
  gracefulOffline?: boolean;
}

interface GatewayResult {
  ok: boolean;
  status: number;
  data: any;
  gatewayOffline?: boolean;
}

/**
 * Proxy a request to the gateway-service.
 *
 * Usage:
 *   const result = await gatewayProxy("/api/interfaces", { method: "GET" });
 *   if (result.gatewayOffline) return NextResponse.json(result, { status: 503 });
 *   if (!result.ok) return NextResponse.json(result, { status: result.status });
 *   return NextResponse.json(result.data);
 */
export async function gatewayProxy(
  path: string,
  options: GatewayProxyOptions = {}
): Promise<GatewayResult> {
  const { method = "GET", body, timeoutMs = 10000, gracefulOffline = true } = options;

  // Check if gateway is reachable
  const online = await checkGatewayHealth();
  if (!online) {
    return {
      ok: false,
      status: 503,
      data: { error: "Gateway service is offline", gatewayOffline: true },
      gatewayOffline: true,
    };
  }

  try {
    const res = await fetch(`${GATEWAY_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
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
    // Connection error after health check said we were online — mark offline
    gatewayOnline = false;
    return {
      ok: false,
      status: 503,
      data: { error: `Gateway connection failed: ${err.message}`, gatewayOffline: true },
      gatewayOffline: true,
    };
  }
}

/** Get the gateway base URL (useful for constructing URLs) */
export function getGatewayBase(): string {
  return GATEWAY_BASE;
}
