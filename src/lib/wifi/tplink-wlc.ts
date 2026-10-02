/**
 * TP-Link Omada Controller REST API Adapter
 *
 * Vendor: TP-Link Systems
 * API: Omada Controller REST API v2
 * Auth: POST /api/v2/login → JWT token (set as "token" header for subsequent calls)
 * Endpoints:
 *   POST /api/v2/login                                                    — Authenticate
 *   GET  /api/v2/sites/{siteId}/controller/status                         — Controller status
 *   GET  /api/v2/sites/{siteId}/aps                                       — AP list
 *   GET  /api/v2/sites/{siteId}/aps/{mac}                                 — Single AP details
 *   GET  /api/v2/sites/{siteId}/ssids                                     — SSID list
 *   GET  /api/v2/sites/{siteId}/clients                                   — Client list
 *   POST /api/v2/sites/{siteId}/aps/{mac}/restart                         — Restart AP
 *   POST /api/v2/sites/{siteId}/clients/{mac}/kick                        — Disconnect client
 * RADIUS Vendor ID: 19388
 * CoA Port: 3799
 */

import {
  WlcAdapter,
  WlcConfig,
  WlcHealth,
  WlcAccessPoint,
  WlcSsid,
  WlcRadiusProfile,
} from './wlc-adapter';

export class TplinkWlcAdapter extends WlcAdapter {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private siteId: string;

  constructor(config: WlcConfig) {
    super(config);
    this.siteId = config.siteId ?? 'default';
  }

  getVendor() {
    return 'tplink' as const;
  }

