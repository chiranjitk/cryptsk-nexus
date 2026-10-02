/**
 * Grandstream WiFi Gateway Adapter
 * 
 * Grandstream GWN Series is popular in SMB hospitality deployments worldwide.
 * This adapter supports:
 * - GWN Manager (Cloud/On-Premises) REST API v1
 * - GWN7000, GWN7600, GWN7605, GWN7610, GWN7625, GWN7630, GWN7660 Access Points
 * - Captive Portal
 * - RADIUS authentication
 * - CoA for session management (via freeradius-service)
 * 
 * Auth: HTTP Basic authentication with apiUsername:apiPassword
 * API base: https://{ip}:{port}/api/v1/
 * 
 * References:
 * - https://www.grandstream.com/products/networking-wifi-access-points
 * - https://www.grandstream.com/support/tools/gwn-api
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

export interface GrandstreamConfig extends GatewayConfig {
  vendor: 'grandstream';
  // Grandstream-specific settings
  gwnManagerUrl?: string;
  gwnManagerUsername?: string;
  gwnManagerPassword?: string;
  gwnManagerTenantId?: string;
  apModel?: string;
  apMacAddress?: string;
  useCloudManager?: boolean;
  captivePortalEnabled?: boolean;
  captivePortalUrl?: string;
}

/**
 * Grandstream VSA Attribute Types (Vendor ID: 10055)
 */
enum GrandstreamVSA {
  BANDWIDTH_MAX_DOWN = 1,
  BANDWIDTH_MAX_UP = 2,
  SESSION_TIMEOUT = 3,
  IDLE_TIMEOUT = 4,
  VLAN_ID = 5,
  USER_GROUP = 6,
  QOS_PROFILE = 7,
  MAX_DATA_LIMIT = 8,
  PORTAL_URL = 9,
  CLIENT_ISOLATION = 10,
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
 * Grandstream GWN Gateway Adapter
 * 
 * Uses HTTP Basic authentication against GWN Manager API v1.
 * All CoA operations are routed through freeradius-service.
 */
export class GrandstreamAdapter extends GatewayAdapter {
  protected grandstreamConfig: GrandstreamConfig;

  constructor(config: GrandstreamConfig) {
    super(config);
    this.grandstreamConfig = config;
  }

  getVendor() {
    return 'grandstream' as const;
  }

  /**
   * Get the base URL for GWN Manager API
   * Prefers explicit gwnManagerUrl, falls back to ip + port
   */
  private getBaseUrl(): string {
    if (this.grandstreamConfig.gwnManagerUrl) {
      // Ensure no trailing slash
      return this.grandstreamConfig.gwnManagerUrl.replace(/\/+$/, '');
    }
    const port = this.config.apiPort || 443;
    return `https://${this.config.ipAddress}:${port}`;
  }

  /**
   * Build Basic Authorization header from config credentials
   * Supports both apiUsername/apiPassword and gwnManagerUsername/gwnManagerPassword
   */
  private getAuthHeaders(): Record<string, string> {
    const username = this.config.apiUsername || this.grandstreamConfig.gwnManagerUsername || '';
    const password = this.config.apiPassword || this.grandstreamConfig.gwnManagerPassword || '';

    if (!username || !password) {
      return {};
    }

    return {
      'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    };
  }

  /**
   * Make an authenticated request to GWN Manager API
   * Uses HTTP Basic auth for all requests
   */
  private async gwnRequest(
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

      // Add tenant header for multi-tenant deployments
      if (this.grandstreamConfig.gwnManagerTenantId) {
        headers['X-Tenant-ID'] = this.grandstreamConfig.gwnManagerTenantId;
      }

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
          error: `GWN Manager authentication failed (status ${response.status})`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `GWN Manager API returned status ${response.status}`,
        };
      }

