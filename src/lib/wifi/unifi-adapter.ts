/**
 * Ubiquiti UniFi Gateway Adapter
 * 
 * UniFi Network Application - Enterprise grade WiFi for hospitality.
 * This adapter supports:
 * - UniFi Controller REST API
 * - Guest Portal
 * - VLAN Networks
 * - RADIUS authentication
 * - CoA for session management (via freeradius-service)
 * 
 * Auth flow:
 * 1. POST /api/login with JSON {username, password}
 * 2. Capture Set-Cookie and X-CSRF-Token from response headers
 * 3. Include both in all subsequent API calls
 * 
 * References:
 * - https://ui.com/
 * - https://developer.ui.com/
 */

import {
  GatewayAdapter,
  GatewayConfig,
  CoARequest,
  CoAResponse,
  SessionInfo,
  GatewayStatus,
  BandwidthPolicy,
} from './gateway-adapter';

const RADIUS_SERVICE_URL = process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

export interface UniFiConfig extends GatewayConfig {
  vendor: 'unifi';
  // UniFi-specific settings
  controllerUrl?: string;
  site?: string;
  verifySsl?: boolean;
  portalEnabled?: boolean;
}

/**
 * Helper to make requests to the freeradius-service
 * Used for all CoA operations that require radclient CLI
 */
async function freeradiusRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${RADIUS_SERVICE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedError;
    try {
      parsedError = JSON.parse(errorBody);
    } catch {
      parsedError = { error: errorBody };
    }
    return { success: false, status: response.status, ...parsedError };
  }

  return response.json();
}

/**
 * Ubiquiti UniFi Gateway Adapter
 * 
 * Uses cookie + CSRF token authentication against UniFi Controller API.
 * All CoA operations are routed through freeradius-service.
 */
export class UniFiAdapter extends GatewayAdapter {
  protected unifiConfig: UniFiConfig;

  constructor(config: UniFiConfig) {
    super(config);
    this.unifiConfig = config;
  }

  getVendor() {
    return 'unifi' as const;
  }

  /**
   * Get the base URL for UniFi Controller API
   */
  private getBaseUrl(): string {
    const port = this.config.apiPort || 8443;
    return `https://${this.config.ipAddress}:${port}`;
  }

  /**
   * Get the site identifier (defaults to "default")
   */
  private getSite(): string {
    return this.unifiConfig.site || 'default';
  }

