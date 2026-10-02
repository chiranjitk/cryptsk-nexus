/**
 * Cisco Meraki Gateway Adapter — Production
 *
 * Cloud-managed WiFi for hospitality via the Meraki Dashboard REST API v1.
 *
 * - MR Access Points  (MR20–MR86)
 * - MX Security Appliances (MX64–MX450)
 * - MS Switches       (MS120–MS450)
 * - RADIUS auth / CoA on port 1700 (Meraki-specific)
 *
 * Vendor ID for RADIUS VSA: 9 (Cisco)
 *
 * @see https://developer.cisco.com/meraki/api-v1/
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
// Node.js-only module — loaded via require() to avoid Turbopack Edge Runtime analysis.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = /*turbopackIgnore: true*/ require('net');

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type MerakiAPModel =
  | 'MR20' | 'MR33' | 'MR36' | 'MR42' | 'MR45'
  | 'MR46' | 'MR52' | 'MR56' | 'MR70' | 'MR76' | 'MR86';

export type MerakiMXModel =
  | 'MX64' | 'MX65' | 'MX67' | 'MX68' | 'MX84'
  | 'MX85' | 'MX95' | 'MX100' | 'MX105' | 'MX250' | 'MX450';

export type MerakiMSModel =
  | 'MS120' | 'MS125' | 'MS210' | 'MS220' | 'MS225'
  | 'MS250' | 'MS350' | 'MS355' | 'MS390' | 'MS410' | 'MS425' | 'MS450';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CiscoConfig extends GatewayConfig {
  vendor: 'cisco';
  apiKey: string;
  organizationId?: string;
  networkId?: string;
  apModels?: MerakiAPModel[];
  mxModel?: MerakiMXModel;
  msModels?: MerakiMSModel[];
  useDashboardApi?: boolean;
  splashPageEnabled?: boolean;
  defaultSsid?: string;
  guestSsid?: string;
  defaultGroupPolicy?: string;
  radiusServers?: { host: string; port: number; secret: string }[];
}

/** Shared FreeRADIUS micro-service URL */
const RADIUS_SERVICE_URL = process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

// ---------------------------------------------------------------------------
// Meraki Dashboard API response types (kept minimal)
// ---------------------------------------------------------------------------

interface MerakiOrganization { id: string; name: string; url: string; api: { enabled: boolean } }

interface MerakiNetwork {
  id: string; name: string; type: string; timeZone: string; tags?: string[];
}

interface MerakiDevice {
  serial: string; name: string; model: string; mac: string;
  lanIp: string; firmware: string; status: string; networkId: string;
  tags?: string[]; details?: { gateway?: string; dns?: string };
}

interface MerakiSSID {
  number: number; name: string; enabled: boolean;
  authMode?: string; splashPage?: string;
  radiusServers?: Array<{ host: string; port: number; secret: string }>;
  radiusCoaEnabled?: boolean;
  radiusCoaServer?: { enabled: boolean; port: number; secret: string };
  bandwidthLimitDown?: number; bandwidthLimitUp?: number;
  perClientBandwidthLimitUp?: number; perClientBandwidthLimitDown?: number;
  groupPolicyId?: string;
  [key: string]: unknown;
}

interface MerakiClient {
  id: string; mac: string; description?: string; ip: string; ip6?: string;
  firstSeen: number; lastSeen: number; manufacturer?: string; os?: string;
  recentDeviceSerial?: string; recentDeviceName?: string; recentDeviceMac?: string;
  ssid?: string; vlan?: number;
  usage?: { sent: number; recv: number };
  status: string; notes?: string;
  groupPolicy8021x?: string | null;
  [key: string]: unknown;
}

interface MerakiGroupPolicy {
  groupPolicyId: string; name: string;
  bandwidth?: { settings: string; bandwidthLimits?: { limitUp: number; limitDown: number } };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// MerakiDashboardClient — real HTTP client for api.meraki.com
// ---------------------------------------------------------------------------

class MerakiDashboardClient {
  private config: CiscoConfig;
  private readonly baseUrl = 'https://api.meraki.com/api/v1';
  private rateLimitRemaining = 100;
  private rateLimitReset: Date | null = null;

  constructor(config: CiscoConfig) {
    this.config = config;
  }

  // -- core request ----------------------------------------------------------

