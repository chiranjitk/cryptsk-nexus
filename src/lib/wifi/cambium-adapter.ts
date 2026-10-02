/**
 * Cambium Networks Gateway Adapter
 * 
 * cnPilot & ePMP - ISP and hospitality focused WiFi solutions.
 * This adapter supports:
 * - cnMaestro Cloud/On-Premises Management API (v1)
 * - cnPilot Access Points
 * - ePMP Backhaul
 * - RADIUS authentication
 * - CoA for session management (via freeradius-service)
 * 
 * Auth: HTTP Basic authentication with apiUsername:apiPassword
 * API base: https://{ip}:{port}/api/v1/
 * 
 * References:
 * - https://cambiumnetworks.com/
 * - https://www.cambiumnetworks.com/products/wifi/
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

export interface CambiumConfig extends GatewayConfig {
  vendor: 'cambium';
  // Cambium-specific settings
  cnMaestroUrl?: string;
  cnMaestroApiKey?: string;
  accountId?: string;
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
 * Cambium Networks Gateway Adapter
 * 
 * Uses HTTP Basic authentication against cnMaestro API v1.
 * All CoA operations are routed through freeradius-service.
 */
export class CambiumAdapter extends GatewayAdapter {
  protected cambiumConfig: CambiumConfig;

  constructor(config: CambiumConfig) {
    super(config);
    this.cambiumConfig = config;
  }

  getVendor() {
    return 'cambium' as const;
  }

  /**
   * Get the base URL for cnMaestro API
   */
  private getBaseUrl(): string {
    const port = this.config.apiPort || 443;
    return `https://${this.config.ipAddress}:${port}/api/v1`;
  }

  /**
   * Build Basic Authorization header from config credentials
   */
  private getAuthHeaders(): Record<string, string> {
    const username = this.config.apiUsername || '';
    const password = this.config.apiPassword || '';

    if (!username || !password) {
      return {};
    }

    return {
      'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    };
  }

  /**
   * Make an authenticated request to cnMaestro API
   * Uses HTTP Basic auth for all requests
   */
  private async cnMaestroRequest(
    endpoint: string,
    options: {
      method?: string;
      body?: string;
    } = {}
  ): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
    const { method = 'GET', body } = options;
    const baseUrl = this.getBaseUrl();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      };

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers,
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          status: response.status,
          error: `cnMaestro authentication failed (status ${response.status})`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `cnMaestro API returned status ${response.status}`,
        };
      }

      const data = await response.json();
      return { ok: true, status: response.status, data };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'cnMaestro request failed',
      };
    }
  }

  /**
   * Test connection to cnMaestro
   * GET /api/v1/system/info
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      const result = await this.cnMaestroRequest('/system/info');

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
   * Get gateway status from cnMaestro
   * GET /api/v1/system/status
   * Parses uptime, firmware, and client counts
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      const result = await this.cnMaestroRequest('/system/status');

      if (!result.ok || !result.data) {
        return {
          online: false,
          lastSeen: new Date(),
        };
      }

      const d = result.data;

      return {
        online: true,
        firmwareVersion: d.firmware || d.version || d.softwareVersion || undefined,
        cpuUsage: d.cpuUsage !== undefined ? Number(d.cpuUsage) : undefined,
        memoryUsage: d.memoryUsage !== undefined ? Number(d.memoryUsage) : undefined,
        uptime: d.uptime !== undefined ? Number(d.uptime) : undefined,
        totalClients: d.clients !== undefined ? Number(d.clients) : undefined,
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
   * Get active sessions from cnMaestro
   * GET /api/v1/clients?status=online
   * Returns connected client list with MAC, IP, signal, data usage
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const result = await this.cnMaestroRequest('/clients?status=online');

      if (!result.ok || !result.data) {
        return [];
      }

      const clients = Array.isArray(result.data) ? result.data : (result.data.clients || result.data.clientList || []);

      return (Array.isArray(clients) ? clients : []).map((client: Record<string, unknown>) => ({
        sessionId: String(client.mac || client.clientMac || ''),
        username: String(client.hostname || client.name || client.mac || ''),
        ipAddress: String(client.ip || client.ipAddress || client.clientIp || ''),
        macAddress: String(client.mac || client.clientMac || ''),
        nasIpAddress: this.config.ipAddress,
        startTime: client.uptime || client.connectedTime || client.sessionStartTime
          ? new Date(Date.now() - Number(client.uptime || client.connectedTime || client.sessionStartTime) * 1000)
          : new Date(),
        duration: Number(client.uptime || client.sessionTime || client.connectedTime || 0),
        bytesIn: Number(client.rxBytes || client.bytesRx || client.downloadBytes || 0),
        bytesOut: Number(client.txBytes || client.bytesTx || client.uploadBytes || 0),
        status: 'active' as const,
        apName: String(client.apName || client.nodeName || client.accessPoint || ''),
        ssid: String(client.ssid || client.wlanName || ''),
        additionalInfo: {
          signal: client.signal || client.rssi,
          snr: client.snr,
          phy_rate: client.phyRate || client.phyRateRx || client.phyRateTx,
          frequency: client.frequency,
          bandwidth: client.bandwidth,
          network: client.network,
          vlan: client.vlan,
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
   * Get Cambium-specific RADIUS attributes for a policy
   * Uses standard WISPr-Bandwidth-Max-Down/Up attributes (bps)
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);
    // Cambium uses standard WISPr attributes (already set by parent)
    // These are in bps as per WISPr spec
    attrs['WISPr-Bandwidth-Max-Down'] = String(policy.downloadSpeed);
    attrs['WISPr-Bandwidth-Max-Up'] = String(policy.uploadSpeed);
    return attrs;
  }

  /**
   * Format bandwidth for Cambium cnMaestro
   * Uses WISPr format in bps
   */
  formatBandwidthLimit(download: number, upload: number): string {
    return `${download}/${upload}`;
  }

  getHealthCheckEndpoints(): string[] {
    return ['/api/v1/system/info', '/api/v1/system/status'];
  }
}
