/**
 * Ruijie Networks Gateway Adapter — Production Ready
 *
 * Ruijie Networks is very popular in India and China for hospitality WiFi.
 * API: https://{ip}:{port}/api/v1/
 * Auth: Basic auth with apiUsername:apiPassword
 *
 * RADIUS Vendor ID: 25506
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

const RUIJIE_VENDOR_ID = 25506;
const RADIUS_SERVICE_URL = process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface RuijieConfig extends GatewayConfig {
  vendor: 'ruijie';
  ruijieCloudEnabled?: boolean;
  ruijieCloudUrl?: string;
  ruijieCloudAppKey?: string;
  ruijieCloudAppSecret?: string;
  ruijieCloudOrgId?: string;
  ruijieCloudProjectId?: string;
  controllerModel?: 'RG-BC8600' | 'RG-BC5750' | 'RG-BC2800' | 'RG-BC1200' | string;
  controllerApiPort?: number;
  controllerUseSSL?: boolean;
  portalEnabled?: boolean;
  portalSecret?: string;
  portalAuthUrl?: string;
  apModel?: 'RG-AP520' | 'RG-AP620' | 'RG-AP840' | 'RG-AP860' | string;
  ssidProfileName?: string;
  guestVlanId?: number;
  staffVlanId?: number;
  maxSessionsPerAp?: number;
  sessionTimeoutDefault?: number;
}

interface RuijieCloudResponse<T = unknown> { code: number; message: string; data?: T; requestId?: string; }
interface RuijieCloudDevice { deviceId: string; deviceName: string; deviceModel: string; deviceSn: string; deviceIp: string; deviceMac: string; status: 'online' | 'offline' | 'fault'; firmwareVersion: string; cpuUsage: number; memoryUsage: number; clientCount: number; uptime: number; lastSeen: string; siteId: string; siteName: string; }
interface RuijieCloudClientInfo { clientId: string; clientMac: string; clientIp: string; clientName: string; ssid: string; apMac: string; apName: string; connectTime: string; duration: number; rxBytes: number; txBytes: number; rxRate: number; txRate: number; signalStrength: number; status: 'online' | 'offline'; vlanId: number; authType: 'portal' | 'psk' | 'open' | 'radius'; }
interface RuijiePortalAuthRequest { username: string; password: string; clientMac: string; clientIp: string; apMac: string; ssid: string; sessionId?: string; }
interface RuijiePortalAuthResponse { success: boolean; sessionId?: string; sessionTimeout?: number; bandwidthLimit?: { download: number; upload: number }; message?: string; errorCode?: string; }

enum RuijieVSA {
  BANDWIDTH_MAX_DOWN = 1,
  BANDWIDTH_MAX_UP = 2,
  BANDWIDTH_MIN_DOWN = 3,
  BANDWIDTH_MIN_UP = 4,
  // Burst/ceil VSAs — custom/vendor-specific (not in published Ruijie dictionary)
  // Used by RG-BC8600/BC5750 series controllers to set HTB burst ceiling
  BANDWIDTH_CEIL_DOWN = 5,
  BANDWIDTH_CEIL_UP = 6,
  SESSION_TIMEOUT = 10,
  IDLE_TIMEOUT = 11,
  VLAN_ID = 20,
  VLAN_NAME = 21,
  USER_GROUP = 30,
  USER_PRIORITY = 31,
  PORTAL_URL = 40,
  PORTAL_SECRET = 41,
  QOS_PROFILE = 50,
  QOS_PRIORITY = 51,
  ACL_PROFILE = 60,
  ROAMING_ENABLED = 70,
  ROAMING_GROUP = 71,
}

interface RuijieBandwidthProfile { profileName: string; downloadMax: number; uploadMax: number; downloadMin?: number; uploadMin?: number; burstDownload?: number; burstUpload?: number; }
interface RuijieSessionInfo extends SessionInfo { apName?: string; ssid?: string; authType?: string; vlanId?: number; signalStrength?: number; }

// Re-export enums/types that were previously exported
export { RuijieVSA };

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class RuijieAdapter extends GatewayAdapter {
  protected ruijieConfig: RuijieConfig;

  constructor(config: RuijieConfig) {
    super(config);
    this.ruijieConfig = config;
  }

  getVendor() {
    return 'ruijie' as const;
  }

  // -- helpers ---------------------------------------------------------------

  private getBaseUrl(): string {
    const proto = this.ruijieConfig.controllerUseSSL !== false ? 'https' : 'http';
    const port = this.ruijieConfig.controllerApiPort || this.config.apiPort || 443;
    return `${proto}://${this.config.ipAddress}:${port}`;
  }

  private getBasicAuthHeader(): string {
    const user = this.config.apiUsername || '';
    const pass = this.config.apiPassword || '';
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
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
        headers: {
          'Authorization': this.getBasicAuthHeader(),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ruijie API ${res.status}: ${text || res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') throw new Error('Ruijie API request timed out');
      throw err;
    }
  }

  private async fetchEndpoint(path: string, method: 'POST' | 'PUT' | 'DELETE' = 'POST', body?: unknown): Promise<{ success: boolean; error?: string }> {
    const url = `${this.getBaseUrl()}${path}`;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': this.getBasicAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `Ruijie API ${res.status}: ${text || res.statusText}` };
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
      const info = await this.fetchJson<{ success?: boolean } | null>('/api/v1/system/info');
      if (!info) throw new Error('No response body');
      return { success: true, latency: Date.now() - start };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection test failed' };
    }
  }

  async getStatus(): Promise<GatewayStatus> {
    try {
      const status = await this.fetchJson<{
        firmwareVersion?: string;
        cpuUsage?: number;
        memoryUsage?: number;
        uptime?: number;
        totalAps?: number;
        onlineAps?: number;
        totalClients?: number;
        health?: string;
      }>('/api/v1/system/status');

      if (!status) throw new Error('No status data returned');

      return {
        online: true,
        firmwareVersion: status.firmwareVersion,
        cpuUsage: status.cpuUsage,
        memoryUsage: status.memoryUsage,
        uptime: status.uptime,
        totalClients: status.totalClients,
        lastSeen: new Date(),
      };
    } catch (err) {
      return { online: false, lastSeen: new Date() };
    }
  }

  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const data = await this.fetchJson<{ clients?: RuijieCloudClientInfo[] } | null>(
        '/api/v1/clients',
        { status: 'online' }
      );
      const clients = data?.clients;
      if (!clients) return [];

      return clients.map((c) => ({
        sessionId: c.clientId,
        username: c.clientName || c.clientMac,
        ipAddress: c.clientIp,
        macAddress: c.clientMac,
        nasIpAddress: this.config.ipAddress,
        startTime: new Date(c.connectTime),
        duration: c.duration,
        bytesIn: c.rxBytes || 0,
        bytesOut: c.txBytes || 0,
        status: 'active' as const,
        apName: c.apName,
        ssid: c.ssid,
        vlanId: c.vlanId,
        additionalInfo: { authType: c.authType, signalStrength: c.signalStrength },
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
    if (policy.downloadSpeed) attrs['Ruijie-Bandwidth-Max-Down'] = String(Math.ceil(policy.downloadSpeed / 1000));
    if (policy.uploadSpeed) attrs['Ruijie-Bandwidth-Max-Up'] = String(Math.ceil(policy.uploadSpeed / 1000));
    // Burst ceil attributes — only include when burst values are > 0
    if (policy.burstDownloadSpeed && policy.burstDownloadSpeed > 0) {
      attrs['Ruijie-Bandwidth-Ceil-Down'] = String(Math.ceil(policy.burstDownloadSpeed / 1000));
    }
    if (policy.burstUploadSpeed && policy.burstUploadSpeed > 0) {
      attrs['Ruijie-Bandwidth-Ceil-Up'] = String(Math.ceil(policy.burstUploadSpeed / 1000));
    }
    if (policy.sessionTimeout) attrs['Session-Timeout'] = String(policy.sessionTimeout);
    return this.sendCoA({ username, sessionId, action: 'update', attributes: attrs });
  }

  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs: Record<string, string> = {};
    if (policy.sessionTimeout) attrs['Session-Timeout'] = String(policy.sessionTimeout);
    if (policy.downloadSpeed) {
      attrs['WISPr-Bandwidth-Max-Down'] = String(policy.downloadSpeed);
      attrs['Ruijie-Bandwidth-Max-Down'] = String(Math.ceil(policy.downloadSpeed / 1000));
    }
    if (policy.uploadSpeed) {
      attrs['WISPr-Bandwidth-Max-Up'] = String(policy.uploadSpeed);
      attrs['Ruijie-Bandwidth-Max-Up'] = String(Math.ceil(policy.uploadSpeed / 1000));
    }
    // Burst ceil attributes — only include when burst values are > 0
    // Ruijie-Bandwidth-Ceil-Down/Up are custom vendor-specific VSAs (RuijieVSA 5/6)
    // Supported by RG-BC8600/BC5750 series controllers for HTB burst ceiling
    if (policy.burstDownloadSpeed && policy.burstDownloadSpeed > 0) {
      attrs['Ruijie-Bandwidth-Ceil-Down'] = String(Math.ceil(policy.burstDownloadSpeed / 1000));
    }
    if (policy.burstUploadSpeed && policy.burstUploadSpeed > 0) {
      attrs['Ruijie-Bandwidth-Ceil-Up'] = String(Math.ceil(policy.burstUploadSpeed / 1000));
    }
    return attrs;
  }
}
