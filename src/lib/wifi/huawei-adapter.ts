/**
 * Huawei AirEngine WiFi Gateway Adapter — Production Ready
 *
 * Huawei is extremely popular in India and Asian markets for enterprise hospitality.
 * API: https://{ip}:{port}/api/v1/
 * Auth: Basic auth (try first) or token-based
 *
 * RADIUS Vendor ID: 2011
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

const HUAWEI_VENDOR_ID = 2011;
const RADIUS_SERVICE_URL = process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type HuaweiDeviceType = 'airengine-ap' | 'cloudengine-sw' | 'access-controller' | 'ekit-wifi';
export type HuaweiManagementMode = 'esight' | 'cloud' | 'standalone';
export type HuaweiAirEngineModel = 'AirEngine5760-10' | 'AirEngine5760-12' | 'AirEngine6760-X1' | 'AirEngine6760-X2' | 'AirEngine8760-X1' | 'AirEngine8760-X2' | 'AirEngine8760-X3' | 'AirEngine5760-12SW' | 'AirEngine6760R';
export type HuaweiACModel = 'AC6508' | 'AC6805' | 'AC6800V' | 'AC6507S' | 'AC6800V-H';

export interface HuaweiConfig extends Omit<GatewayConfig, 'vendor'> {
  vendor: 'huawei';
  managementMode?: HuaweiManagementMode;
  esightUrl?: string;
  esightUsername?: string;
  esightPassword?: string;
  esightPort?: number;
  esightVersion?: string;
  cloudRegion?: string;
  cloudProjectId?: string;
  cloudAccessKeyId?: string;
  cloudSecretAccessKey?: string;
  cloudIamEndpoint?: string;
  deviceType?: HuaweiDeviceType;
  deviceModel?: HuaweiAirEngineModel | HuaweiACModel | string;
  deviceId?: string;
  netconfEnabled?: boolean;
  netconfPort?: number;
  netconfUsername?: string;
  netconfPassword?: string;
  apGroup?: string;
  ssidProfile?: string;
  vapProfile?: string;
  acControllerIp?: string;
  enableAI?: boolean;
  enable5GConvergence?: boolean;
  enableCaptivePortal?: boolean;
}

export const HuaweiRadiusVSA = {
  VENDOR_ID: 2011,
  ATTRIBUTES: {
    INPUT_AVERAGE_RATE: 1,
    OUTPUT_AVERAGE_RATE: 2,
    INPUT_PEAK_RATE: 3,
    OUTPUT_PEAK_RATE: 4,
    VLAN_ID: 5,
    IP_ADDRESS: 6,
    ACL_NUMBER: 7,
    USER_GROUP: 8,
    UPSTREAM_RATE_LIMIT: 9,
    DOWNSTREAM_RATE_LIMIT: 10,
    SESSION_TIMEOUT: 11,
    REMAINING_TRAFFIC: 12,
    SERVICE_TYPE: 13,
    QOS_PROFILE: 14,
    CAR_PROFILE: 15,
    DOMAIN_NAME: 16,
    UPSTREAM_CAR: 17,
    DOWNSTREAM_CAR: 18,
    VLAN_POOL: 19,
    ACCESS_PRIORITY: 20,
    ACCOUNTING_INTERVAL: 21,
    QUOTA_SESSION_TIME: 22,
    QUOTA_INPUT_OCTETS: 23,
    QUOTA_OUTPUT_OCTETS: 24,
    WEB_AUTH_URL: 25,
    PORTAL_SERVER: 26,
    AP_GROUP: 27,
    UCL_GROUP: 28,
    SERVICE_SCHEME: 29,
    PRE_SHARED_KEY: 30,
  },
} as const;

interface ESightResponse<T = unknown> { errorCode: string; errorMsg?: string; data?: T; total?: number; }
interface HuaweiSessionData { sessionId: string; userName: string; userIp: string; userMac: string; apMac?: string; ssid?: string; nasIp: string; startTime: number; duration: number; inputOctets: number; outputOctets: number; inputPackets: number; outputPackets: number; status: 'online' | 'offline' | 'idle'; authenticationType?: string; vapName?: string; radioType?: string; channel?: number; rssi?: number; snr?: number; }
interface HuaweiAPInfo { apMac: string; apName: string; apModel: string; apGroup: string; apStatus: 'online' | 'offline' | 'fault' | 'idle'; ip: string; serialNumber: string; firmwareVersion: string; cpuUsage: number; memoryUsage: number; onlineDuration: number; clientCount: number; radioInfo: HuaweiRadioInfo[]; lastSeen: Date; }
interface HuaweiRadioInfo { radioId: number; radioType: '2.4GHz' | '5GHz' | '6GHz' | '5GHz-2'; channel: number; bandwidth: number; power: number; clientCount: number; interference: number; utilization: number; }

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class HuaweiAdapter extends GatewayAdapter {
  protected huaweiConfig: HuaweiConfig;

  constructor(config: HuaweiConfig) {
    super(config as GatewayConfig);
    this.huaweiConfig = config;
  }

  getVendor(): 'huawei' {
    return 'huawei';
  }

  // -- helpers ---------------------------------------------------------------

  private getBaseUrl(): string {
    if (this.huaweiConfig.esightUrl) return this.huaweiConfig.esightUrl;
    const proto = 'https';
    const port = this.huaweiConfig.esightPort || this.config.apiPort || 32102;
    return `${proto}://${this.config.ipAddress}:${port}`;
  }

  private getAuthHeaders(): Record<string, string> {
    const user = this.huaweiConfig.esightUsername || this.config.apiUsername || '';
    const pass = this.huaweiConfig.esightPassword || this.config.apiPassword || '';
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    };
  }

  private async fetchJson<T>(path: string, params?: Record<string, string>): Promise<T | null> {
    let url = `${this.getBaseUrl()}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Huawei API ${res.status}: ${text || res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') throw new Error('Huawei API request timed out');
      throw err;
    }
  }

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
        return { success: false, error: `Huawei API ${res.status}: ${text || res.statusText}` };
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
      await this.fetchJson<ESightResponse>('/api/v1/system/status');
      return { success: true, latency: Date.now() - start };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection test failed' };
    }
  }

  async getStatus(): Promise<GatewayStatus> {
    try {
      const resp = await this.fetchJson<ESightResponse<{
        firmwareVersion?: string;
        cpuUsage?: number;
        memoryUsage?: number;
        uptime?: number;
        totalAps?: number;
        onlineAps?: number;
        totalClients?: number;
      }>>('/api/v1/system/status');

      if (!resp || resp.errorCode !== '0' || !resp.data) throw new Error(resp?.errorMsg || 'Failed to retrieve status');

      const d = resp.data;
      return {
        online: true,
        firmwareVersion: d.firmwareVersion,
        cpuUsage: d.cpuUsage,
        memoryUsage: d.memoryUsage,
        uptime: d.uptime,
        totalClients: d.totalClients ?? d.onlineAps,
        lastSeen: new Date(),
      };
    } catch (err) {
      return { online: false, lastSeen: new Date() };
    }
  }

  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const resp = await this.fetchJson<ESightResponse<HuaweiSessionData[]>>('/api/v1/sta', { status: 'online' });
      const sessions = resp?.data;
      if (!sessions) return [];

      return sessions.map((s) => ({
        sessionId: s.sessionId,
        username: s.userName || s.userMac,
        ipAddress: s.userIp,
        macAddress: s.userMac,
        nasIpAddress: this.config.ipAddress,
        startTime: new Date(s.startTime),
        duration: s.duration,
        bytesIn: s.inputOctets || 0,
        bytesOut: s.outputOctets || 0,
        status: 'active' as const,
        apName: s.apMac,
        ssid: s.ssid,
        vlanId: undefined,
        additionalInfo: { authenticationType: s.authenticationType, radioType: s.radioType, rssi: s.rssi, snr: s.snr },
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
    if (policy.downloadSpeed) attrs['Huawei-Downstream-Rate-Limit'] = String(Math.ceil(policy.downloadSpeed / 1000));
    if (policy.uploadSpeed) attrs['Huawei-Upstream-Rate-Limit'] = String(Math.ceil(policy.uploadSpeed / 1000));
    if (policy.sessionTimeout) attrs['Huawei-Session-Timeout'] = String(policy.sessionTimeout);
    return this.sendCoA({ username, sessionId, action: 'update', attributes: attrs });
  }

  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (policy.sessionTimeout) attrs['Session-Timeout'] = String(policy.sessionTimeout);
    if (policy.downloadSpeed) {
      attrs['WISPr-Bandwidth-Max-Down'] = String(policy.downloadSpeed);
      attrs['Huawei-Downstream-Rate-Limit'] = String(Math.ceil(policy.downloadSpeed / 1000));
    }
    if (policy.uploadSpeed) {
      attrs['WISPr-Bandwidth-Max-Up'] = String(policy.uploadSpeed);
      attrs['Huawei-Upstream-Rate-Limit'] = String(Math.ceil(policy.uploadSpeed / 1000));
    }
    return attrs;
  }
}
