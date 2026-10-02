/**
 * D-Link WiFi Gateway Adapter — Real API Calls
 *
 * Communicates directly with D-Link Nuclias Connect controllers
 * (DWC-1000, DWC-2020, DWC-3020) via their REST API and routes
 * RADIUS CoA / disconnect / bandwidth-change operations through
 * the shared FreeRADIUS micro-service.
 *
 * API base: https://{ip}:{port}/api/v2/
 * Auth:     HTTP Basic (apiUsername / apiPassword)
 *
 * RADIUS Vendor ID: 171 (D-Link)
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

// ============================================================================
// Types, Constants, Exports
// ============================================================================

export const DLINK_VENDOR_ID = 171;

export const DLINK_VSA_ATTRIBUTES = {
  DLINK_BANDWIDTH_MAX_DOWN: 1,
  DLINK_BANDWIDTH_MAX_UP: 2,
  DLINK_BANDWIDTH_MIN_DOWN: 3,
  DLINK_BANDWIDTH_MIN_UP: 4,
  DLINK_SESSION_TIMEOUT: 5,
  DLINK_IDLE_TIMEOUT: 6,
  DLINK_VLAN_ID: 7,
  DLINK_VLAN_NAME: 8,
  DLINK_USER_GROUP: 9,
  DLINK_USER_PROFILE: 10,
  DLINK_USER_ROLE: 11,
  DLINK_PORTAL_URL: 12,
  DLINK_PORTAL_SECRET: 13,
  DLINK_QOS_PROFILE: 14,
  DLINK_PRIORITY: 15,
  DLINK_COA_ACTION: 16,
} as const;

export type DLinkHardwareType =
  | 'dwc-1000' | 'dwc-2020' | 'dwc-3020'
  | 'dap-2610' | 'dap-2622' | 'dap-3662' | 'dap-3711'
  | 'dws-3160' | 'dws-3226' | 'dws-4026'
  | 'generic';

export interface DLinkConfig extends Omit<GatewayConfig, 'vendor'> {
  vendor: 'dlink';

  hardwareType?: DLinkHardwareType;
  firmwareVersion?: string;

  // Nuclias Connect (On-premises controller)
  nucliasConnectUrl?: string;
  nucliasConnectUsername?: string;
  nucliasConnectPassword?: string;
  nucliasConnectApiKey?: string;
  nucliasSiteId?: string;

  // Nuclias Cloud
  useNucliasCloud?: boolean;
  nucliasCloudUrl?: string;
  nucliasCloudApiKey?: string;
  nucliasCloudAccountId?: string;
  nucliasCloudSiteId?: string;

  // Access Point settings
  ssidProfileName?: string;
  captivePortalEnabled?: boolean;
  captivePortalUrl?: string;

  // RADIUS settings
  radiusNasId?: string;
  radiusNasPortId?: string;

  // Advanced features
  enableBandwidthControl?: boolean;
  enableVlanAssignment?: boolean;
  enableSessionSync?: boolean;

  // Retry and timeout settings
  apiTimeout?: number;
  apiRetries?: number;
  coaTimeout?: number;
}

// ============================================================================
// Internal API response shapes
// ============================================================================

/** Generic D-Link REST envelope */
interface DLinkAPIResponse<T = unknown> {
  success: boolean;
  code?: number;
  message?: string;
  data?: T;
  total?: number;
  page?: number;
  pageSize?: number;
}

/** GET /api/v2/controller/info */
interface DLinkControllerInfo {
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  hostname: string;
  macAddress: string;
  uptime: number;
  status: 'online' | 'offline' | 'starting';
  cpuUsage: number;
  memoryUsage: number;
  apCount: number;
  clientCount: number;
  siteId: string;
  siteName: string;
}

/** GET /api/v2/clients?status=online  →  data[] item */
interface DLinkOnlineClient {
  sessionId: string;
  macAddress: string;
  ipAddress: string;
  hostname?: string;
  username?: string;
  ssid: string;
  apMac: string;
  apName: string;
  band: '2.4GHz' | '5GHz' | '6GHz';
  channel: number;
  signalStrength: number;
  dataRate: number;
  startTime: string;
  duration: number;
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  status: 'connected' | 'authenticating' | 'disconnected' | 'roaming';
  authMethod?: 'open' | 'psk' | '802.1x' | 'captive';
  vlanId?: number;
  bandwidthLimitDown?: number;
  bandwidthLimitUp?: number;
}

/** Shared FreeRADIUS micro-service URL */
const RADIUS_SERVICE_URL =
  process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

// ============================================================================
// D-Link Adapter
// ============================================================================

/**
 * D-Link Adapter — implements GatewayAdapter with real API calls.
 *
 * All controller API calls go directly to
 *   https://{ip}:{port}/api/v2/...
 * authenticated via HTTP Basic.
 *
 * RADIUS-sensitive operations (CoA, disconnect, bandwidth update)
 * are proxied through the FreeRADIUS service.
 */
