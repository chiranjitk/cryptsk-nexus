/**
 * Aruba Networks (HPE) Gateway Adapter
 * 
 * ArubaOS & Central - Enterprise hospitality WiFi solutions.
 * This adapter supports:
 * - Aruba Mobility Controller REST API
 * - Aruba Central Cloud Management
 * - ClearPass Integration
 * - Role-based Access
 * - RADIUS authentication
 * - CoA for session management (via freeradius-service)
 * 
 * Auth flow:
 * 1. POST /v1/api/login with JSON {user, password}
 * 2. Capture session cookie from Set-Cookie header
 * 3. Include cookie in all subsequent API calls
 * 
 * API endpoints:
 * - /v1/configuration/showcommand?command=... — run CLI show commands via REST
 * - /rest/v1/ — newer REST API paths
 * 
 * References:
 * - https://www.arubanetworks.com/
 * - https://developer.arubanetworks.com/
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

export interface ArubaConfig extends GatewayConfig {
  vendor: 'aruba';
  // Aruba-specific settings
  centralUrl?: string;
  clientId?: string;
  clientSecret?: string;
  customerId?: string;
  sharedSecret?: string;
  role?: string;
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
 * Aruba Networks Gateway Adapter
 * 
 * Uses cookie-based authentication against Aruba Mobility Controller API.
 * All CoA operations are routed through freeradius-service.
 */
export class ArubaAdapter extends GatewayAdapter {
  protected arubaConfig: ArubaConfig;

  constructor(config: ArubaConfig) {
    super(config);
    this.arubaConfig = config;
  }

  getVendor() {
    return 'aruba' as const;
  }

  /**
   * Get the base URL for Aruba Mobility Controller API
   */
  private getBaseUrl(): string {
    const port = this.config.apiPort || 443;
    return `https://${this.config.ipAddress}:${port}`;
  }

  /**
   * Authenticate with Aruba Mobility Controller
   * POST /v1/api/login with {user, password}
   * Returns session cookie needed for subsequent requests
   */
  private async authenticate(): Promise<string> {
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}/v1/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: this.config.apiUsername || 'admin',
        password: this.config.apiPassword || '',
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Aruba login failed with status ${response.status}`);
    }

    // Extract session cookie from Set-Cookie header
    const setCookieHeader = response.headers.get('set-cookie') || '';
    const cookies = setCookieHeader
      .split(',')
      .map((c) => c.split(';')[0].trim())
      .join('; ');

    if (!cookies) {
      throw new Error('Aruba login succeeded but no session cookie returned');
    }

    return cookies;
  }

  /**
   * Make an authenticated request to Aruba Mobility Controller API
   * Handles authentication and retries on 401
   */
  private async arubaRequest(
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
      // Authenticate and get cookie
      const cookie = await this.authenticate();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cookie': cookie,
      };

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers,
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 401 && retries < maxRetries) {
        // Session expired, retry with fresh auth
        return this.arubaRequest(endpoint, { method, body, retries: retries + 1 });
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `Aruba API returned status ${response.status}`,
        };
      }

      const data = await response.json();
      return { ok: true, status: response.status, data };
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
        error: error instanceof Error ? error.message : 'Aruba request failed',
      };
    }
  }

  /**
   * Run a CLI show command via the Aruba REST API
   * GET /v1/configuration/showcommand?command=<command>
   * Returns parsed output from the command
   */
  private async runShowCommand(command: string): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
    const encoded = encodeURIComponent(command);
    return this.arubaRequest(`/v1/configuration/showcommand?command=${encoded}`);
  }

  /**
   * Test connection to Aruba Mobility Controller
   * GET /v1/configuration/showcommand?command=show version
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      const result = await this.runShowCommand('show version');

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
   * Get gateway status from Aruba Mobility Controller
   * GET /v1/configuration/showcommand?command=show ap database summary
   * Parses AP status, firmware, and client counts
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      // Get version info
      const versionResult = await this.runShowCommand('show version');

      if (!versionResult.ok || !versionResult.data) {
        return {
          online: false,
          lastSeen: new Date(),
        };
      }

      // Get AP database for client counts and system info
      const apResult = await this.runShowCommand('show ap database summary');

      const versionData = versionResult.data;
      const totalClients = apResult.ok && apResult.data
        ? (apResult.data.Total_Num_Stations || apResult.data.Total_Clients || 0)
        : undefined;

      return {
        online: true,
        firmwareVersion: versionData.Version || versionData.software_version || undefined,
        cpuUsage: versionData.CPU_Usage !== undefined ? Number(versionData.CPU_Usage) : undefined,
        memoryUsage: versionData.Memory_Usage !== undefined ? Number(versionData.Memory_Usage) : undefined,
        uptime: versionData.Up_Time || versionData.uptime ? Number(versionData.Up_Time || versionData.uptime) : undefined,
        totalClients: totalClients !== undefined ? Number(totalClients) : undefined,
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
   * Get active sessions from Aruba Mobility Controller
   * GET /v1/configuration/showcommand?command=show user
   * Returns user/session list with MAC, IP, role, and AP info
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const result = await this.runShowCommand('show user');

      if (!result.ok || !result.data) {
        return [];
      }

      // Aruba returns user list — could be an array or an object with a Users/User_list key
      const users = Array.isArray(result.data)
        ? result.data
        : (result.data.Users || result.data.User_List || result.data.user_list || []);

      return (Array.isArray(users) ? users : []).map((user: Record<string, unknown>) => ({
        sessionId: String(user['MAC Address'] || user.mac || user.mac_address || ''),
        username: String(user['User Name'] || user.username || user['Role'] || ''),
        ipAddress: String(user['IP Address'] || user.ip || user.ip_address || ''),
        macAddress: String(user['MAC Address'] || user.mac || user.mac_address || ''),
        nasIpAddress: this.config.ipAddress,
        startTime: user['Time Connected'] || user.login_time
          ? new Date(String(user['Time Connected'] || user.login_time))
          : new Date(),
        duration: Number(user['Up Time'] || user.uptime || user.session_time || 0),
        bytesIn: Number(user['Bytes Rx'] || user.rx_bytes || 0),
        bytesOut: Number(user['Bytes Tx'] || user.tx_bytes || 0),
        status: 'active' as const,
        apName: String(user['AP Name'] || user.ap_name || user.bssid || ''),
        ssid: String(user['ESSID'] || user.essid || user.ssid || ''),
        additionalInfo: {
          role: user['Role'] || user.role,
          ap_name: user['AP Name'] || user.ap_name,
          vlan: user['VLAN'] || user.vlan,
          auth_method: user['Authentication'] || user.auth_method,
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
   * Get Aruba-specific RADIUS attributes for a policy
   * Adds Aruba-BW-Contract in format "downM/upM" and optional Aruba-User-Role
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);
    const downloadMbps = policy.downloadSpeed / 1000000;
    const uploadMbps = policy.uploadSpeed / 1000000;
    attrs['Aruba-BW-Contract'] = `${downloadMbps}M/${uploadMbps}M`;
    if (this.arubaConfig.role) {
      attrs['Aruba-User-Role'] = this.arubaConfig.role;
    }
    return attrs;
  }

  /**
   * Format bandwidth for Aruba
   * Aruba uses: down-Mbps/up-Mbps
   */
  formatBandwidthLimit(download: number, upload: number): string {
    return `${download / 1000000}M/${upload / 1000000}M`;
  }

  getHealthCheckEndpoints(): string[] {
    return [
      '/v1/configuration/showcommand?command=show version',
      '/v1/configuration/object/audit_logging',
    ];
  }
}
