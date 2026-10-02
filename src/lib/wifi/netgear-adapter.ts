/**
 * Netgear WiFi Gateway Adapter — Production Ready
 *
 * Netgear is extremely popular in India and SMB hospitality market.
 * API: https://{ip}:{port}/api/v1/ (local controller) OR https://api.insight.netgear.com/v1/ (cloud)
 * Auth: Basic auth with apiUsername:apiPassword
 *
 * RADIUS Vendor ID: 4526
 */

import {
  GatewayAdapter,
  GatewayConfig,
  CoARequest,
  CoAResponse,
  SessionInfo,
  GatewayStatus,
  BandwidthPolicy,
  GatewayVendor,
} from './gateway-adapter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NETGEAR_VENDOR_ID = 4526;
const RADIUS_SERVICE_URL = process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

const INSIGHT_REGION_URLS: Record<string, string> = {
  us: 'https://api.insight.netgear.com/v1',
  eu: 'https://api.eu.insight.netgear.com/v1',
  ap: 'https://api.ap.insight.netgear.com/v1',
};

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type NetgearHardwareType = 'WAX610' | 'WAX615' | 'WAX620' | 'WAX630' | 'SRK60' | 'SXR80' | 'SXS80' | 'WAC505' | 'WAC510' | 'WAC540' | 'WAC730';

export interface NetgearConfig extends Omit<GatewayConfig, 'vendor'> {
  vendor: 'netgear';
  hardwareType?: NetgearHardwareType;
  insightCloudEnabled?: boolean;
  insightApiKey?: string;
  insightApiSecret?: string;
  insightClientId?: string;
  insightClientSecret?: string;
  insightRegion?: 'us' | 'eu' | 'ap';
  insightOrgId?: string;
  insightNetworkId?: string;
  localApiEnabled?: boolean;
  localApiPort?: number;
  localApiToken?: string;
  orbiProMode?: 'router' | 'satellite';
  orbiMeshId?: string;
  ssids?: NetgearSSIDConfig[];
  defaultSSID?: string;
  radiusServerPrimary?: string;
  radiusServerSecondary?: string;
  captivePortalEnabled?: boolean;
  captivePortalUrl?: string;
  captivePortalSplashUrl?: string;
}

export interface NetgearSSIDConfig {
  name: string;
  ssid: string;
  enabled: boolean;
  security: 'open' | 'wpa2-psk' | 'wpa3-psk' | 'wpa2-enterprise';
  password?: string;
  vlanId?: number;
  bandwidthLimit?: { download: number; upload: number };
  captivePortal?: boolean;
  ssidBroadcast?: boolean;
  isolation?: boolean;
  maxClients?: number;
}

export interface NetgearSession {
  id: string;
  macAddress: string;
  ipAddress: string;
  ssid: string;
  username?: string;
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  connectedAt: Date;
  lastActivity: Date;
  signalStrength: number;
  apMac: string;
  apName: string;
  radioBand: '2.4GHz' | '5GHz' | '6GHz';
  channel: number;
}

export interface NetgearAccessPoint {
  mac: string;
  name: string;
  model: NetgearHardwareType;
  serialNumber: string;
  firmwareVersion: string;
  ip: string;
  status: 'online' | 'offline' | 'updating' | 'rebooting';
  clientCount: number;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
  lastSeen: Date;
  radios: NetgearRadioInfo[];
}

export interface NetgearRadioInfo {
  band: '2.4GHz' | '5GHz' | '6GHz';
  channel: number;
  channelWidth: number;
  txPower: number;
  clientCount: number;
  interference: number;
  noiseFloor: number;
}

export interface NetgearNetwork {
  id: string;
  name: string;
  ssid: string;
  security: string;
  vlanId?: number;
  bandwidthLimit?: { download: number; upload: number };
  clientCount: number;
  status: 'active' | 'inactive';
}

export interface InsightAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  pagination?: { page: number; limit: number; total: number; hasMore: boolean };
}

