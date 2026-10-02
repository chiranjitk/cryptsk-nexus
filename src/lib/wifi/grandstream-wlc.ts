/**
 * Grandstream GWN Manager REST API Adapter
 *
 * Vendor: Grandstream Networks
 * API: GWN Manager REST API (/api/)
 * Auth: HTTP Basic Authentication or token-based
 * Endpoints:
 *   GET  /api/system/info                              — System info
 *   GET  /api/system/performance                        — CPU/Memory/uptime
 *   GET  /api/ap/list                                   — AP list
 *   GET  /api/ap/{mac}                                  — Single AP details
 *   GET  /api/ssid/list                                 — SSID list
 *   GET  /api/client/list                               — Client list
 *   POST /api/ap/{mac}/restart                          — Restart AP
 *   DELETE /api/client/{mac}                            — Disconnect client
 * RADIUS Vendor ID: 13925
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

export class GrandstreamWlcAdapter extends WlcAdapter {
  private token: string | null = null;

  constructor(config: WlcConfig) {
    super(config);
    // GWN Manager supports Basic auth
    const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.headers['Authorization'] = `Basic ${creds}`;
  }

  getVendor() {
    return 'grandstream' as const;
  }

  /** Test connectivity */
  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();
    const res = await this.apiRequest('/api/system/info');

    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    const info = res.data?.data ?? res.data ?? {};
    return {
      online: true,
      latencyMs: Date.now() - start,
      model: info.model as string ?? info.deviceModel as string ?? undefined,
      firmwareVersion: info.firmwareVersion as string ?? info.version as string ?? undefined,
      serialNumber: info.serialNumber as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get full controller health */
  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();

    const [infoRes, perfRes, apRes, clientRes] = await Promise.all([
      this.apiRequest('/api/system/info'),
      this.apiRequest('/api/system/performance'),
      this.apiRequest('/api/ap/list'),
      this.apiRequest('/api/client/list'),
    ]);

    if (!infoRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: infoRes.error ?? 'Unable to reach controller',
      };
    }

    const info = infoRes.data?.data ?? infoRes.data ?? {};
    const perf = perfRes.ok ? (perfRes.data?.data ?? perfRes.data ?? {}) : {};
    const apList = apRes.ok ? (Array.isArray(apRes.data) ? apRes.data : apRes.data?.data ?? apRes.data?.list ?? []) : [];
    const clientList = clientRes.ok ? (Array.isArray(clientRes.data) ? clientRes.data : clientRes.data?.data ?? clientRes.data?.list ?? []) : [];

    const onlineAps = apList.filter(
      (ap: Record<string, unknown>) => (ap.status as string ?? '').toLowerCase() === 'online'
    ).length;

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: perf.cpuUsage != null ? Number(perf.cpuUsage) : undefined,
      memoryUsage: perf.memoryUsage != null ? Number(perf.memoryUsage) : undefined,
      uptimeSeconds: perf.uptime != null ? Number(perf.uptime) : undefined,
      firmwareVersion: info.firmwareVersion as string ?? info.version as string ?? undefined,
      model: info.model as string ?? info.deviceModel as string ?? undefined,
      serialNumber: info.serialNumber as string ?? undefined,
      totalAps: apList.length || undefined,
      onlineAps: onlineAps || undefined,
      totalClients: clientList.length || undefined,
      licenseStatus: info.licenseStatus as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get all access points */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    const res = await this.apiRequest('/api/ap/list');
    if (!res.ok) return [];

    const apList = Array.isArray(res.data) ? res.data : res.data?.data ?? res.data?.list ?? [];
    if (!Array.isArray(apList)) return [];

    return apList
      .filter((ap: Record<string, unknown>) => ap)
      .map((ap: Record<string, unknown>) => {
        const status = this.parseApStatus(ap.status as string ?? 'offline');
        return {
          id: (ap.mac as string ?? ap.macAddress as string ?? '').toLowerCase(),
          mac: (ap.mac as string ?? ap.macAddress as string ?? '').toLowerCase(),
          name: ap.name as string ?? ap.apName as string ?? '',
          model: ap.model as string ?? ap.deviceModel as string ?? '',
          firmware: ap.firmwareVersion as string ?? ap.version as string ?? '',
          status,
          ip: ap.ip as string ?? ap.ipAddress as string ?? undefined,
          serialNumber: ap.serialNumber as string ?? ap.sn as string ?? undefined,
          clients: Number(ap.clientCount ?? ap.onlineClient ?? 0),
          channel: ap.channel != null ? Number(ap.channel) : undefined,
          txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
          uptimeSeconds: ap.uptimeSeconds != null ? Number(ap.uptimeSeconds) : undefined,
          site: ap.location as string ?? undefined,
          floor: ap.floor as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: new Date(),
        };
      });
  }

  /** Get all SSIDs */
  async getSsids(): Promise<WlcSsid[]> {
    const res = await this.apiRequest('/api/ssid/list');
    if (!res.ok) return [];

    const ssidList = Array.isArray(res.data) ? res.data : res.data?.data ?? res.data?.list ?? [];
    if (!Array.isArray(ssidList)) return [];

    return ssidList
      .filter((ssid: Record<string, unknown>) => ssid)
      .map((ssid: Record<string, unknown>) => ({
        id: (ssid.id as string ?? ssid.ssidId as string ?? '').toString(),
        name: ssid.ssidName as string ?? ssid.name as string ?? '',
        interface: ssid.interface as string ?? undefined,
        vlanId: ssid.vlanId != null ? Number(ssid.vlanId) : undefined,
        securityType: this.parseSecurityType(ssid.securityType as string ?? ssid.authentication as string ?? ''),
        enabled: ssid.enabled === true || ssid.status === 'enable',
        broadcastSsid: ssid.hideSsid !== true,
        clientCount: ssid.clientCount != null ? Number(ssid.clientCount) : undefined,
        maxClients: ssid.maxClients != null ? Number(ssid.maxClients) : undefined,
        band: this.parseBand(ssid.band as string ?? ssid.radioType as string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.apiRequest(`/api/client/${mac}`, { method: 'DELETE' });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
  }

  /** Restart an AP by MAC */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.apiRequest(`/api/ap/${mac}/restart`, { method: 'POST' });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for Grandstream (Vendor ID 13925) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'grandstream-default',
      name: 'Grandstream Default',
      vendor: 'grandstream',
      description: 'Default RADIUS VSA profile for Grandstream GWN Manager (Vendor ID 13925)',
      attributes: [
        { vendorId: 13925, attributeName: 'Grandstream-VLAN-ID', attributeValue: '', vendorName: 'Grandstream' },
        { vendorId: 13925, attributeName: 'Grandstream-Profile', attributeValue: 'default', vendorName: 'Grandstream' },
      ],
      defaultRole: 'default',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'online' || s === 'up' || s === 'connected') return 'online';
    if (s === 'offline' || s === 'down') return 'offline';
    if (s === 'provisioning' || s === 'configuring') return 'provisioning';
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
    if (s === 'open' || s === 'none') return 'Open';
    return raw;
  }

  private parseBand(raw: string): string {
    if (!raw) return 'dual';
    const s = raw.toLowerCase();
    if (s.includes('5') && s.includes('2.4')) return 'dual';
    if (s.includes('5')) return '5GHz';
    if (s.includes('2.4')) return '2.4GHz';
    return 'dual';
  }
}