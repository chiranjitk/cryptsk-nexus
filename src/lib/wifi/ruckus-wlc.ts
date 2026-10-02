/**
 * Ruckus SmartZone / ZoneDirector REST API Adapter
 *
 * Vendor: Ruckus Networks (CommScope)
 * API: SmartZone REST API v1 (/rest/v1/)
 * Auth: HTTP Basic Authentication or API key header (X-API-Key)
 * Endpoints:
 *   GET  /rest/v1/system                               — System info
 *   GET  /rest/v1/system/status                        — Controller status
 *   GET  /rest/v1/ap                                   — AP list
 *   GET  /rest/v1/ap/{mac}                             — Single AP details
 *   GET  /rest/v1/wlans                                — WLAN/SSID list
 *   GET  /rest/v1/wlans/{id}                           — Single WLAN details
 *   GET  /rest/v1/stats/clients                        — Client statistics
 *   POST /rest/v1/ap/{mac}/restart                     — Restart AP
 *   DELETE /rest/v1/clients/{mac}                      — Disconnect client
 * RADIUS Vendor ID: 25053
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

export class RuckusWlcAdapter extends WlcAdapter {
  constructor(config: WlcConfig) {
    super(config);

    if (config.extraConfig?.apiKey) {
      // API key authentication
      this.headers['X-API-Key'] = config.extraConfig.apiKey;
    } else {
      // Basic auth fallback
      const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      this.headers['Authorization'] = `Basic ${creds}`;
    }
  }

  getVendor() {
    return 'ruckus' as const;
  }

  /** Test connectivity by fetching system info */
  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();
    const res = await this.apiRequest('/rest/v1/system');

    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    const sys = res.data?.system ?? res.data ?? {};
    return {
      online: true,
      latencyMs: Date.now() - start,
      model: sys.model as string ?? sys['product-model'] as string ?? undefined,
      firmwareVersion: sys.version as string ?? sys['software-version'] as string ?? undefined,
      serialNumber: sys.serialNumber as string ?? sys['serial-number'] as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get full controller health */
  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();

    const [sysRes, statusRes, apRes, clientRes] = await Promise.all([
      this.apiRequest('/rest/v1/system'),
      this.apiRequest('/rest/v1/system/status'),
      this.apiRequest('/rest/v1/ap'),
      this.apiRequest('/rest/v1/stats/clients'),
    ]);

    if (!sysRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: sysRes.error ?? 'Unable to reach controller',
      };
    }

    const sys = sysRes.data?.system ?? sysRes.data ?? {};
    const status = statusRes.ok ? (statusRes.data?.status ?? statusRes.data ?? {}) : {};
    const apList = apRes.ok ? (Array.isArray(apRes.data) ? apRes.data : apRes.data?.ap ?? apRes.data?.list ?? []) : [];
    const clientStats = clientRes.ok ? (clientRes.data?.stats ?? clientRes.data ?? {}) : {};

    const onlineAps = apList.filter(
      (ap: Record<string, unknown>) => (ap.status as string ?? '').toLowerCase() === 'connected' || (ap.status as string ?? '').toLowerCase() === 'online'
    ).length;

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: status.cpuUsage != null ? Number(status.cpuUsage) : undefined,
      memoryUsage: status.memoryUsage != null ? Number(status.memoryUsage) : undefined,
      uptimeSeconds: status.uptime != null ? Number(status.uptime) : undefined,
      firmwareVersion: sys.version as string ?? sys['software-version'] as string ?? undefined,
      model: sys.model as string ?? sys['product-model'] as string ?? undefined,
      serialNumber: sys.serialNumber as string ?? sys['serial-number'] as string ?? undefined,
      totalAps: apList.length || undefined,
      onlineAps: onlineAps || undefined,
      totalClients: clientStats.totalClients != null ? Number(clientStats.totalClients) : undefined,
      licenseStatus: sys.licenseStatus as string ?? status.licenseStatus as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get all access points */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    const res = await this.apiRequest('/rest/v1/ap');
    if (!res.ok) return [];

    const apList = Array.isArray(res.data) ? res.data : res.data?.ap ?? res.data?.list ?? [];
    if (!Array.isArray(apList)) return [];

    return apList
      .filter((ap: Record<string, unknown>) => ap)
      .map((ap: Record<string, unknown>) => {
        const status = this.parseApStatus(ap.status as string ?? 'offline');
        return {
          id: (ap.mac as string ?? ap['mac-address'] as string ?? '').toLowerCase(),
          mac: (ap.mac as string ?? ap['mac-address'] as string ?? '').toLowerCase(),
          name: ap.name as string ?? ap.hostname as string ?? '',
          model: ap.model as string ?? ap['model-name'] as string ?? '',
          firmware: ap.version as string ?? ap['software-version'] as string ?? '',
          status,
          ip: ap.ip as string ?? ap['ip-address'] as string ?? undefined,
          serialNumber: ap.serial as string ?? ap.serialNumber as string ?? undefined,
          clients: Number(ap.clientCount ?? ap['client-count'] ?? ap.activeClients ?? 0),
          channel: ap.channel != null ? Number(ap.channel) : undefined,
          txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
          uptimeSeconds: ap.uptime != null ? Number(ap.uptime) : undefined,
          site: ap.site as string ?? ap.location as string ?? undefined,
          floor: ap.floor as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: new Date(),
        };
      });
  }

  /** Get all SSIDs/WLANs */
  async getSsids(): Promise<WlcSsid[]> {
    const res = await this.apiRequest('/rest/v1/wlans');
    if (!res.ok) return [];

    const wlanList = Array.isArray(res.data) ? res.data : res.data?.wlan ?? res.data?.list ?? [];
    if (!Array.isArray(wlanList)) return [];

    return wlanList
      .filter((wlan: Record<string, unknown>) => wlan)
      .map((wlan: Record<string, unknown>) => ({
        id: (wlan.id as string ?? wlan.wlanId as string ?? '').toString(),
        name: wlan.ssid as string ?? wlan.name as string ?? '',
        interface: wlan.interface as string ?? undefined,
        vlanId: wlan.vlanId != null ? Number(wlan.vlanId) : undefined,
        securityType: this.parseSecurityType(wlan.security as string ?? wlan.authentication as string ?? ''),
        enabled: wlan.status !== 'disabled' && wlan.disabled !== true,
        broadcastSsid: wlan.broadcaseSsid !== false && wlan.hideSsid !== true,
        clientCount: wlan.clientCount != null ? Number(wlan.clientCount) : undefined,
        maxClients: wlan.maxClients != null ? Number(wlan.maxClients) : undefined,
        band: this.parseBand(wlan.band as string ?? wlan.radio as string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.apiRequest(`/rest/v1/clients/${mac}`, {
      method: 'DELETE',
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
  }

  /** Restart an AP by MAC */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.apiRequest(`/rest/v1/ap/${mac}/restart`, {
      method: 'POST',
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for Ruckus (Vendor ID 25053) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'ruckus-default',
      name: 'Ruckus Default',
      vendor: 'ruckus',
      description: 'Default RADIUS VSA profile for Ruckus SmartZone/ZoneDirector (Vendor ID 25053)',
      attributes: [
        { vendorId: 25053, attributeName: 'Ruckus-Bandwidth-Max-Down', attributeValue: '0', vendorName: 'Ruckus' },
        { vendorId: 25053, attributeName: 'Ruckus-Bandwidth-Max-Up', attributeValue: '0', vendorName: 'Ruckus' },
        { vendorId: 25053, attributeName: 'Ruckus-VLAN-ID', attributeValue: '', vendorName: 'Ruckus' },
        { vendorId: 25053, attributeName: 'Ruckus-User-Role', attributeValue: 'guest', vendorName: 'Ruckus' },
        { vendorId: 25053, attributeName: 'Ruckus-Session-Timeout', attributeValue: '0', vendorName: 'Ruckus' },
      ],
      defaultRole: 'guest',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'connected' || s === 'online' || s === 'up') return 'online';
    if (s === 'disconnected' || s === 'offline' || s === 'down') return 'offline';
    if (s === 'provisioning' || s === 'configuring') return 'provisioning';
    if (s === 'adopting') return 'adopting';
    return 'offline';
  }

  private parseSecurityType(raw: string): string {
    if (!raw) return 'Unknown';
    const s = raw.toLowerCase();
    if (s.includes('wpa3') && s.includes('enterprise')) return 'WPA3-Enterprise';
    if (s.includes('wpa3')) return 'WPA3-PSK';
    if (s.includes('wpa2') && (s.includes('enterprise') || s.includes('802.1x'))) return 'WPA2-Enterprise';
    if (s.includes('wpa2')) return 'WPA2-PSK';
    if (s.includes('open') || s === 'none') return 'Open';
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