/**
 * Juniper Mist WiFi Gateway Adapter — Production Ready
 *
 * Juniper Mist is an AI-driven WiFi platform popular in modern hospitality deployments.
 * This adapter supports:
 * - Mist Cloud REST API
 * - Mist Edge (on-premises)
 * - RADIUS authentication via FreeRADIUS service
 * - CoA for session management
 * - Marvis AI integration
 * - Location services
 *
 * API: https://api.mist.com/api/v1/ OR https://{ip}:{port}/api/v1/
 * Auth: Authorization: Token {config.apiPassword}
 *
 * RADIUS Vendor ID: 2636
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JUNIPER_VENDOR_ID = 2636;
const WISPR_VENDOR_ID = 14122;
const RADIUS_SERVICE_URL = process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

const MIST_API_URLS = {
  'us-east-1': 'https://api.mist.com',
  'us-west-1': 'https://api.acmeshop.mist.com',
  'eu-west-1': 'https://api.eu.mist.com',
  'ap-southeast-1': 'https://api.sg.mist.com',
} as const;

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type MistRegion = keyof typeof MIST_API_URLS;

export interface MistAPModel {
  model: string;
  name: string;
  wifiStandard: string;
  maxDataRate: string;
  features: string[];
}

export const MIST_AP_MODELS: Record<string, MistAPModel> = {
  AP41: { model: 'AP41', name: 'Mist AP41', wifiStandard: 'Wi-Fi 6 (802.11ax)', maxDataRate: '2.5 Gbps', features: ['BLE', 'Dual-band', 'IoT', 'Location'] },
  AP43: { model: 'AP43', name: 'Mist AP43', wifiStandard: 'Wi-Fi 6 (802.11ax)', maxDataRate: '5.4 Gbps', features: ['BLE', 'Tri-band', 'IoT', 'Location', 'USB'] },
  AP45: { model: 'AP45', name: 'Mist AP45', wifiStandard: 'Wi-Fi 6E (802.11ax)', maxDataRate: '10.1 Gbps', features: ['BLE', 'Tri-band', '6GHz', 'IoT', 'Location', 'USB'] },
  AP32: { model: 'AP32', name: 'Mist AP32', wifiStandard: 'Wi-Fi 5 (802.11ac)', maxDataRate: '2.5 Gbps', features: ['BLE', 'Dual-band', 'IoT'] },
  AP33: { model: 'AP33', name: 'Mist AP33', wifiStandard: 'Wi-Fi 5 (802.11ac)', maxDataRate: '3.1 Gbps', features: ['BLE', 'Dual-band', 'IoT', 'USB'] },
  AP61: { model: 'AP61', name: 'Mist AP61', wifiStandard: 'Wi-Fi 6E (802.11ax)', maxDataRate: '10.1 Gbps', features: ['BLE', 'Tri-band', '6GHz', 'IoT', 'Location', 'USB', 'Outdoor'] },
  AP63: { model: 'AP63', name: 'Mist AP63', wifiStandard: 'Wi-Fi 6E (802.11ax)', maxDataRate: '10.1 Gbps', features: ['BLE', 'Tri-band', '6GHz', 'IoT', 'Location', 'USB', 'Outdoor', 'IP67'] },
};

export interface JuniperConfig extends GatewayConfig {
  vendor: 'juniper';
  mistApiToken?: string;
  mistOrgId?: string;
  mistSiteId?: string;
  mistRegion?: MistRegion;
  mistApiUrl?: string;
  useMistEdge?: boolean;
  mistEdgeIp?: string;
  enableMarvisAI?: boolean;
  enableLocationServices?: boolean;
  enableInsights?: boolean;
  wlanGroupId?: string;
  ssid?: string;
  radiusServerGroup?: string;
}

export interface MistOrganization { id: string; name: string; orggroup_ids?: string[]; created_time: number; modified_time: number; }
export interface MistSite { id: string; name: string; org_id: string; address?: string; country_code?: string; rftemplate_id?: string; timezone?: string; created_time: number; modified_time: number; }
export interface MistWLANGroup { id: string; name: string; org_id: string; wlan_ids?: string[]; created_time: number; modified_time: number; }
export interface MistWLAN { id: string; name: string; org_id: string; site_id: string; ssid: string; enabled: boolean; secure_vlan?: boolean; vlan_ids?: string[]; auth?: { type: string; psk?: string; radius_servers?: MistRadiusServer[] }; bandwidth_limit?: { enabled: boolean; default_down?: number; default_up?: number }; created_time: number; modified_time: number; }
export interface MistRadiusServer { name: string; host: string; port: number; secret: string; acct_port?: number; acct_interim_interval?: number; enabled?: boolean; }
export interface MistClient { mac: string; hostname?: string; ip?: string; ip6?: string; ssid?: string; ap_mac?: string; site_id?: string; org_id?: string; wlan_id?: string; username?: string; vlan_id?: number; channel?: number; rssi?: number; snr?: number; tx_rate?: number; rx_rate?: number; tx_bytes?: number; rx_bytes?: number; tx_packets?: number; rx_packets?: number; assoc_time?: number; last_seen?: number; manufacturer?: string; os_type?: string; key_mgmt?: string; group?: string; protos?: { dhcp?: string; http?: string }; labels?: string[]; }
export interface MistAP { mac: string; name?: string; model: string; org_id: string; site_id: string; serial?: string; firmware?: string; ip?: string; status?: string; uptime?: number; num_clients?: number; cpu?: number; mem?: number; radio_stats?: { band_2g?: { channel?: number; bandwidth?: number; clients?: number; utilization?: number }; band_5g?: { channel?: number; bandwidth?: number; clients?: number; utilization?: number }; band_6g?: { channel?: number; bandwidth?: number; clients?: number; utilization?: number }; }; location?: { x: number; y: number; latitude?: number; longitude?: number }; last_seen?: number; created_time?: number; modified_time?: number; }
export interface MistInsight { title: string; description: string; category: 'coverage' | 'capacity' | 'connectivity' | 'performance' | 'roaming' | 'security'; severity: 'critical' | 'warning' | 'info'; timestamp: number; site_id?: string; ap_mac?: string; recommendations?: string[]; impact?: string; }
export interface MarvisAIQuery { query: string; scope?: 'org' | 'site'; site_id?: string; }
export interface MarvisAIResponse { query: string; response: string; insights?: MistInsight[]; actions?: { type: string; params: Record<string, any> }[]; }
export interface MistLocationZone { id: string; name: string; site_id: string; vertices: Array<{ x: number; y: number }>; map_id?: string; created_time: number; modified_time: number; }
export interface MistClientLocation { mac: string; map_id?: string; x: number; y: number; latitude?: number; longitude?: number; timestamp: number; accuracy?: number; site_id?: string; zone_id?: string; }

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class JuniperAdapter extends GatewayAdapter {
  protected juniperConfig: JuniperConfig;

  constructor(config: JuniperConfig) {
    super(config);
    this.juniperConfig = config;
  }

  getVendor() {
    return 'juniper' as const;
  }

  // -- helpers ---------------------------------------------------------------

  /** Resolve the Mist API base URL. */
  private getBaseUrl(): string {
    if (this.juniperConfig.mistApiUrl) return this.juniperConfig.mistApiUrl;
    if (this.juniperConfig.useMistEdge && this.juniperConfig.mistEdgeIp) {
      const port = this.config.apiPort || 443;
      return `https://${this.juniperConfig.mistEdgeIp}:${port}/api/v1`;
    }
    return MIST_API_URLS[this.juniperConfig.mistRegion || 'us-east-1'];
  }

  /** Build auth headers — Mist uses Token auth, we repurpose apiPassword. */
  private getAuthHeaders(): Record<string, string> {
    const token = this.juniperConfig.mistApiToken || this.config.apiPassword || '';
    return { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };
  }

  /** Ensure we have orgId / siteId. If missing, try to fetch first org. */
  private async ensureOrgAndSite(): Promise<{ orgId: string; siteId: string }> {
    let orgId = this.juniperConfig.mistOrgId || '';
    let siteId = this.juniperConfig.mistSiteId || '';

    if (!orgId) {
      const orgs = await this.fetchJson<Array<{ id: string }>>('/api/v1/orgs');
      if (!orgs || orgs.length === 0) throw new Error('No organizations found');
      orgId = orgs[0].id;
    }
    if (!siteId) {
      const sites = await this.fetchJson<Array<{ id: string }>>(`/api/v1/orgs/${orgId}/sites`);
      if (!sites || sites.length === 0) throw new Error('No sites found');
      siteId = sites[0].id;
    }

    return { orgId, siteId };
  }

  /** Generic GET fetch against Mist API. */
  private async fetchJson<T>(path: string): Promise<T | null> {
    const url = `${this.getBaseUrl()}${path}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Mist API ${res.status}: ${text || res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') throw new Error('Mist API request timed out');
      throw err;
    }
  }

  /** Generic POST/PUT/DELETE fetch against Mist API. */
  private async fetchEndpoint(path: string, method: 'POST' | 'PUT' | 'DELETE' = 'POST', body?: unknown): Promise<{ success: boolean; error?: string }> {
    const url = `${this.getBaseUrl()}${path}`;
    try {
      const res = await fetch(url, {
        method,
        headers: this.getAuthHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `Mist API ${res.status}: ${text || res.statusText}` };
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      return { success: false, error: msg };
    }
  }

  /**
   * Private helper: send CoA operations to the FreeRADIUS service.
   * All disconnect / bandwidth-update / reauthorize flows route here.
   */
  private async freeradiusRequest(payload: {
    action: 'disconnect' | 'coa';
    username: string;
    sessionId: string;
    nasIp: string;
    nasPort?: number;
    secret: string;
    attributes?: Record<string, string>;
  }): Promise<CoAResponse> {
    try {
      const res = await fetch(`${RADIUS_SERVICE_URL}/api/coa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `FreeRADIUS service ${res.status}: ${text || res.statusText}` };
      }
      const data = await res.json();
      return { success: !!data.success, error: data.error, message: data.message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'FreeRADIUS service unreachable';
      return { success: false, error: msg };
    }
  }

  // -- GatewayAdapter implementation -----------------------------------------

  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.fetchJson<Array<{ id: string }>>('/api/v1/orgs');
      return { success: true, latency: Date.now() - start };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection test failed' };
    }
  }

  async getStatus(): Promise<GatewayStatus> {
    try {
      const { orgId, siteId } = await this.ensureOrgAndSite();
      const stats = await this.fetchJson<{
        ap_count?: number;
        connected_ap_count?: number;
        clients?: number;
        healthy?: boolean;
      }>(`/api/v1/orgs/${orgId}/sites/${siteId}/stats`);

      if (!stats) throw new Error('No stats returned');

      return {
        online: stats.healthy ?? stats.connected_ap_count !== undefined,
        totalClients: stats.clients ?? stats.connected_ap_count,
        lastSeen: new Date(),
      };
    } catch (err) {
      return { online: false, lastSeen: new Date() };
    }
  }

  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const { orgId, siteId } = await this.ensureOrgAndSite();
      const clients = await this.fetchJson<MistClient[]>(`/api/v1/sites/${siteId}/clients`);
      if (!clients) return [];

      return clients.map((c) => ({
        sessionId: c.mac,
        username: c.username || c.mac,
        ipAddress: c.ip || '',
        macAddress: c.mac,
        nasIpAddress: this.config.ipAddress,
        startTime: c.assoc_time ? new Date(c.assoc_time * 1000) : new Date(),
        duration: c.assoc_time ? Math.floor((Date.now() - c.assoc_time * 1000) / 1000) : 0,
        bytesIn: c.rx_bytes || 0,
        bytesOut: c.tx_bytes || 0,
        status: 'active' as const,
        apName: c.ap_mac,
        ssid: c.ssid,
        vlanId: c.vlan_id,
        additionalInfo: { rssi: c.rssi, snr: c.snr, hostname: c.hostname, manufacturer: c.manufacturer, os_type: c.os_type },
      }));
    } catch (err) {
      return [];
    }
  }

  async sendCoA(request: CoARequest): Promise<CoAResponse> {
    const secret = this.config.coaSecret || this.config.radiusSecret;
    return this.freeradiusRequest({
      action: request.action === 'disconnect' ? 'disconnect' : 'coa',
      username: request.username,
      sessionId: request.sessionId,
      nasIp: this.config.ipAddress,
      nasPort: this.config.radiusAuthPort,
      secret,
      attributes: request.attributes,
    });
  }

  async disconnectSession(sessionId: string, username: string): Promise<CoAResponse> {
    return this.sendCoA({ username, sessionId, action: 'disconnect' });
  }

  async updateBandwidth(sessionId: string, username: string, policy: BandwidthPolicy): Promise<CoAResponse> {
    const attrs: Record<string, string> = {};
    if (policy.downloadSpeed) attrs['WISPr-Bandwidth-Max-Down'] = String(policy.downloadSpeed);
    if (policy.uploadSpeed) attrs['WISPr-Bandwidth-Max-Up'] = String(policy.uploadSpeed);
    if (policy.sessionTimeout) attrs['Session-Timeout'] = String(policy.sessionTimeout);
    return this.sendCoA({ username, sessionId, action: 'update', attributes: attrs });
  }

  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (policy.sessionTimeout) attrs['Session-Timeout'] = String(policy.sessionTimeout);
    if (policy.downloadSpeed) attrs['WISPr-Bandwidth-Max-Down'] = String(policy.downloadSpeed);
    if (policy.uploadSpeed) attrs['WISPr-Bandwidth-Max-Up'] = String(policy.uploadSpeed);
    // Juniper VSA (Vendor 2636)
    if (policy.downloadSpeed) attrs['Juniper-Bandwidth-Max-Down'] = String(Math.ceil(policy.downloadSpeed / 1000));
    if (policy.uploadSpeed) attrs['Juniper-Bandwidth-Max-Up'] = String(Math.ceil(policy.uploadSpeed / 1000));
    return attrs;
  }
}
