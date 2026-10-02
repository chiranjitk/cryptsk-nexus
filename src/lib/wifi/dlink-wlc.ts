/**
 * D-Link Nuclias Connect / DWS Controller REST API Adapter
 *
 * Vendor: D-Link Corporation
 * API: Nuclias Connect REST API v1 (/api/v1/)
 * Auth: HTTP Basic Authentication
 * Endpoints:
 *   GET  /api/v1/controller/info                 — Controller info
 *   GET  /api/v1/controller/performance           — CPU/Memory/uptime
 *   GET  /api/v1/ap                                — AP list
 *   GET  /api/v1/ap/{mac}                          — Single AP details
 *   GET  /api/v1/wlan                              — WLAN/SSID list
 *   GET  /api/v1/client                            — Client list
 *   POST /api/v1/ap/{mac}/restart                  — Restart AP
 *   DELETE /api/v1/client/{mac}                    — Disconnect client
 * RADIUS Vendor ID: 171
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

export class DlinkWlcAdapter extends WlcAdapter {
  constructor(config: WlcConfig) {
    super(config);
    const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.headers['Authorization'] = `Basic ${creds}`;
  }

  getVendor() {
    return 'dlink' as const;
  }

  /** Test connectivity */
  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();
    const res = await this.apiRequest('/api/v1/controller/info');

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
      this.apiRequest('/api/v1/controller/info'),
      this.apiRequest('/api/v1/controller/performance'),
      this.apiRequest('/api/v1/ap'),
      this.apiRequest('/api/v1/client'),
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
      (ap: Record<string, unknown>) => (ap.status as string ?? '').toLowerCase() === 'online' || (ap.status as string ?? '').toLowerCase() === 'up'
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
    const res = await this.apiRequest('/api/v1/ap');
    if (!res.ok) return [];

    const apList = Array.isArray(res.data) ? res.data : res.data?.data ?? res.data?.list ?? [];
    if (!Array.isArray(apList)) return [];

    return apList
      .filter((ap: Record<string, unknown>) => ap)
      .map((ap: Record<string, unknown>) => {
        const status = this.parseApStatus(ap.status as string ?? 'offline');
        return {
          id: (ap.macAddress as string ?? ap.mac as string ?? '').toLowerCase(),
          mac: (ap.macAddress as string ?? ap.mac as string ?? '').toLowerCase(),
          name: ap.name as string ?? ap.apName as string ?? '',
          model: ap.model as string ?? ap.deviceModel as string ?? '',
          firmware: ap.firmwareVersion as string ?? ap.version as string ?? '',
          status,
          ip: ap.ipAddress as string ?? ap.ip as string ?? undefined,
          serialNumber: ap.serialNumber as string ?? ap.sn as string ?? undefined,
          clients: Number(ap.clientCount ?? ap.activeClients ?? 0),
          channel: ap.channel != null ? Number(ap.channel) : undefined,
          txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
          uptimeSeconds: ap.uptime != null ? Number(ap.uptime) : undefined,
          site: ap.siteName as string ?? ap.location as string ?? undefined,
          floor: ap.floor as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: new Date(),
        };
      });
  }

  /** Get all SSIDs/WLANs */
  async getSsids(): Promise<WlcSsid[]> {
    const res = await this.apiRequest('/api/v1/wlan');
    if (!res.ok) return [];

    const wlanList = Array.isArray(res.data) ? res.data : res.data?.data ?? res.data?.list ?? [];
    if (!Array.isArray(wlanList)) return [];

    return wlanList
      .filter((wlan: Record<string, unknown>) => wlan)
      .map((wlan: Record<string, unknown>) => ({
        id: (wlan.id as string ?? wlan.wlanId as string ?? '').toString(),
        name: wlan.ssid as string ?? wlan.name as string ?? '',
        interface: wlan.interface as string ?? undefined,
        vlanId: wlan.vlanId != null ? Number(wlan.vlanId) : undefined,
        securityType: this.parseSecurityType(wlan.securityType as string ?? wlan.security as string ?? ''),
        enabled: wlan.enabled === true || wlan.status === 'enabled',
        broadcastSsid: wlan.hiddenSsid !== true && wlan.hideSsid !== true,
        clientCount: wlan.clientCount != null ? Number(wlan.clientCount) : undefined,
        maxClients: wlan.maxClients != null ? Number(wlan.maxClients) : undefined,
        band: this.parseBand(wlan.band as string ?? wlan.radioType as string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.apiRequest(`/api/v1/client/${mac}`, { method: 'DELETE' });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
  }

  /** Restart an AP by MAC */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.apiRequest(`/api/v1/ap/${mac}/restart`, { method: 'POST' });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for D-Link (Vendor ID 171) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'dlink-default',
      name: 'D-Link Default',
      vendor: 'dlink',
      description: 'Default RADIUS VSA profile for D-Link Nuclias Connect / DWS Controller (Vendor ID 171)',
      attributes: [
        { vendorId: 171, attributeName: 'D-Link-VLAN-ID', attributeValue: '', vendorName: 'D-Link' },
        { vendorId: 171, attributeName: 'D-Link-User-Group', attributeValue: 'guest', vendorName: 'D-Link' },
        { vendorId: 171, attributeName: 'D-Link-Filter-Id', attributeValue: '', vendorName: 'D-Link' },
      ],
      defaultRole: 'guest',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'online' || s === 'up' || s === 'connected') return 'online';
    if (s === 'offline' || s === 'down' || s === 'disconnected') return 'offline';
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