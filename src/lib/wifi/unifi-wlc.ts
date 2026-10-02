/**
 * Ubiquiti UniFi Network Application REST API Adapter
 *
 * Vendor: Ubiquiti (UniFi)
 * API: UniFi Network Application REST API (unifi-os or self-hosted controller)
 * Auth: POST /api/login → session cookie (PHPSESSID or custom)
 * Endpoints:
 *   POST /api/login                                         — Authenticate
 *   POST /api/logout                                        — Logout
 *   GET  /api/s/{site}/stat/health                          — System health
 *   GET  /api/s/{site}/stat/system                          — System info
 *   GET  /api/s/{site}/stat/device/                         — Device list (filter: type=uap for APs)
 *   GET  /api/s/{site}/stat/sta/                            — Client list
 *   GET  /api/s/{site}/rest/wlanconf/                       — SSID/WLAN configuration
 *   POST /api/s/{site}/cmd/stamgr                           — Client management (kick, block)
 *   POST /api/s/{site}/cmd/devmgr                           — AP management (restart, provision)
 * RADIUS Vendor ID: 26825
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

export class UnifiWlcAdapter extends WlcAdapter {
  private siteId: string;
  private csrfToken: string | null = null;

  constructor(config: WlcConfig) {
    super(config);
    this.siteId = config.siteId ?? 'default';
  }

  getVendor() {
    return 'unifi' as const;
  }

  /** Authenticate with UniFi controller */
  private async authenticate(): Promise<boolean> {
    // UniFi uses cookie-based auth. We set up credentials for the login call.
    const loginRes = await this.apiRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${this.baseUrl}`,
      },
    });

    return loginRes.ok;
  }

  /** Helper: Site-scoped API request */
  private siteApiRequest(path: string, options: RequestInit = {}) {
    return this.apiRequest(`/api/s/${this.siteId}${path}`, {
      ...options,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...options.headers,
      },
    });
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

    const res = await this.siteApiRequest('/stat/system');
    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    const sys = Array.isArray(res.data) ? res.data[0] : res.data;
    return {
      online: true,
      latencyMs: Date.now() - start,
      model: sys?.model as string ?? sys?.type as string ?? undefined,
      firmwareVersion: sys?.version as string ?? undefined,
      serialNumber: sys?.serial as string ?? undefined,
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

    const [sysRes, healthRes, deviceRes, staRes] = await Promise.all([
      this.siteApiRequest('/stat/system'),
      this.siteApiRequest('/stat/health'),
      this.siteApiRequest('/stat/device/'),
      this.siteApiRequest('/stat/sta/'),
    ]);

    if (!sysRes.ok && !healthRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: sysRes.error ?? healthRes.error ?? 'Unable to reach controller',
      };
    }

    const sys = sysRes.ok ? (Array.isArray(sysRes.data) ? sysRes.data[0] : sysRes.data) : {};
    const health = healthRes.ok ? (Array.isArray(healthRes.data) ? healthRes.data[0] : healthRes.data) : {};
    const devices = deviceRes.ok ? (Array.isArray(deviceRes.data) ? deviceRes.data : []) : [];
    const stations = staRes.ok ? (Array.isArray(staRes.data) ? staRes.data : []) : [];

    const aps = devices.filter(
      (d: Record<string, unknown>) => d.type === 'uap' || d.deviceType === 'uap'
    );
    const onlineAps = aps.filter(
      (ap: Record<string, unknown>) => ap.state === 'RUNNING' || ap.lastSeen != null
    ).length;

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: health?.cpu != null ? Number(health.cpu) : undefined,
      memoryUsage: health?.mem != null ? Number(health.mem) : undefined,
      uptimeSeconds: sys?.uptime != null ? Number(sys.uptime) : undefined,
      firmwareVersion: sys?.version as string ?? undefined,
      model: sys?.model as string ?? sys?.type as string ?? undefined,
      serialNumber: sys?.serial as string ?? undefined,
      totalAps: aps.length || undefined,
      onlineAps: onlineAps || undefined,
      totalClients: stations.length || undefined,
      lastSync: new Date(),
    };
  }

  /** Get all access points (filter: type=uap) */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    if (!(await this.authenticate())) return [];
    const res = await this.siteApiRequest('/stat/device/');
    if (!res.ok) return [];

    const devices: Record<string, unknown>[] = Array.isArray(res.data) ? res.data : [];
    const aps = devices.filter(
      (d) => d.type === 'uap' || d.deviceType === 'uap'
    );

    return aps.map((ap) => {
      const status = this.parseApStatus(ap.state as string ?? ap.status as string ?? 'offline');
      return {
        id: (ap.mac as string ?? '').toLowerCase(),
        mac: (ap.mac as string ?? '').toLowerCase(),
        name: ap.name as string ?? '',
        model: ap.model as string ?? ap.deviceModel as string ?? '',
        firmware: ap.version as string ?? ap.firmwareVersion as string ?? '',
        status,
        ip: ap.ip as string ?? undefined,
        serialNumber: ap.serial as string ?? ap.serialNumber as string ?? undefined,
        clients: Number(ap.numSta ?? ap['num_sta'] ?? ap.clientCount ?? 0),
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

  /** Get all SSIDs/WLANs */
  async getSsids(): Promise<WlcSsid[]> {
    if (!(await this.authenticate())) return [];
    const res = await this.siteApiRequest('/rest/wlanconf/');
    if (!res.ok) return [];

    const wlans: Record<string, unknown>[] = Array.isArray(res.data) ? res.data : [];
    return wlans
      .filter((wlan) => wlan)
      .map((wlan) => ({
        id: (wlan._id as string ?? wlan.id as string ?? '').toString(),
        name: wlan.ssid as string ?? wlan.name as string ?? '',
        interface: wlan.networkconf as string ?? wlan.interface as string ?? undefined,
        vlanId: wlan.vlan != null ? Number(wlan.vlan) : undefined,
        securityType: this.parseSecurityType(wlan.security as string ?? wlan.encryption as string ?? ''),
        enabled: wlan.enabled === true,
        broadcastSsid: wlan.hide_ssid !== true,
        clientCount: wlan.num_sta != null ? Number(wlan.num_sta) : undefined,
        maxClients: wlan.max_clients != null ? Number(wlan.max_clients) : undefined,
        band: this.parseBand(wlan.band as string ?? wlan.radio as string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.authenticate())) {
      return { success: false, error: 'Authentication failed' };
    }

    const res = await this.siteApiRequest('/cmd/stamgr', {
      method: 'POST',
      body: JSON.stringify({
        cmd: 'kick-sta',
        mac: mac,
      }),
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

    const res = await this.siteApiRequest('/cmd/devmgr', {
      method: 'POST',
      body: JSON.stringify({
        cmd: 'restart',
        mac: mac,
      }),
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for UniFi (Vendor ID 26825) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'unifi-default',
      name: 'UniFi Default',
      vendor: 'unifi',
      description: 'Default RADIUS VSA profile for Ubiquiti UniFi (Vendor ID 26825). Uses WISPr and UniFi-VLAN-ID.',
      attributes: [
        { vendorId: 26825, attributeName: 'UniFi-VLAN-ID', attributeValue: '', vendorName: 'UniFi' },
        { vendorId: 26825, attributeName: 'UniFi-User-Group', attributeValue: 'default', vendorName: 'UniFi' },
        { vendorId: 14122, attributeName: 'WISPr-Bandwidth-Max-Down', attributeValue: '', vendorName: 'WISPr' },
        { vendorId: 14122, attributeName: 'WISPr-Bandwidth-Max-Up', attributeValue: '', vendorName: 'WISPr' },
        { vendorId: 14122, attributeName: 'WISPr-Session-Terminate-Time', attributeValue: '', vendorName: 'WISPr' },
      ],
      defaultRole: 'default',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'running' || s === 'online' || s === 'connected') return 'online';
    if (s === 'offline' || s === 'unreachable') return 'offline';
    if (s === 'adopting') return 'adopting';
    if (s === 'provisioning' || s === 'upgrading' || s === 'provisioned') return 'provisioning';
    return 'offline';
  }

  private parseSecurityType(raw: string): string {
    if (!raw) return 'Unknown';
    const s = raw.toLowerCase();
    if (s === 'open' || s === 'none') return 'Open';
    if (s.includes('wpa3') && s.includes('enterprise')) return 'WPA3-Enterprise';
    if (s.includes('wpa3')) return 'WPA3-PSK';
    if (s.includes('wpa2') && s.includes('enterprise')) return 'WPA2-Enterprise';
    if (s.includes('wpa2')) return 'WPA2-PSK';
    if (s.includes('wpa')) return 'WPA-PSK';
    if (s.includes('owe')) return 'OWE';
    return raw;
  }

  private parseBand(raw: string): string {
    if (!raw) return 'dual';
    const s = raw.toLowerCase();
    if (s === '5g') return '5GHz';
    if (s === '2g') return '2.4GHz';
    return 'dual';
  }
}