  private async request<T>(
    endpoint: string,
    opts: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      params?: Record<string, string>;
      maxRetries?: number;
    } = {},
  ): Promise<T> {
    const { method = 'GET', body, params, maxRetries = 3 } = opts;

    // Honour rate-limit window
    if (this.rateLimitRemaining <= 5 && this.rateLimitReset && this.rateLimitReset > new Date()) {
      await this.delay(this.rateLimitReset.getTime() - Date.now());
    }

    let url = `${this.baseUrl}${endpoint}`;
    if (params) url += `?${new URLSearchParams(params).toString()}`;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const init: RequestInit = {
          method,
          headers: {
            'X-Cisco-Meraki-API-Key': this.config.apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        };

        if (body && method !== 'GET') init.body = JSON.stringify(body);

        const res = await fetch(url, init);

        // Track rate-limit headers
        const rem = res.headers.get('X-RateLimit-Remaining');
        if (rem) this.rateLimitRemaining = parseInt(rem, 10);
        const rst = res.headers.get('X-RateLimit-Reset');
        if (rst) this.rateLimitReset = new Date(parseInt(rst, 10) * 1000);

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`Meraki API ${res.status}: ${txt}`);
        }

        if (res.status === 204) return {} as T;

        return (await res.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // 429 — wait for reset window then retry
        if (lastError.message.includes('429')) {
          const wait = this.rateLimitReset
            ? Math.max(this.rateLimitReset.getTime() - Date.now(), 1000)
            : 2000;
          await this.delay(wait);
          continue;
        }

        if (attempt < maxRetries) await this.delay(2 ** attempt * 500);
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // -- Organization / Network ------------------------------------------------

  async getOrganizations(): Promise<MerakiOrganization[]> {
    return this.request<MerakiOrganization[]>('/organizations');
  }

  async getNetworks(orgId: string): Promise<MerakiNetwork[]> {
    return this.request<MerakiNetwork[]>(`/organizations/${orgId}/networks`);
  }

  async getDevices(networkId: string): Promise<MerakiDevice[]> {
    return this.request<MerakiDevice[]>(`/networks/${networkId}/devices`);
  }

  // -- Wireless SSIDs -------------------------------------------------------

  async getSSIDs(networkId: string): Promise<MerakiSSID[]> {
    return this.request<MerakiSSID[]>(`/networks/${networkId}/wireless/ssids`);
  }

  async updateSSID(networkId: string, ssidNum: number, cfg: Partial<MerakiSSID>): Promise<MerakiSSID> {
    return this.request<MerakiSSID>(`/networks/${networkId}/wireless/ssids/${ssidNum}`, {
      method: 'PUT', body: cfg,
    });
  }

  // -- Clients --------------------------------------------------------------

  async getClients(networkId: string, opts?: { timespan?: number; perPage?: number }): Promise<MerakiClient[]> {
    const p: Record<string, string> = {};
    if (opts?.timespan) p.timespan = String(opts.timespan);
    if (opts?.perPage)   p.perPage   = String(opts.perPage);
    return this.request<MerakiClient[]>(`/networks/${networkId}/clients`, { params: p });
  }

  async disconnectClient(networkId: string, clientId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request(`/networks/${networkId}/clients/${clientId}/disconnect`, { method: 'POST' });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Disconnect failed' };
    }
  }

  async updateClientPolicy(
    networkId: string, clientId: string,
    policy: { devicePolicy: string; groupPolicyId?: string },
  ): Promise<{ success: boolean }> {
    try {
      await this.request(`/networks/${networkId}/clients/${clientId}/policy`, { method: 'PUT', body: policy });
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  }

  // -- Group Policies --------------------------------------------------------

  async getGroupPolicies(networkId: string): Promise<MerakiGroupPolicy[]> {
    return this.request<MerakiGroupPolicy[]>(`/networks/${networkId}/groupPolicies`);
  }

  async createGroupPolicy(networkId: string, policy: Omit<MerakiGroupPolicy, 'groupPolicyId'>): Promise<MerakiGroupPolicy> {
    return this.request<MerakiGroupPolicy>(`/networks/${networkId}/groupPolicies`, { method: 'POST', body: policy });
  }

  // -- RADIUS / CoA / Bandwidth helpers for SSIDs ----------------------------

  async configureRadiusForSSID(
    networkId: string, ssidNum: number,
    cfg: {
      radiusServers: Array<{ host: string; port: number; secret: string }>;
      radiusAccountingServers?: Array<{ host: string; port: number; secret: string }>;
      radiusCoaEnabled?: boolean;
      radiusCoaServer?: { port: number; secret: string };
    },
  ): Promise<MerakiSSID> {
    return this.request<MerakiSSID>(`/networks/${networkId}/wireless/ssids/${ssidNum}`, {
      method: 'PUT',
      body: {
        radiusServers: cfg.radiusServers,
        radiusAccountingServers: cfg.radiusAccountingServers,
        radiusCoaEnabled: cfg.radiusCoaEnabled ?? true,
        radiusCoaServer: cfg.radiusCoaServer,
        radiusOverride: true,
      },
    });
  }

  async configureBandwidthForSSID(
    networkId: string, ssidNum: number,
    cfg: {
      bandwidthLimitDown?: number;
      bandwidthLimitUp?: number;
      perClientBandwidthLimitDown?: number;
      perClientBandwidthLimitUp?: number;
    },
  ): Promise<MerakiSSID> {
    return this.request<MerakiSSID>(`/networks/${networkId}/wireless/ssids/${ssidNum}`, {
      method: 'PUT', body: cfg,
    });
  }
}

// ---------------------------------------------------------------------------
// CiscoAdapter — implements GatewayAdapter
// ---------------------------------------------------------------------------

export class CiscoAdapter extends GatewayAdapter {
  protected ciscoConfig: CiscoConfig;
  private dashboard: MerakiDashboardClient;