      const data = await response.json();
      return { ok: true, status: response.status, data };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : 'GWN Manager request failed',
      };
    }
  }

  /**
   * Test connection to GWN Manager
   * GET /api/v1/system/status
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      const result = await this.gwnRequest('/api/v1/system/status');

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
   * Get gateway status from GWN Manager
   * GET /api/v1/system/status
   * Parses firmware, CPU, memory, uptime, and client counts
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      const result = await this.gwnRequest('/api/v1/system/status');

      if (!result.ok || !result.data) {
        return {
          online: false,
          lastSeen: new Date(),
        };
      }

      const d = result.data;

      return {
        online: true,
        firmwareVersion: d.firmwareVersion || d.firmware || d.version || undefined,
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
   * Get active sessions from GWN Manager
   * GET /api/v1/clients?status=connected
   * Returns connected client list with MAC, IP, hostname, SSID, signal, data usage
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const result = await this.gwnRequest('/api/v1/clients?status=connected');

      if (!result.ok || !result.data) {
        return [];
      }

      const clients = Array.isArray(result.data) ? result.data : (result.data.clients || result.data.clientList || []);

      return (Array.isArray(clients) ? clients : []).map((client: Record<string, unknown>) => ({
        sessionId: String(client.mac || client.macAddress || ''),
        username: String(client.hostname || client.name || client.mac || ''),
        ipAddress: String(client.ip || client.ipAddress || ''),
        macAddress: String(client.mac || client.macAddress || ''),
        nasIpAddress: this.config.ipAddress,
        startTime: client.connectedTime || client.uptime || client.sessionStartTime
          ? new Date(Date.now() - Number(client.connectedTime || client.uptime || client.sessionStartTime) * 1000)
          : new Date(),
        duration: Number(client.connectedTime || client.uptime || client.sessionTime || 0),
        bytesIn: Number(client.rxBytes || client.bytesRx || client.downloadBytes || 0),
        bytesOut: Number(client.txBytes || client.bytesTx || client.uploadBytes || 0),
        status: 'active' as const,
        apName: String(client.apName || client.apMac || client.ap || ''),
        ssid: String(client.ssid || client.ssidName || ''),
        additionalInfo: {
          ssid: client.ssid || client.ssidName,
          signal: client.signal || client.rssi,
          channel: client.channel,
          bandwidth: client.bandwidth,
          vlan: client.vlanId || client.vlan,
          device_type: client.deviceType || client.device_type,
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
    // Try GWN Manager API first for direct disconnect
    try {
      const result = await this.gwnRequest(`/api/v1/clients/${sessionId}/disconnect`, {
        method: 'POST',
      });

      if (result.ok) {
        return {
          success: true,
          message: 'Session disconnected via GWN Manager',
        };
      }
    } catch {
      // Fall through to CoA
    }

    // Fallback to CoA via freeradius-service
    return this.sendCoA({
      username,
      sessionId,
      action: 'disconnect',
    });
  }

  /**
   * Update bandwidth for a session
   * Tries GWN Manager API first, falls back to CoA
   */
  async updateBandwidth(
    sessionId: string,
    username: string,
    policy: BandwidthPolicy
  ): Promise<CoAResponse> {
    // Try GWN Manager API for direct bandwidth update
    try {
      const downloadKbps = Math.ceil(policy.downloadSpeed / 1000);
      const uploadKbps = Math.ceil(policy.uploadSpeed / 1000);

      const result = await this.gwnRequest(`/api/v1/clients/${sessionId}/bandwidth`, {
        method: 'PUT',
        body: JSON.stringify({
          download_limit: downloadKbps,
          upload_limit: uploadKbps,
        }),
      });

      if (result.ok) {
        return {
          success: true,
          message: 'Bandwidth updated via GWN Manager',
        };
      }
    } catch {
      // Fall through to CoA
    }

    // Fallback to CoA via freeradius-service
    const attrs = this.getRadiusAttributes(policy);
    return this.sendCoA({
      username,
      sessionId,
      action: 'update',
      attributes: attrs,
    });
  }

  /**
   * Get Grandstream-specific RADIUS attributes for a policy
   * Uses WISPr attributes (in Kbps) and Grandstream VSA attributes
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);

    // WISPr attributes (Grandstream supports these) — in Kbps
    const downloadKbps = Math.ceil(policy.downloadSpeed / 1000);
    const uploadKbps = Math.ceil(policy.uploadSpeed / 1000);

    attrs['WISPr-Bandwidth-Max-Down'] = String(downloadKbps);
    attrs['WISPr-Bandwidth-Max-Up'] = String(uploadKbps);

    // Grandstream VSA attributes
    attrs['Grandstream-Bandwidth-Down'] = String(downloadKbps);
    attrs['Grandstream-Bandwidth-Up'] = String(uploadKbps);

    return attrs;
  }

  /**
   * Format bandwidth for Grandstream
   * Uses human-readable format: e.g., "10M/5M", "512K/256K", "1.5G/500M"
   */
  formatBandwidthLimit(download: number, upload: number): string {
    const formatRate = (bps: number): string => {
      const kbps = Math.ceil(bps / 1000);
      if (kbps >= 1000000) return `${(kbps / 1000000).toFixed(1)}G`;
      if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)}M`;
      return `${kbps}K`;
    };
    return `${formatRate(download)}/${formatRate(upload)}`;
  }

  getHealthCheckEndpoints(): string[] {
    return ['/api/v1/system/status', '/api/v1/clients'];
  }

  /**
   * Configure SSID via GWN Manager API
   */
  async configureSSID(
    ssidName: string,
    options?: {
      password?: string;
      vlanId?: number;
      bandwidthLimit?: { download: number; upload: number };
      captivePortal?: boolean;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const opts = options || {};

    try {
      const result = await this.gwnRequest('/api/v1/ssids', {
        method: 'POST',
        body: JSON.stringify({
          name: ssidName,
          security: opts.password ? 'wpa2-psk' : 'open',
          password: opts.password,
          vlan_id: opts.vlanId,
          bandwidth_limit: opts.bandwidthLimit ? {
            download: Math.ceil(opts.bandwidthLimit.download / 1000),
            upload: Math.ceil(opts.bandwidthLimit.upload / 1000),
          } : undefined,
          captive_portal: opts.captivePortal,
        }),
      });

      if (result.ok) {
        return { success: true };
      }

      return {
        success: false,
        error: result.error || 'SSID configuration failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'SSID configuration failed',
      };
    }
  }

  /**
   * Get access points from GWN Manager
   */
  async getAPs(): Promise<any[]> {
    const result = await this.gwnRequest('/api/v1/aps');

    if (!result.ok || !result.data) {
      return [];
    }

    const aps = Array.isArray(result.data) ? result.data : (result.data.aps || []);
    return Array.isArray(aps) ? aps : [];
  }

  /**
   * Get AP statistics from GWN Manager
   */
  async getAPStats(apMac?: string): Promise<any> {
    const mac = apMac || this.grandstreamConfig.apMacAddress;
    if (!mac) return null;

    const result = await this.gwnRequest(`/api/v1/aps/${mac}/stats`);
    return result.ok ? result.data : null;
  }
}
