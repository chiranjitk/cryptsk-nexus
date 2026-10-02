/**
 * Ruijie RG-BC Controller REST API Adapter
 *
 * Vendor: Ruijie Networks (锐捷网络)
 * API: RG-BC WLC REST API v1 (/api/v1/)
 * Auth: HTTP Basic Authentication
 * Endpoints:
 *   GET  /api/v1/system/info                — Controller info
 *   GET  /api/v1/system/performance          — CPU/Memory/uptime
 *   GET  /api/v1/ap                          — AP list
 *   GET  /api/v1/ap/{mac}                    — Single AP details
 *   GET  /api/v1/ssid                        — SSID list
 *   GET  /api/v1/client                      — Client list
 *   POST /api/v1/ap/{mac}/restart            — Restart AP
 *   DELETE /api/v1/client/{mac}              — Disconnect client
 * RADIUS Vendor ID: 25506
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

export class RuijieWlcAdapter extends WlcAdapter {
  constructor(config: WlcConfig) {
    super(config);
    const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.headers['Authorization'] = `Basic ${creds}`;
  }

  getVendor() {
    return 'ruijie' as const;
  }

  /** Test connectivity */
  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();
    const res = await this.apiRequest('/api/v1/system/info');

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
      firmwareVersion: info.softwareVersion as string ?? info.version as string ?? undefined,
      serialNumber: info.serialNumber as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get full controller health */
  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();

    const [infoRes, perfRes, apRes, clientRes] = await Promise.all([
      this.apiRequest('/api/v1/system/info'),
      this.apiRequest('/api/v1/system/performance'),
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
      (ap: Record<string, unknown>) => (ap.status as string ?? '').toLowerCase() === 'online'
    ).length;

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: perf.cpuUsage != null ? Number(perf.cpuUsage) : undefined,
      memoryUsage: perf.memoryUsage != null ? Number(perf.memoryUsage) : undefined,
      uptimeSeconds: perf.uptime != null ? Number(perf.uptime) : undefined,
      firmwareVersion: info.softwareVersion as string ?? info.version as string ?? undefined,
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
          model: ap.model as string ?? ap.apModel as string ?? '',
          firmware: ap.version as string ?? ap.softwareVersion as string ?? '',
          status,
          ip: ap.ipAddress as string ?? ap.ip as string ?? undefined,
          serialNumber: ap.serialNumber as string ?? ap.sn as string ?? undefined,
          clients: Number(ap.clientCount ?? ap.onlineClient ?? 0),
          channel: ap.channel != null ? Number(ap.channel) : undefined,
          txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
          uptimeSeconds: ap.uptime != null ? Number(ap.uptime) : undefined,
          site: ap.location as string ?? undefined,
          floor: ap.floor as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: new Date(),
        };
      });
  }

  /** Get all SSIDs */
  async getSsids(): Promise<WlcSsid[]> {
    const res = await this.apiRequest('/api/v1/ssid');
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
        broadcastSsid: ssid.hideSsid !== true && ssid.hiddenSsid !== true,
        clientCount: ssid.clientCount != null ? Number(ssid.clientCount) : undefined,
        maxClients: ssid.maxClients != null ? Number(ssid.maxClients) : undefined,
        band: this.parseBand(ssid.radioType as string ?? ssid.band as string ?? ''),
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

  /** Default RADIUS VSA profile for Ruijie (Vendor ID 25506) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'ruijie-default',
      name: 'Ruijie Default',
      vendor: 'ruijie',
      description: 'Default RADIUS VSA profile for Ruijie RG-BC Controller (Vendor ID 25506)',
      attributes: [
        { vendorId: 25506, attributeName: 'Ruijie-VLAN-ID', attributeValue: '', vendorName: 'Ruijie' },
        { vendorId: 25506, attributeName: 'Ruijie-User-Group', attributeValue: 'guest', vendorName: 'Ruijie' },
        { vendorId: 25506, attributeName: 'Ruijie-QoS-Profile', attributeValue: 'default', vendorName: 'Ruijie' },
        { vendorId: 25506, attributeName: 'Ruijie-Bandwidth-Limit', attributeValue: '0', vendorName: 'Ruijie' },
      ],
      defaultRole: 'guest',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'online' || s === 'up' || s === 'running') return 'online';
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