  constructor(config: CiscoConfig) {
    super(config);
    this.ciscoConfig = config;
    this.dashboard = new MerakiDashboardClient(config);
  }

  getVendor() {
    return 'cisco' as const;
  }

  // -----------------------------------------------------------------------
  // FreeRADIUS micro-service helper
  // -----------------------------------------------------------------------

  /**
   * POST to the shared FreeRADIUS service.
   * Every request is enriched with the adapter's target IP, CoA port, and
   * RADIUS secret so the service can construct proper CoA packets.
   */
  private async freeradiusRequest(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${RADIUS_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        targetIp:  this.config.ipAddress,
        coaPort:   this.config.coaPort || 1700,
        secret:    this.config.coaSecret || this.config.radiusSecret,
        vendor:    'cisco',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`FreeRADIUS service ${res.status}: ${txt}`);
    }

    return res.json();
  }

  // -----------------------------------------------------------------------
  // GatewayAdapter implementation
  // -----------------------------------------------------------------------

  /**
   * Test connectivity — prefers Dashboard API, falls back to TCP ping.
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const t0 = Date.now();

    try {
      if (this.ciscoConfig.useDashboardApi !== false && this.ciscoConfig.apiKey) {
        const orgs = await this.dashboard.getOrganizations();
        if (orgs?.length) return { success: true, latency: Date.now() - t0 };
        return { success: false, error: 'Meraki API returned no organizations' };
      }
    } catch { /* fall through to TCP ping */ }

    return this.tcpPing(this.config.coaPort || 1700);
  }

  /** TCP ping helper (no Dashboard dependency) */
  private async tcpPing(port: number): Promise<{ success: boolean; latency?: number; error?: string }> {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const sock = new net.Socket();
      sock.setTimeout(5000);

      sock.connect(port, this.config.ipAddress, () => {
        sock.destroy();
        resolve({ success: true, latency: Date.now() - t0 });
      });
      sock.on('error', (e) => resolve({ success: false, error: e.message }));
      sock.on('timeout', () => { sock.destroy(); resolve({ success: false, error: 'Timeout' }); });
    });
  }

  /**
   * Gateway status — pulls devices and active client count from Dashboard.
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      if (!this.ciscoConfig.networkId) {
        return { online: true, lastSeen: new Date() };
      }

      const devices = await this.dashboard.getDevices(this.ciscoConfig.networkId);
      if (!devices.length) return { online: true, lastSeen: new Date() };

      let totalClients = 0;
      try {
        const clients = await this.dashboard.getClients(this.ciscoConfig.networkId, { timespan: 300 });
        totalClients = clients.length;
      } catch { /* non-critical */ }

      return {
        online: devices[0].status === 'online',
        firmwareVersion: devices[0].firmware,
        totalClients,
        lastSeen: new Date(),
      };
    } catch {
      return { online: false, lastSeen: new Date() };
    }
  }

  /**
   * Active sessions — fetches clients seen in the last hour from Dashboard.
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      if (!this.ciscoConfig.networkId) return [];

      const clients = await this.dashboard.getClients(this.ciscoConfig.networkId, { timespan: 3600 });

      return clients
        .filter((c: MerakiClient) => c.status === 'Online')
        .map((c: MerakiClient) => ({
          sessionId:    c.id,
          username:     c.description || c.mac,
          ipAddress:    c.ip,
          macAddress:   c.mac,
          nasIpAddress: this.config.ipAddress,
          startTime:    new Date(c.firstSeen),
          duration:     Math.floor((Date.now() - c.firstSeen) / 1000),
          bytesIn:      c.usage?.recv || 0,
          bytesOut:     c.usage?.sent || 0,
          status:       'active' as const,
          additionalInfo: {
            ssid:          c.ssid,
            vlan:          c.vlan,
            manufacturer:  c.manufacturer,
            os:            c.os,
            deviceName:    c.recentDeviceName,
          },
        }));
    } catch {
      return [];
    }
  }

  /**
   * Send CoA — routes through the FreeRADIUS service at /api/coa/disconnect.
   */
  async sendCoA(request: CoARequest): Promise<CoAResponse> {
    const action = request.action === 'disconnect' ? 'disconnect'
                 : request.action === 'reauthorize' ? 'reauthorize'
                 : 'update';

    try {
      const result = await this.freeradiusRequest('/api/coa/disconnect', {
        username:  request.username,
        sessionId: request.sessionId,
        action,
        attributes: request.attributes,
      }) as Record<string, unknown>;

      const ok = !!result.success;
      return {
        success: ok,
        error:    ok ? undefined : String(result.error ?? 'CoA failed'),
        message:  ok ? `CoA ${action} successful` : undefined,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'CoA request failed',
      };
    }
  }

  /**
   * Disconnect — prefers Dashboard API, falls back to CoA.
   */
  async disconnectSession(sessionId: string, username: string): Promise<CoAResponse> {
    if (this.ciscoConfig.networkId) {
      const r = await this.dashboard.disconnectClient(this.ciscoConfig.networkId, sessionId);
      if (r.success) return { success: true, message: 'Disconnected via Dashboard' };
    }
    return this.sendCoA({ username, sessionId, action: 'disconnect' });
  }

  /**
   * Update bandwidth — tries Group Policy via Dashboard first, then CoA.
   */
  async updateBandwidth(sessionId: string, username: string, policy: BandwidthPolicy): Promise<CoAResponse> {
    if (this.ciscoConfig.networkId) {
      try {
        let gp = (await this.dashboard.getGroupPolicies(this.ciscoConfig.networkId))
          .find((p: MerakiGroupPolicy) => p.name === `bw_${policy.downloadSpeed}_${policy.uploadSpeed}`);

        if (!gp) {
          gp = await this.dashboard.createGroupPolicy(this.ciscoConfig.networkId, {
            name: `bw_${policy.downloadSpeed}_${policy.uploadSpeed}`,
            bandwidth: {
              settings: 'custom',
              bandwidthLimits: {
                limitUp:   Math.ceil(policy.uploadSpeed / 1000),
                limitDown: Math.ceil(policy.downloadSpeed / 1000),
              },
            },
          });
        }

        const ok = await this.dashboard.updateClientPolicy(this.ciscoConfig.networkId, sessionId, {
          devicePolicy: 'Group policy',
          groupPolicyId: gp.groupPolicyId,
        });

        if (ok.success) return { success: true, message: 'Bandwidth updated via Dashboard' };
      } catch { /* fall through to CoA */ }
    }

    return this.sendCoA({
      username, sessionId, action: 'update',
      attributes: this.getRadiusAttributes(policy),
    });
  }

  /**
   * Cisco-specific RADIUS attributes (WISPr + Cisco-AVPair).
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);

    const downKbps = Math.ceil(policy.downloadSpeed / 1000);
    const upKbps   = Math.ceil(policy.uploadSpeed / 1000);

    attrs['WISPr-Bandwidth-Max-Down'] = String(downKbps);
    attrs['WISPr-Bandwidth-Max-Up']   = String(upKbps);
    attrs['Cisco-AVPair'] = `bandwidth-limit-down=${downKbps}kbps;bandwidth-limit-up=${upKbps}kbps`;

    if (policy.sessionTimeout) {
      attrs['Session-Timeout']  = String(policy.sessionTimeout);
      attrs['Cisco-AVPair-0']   = `session-timeout=${policy.sessionTimeout}`;
    }

    if (policy.dataLimit) {
      attrs['Cisco-AVPair-1'] = `data-limit=${policy.dataLimit}`;
    }

    return attrs;
  }

  /**
   * Format bandwidth for Meraki (kbps-based).
   */
  formatBandwidthLimit(download: number, upload: number): string {
    const fmt = (bps: number) => {
      const k = Math.ceil(bps / 1000);
      if (k >= 1_000_000) return `${(k / 1_000_000).toFixed(1)}G`;
      if (k >= 1000) return `${(k / 1000).toFixed(1)}M`;
      return `${k}K`;
    };
    return `${fmt(download)}/${fmt(upload)}`;
  }

  getHealthCheckEndpoints(): string[] {
    return ['/organizations', '/networks', '/devices'];
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const result = super.validateConfig();
    if (!this.ciscoConfig.apiKey) result.errors.push('Meraki Dashboard API key is required');
    if (!this.ciscoConfig.networkId && !this.ciscoConfig.organizationId) {
      result.errors.push('Network ID or Organization ID is required');
    }
    return { valid: result.errors.length === 0, errors: result.errors };
  }
}

// ---------------------------------------------------------------------------
// Factory helper & defaults
// ---------------------------------------------------------------------------

export function createCiscoAdapter(config: Omit<CiscoConfig, 'vendor'>): CiscoAdapter {
  return new CiscoAdapter({ ...config, vendor: 'cisco' });
}

export const CISCO_DEFAULTS = {
  coaPort: 1700,
  radiusAuthPort: 1812,
  radiusAcctPort: 1813,
  apiTimeout: 10000,
} as const;
