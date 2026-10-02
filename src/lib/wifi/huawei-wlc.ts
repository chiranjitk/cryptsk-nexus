/**
 * Huawei AC (Access Controller) REST API Adapter
 *
 * Vendor: Huawei Technologies
 * API: Huawei AC REST API v2 (/api/v2/)
 * Auth: Digest Authentication or token-based (POST /api/v2/token)
 * Endpoints:
 *   POST /api/v2/token                              — Get auth token
 *   GET  /api/v2/system/device-info                 — Device info / health
 *   GET  /api/v2/system/performance                  — CPU/Memory usage
 *   GET  /api/v2/ap                                  — AP list
 *   GET  /api/v2/ap/{mac}                            — Single AP details
 *   GET  /api/v2/vap                                 — VAP/SSID list
 *   GET  /api/v2/sta                                 — Client/STA list
 *   POST /api/v2/ap/{mac}/restart                    — Restart AP
 *   DELETE /api/v2/sta/{mac}                         — Disconnect client
 * RADIUS Vendor ID: 2011
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

export class HuaweiWlcAdapter extends WlcAdapter {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: WlcConfig) {
    super(config);
  }

  getVendor() {
    return 'huawei' as const;
  }

  /** Authenticate and obtain access token */
  private async authenticate(): Promise<boolean> {
    if (this.token && this.tokenExpiresAt > Date.now()) {
      this.headers['X-Access-Token'] = this.token;
      return true;
    }

    // Try token-based auth first
    const res = await this.apiRequest('/api/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Huawei AC uses username/password in body or basic auth for token endpoint
      },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
      }),
    });

    if (res.ok && res.data) {
      const token = res.data.accessToken ?? res.data.token ?? res.data.access_token;
      if (typeof token === 'string' && token.length > 0) {
        this.token = token;
        this.tokenExpiresAt = Date.now() + 30 * 60 * 1000; // 30 min
        this.headers['X-Access-Token'] = this.token;
        return true;
      }
    }

    // Fallback: Basic auth
    const creds = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    this.headers['Authorization'] = `Basic ${creds}`;
    return true;
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

    const res = await this.apiRequest('/api/v2/system/device-info');
    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    const info = res.data?.deviceInfo ?? res.data?.data ?? res.data ?? {};
    return {
      online: true,
      latencyMs: Date.now() - start,
      model: info.deviceModel as string ?? info.model as string ?? undefined,
      firmwareVersion: info.softwareVersion as string ?? info.version as string ?? undefined,
      serialNumber: info.esn as string ?? info.serialNumber as string ?? undefined,
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

    const [deviceRes, perfRes, apRes, staRes] = await Promise.all([
      this.apiRequest('/api/v2/system/device-info'),
      this.apiRequest('/api/v2/system/performance'),
      this.apiRequest('/api/v2/ap'),
      this.apiRequest('/api/v2/sta'),
    ]);

    if (!deviceRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: deviceRes.error ?? 'Unable to reach controller',
      };
    }

    const info = deviceRes.data?.deviceInfo ?? deviceRes.data?.data ?? deviceRes.data ?? {};
    const perf = perfRes.ok ? (perfRes.data?.performance ?? perfRes.data?.data ?? perfRes.data ?? {}) : {};
    const apList = apRes.ok ? (Array.isArray(apRes.data) ? apRes.data : apRes.data?.ap ?? apRes.data?.data ?? []) : [];
    const staList = staRes.ok ? (Array.isArray(staRes.data) ? staRes.data : staRes.data?.sta ?? staRes.data?.data ?? []) : [];

    const onlineAps = apList.filter(
      (ap: Record<string, unknown>) => (ap.runState as string ?? ap.status as string ?? '').toLowerCase() === 'normal'
    ).length;

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: perf.cpuUsage != null ? Number(perf.cpuUsage) : undefined,
      memoryUsage: perf.memoryUsage != null ? Number(perf.memoryUsage) : undefined,
      uptimeSeconds: info.uptime != null ? Number(info.uptime) : undefined,
      firmwareVersion: info.softwareVersion as string ?? info.version as string ?? undefined,
      model: info.deviceModel as string ?? info.model as string ?? undefined,
      serialNumber: info.esn as string ?? info.serialNumber as string ?? undefined,
      totalAps: apList.length || undefined,
      onlineAps: onlineAps || undefined,
      totalClients: staList.length || undefined,
      licenseStatus: info.licenseStatus as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get all access points */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    if (!(await this.authenticate())) return [];
    const res = await this.apiRequest('/api/v2/ap');
    if (!res.ok) return [];

    const apList = Array.isArray(res.data) ? res.data : res.data?.ap ?? res.data?.data ?? [];
    if (!Array.isArray(apList)) return [];

    return apList
      .filter((ap: Record<string, unknown>) => ap)
      .map((ap: Record<string, unknown>) => {
        const status = this.parseApStatus(ap.runState as string ?? ap.status as string ?? 'offline');
        return {
          id: (ap.macAddress as string ?? ap.mac as string ?? '').toLowerCase(),
          mac: (ap.macAddress as string ?? ap.mac as string ?? '').toLowerCase(),
          name: ap.name as string ?? ap.apName as string ?? '',
          model: ap.apModel as string ?? ap.model as string ?? '',
          firmware: ap.softwareVersion as string ?? ap.version as string ?? '',
          status,
          ip: ap.ipAddress as string ?? ap.ip as string ?? undefined,
          serialNumber: ap.serialNumber as string ?? ap.sn as string ?? undefined,
          clients: Number(ap.onlineUserNum ?? ap.clientCount ?? ap.onlineStaNum ?? 0),
          channel: ap.channel != null ? Number(ap.channel) : undefined,
          txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
          uptimeSeconds: ap.upTime != null ? Number(ap.upTime) : undefined,
          site: ap.location as string ?? undefined,
          floor: ap.floor as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: new Date(),
        };
      });
  }

  /** Get all VAPs/SSIDs */
  async getSsids(): Promise<WlcSsid[]> {
    if (!(await this.authenticate())) return [];
    const res = await this.apiRequest('/api/v2/vap');
    if (!res.ok) return [];

    const vapList = Array.isArray(res.data) ? res.data : res.data?.vap ?? res.data?.data ?? [];
    if (!Array.isArray(vapList)) return [];

    return vapList
      .filter((vap: Record<string, unknown>) => vap)
      .map((vap: Record<string, unknown>) => ({
        id: (vap.vapId as string ?? vap.id as string ?? '').toString(),
        name: vap.ssid as string ?? vap.wlanName as string ?? vap.name as string ?? '',
        interface: vap.ifName as string ?? vap.interface as string ?? undefined,
        vlanId: vap.vlanId != null ? Number(vap.vlanId) : undefined,
        securityType: this.parseSecurityType(vap.securityProfile as string ?? vap.authentication as string ?? ''),
        enabled: vap.status === 'Up' || vap.runState === 'normal' || vap.enabled === true,
        broadcastSsid: vap.hiddenSsid !== true && vap.hideSsid !== true,
        clientCount: vap.onlineUserNum != null ? Number(vap.onlineUserNum) : undefined,
        maxClients: vap.maxUserNum != null ? Number(vap.maxUserNum) : undefined,
        band: this.parseBand(vap.radioType as string ?? vap.band as string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.authenticate())) {
      return { success: false, error: 'Authentication failed' };
    }

    const res = await this.apiRequest(`/api/v2/sta/${mac}`, {
      method: 'DELETE',
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
  }

  /** Restart an AP by MAC */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.authenticate())) {
      return { success: false, error: 'Authentication failed' };
    }

    const res = await this.apiRequest(`/api/v2/ap/${mac}/restart`, {
      method: 'POST',
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for Huawei (Vendor ID 2011) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'huawei-default',
      name: 'Huawei AC Default',
      vendor: 'huawei',
      description: 'Default RADIUS VSA profile for Huawei AC (Vendor ID 2011). Uses Huawei-AVPair for QoS and rate-limit.',
      attributes: [
        { vendorId: 2011, attributeName: 'HW-VLAN-Id', attributeValue: '', vendorName: 'Huawei' },
        { vendorId: 2011, attributeName: 'HW-User-Group', attributeValue: 'guest', vendorName: 'Huawei' },
        { vendorId: 2011, attributeName: 'Huawei-AVPair', attributeValue: 'qos-profile=default', vendorName: 'Huawei' },
        { vendorId: 2011, attributeName: 'Huawei-AVPair', attributeValue: 'rate-limit=0', vendorName: 'Huawei' },
      ],
      defaultRole: 'guest',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'normal' || s === 'online' || s === 'up' || s === 'running') return 'online';
    if (s === 'fault' || s === 'offline' || s === 'down') return 'offline';
    if (s === 'configuring' || s === 'provisioning') return 'provisioning';
    if (s === 'downloading') return 'provisioning';
    return 'offline';
  }

  private parseSecurityType(raw: string): string {
    if (!raw) return 'Unknown';
    const s = raw.toLowerCase();
    if (s.includes('wpa3') && s.includes('enterprise')) return 'WPA3-Enterprise';
    if (s.includes('wpa3')) return 'WPA3-PSK';
    if (s.includes('wpa2') && s.includes('enterprise')) return 'WPA2-Enterprise';
    if (s.includes('wpa2')) return 'WPA2-PSK';
    if (s.includes('wpa')) return 'WPA-PSK';
    if (s.includes('open') || s === 'none') return 'Open';
    return raw;
  }

  private parseBand(raw: string): string {
    if (!raw) return 'dual';
    const s = raw.toLowerCase();
    if (s.includes('5') && (s.includes('2.4') || s.includes('2g'))) return 'dual';
    if (s.includes('5g') || s === '5') return '5GHz';
    if (s.includes('2.4g') || s === '2.4') return '2.4GHz';
    return 'dual';
  }
}