/**
 * TP-Link Omada Gateway Adapter
 * 
 * TP-Link Omada SDN - Cost-effective enterprise WiFi for hospitality.
 * This adapter supports:
 * - Omada Controller REST API (v2)
 * - EAP Access Points
 * - Captive Portal
 * - RADIUS authentication
 * - CoA for session management (via freeradius-service)
 * 
 * Auth flow:
 * 1. POST /api/v2/login with JSON {username, password}
 * 2. Response contains {token} — set as Omada-Cookie header
 * 3. Include Omada-Cookie header in all subsequent requests
 * 
 * References:
 * - https://www.tp-link.com/us/business-networking/omada-sdn/
 * - https://www.tp-link.com/en/download/omada-sdn-controller/
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

export interface TPLinkConfig extends GatewayConfig {
  vendor: 'tplink';
  // TP-Link Omada-specific settings
  controllerUrl?: string;
  controllerUsername?: string;
  controllerPassword?: string;
  siteId?: string;
  siteName?: string;
  portalProfileId?: string;
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
 * TP-Link Omada Gateway Adapter
 * 
 * Uses token-based authentication against Omada Controller API v2.
 * All CoA operations are routed through freeradius-service.
 */
export class TPLinkAdapter extends GatewayAdapter {
  protected tplinkConfig: TPLinkConfig;
  private cachedToken: string | null = null;

  constructor(config: TPLinkConfig) {
    super(config);
    this.tplinkConfig = config;
  }

  getVendor() {
    return 'tplink' as const;
  }

  /**
   * Get the base URL for Omada Controller API
   */
  private getBaseUrl(): string {
    const port = this.config.apiPort || 8043;
    return `https://${this.config.ipAddress}:${port}`;
  }

  /**
   * Get the site identifier (defaults to "Default")
   */
  private getSiteName(): string {
    return this.tplinkConfig.siteName || this.tplinkConfig.siteId || 'Default';
  }

  /**
   * Authenticate with Omada Controller
   * POST /api/v2/login with {username, password}
   * Returns token to use as Omada-Cookie header
   */
  private async authenticate(): Promise<string> {
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}/api/v2/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.config.apiUsername || this.tplinkConfig.controllerUsername || 'admin',
        password: this.config.apiPassword || this.tplinkConfig.controllerPassword || '',
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Omada login failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data.token) {
      throw new Error('Omada login succeeded but no token returned');
    }

    this.cachedToken = data.token;
    return data.token;
  }

  /**
   * Make an authenticated request to Omada Controller API
   * Handles authentication and retries on 401
   */
  private async omadaRequest(
    endpoint: string,
    options: {
      method?: string;
      body?: string;
      retries?: number;
    } = {}
  ): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
    const { method = 'GET', body, retries = 0 } = options;
    const baseUrl = this.getBaseUrl();
    const maxRetries = 1;

    try {
      // Use cached token or authenticate fresh
      let token = this.cachedToken;
      if (!token) {
        token = await this.authenticate();
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Omada-Cookie': token,
      };

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers,
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 401 && retries < maxRetries) {
        // Token expired, clear cache and retry
        this.cachedToken = null;
        return this.omadaRequest(endpoint, { method, body, retries: retries + 1 });
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `Omada API returned status ${response.status}`,
        };
      }

      const data = await response.json();

      // Omada API wraps in { result, errorCode, msg }
      if (data.errorCode !== undefined && data.errorCode !== 0) {
        return {
          ok: false,
          status: response.status,
          error: data.msg || `Omada API error code ${data.errorCode}`,
        };
      }

      return { ok: true, status: response.status, data: data.result !== undefined ? data.result : data };
    } catch (error) {
      if (error instanceof Error && error.message.includes('login failed')) {
        return {
          ok: false,
          status: 0,
          error: error.message,
        };
      }
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Omada request failed',
      };
    }
  }

  /**
   * Test connection to Omada Controller
   * GET /api/v2/info
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      const result = await this.omadaRequest('/api/v2/info');

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
   * Get gateway status from Omada Controller
   * GET /api/v2/sites/{siteName}/devices/stats
   * Parses uptime, firmware, and client counts
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      const siteName = this.getSiteName();
      const result = await this.omadaRequest(`/api/v2/sites/${siteName}/devices/stats`);

      if (!result.ok || !result.data) {
        return {
          online: false,
          lastSeen: new Date(),
        };
      }

      const d = result.data;

      return {
        online: true,
        firmwareVersion: d.firmwareVersion || d.firmware || undefined,
        cpuUsage: d.cpuUsage !== undefined ? Number(d.cpuUsage) : undefined,
        memoryUsage: d.memoryUsage !== undefined ? Number(d.memoryUsage) : undefined,
        uptime: d.uptime !== undefined ? Number(d.uptime) : undefined,
        totalClients: d.totalClients !== undefined ? Number(d.totalClients) : undefined,
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
   * Get active sessions from Omada Controller
   * GET /api/v2/sites/{siteName}/clients?filter.active=true
   * Returns client list with MAC, IP, hostname, tx/rx, SSID, AP info
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const siteName = this.getSiteName();
      const result = await this.omadaRequest(`/api/v2/sites/${siteName}/clients?filter.active=true`);

      if (!result.ok || !result.data) {
        return [];
      }

      const clients = Array.isArray(result.data) ? result.data : (result.data.clients || []);

      return (Array.isArray(clients) ? clients : []).map((client: Record<string, unknown>) => ({
        sessionId: String(client.mac || ''),
        username: String(client.hostname || client.name || client.mac || ''),
        ipAddress: String(client.ip || client.ipAddress || ''),
        macAddress: String(client.mac || ''),
        nasIpAddress: this.config.ipAddress,
        startTime: new Date(),
        duration: Number(client.activeTime || client.uptime || 0),
        bytesIn: Number(client.rxBytes || client.totalRxBytes || 0),
        bytesOut: Number(client.txBytes || client.totalTxBytes || 0),
        status: 'active' as const,
        apName: String(client.apName || client.deviceName || ''),
        ssid: String(client.ssid || client.networkName || ''),
        vlanId: client.vlanId ? Number(client.vlanId) : undefined,
        additionalInfo: {
          signal: client.signal || client.rssi,
          channel: client.channel,
          band: client.band,
          device_type: client.deviceType,
          activity: client.activities,
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
   * Get TP-Link-specific RADIUS attributes for a policy
   * TP-Link-Rate-Limit in Kbps format: "downKbps/upKbps"
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);
    const downloadKbps = policy.downloadSpeed / 1000;
    const uploadKbps = policy.uploadSpeed / 1000;
    attrs['TP-Link-Rate-Limit'] = `${downloadKbps}/${uploadKbps}`;
    return attrs;
  }

  /**
   * Format bandwidth for TP-Link Omada
   * Omada uses: down-Kbps/up-Kbps
   */
  formatBandwidthLimit(download: number, upload: number): string {
    return `${download / 1000}/${upload / 1000}`;
  }

  getHealthCheckEndpoints(): string[] {
    return ['/api/v2/info', '/api/v2/sites'];
  }
}