export class DLinkAdapter extends GatewayAdapter {
  protected dlinkConfig: DLinkConfig;

  constructor(config: DLinkConfig) {
    super(config as GatewayConfig);
    this.dlinkConfig = config;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /** Build the API base URL from config */
  private get apiBaseUrl(): string {
    const port = this.dlinkConfig.apiPort || 8443;
    return `https://${this.config.ipAddress}:${port}/api/v2`;
  }

  /** HTTP Basic Authorization header value */
  private get basicAuth(): string {
    const user = this.dlinkConfig.apiUsername || 'admin';
    const pass = this.config.apiPassword || '';
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  /** Timeout in ms (default 5 000) */
  private get timeout(): number {
    return this.dlinkConfig.apiTimeout || 5000;
  }

  /**
   * Core HTTP helper — every fetch call goes through here.
   * Uses `AbortSignal.timeout(5000)` (or configured timeout).
   */
  private async apiRequest<T = unknown>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      body?: unknown;
      params?: Record<string, string | number>;
    } = {},
  ): Promise<DLinkAPIResponse<T>> {
    let url = `${this.apiBaseUrl}${endpoint}`;

    if (options.params) {
      const qs = new URLSearchParams(
        Object.entries(options.params).map(([k, v]) => [k, String(v)]),
      ).toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: this.basicAuth,
    };

    const fetchOpts: RequestInit = {
      method: options.method || 'GET',
      headers,
      signal: AbortSignal.timeout(this.timeout),
    };

    if (options.body && options.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOpts);

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      return {
        success: false,
        message: `API error (${response.status}): ${err}`,
      };
    }

