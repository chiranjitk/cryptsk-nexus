/**
 * Fortinet WiFi Gateway Adapter — Real API Implementation
 *
 * FortiGate API base:  https://{ip}:{port}/api/v2/cmdb/
 * Auth:                config.apiPassword → access_token query parameter
 * RADIUS Vendor ID:    12356 (Fortinet)
 *
 * Endpoints: /system/status · /wifi/managed-ap · /user/firewall
 * Hardware:  FortiWiFi (FWF-*) · FortiAP (FAP-*) · FortiGate (FG-*)
 *
 * @see https://docs.fortinet.com/document/fortigate/7.4.0/administration-guide
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
// Type exports
// ============================================================================

/** Supported Fortinet hardware models */
export type FortinetModel =
  | 'FWF-40F' | 'FWF-60F' | 'FWF-80F' | 'FWF-100F' | 'FWF-200F'
  | 'FAP-221E' | 'FAP-231F' | 'FAP-431F' | 'FAP-433F'
  | 'FG-60F' | 'FG-100F' | 'FG-200F';

export interface FortinetConfig extends GatewayConfig {
  vendor: 'fortinet';
  model?: FortinetModel;
  isController?: boolean;
  managedAPs?: string[];
  apiToken?: string;
  apiVersion?: string;
  vdom?: string;
  securityProfile?: {
    antivirus?: string;
    webFilter?: string;
    applicationControl?: string;
    ips?: string;
    dnsFilter?: string;
  };
  fortiPresence?: {
    enabled: boolean;
    serverUrl?: string;
    apiKey?: string;
  };
  wifiSettings?: {
    ssid?: string;
    securityMode?:
      | 'open'
      | 'wpa2-personal'
      | 'wpa2-enterprise'
      | 'wpa3-personal'
      | 'wpa3-enterprise';
    captivePortal?: boolean;
    portalUrl?: string;
  };
  vlanConfig?: {
    guestVlanId?: number;
    staffVlanId?: number;
    managementVlanId?: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const RADIUS_SERVICE_URL =
  process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

/** Fortinet Vendor-Specific Attributes — Vendor ID: 12356 */
export const FORTINET_VSA = {
  VENDOR_ID: 12356,
  ATTRIBUTES: {
    FG_USER_GROUP: 1,
    FG_USER_ROLE: 2,
    FG_VDOM: 3,
    FG_FIREWALL_POLICY: 4,
    FG_RATE_LIMIT_UP: 5,
    FG_RATE_LIMIT_DOWN: 6,
    FG_SESSION_TIMEOUT: 7,
    FG_VLAN_ID: 8,
    FG_IDLE_TIMEOUT: 9,
    FG_DNS_FILTER: 10,
    FG_WEB_FILTER: 11,
    FG_APPLICATION_CONTROL: 12,
    FG_ANTIVIRUS_PROFILE: 13,
    FG_IPS_PROFILE: 14,
    FG_ZTNA_TAGS: 15,
    FG_SESSION_ID: 16,
  },
} as const;

// ============================================================================
// FortiGate API response shapes
// ============================================================================

interface FortiGateSystemStatus {
  hostname?: string;
  Serial?: string;
  Model?: string;
  Version?: string;
  Build?: string;
  uptime?: number;
  status?: string;
}

interface FortiGateResourceUsage {
  cpu?: number;
  memory?: number;
  current_sessions?: number;
  session_rate?: number;
}

interface FortiGateFirewallUser {
  mkey: string;
  name?: string;
  ip?: string;
  mac?: string;
  group?: string;
  last_seen?: number;
  type?: string;
  auth_protocol?: string;
}

export interface ManagedAPInfo {
  name?: string;
  serial_number?: string;
  status?: string;
  ip?: string;
  model?: string;
  ssid?: string;
  wlan_id?: number;
  clients?: number;
  uptime?: number;
}

// ============================================================================
// Fortinet Adapter
// ============================================================================

export class FortinetAdapter extends GatewayAdapter {
  protected fortinetConfig: FortinetConfig;
  private readonly apiBase: string;

  constructor(config: FortinetConfig) {
    super(config);
    this.fortinetConfig = config;
    const port = config.apiPort || 443;
    this.apiBase = `https://${config.ipAddress}:${port}`;
  }

  // ------------------------------------------------------------------
  // Identity
  // ------------------------------------------------------------------

  getVendor() {
    return 'fortinet' as const;
  }

  // ------------------------------------------------------------------
  // FreeRADIUS service helper
  // ------------------------------------------------------------------

  /**
   * Proxy a request to the shared FreeRADIUS micro-service.
   * All RADIUS-level operations (CoA, Disconnect, bandwidth update)
   * go through this single helper.
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
        vendor: 'fortinet',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`FreeRADIUS service ${response.status}: ${err}`);
    }

    return response.json();
  }

  // ------------------------------------------------------------------
  // FortiGate REST API helper
  // ------------------------------------------------------------------

  /**
   * Low-level GET against FortiGate REST API v2.
   * Auth via `access_token` query param; respects `vdom`.
   * Normalises FortiGate v2 `{ results: [...] }` wrapper.
   */
  private async fortiGet<T>(path: string): Promise<T> {
    const url = new URL(`${this.apiBase}${path}`);
    url.searchParams.set('access_token', this.config.apiPassword || '');

    if (this.fortinetConfig.vdom) {
      url.searchParams.set('vdom', this.fortinetConfig.vdom);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`FortiGate API ${response.status}: ${err}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    return (json.results ?? json) as T;
  }

  // ------------------------------------------------------------------
  // Core adapter methods
  // ------------------------------------------------------------------

  /** Test connectivity — GET /api/v2/cmdb/system/status */
  async testConnection(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      await this.fortiGet<FortiGateSystemStatus>(
        '/api/v2/cmdb/system/status',
      );
      return { success: true, latency: Date.now() - start };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * Get gateway status — firmware, CPU, memory, uptime.
   * Parallel: /system/status + /monitor/system/resource/usage
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      const [status, resources] = await Promise.all([
        this.fortiGet<FortiGateSystemStatus>(
          '/api/v2/cmdb/system/status',
        ),
        this.fortiGet<FortiGateResourceUsage>(
          '/api/v2/monitor/system/resource/usage',
        ).catch((): FortiGateResourceUsage => ({})),
      ]);

      return {
        online: true,
        firmwareVersion: [
          status.Version,
          status.Build ? `build ${status.Build}` : undefined,
        ]
          .filter(Boolean)
          .join(' '),
        cpuUsage: resources.cpu,
        memoryUsage: resources.memory,
        uptime: status.uptime,
        totalClients: resources.current_sessions,
        lastSeen: new Date(),
      };
    } catch {
      return { online: false, lastSeen: new Date() };
    }
  }

  /** Get active sessions — GET /api/v2/cmdb/user/firewall */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const users = await this.fortiGet<FortiGateFirewallUser[]>(
        '/api/v2/cmdb/user/firewall',
      );

      return users.map((u) => ({
        sessionId: u.mkey,
        username: u.name || '',
        ipAddress: u.ip || '',
        macAddress: u.mac || '',
        nasIpAddress: this.config.ipAddress,
        startTime: u.last_seen
          ? new Date(u.last_seen * 1000)
          : new Date(),
        duration: u.last_seen
          ? Math.floor((Date.now() - u.last_seen * 1000) / 1000)
          : 0,
        bytesIn: 0,
        bytesOut: 0,
        status: 'active' as const,
      }));
    } catch {
      return [];
    }
  }

  /** Send Change of Authorization — routed through FreeRADIUS service */
  async sendCoA(request: CoARequest): Promise<CoAResponse> {
    const action =
      request.action === 'disconnect' ? 'disconnect' : 'update';

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

  /** Disconnect a session — routed through FreeRADIUS service */
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

  /** Update bandwidth — routed through FreeRADIUS with Fortinet VSA attrs */
  async updateBandwidth(
    sessionId: string,
    username: string,
    policy: BandwidthPolicy,
  ): Promise<CoAResponse> {
    return this.sendCoA({
      username,
      sessionId,
      action: 'update',
      attributes: this.getRadiusAttributes(policy),
    });
  }

  // ------------------------------------------------------------------
  // Managed AP queries
  // ------------------------------------------------------------------

  /** Get managed FortiAPs — GET /api/v2/cmdb/wifi/managed-ap */
  async getManagedAPs(): Promise<ManagedAPInfo[]> {
    try {
      return await this.fortiGet<ManagedAPInfo[]>(
        '/api/v2/cmdb/wifi/managed-ap',
      );
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------------
  // RADIUS attribute generation — VSA: Fortinet 12356
  // ------------------------------------------------------------------

  /**
   * Build RADIUS attributes for a bandwidth policy.
   * Standard + WISPr + Fortinet VSA (Vendor ID: 12356).
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);

    const downloadKbps = Math.ceil(policy.downloadSpeed / 1000);
    const uploadKbps = Math.ceil(policy.uploadSpeed / 1000);

    // WISPr bandwidth attributes (kbps)
    attrs['WISPr-Bandwidth-Max-Down'] = String(downloadKbps);
    attrs['WISPr-Bandwidth-Max-Up'] = String(uploadKbps);

    // Fortinet VSA attributes (Vendor ID: 12356)
    attrs['Ft-FG-Rate-Limit-Down'] = String(downloadKbps);
    attrs['Ft-FG-Rate-Limit-Up'] = String(uploadKbps);

    if (policy.sessionTimeout) {
      attrs['Session-Timeout'] = String(policy.sessionTimeout);
      attrs['Ft-FG-Session-Timeout'] = String(policy.sessionTimeout);
    }

    if (policy.dataLimit) {
      attrs['Ft-FG-Data-Limit'] = String(Math.floor(policy.dataLimit));
    }

    return attrs;
  }

  // ------------------------------------------------------------------
  // Overrides
  // ------------------------------------------------------------------

  override getHealthCheckEndpoints(): string[] {
    return [
      '/api/v2/cmdb/system/status',
      '/api/v2/monitor/system/resource/usage',
      '/api/v2/cmdb/wifi/managed-ap',
      '/api/v2/cmdb/user/firewall',
    ];
  }

  override validateConfig(): { valid: boolean; errors: string[] } {
    const result = super.validateConfig();
    if (!this.fortinetConfig.apiToken && !this.fortinetConfig.apiPassword) {
      result.errors.push('FortiGate API token or password is required');
    }
    return { valid: result.errors.length === 0, errors: result.errors };
  }
}

// ============================================================================
// Factory & defaults
// ============================================================================

export function createFortinetAdapter(
  config: Omit<FortinetConfig, 'vendor'>,
): FortinetAdapter {
  return new FortinetAdapter({ ...config, vendor: 'fortinet' });
}

export const FORTINET_DEFAULTS = {
  coaPort: 3799,
  radiusAuthPort: 1812,
  radiusAcctPort: 1813,
  apiPort: 443,
} as const;