  /** Authenticate and get token */
  private async authenticate(): Promise<boolean> {
    if (this.token && this.tokenExpiresAt > Date.now()) {
      this.headers['token'] = this.token;
      return true;
    }

    const res = await this.apiRequest('/api/v2/login', {
      method: 'POST',
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
      }),
    });

    if (!res.ok || !res.data) {
      this.token = null;
      return false;
    }

    // Omada returns token in response data
    const token = res.data.token as string | undefined;
    if (!token) return false;

    this.token = token;
    this.tokenExpiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2 hours (Omada default)
    this.headers['token'] = this.token;
    return true;
  }

  /** Helper: API request with site path prefix */
  private siteApiRequest(path: string, options: RequestInit = {}) {
    return this.apiRequest(`/api/v2/sites/${this.siteId}${path}`, options);
  }

  /** Test connectivity */
  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();
    if (!(await this.authenticate())) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: 'Authentication failed',
      };
    }

    const res = await this.siteApiRequest('/controller/status');
    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    const info = res.data?.result ?? res.data ?? {};
    return {
      online: true,
      latencyMs: Date.now() - start,
      model: info.modelName as string ?? info.model as string ?? undefined,
      firmwareVersion: info.firmwareVersion as string ?? info.version as string ?? undefined,
      serialNumber: info.serialNumber as string ?? info.hwVersion as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get full controller health */
  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();
    if (!(await this.authenticate())) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: 'Authentication failed',
      };
    }

    const [statusRes, apRes, clientRes] = await Promise.all([
      this.siteApiRequest('/controller/status'),
      this.siteApiRequest('/aps'),
      this.siteApiRequest('/clients'),
    ]);

    if (!statusRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: statusRes.error ?? 'Unable to reach controller',
      };
    }

    const status = statusRes.data?.result ?? statusRes.data ?? {};
    const apList = apRes.ok ? (Array.isArray(apRes.data?.result) ? apRes.data.result : apRes.data?.data ?? []) : [];
    const clientList = clientRes.ok ? (Array.isArray(clientRes.data?.result) ? clientRes.data.result : clientRes.data?.data ?? []) : [];

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: status.cpuUsage != null ? Number(status.cpuUsage) : undefined,
      memoryUsage: status.memUsage != null ? Number(status.memUsage) : undefined,
      uptimeSeconds: status.uptime != null ? Number(status.uptime) : undefined,
      firmwareVersion: status.firmwareVersion as string ?? status.version as string ?? undefined,
      model: status.modelName as string ?? status.model as string ?? undefined,
      serialNumber: status.serialNumber as string ?? undefined,
      totalAps: apList.length || undefined,
      onlineAps: apList.filter(
        (ap: Record<string, unknown>) => (ap.status as number) === 1 || (ap.status as string ?? '').toLowerCase() === 'online'
      ).length || undefined,
      totalClients: clientList.length || undefined,
      licenseStatus: status.licenseStatus as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get all access points */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    if (!(await this.authenticate())) return [];
    const res = await this.siteApiRequest('/aps');
    if (!res.ok) return [];

    const apList = Array.isArray(res.data?.result) ? res.data.result : res.data?.data ?? [];
    if (!Array.isArray(apList)) return [];

    return apList
      .filter((ap: Record<string, unknown>) => ap)
      .map((ap: Record<string, unknown>) => {
        const status = this.parseApStatus(ap.status as number | string ?? 0);
        return {
          id: (ap.mac as string ?? '').toLowerCase(),
          mac: (ap.mac as string ?? '').toLowerCase(),
          name: ap.name as string ?? ap.deviceName as string ?? '',
          model: ap.type as string ?? ap.model as string ?? '',
          firmware: ap.firmwareVersion as string ?? ap.softwareVersion as string ?? '',
          status,
          ip: ap.ip as string ?? ap.ipAddress as string ?? undefined,
          serialNumber: ap.mac as string ?? ap.serialNumber as string ?? undefined,
          clients: Number(ap.clientNum ?? ap.clientCount ?? 0),
          channel: ap.channel != null ? Number(ap.channel) : undefined,
          txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
          uptimeSeconds: ap.uptime != null ? Number(ap.uptime) : undefined,
          site: ap.siteName as string ?? undefined,
          floor: ap.floorName as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: new Date(),
        };
      });
  }

  /** Get all SSIDs */
  async getSsids(): Promise<WlcSsid[]> {
    if (!(await this.authenticate())) return [];
    const res = await this.siteApiRequest('/ssids');
    if (!res.ok) return [];

    const ssidList = Array.isArray(res.data?.result) ? res.data.result : res.data?.data ?? [];
    if (!Array.isArray(ssidList)) return [];

    return ssidList
      .filter((ssid: Record<string, unknown>) => ssid)
      .map((ssid: Record<string, unknown>) => ({
        id: (ssid.id as string ?? ssid.ssidId as string ?? '').toString(),
        name: ssid.ssidName as string ?? ssid.name as string ?? '',
        interface: ssid.interfaceName as string ?? undefined,
        vlanId: ssid.vlanId != null ? Number(ssid.vlanId) : undefined,
        securityType: this.parseSecurityType(ssid.security as string ?? ssid.authType as string ?? ''),
        enabled: ssid.enable === true || ssid.enabled === true || ssid.status === 1,
        broadcastSsid: ssid.hideSsid !== true && ssid.hidden !== true,
        clientCount: ssid.clientNum != null ? Number(ssid.clientNum) : undefined,
        maxClients: ssid.maxClient != null ? Number(ssid.maxClient) : undefined,
        band: this.parseBand(ssid.band as number | string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.authenticate())) {
      return { success: false, error: 'Authentication failed' };
    }

    const res = await this.siteApiRequest(`/clients/${mac}/kick`, { method: 'POST' });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
  }

  /** Restart an AP by MAC */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.authenticate())) {
      return { success: false, error: 'Authentication failed' };
    }

    const res = await this.siteApiRequest(`/aps/${mac}/restart`, { method: 'POST' });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for TP-Link (Vendor ID 19388) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'tplink-default',
      name: 'TP-Link Omada Default',
      vendor: 'tplink',
      description: 'Default RADIUS VSA profile for TP-Link Omada Controller (Vendor ID 19388)',
      attributes: [
        { vendorId: 19388, attributeName: 'TP-Link-VLAN-ID', attributeValue: '', vendorName: 'TP-Link' },
        { vendorId: 19388, attributeName: 'TP-Link-User-Group', attributeValue: 'guest', vendorName: 'TP-Link' },
        { vendorId: 19388, attributeName: 'TP-Link-QoS-Level', attributeValue: '1', vendorName: 'TP-Link' },
        { vendorId: 19388, attributeName: 'TP-Link-Bandwidth', attributeValue: '0/0', vendorName: 'TP-Link' },
      ],
      defaultRole: 'guest',
    };
  }

  // ── Helpers ──

  private parseApStatus(status: number | string): WlcAccessPoint['status'] {
    // Omada uses numeric status: 0=offline, 1=online, 2=provisioning, etc.
    if (typeof status === 'number') {
      if (status === 1) return 'online';
      if (status === 0) return 'offline';
      if (status === 2) return 'provisioning';
      return 'offline';
    }
    const s = status?.toLowerCase() ?? 'offline';
    if (s === 'online' || s === 'connected') return 'online';
    if (s === 'provisioning') return 'provisioning';
    return 'offline';
  }

  private parseSecurityType(raw: string): string {
    if (!raw) return 'Unknown';
    const s = raw.toLowerCase();
    if (s.includes('wpa3') && s.includes('enterprise')) return 'WPA3-Enterprise';
    if (s.includes('wpa3')) return 'WPA3-PSK';
    if (s.includes('wpa2') && (s.includes('enterprise') || s.includes('802.1x'))) return 'WPA2-Enterprise';
    if (s.includes('wpa2')) return 'WPA2-PSK';
    if (s.includes('wpa')) return 'WPA-PSK';
    if (s === 'none' || s.includes('open')) return 'Open';
    return raw;
  }

  private parseBand(raw: string | number): string {
    if (!raw && raw !== 0) return 'dual';
    const s = String(raw).toLowerCase();
    if (s === '5' || s === '5g') return '5GHz';
    if (s === '2' || s === '2.4' || s === '2g' || s === '2.4g') return '2.4GHz';
    return 'dual';
  }
}