    try {
      return (await response.json()) as DLinkAPIResponse<T>;
    } catch {
      return { success: false, message: 'Failed to parse response' };
    }
  }

  /**
   * Private helper — proxy requests to the shared FreeRADIUS service.
   * Used by sendCoA, disconnectSession, and updateBandwidth.
   */
  private async freeradiusRequest(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch(`${RADIUS_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        targetIp: this.config.ipAddress,
        coaPort: this.config.coaPort || 3799,
        secret: this.config.coaSecret || this.config.radiusSecret,
        vendor: 'dlink',
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`FreeRADIUS service ${response.status}: ${err}`);
    }

    return response.json();
  }

  // ------------------------------------------------------------------
  // GatewayAdapter implementation
  // ------------------------------------------------------------------

  getVendor(): 'dlink' {
    return 'dlink';
  }

  /**
   * testConnection
   * Calls GET /api/v2/controller/info to verify controller reachability.
   */
  async testConnection(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const resp = await this.apiRequest<DLinkControllerInfo>(
        '/controller/info',
      );

      if (resp.success && resp.data) {
        return { success: true, latency: Date.now() - start };
      }

      return {
        success: false,
        latency: Date.now() - start,
        error: resp.message || 'Controller reported failure',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * getStatus
   * Real API call — GET /api/v2/controller/info for controller health,
   * AP count, client count, firmware, CPU, memory.
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      const resp = await this.apiRequest<DLinkControllerInfo>(
        '/controller/info',
      );

      if (resp.success && resp.data) {
        const d = resp.data;
        return {
          online: d.status === 'online',
          firmwareVersion: d.firmwareVersion,
          cpuUsage: d.cpuUsage,
          memoryUsage: d.memoryUsage,
          uptime: d.uptime,
          totalClients: d.clientCount,
          lastSeen: new Date(),
        };
      }

      return { online: false, lastSeen: new Date() };
    } catch {
      return { online: false, lastSeen: new Date() };
    }
  }

  /**
   * getActiveSessions
   * Real API call — GET /api/v2/clients?status=online
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const resp = await this.apiRequest<DLinkOnlineClient[]>(
        '/clients',
        { params: { status: 'online' } },
      );

      if (!resp.success || !resp.data) return [];

      return resp.data.map((c) => ({
        sessionId: c.sessionId || c.macAddress,
        username: c.username || c.macAddress,
        ipAddress: c.ipAddress,
        macAddress: c.macAddress,
        nasIpAddress: this.config.ipAddress,
        startTime: new Date(c.startTime),
        duration: c.duration,
        bytesIn: c.bytesIn,
        bytesOut: c.bytesOut,
        status: c.status === 'connected' ? 'active' as const : 'terminated' as const,
        apName: c.apName,
        ssid: c.ssid,
        vlanId: c.vlanId,
        additionalInfo: {
          band: c.band,
          channel: c.channel,
          signalStrength: c.signalStrength,
          authMethod: c.authMethod,
        },
      }));
    } catch {
      return [];
    }
  }

  /**
   * sendCoA — routes through the FreeRADIUS micro-service.
   */
  async sendCoA(request: CoARequest): Promise<CoAResponse> {
    const action =
      request.action === 'disconnect'
        ? 'disconnect'
        : request.action === 'reauthorize'
          ? 'reauthorize'
          : 'update';

    try {
      const result = (await this.freeradiusRequest('/coa', {
        username: request.username,
        sessionId: request.sessionId,
        action,
        attributes: request.attributes,
      })) as { success: boolean; error?: string };

      if (result.success) {
        return { success: true, message: `CoA ${action} successful` };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'CoA failed',
      };
    }
  }

  /**
   * disconnectSession — always routed through FreeRADIUS service.
   */
  async disconnectSession(
    sessionId: string,
    username: string,
  ): Promise<CoAResponse> {
    return this.sendCoA({
      username,
      sessionId,
      action: 'disconnect',
    });
  }

  /**
   * updateBandwidth — routes through FreeRADIUS service with
   * D-Link VSA attributes (Vendor ID 171).
   */
  async updateBandwidth(
    sessionId: string,
    username: string,
    policy: BandwidthPolicy,
  ): Promise<CoAResponse> {
    const attrs = this.getRadiusAttributes(policy);
    return this.sendCoA({
      username,
      sessionId,
      action: 'update',
      attributes: attrs,
    });
  }

  // ------------------------------------------------------------------
  // D-Link VSA attribute generation (Vendor ID: 171)
  // ------------------------------------------------------------------

  /**
   * Build vendor-specific RADIUS attributes for a bandwidth policy.
   * Includes standard WISPr attributes AND D-Link VSAs (Vendor 171).
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);

    // Standard session timeout
    if (policy.sessionTimeout) {
      attrs['Session-Timeout'] = String(policy.sessionTimeout);
    }

    const downloadKbps = Math.ceil(policy.downloadSpeed / 1000);
    const uploadKbps = Math.ceil(policy.uploadSpeed / 1000);

    // WISPr attributes (widely supported)
    attrs['WISPr-Bandwidth-Max-Down'] = String(downloadKbps);
    attrs['WISPr-Bandwidth-Max-Up'] = String(uploadKbps);

    // D-Link VSA attributes (Vendor ID: 171)
    attrs['Dlink-Bandwidth-Max-Down'] = String(downloadKbps);
    attrs['Dlink-Bandwidth-Max-Up'] = String(uploadKbps);

    if (policy.dataLimit) {
      attrs['Dlink-Session-Timeout'] = String(
        Math.floor(policy.dataLimit / 1_000_000),
      );
    }

    return attrs;
  }

  // ------------------------------------------------------------------
  // Utility / convenience methods
  // ------------------------------------------------------------------

  formatBandwidthLimit(download: number, upload: number): string {
    const fmt = (bps: number) => {
      const kbps = Math.ceil(bps / 1000);
      if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(1)}G`;
      if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)}M`;
      return `${kbps}K`;
    };
    return `${fmt(download)}/${fmt(upload)}`;
  }

  getHealthCheckEndpoints(): string[] {
    return [
      '/api/v2/controller/info',
      '/api/v2/clients?status=online',
    ];
  }

  getVLANAttributes(vlanId: number, vlanName?: string): Record<string, string> {
    const attrs: Record<string, string> = {
      'Tunnel-Type': 'VLAN',
      'Tunnel-Medium-Type': 'IEEE-802',
      'Tunnel-Private-Group-Id': String(vlanId),
      'Dlink-VLAN-Id': String(vlanId),
    };
    if (vlanName) attrs['Dlink-VLAN-Name'] = vlanName;
    return attrs;
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const result = super.validateConfig();

    if (
      !this.dlinkConfig.nucliasConnectUrl &&
      !this.dlinkConfig.useNucliasCloud
    ) {
      if (!this.dlinkConfig.radiusSecret) {
        result.errors.push(
          'RADIUS secret is required without Nuclias management',
        );
      }
    }

    if (
      this.dlinkConfig.useNucliasCloud &&
      !this.dlinkConfig.nucliasCloudApiKey
    ) {
      result.errors.push(
        'Nuclias Cloud API key is required for cloud mode',
      );
    }

    return { valid: result.errors.length === 0, errors: result.errors };
  }
}

// ============================================================================
// Factory & defaults
// ============================================================================

export function createDLinkAdapter(
  config: Omit<DLinkConfig, 'vendor'>,
): DLinkAdapter {
  return new DLinkAdapter({ ...config, vendor: 'dlink' });
}

export const DLINK_DEFAULTS = {
  apiPort: 8443,
  coaPort: 3799,
  radiusAuthPort: 1812,
  radiusAcctPort: 1813,
  apiTimeout: 5000,
  apiRetries: 3,
  coaTimeout: 5000,
} as const;