export const NetgearVSA = {
  BANDWIDTH_MAX_DOWN: 1,
  BANDWIDTH_MAX_UP: 2,
  BANDWIDTH_MIN_DOWN: 3,
  BANDWIDTH_MIN_UP: 4,
  SESSION_TIMEOUT: 5,
  IDLE_TIMEOUT: 6,
  VLAN_ID: 11,
  VLAN_NAME: 12,
  VLAN_PRIORITY: 13,
  QOS_PROFILE: 21,
  QOS_CLASS: 22,
  DSCP_MARK: 23,
  SESSION_ID: 31,
  CLIENT_MAC: 32,
  CLIENT_IP: 33,
  AP_MAC: 34,
  SSID: 35,
  AUTH_TYPE: 41,
  AUTH_METHOD: 42,
  AUTH_SERVER: 43,
  GROUP_NAME: 44,
  ROLE_NAME: 45,
  PORTAL_URL: 51,
  REDIRECT_URL: 52,
  PORTAL_SESSION_ID: 53,
  BYTES_IN: 61,
  BYTES_OUT: 62,
  PACKETS_IN: 63,
  PACKETS_OUT: 64,
  SESSION_TIME: 65,
  RATE_LIMIT_DOWN: 71,
  RATE_LIMIT_UP: 72,
  BURST_SIZE_DOWN: 73,
  BURST_SIZE_UP: 74,
} as const;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class NetgearAdapter extends GatewayAdapter {
  protected netgearConfig: NetgearConfig;

  constructor(config: NetgearConfig) {
    super(config as GatewayConfig);
    this.netgearConfig = config;
  }

  getVendor(): GatewayVendor {
    return 'netgear' as GatewayVendor;
  }

  // -- helpers ---------------------------------------------------------------

  /** Use local controller URL or Insight Cloud URL based on config. */
  private getBaseUrl(): string {
    // If local API is explicitly enabled, prefer local controller
    if (this.netgearConfig.localApiEnabled) {
      const port = this.netgearConfig.localApiPort || this.config.apiPort || 443;
      return `https://${this.config.ipAddress}:${port}/api/v1`;
    }
    // Default: local controller on config IP
    const port = this.config.apiPort || 443;
    return `https://${this.config.ipAddress}:${port}/api/v1`;
  }

  /** Insight Cloud base URL (used only when insightCloudEnabled is true). */
  private getInsightUrl(): string {
    const region = this.netgearConfig.insightRegion || 'us';
    return INSIGHT_REGION_URLS[region] || INSIGHT_REGION_URLS['us'];
  }

  private getBasicAuthHeader(): string {
    const user = this.config.apiUsername || '';
    const pass = this.config.apiPassword || '';
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  private async fetchJson<T>(path: string, params?: Record<string, string>, useCloud = false): Promise<T | null> {
    const base = useCloud ? this.getInsightUrl() : this.getBaseUrl();
    let url = `${base}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      // Local controller uses Basic auth
      if (!useCloud) {
        headers['Authorization'] = this.getBasicAuthHeader();
      }
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Netgear API ${res.status}: ${text || res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') throw new Error('Netgear API request timed out');
      throw err;
    }
  }

  private async fetchEndpoint(path: string, method: 'POST' | 'PUT' | 'DELETE' = 'POST', body?: unknown, useCloud = false): Promise<{ success: boolean; error?: string }> {
    const base = useCloud ? this.getInsightUrl() : this.getBaseUrl();
    const url = `${base}${path}`;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (!useCloud) {
        headers['Authorization'] = this.getBasicAuthHeader();
      }
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `Netgear API ${res.status}: ${text || res.statusText}` };
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      return { success: false, error: msg };
    }
  }

  /**
   * Private helper: route all CoA operations through the FreeRADIUS service.
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
      // Try Insight Cloud if configured
      if (this.netgearConfig.insightCloudEnabled && this.netgearConfig.insightApiKey) {
        await this.fetchJson<InsightAPIResponse<unknown>>('/organizations', undefined, true);
      } else {
        // Use local controller API
        await this.fetchJson<{ success?: boolean } | null>('/api/v1/system/info');
      }
      return { success: true, latency: Date.now() - start };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection test failed' };
    }
  }

  async getStatus(): Promise<GatewayStatus> {
    try {
      const useCloud = this.netgearConfig.insightCloudEnabled && this.netgearConfig.insightApiKey;
      if (useCloud) {
        // Insight Cloud: fetch from access-points
        const aps = await this.fetchJson<InsightAPIResponse<NetgearAccessPoint[]>>(
          `/networks/${this.netgearConfig.insightNetworkId || 'default'}/access-points`,
          undefined,
          true,
        );
        if (aps?.data && aps.data.length > 0) {
          const ap = aps.data[0];
          return {
            online: ap.status === 'online',
            firmwareVersion: ap.firmwareVersion,
            cpuUsage: ap.cpuUsage,
            memoryUsage: ap.memoryUsage,
            uptime: ap.uptime,
            totalClients: ap.clientCount,
            lastSeen: ap.lastSeen,
          };
        }
        throw new Error('No access points returned from Insight Cloud');
      }

      // Local controller
      const info = await this.fetchJson<{
        firmwareVersion?: string;
        cpuUsage?: number;
        memoryUsage?: number;
        uptime?: number;
        clientCount?: number;
        totalAps?: number;
        onlineAps?: number;
      }>('/api/v1/system/info');

      if (!info) throw new Error('No system info returned');

      return {
        online: true,
        firmwareVersion: info.firmwareVersion,
        cpuUsage: info.cpuUsage,
        memoryUsage: info.memoryUsage,
        uptime: info.uptime,
        totalClients: info.clientCount ?? info.onlineAps,
        lastSeen: new Date(),
      };
    } catch (err) {
      return { online: false, lastSeen: new Date() };
    }
  }

  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const useCloud = this.netgearConfig.insightCloudEnabled && this.netgearConfig.insightApiKey;
      if (useCloud) {
        const resp = await this.fetchJson<InsightAPIResponse<NetgearSession[]>>(
          `/networks/${this.netgearConfig.insightNetworkId || 'default'}/clients`,
          { status: 'connected' },
          true,
        );
        const sessions = resp?.data;
        if (!sessions) return [];
        return sessions.map((s) => ({
          sessionId: s.id,
          username: s.username || s.macAddress,
          ipAddress: s.ipAddress,
          macAddress: s.macAddress,
          nasIpAddress: this.config.ipAddress,
          startTime: new Date(s.connectedAt),
          duration: Math.floor((Date.now() - s.connectedAt.getTime()) / 1000),
          bytesIn: s.bytesIn || 0,
          bytesOut: s.bytesOut || 0,
          status: 'active' as const,
          apName: s.apName,
          ssid: s.ssid,
          additionalInfo: { signalStrength: s.signalStrength, radioBand: s.radioBand, channel: s.channel, apMac: s.apMac },
        }));
      }

      // Local controller
      const data = await this.fetchJson<{
        clients?: Array<{
          mac: string;
          ip: string;
          ssid: string;
          username?: string;
          download?: number;
          upload?: number;
          duration?: number;
          signal?: number;
          radio?: string;
          apMac?: string;
          apName?: string;
        }>;
      }>('/api/v1/clients', { status: 'connected' });

      const clients = data?.clients;
      if (!clients) return [];

      return clients.map((c) => ({
        sessionId: c.mac,
        username: c.username || c.mac,
        ipAddress: c.ip,
        macAddress: c.mac,
        nasIpAddress: this.config.ipAddress,
        startTime: new Date(Date.now() - (c.duration || 0) * 1000),
        duration: c.duration || 0,
        bytesIn: c.download || 0,
        bytesOut: c.upload || 0,
        status: 'active' as const,
        apName: c.apName,
        ssid: c.ssid,
        additionalInfo: { signalStrength: c.signal, radioBand: c.radio, apMac: c.apMac },
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
    if (policy.downloadSpeed) attrs['Netgear-Bandwidth-Max-Down'] = String(Math.ceil(policy.downloadSpeed / 1000));
    if (policy.uploadSpeed) attrs['Netgear-Bandwidth-Max-Up'] = String(Math.ceil(policy.uploadSpeed / 1000));
    if (policy.sessionTimeout) attrs['Netgear-Session-Timeout'] = String(policy.sessionTimeout);
    return this.sendCoA({ username, sessionId, action: 'update', attributes: attrs });
  }

  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (policy.sessionTimeout) attrs['Session-Timeout'] = String(policy.sessionTimeout);
    if (policy.downloadSpeed) {
      attrs['WISPr-Bandwidth-Max-Down'] = String(policy.downloadSpeed);
      attrs['Netgear-Bandwidth-Max-Down'] = String(Math.ceil(policy.downloadSpeed / 1000));
    }
    if (policy.uploadSpeed) {
      attrs['WISPr-Bandwidth-Max-Up'] = String(policy.uploadSpeed);
      attrs['Netgear-Bandwidth-Max-Up'] = String(Math.ceil(policy.uploadSpeed / 1000));
    }
    return attrs;
  }
}