  /**
   * Authenticate with UniFi Controller
   * Returns cookies and CSRF token needed for subsequent requests
   */
  private async authenticate(): Promise<{
    cookie: string;
    csrfToken: string;
  }> {
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.config.apiUsername || 'admin',
        password: this.config.apiPassword || '',
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`UniFi login failed with status ${response.status}`);
    }

    // Extract cookies from Set-Cookie header
    const setCookieHeader = response.headers.get('set-cookie') || '';
    // Combine all cookies into a single string (UniFi typically returns multiple)
    const cookies = setCookieHeader
      .split(',')
      .map((c) => c.split(';')[0].trim())
      .join('; ');

    // Extract CSRF token from response headers or body
    const csrfToken = response.headers.get('x-csrf-token') || '';

    return { cookie: cookies, csrfToken };
  }

  /**
   * Make an authenticated request to UniFi Controller API
   * Handles authentication and retries on 401
   */
  private async unifiRequest(
    endpoint: string,
    options: {
      method?: string;
      body?: string;
      retries?: number;
    } = {}
  ): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
    const { method = 'GET', body, retries = 0 } = options;
    const baseUrl = this.getBaseUrl();
    const site = this.getSite();
    const maxRetries = 1;

    try {
      // Authenticate
      const { cookie, csrfToken } = await this.authenticate();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cookie': cookie,
      };
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers,
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 401 && retries < maxRetries) {
        // Token expired, retry with fresh auth
        return this.unifiRequest(endpoint, { method, body, retries: retries + 1 });
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `UniFi API returned status ${response.status}`,
        };
      }

      const data = await response.json();
      // UniFi API wraps responses in an array: [{ ...metadata, ... }]
      const result = Array.isArray(data) ? data[0] : data;

      if (result && result.meta && result.meta.rc !== 'ok') {
        return {
          ok: false,
          status: response.status,
          error: result.meta.msg || 'UniFi API error',
        };
      }

      return { ok: true, status: response.status, data: result };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'UniFi request failed',
      };
    }
  }

  /**
   * Test connection to UniFi Controller
   * GET /api/s/default/stat/sysinfo
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      const result = await this.unifiRequest(`/api/s/${this.getSite()}/stat/sysinfo`);

      const latency = Date.now() - startTime;

      if (result.ok) {
        return { success: true, latency };
      }

      return {
        success: false,
        latency,
        error: result.error || 'Connection test failed',
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        latency,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Get gateway status from UniFi Controller
   * GET /api/s/default/stat/sysinfo — parses uptime, version, cpu, mem, num_sta
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      const result = await this.unifiRequest(`/api/s/${this.getSite()}/stat/sysinfo`);

      if (!result.ok || !result.data) {
        return {
          online: false,
          lastSeen: new Date(),
        };
      }

      const d = result.data;

      return {
        online: true,
        firmwareVersion: d.version || undefined,
        cpuUsage: d.cpu !== undefined ? d.cpu : undefined,
        memoryUsage: d.mem !== undefined ? d.mem : undefined,
        uptime: d.uptime !== undefined ? Number(d.uptime) : undefined,
        totalClients: d['num_sta'] !== undefined ? Number(d['num_sta']) : undefined,
        lastSeen: new Date(),
      };
    } catch {
      return {
        online: false,
        lastSeen: new Date(),
      };
    }
  }

  /**
   * Get active sessions from UniFi Controller
   * GET /api/s/default/stat/sta — returns client list with MAC, IP, hostname, tx/rx, channel, ssid, ap_name
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const result = await this.unifiRequest(`/api/s/${this.getSite()}/stat/sta`);

      if (!result.ok || !result.data) {
        return [];
      }

      const clients = Array.isArray(result.data) ? result.data : [];

      return clients.map((client: Record<string, unknown>) => ({
        sessionId: String(client.mac || ''),
        username: String(client.hostname || client.mac || ''),
        ipAddress: String(client.ip || ''),
        macAddress: String(client.mac || ''),
        nasIpAddress: this.config.ipAddress,
        startTime: new Date(),
        duration: Number(client.uptime || 0),
        bytesIn: Number(client.rx_bytes || 0),
        bytesOut: Number(client.tx_bytes || 0),
        status: 'active' as const,
        apName: String(client.ap_name || ''),
        ssid: String(client.essid || client.ssid || ''),
        channel: client.channel ? Number(client.channel) : undefined,
        additionalInfo: {
          channel: client.channel,
          radio: client.radio || client.radio_proto,
          noise: client.noise,
          signal: client.signal,
          tx_power: client.tx_power,
          satisfaction: client.satisfaction,
          last_seen: client.last_seen,
        },
      }));
    } catch {
      return [];
    }
  }

  /**
   * Send CoA request through freeradius-service
   * Routes through freeradius-service which uses radclient CLI
   */
  async sendCoA(request: CoARequest): Promise<CoAResponse> {
    try {
      const coaAttributes: Record<string, string> = {
        'User-Name': request.username,
        'Acct-Session-Id': request.sessionId,
      };

      // Include any additional attributes from the request
      if (request.attributes) {
        Object.assign(coaAttributes, request.attributes);
      }

      const result = await freeradiusRequest('/api/coa/disconnect', {
        method: 'POST',
        body: JSON.stringify({
          username: request.username,
          sessionId: request.sessionId,
          nasIp: this.config.ipAddress,
          coaPort: this.config.coaPort,
          secret: this.config.coaSecret || this.config.radiusSecret,
          action: request.action,
          attributes: coaAttributes,
        }),
      });

      return {
        success: result.success !== false,
        message: result.message || `CoA ${request.action} sent`,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'CoA failed',
      };
    }
  }

  /**
   * Disconnect a session via CoA
   */
  async disconnectSession(sessionId: string, username: string): Promise<CoAResponse> {
    return this.sendCoA({
      username,
      sessionId,
      action: 'disconnect',
    });
  }

  /**
   * Update bandwidth for a session via CoA
   */
  async updateBandwidth(
    sessionId: string,
    username: string,
    policy: BandwidthPolicy
  ): Promise<CoAResponse> {
    const attributes = this.getRadiusAttributes(policy);
    return this.sendCoA({
      username,
      sessionId,
      action: 'update',
      attributes,
    });
  }

  /**
   * Get UniFi-specific RADIUS attributes for a policy
   * Adds UniFi-Rate-Limit in format "downM/upM"
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);
    const downloadMbps = policy.downloadSpeed / 1000000;
    const uploadMbps = policy.uploadSpeed / 1000000;
    attrs['UniFi-Rate-Limit'] = `${downloadMbps}M/${uploadMbps}M`;
    return attrs;
  }

  /**
   * Format bandwidth for UniFi
   * UniFi uses: down-Mbps/up-Mbps
   */
  formatBandwidthLimit(download: number, upload: number): string {
    return `${download / 1000000}M/${upload / 1000000}M`;
  }

  getHealthCheckEndpoints(): string[] {
    return [
      `/api/s/${this.getSite()}/stat/sysinfo`,
      `/api/s/${this.getSite()}/stat/health`,
    ];
  }
}
