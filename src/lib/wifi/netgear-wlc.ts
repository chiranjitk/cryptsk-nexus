/**
 * Netgear Insight Cloud API Adapter
 *
 * Vendor: Netgear
 * API: Netgear Insight Cloud REST API v1
 * Host: insight.api.netgear.com (cloud-managed)
 * Auth: API key in header "Authorization: Bearer <api_key>"
 * Endpoints:
 *   GET  /v1/management/gateways                           — Gateway list
 *   GET  /v1/management/gateways/{gatewayId}               — Gateway details/health
 *   GET  /v1/management/gateways/{gatewayId}/aps           — AP list
 *   GET  /v1/management/gateways/{gatewayId}/wlans         — WLAN/SSID list
 *   GET  /v1/management/gateways/{gatewayId}/clients       — Client list
 *   POST /v1/management/gateways/{gatewayId}/aps/{mac}/restart — Restart AP
 *   DELETE /v1/management/gateways/{gatewayId}/clients/{mac}  — Disconnect client
 * RADIUS Vendor ID: 331
 * CoA Port: 3799
 *
 * Note: Netgear Insight is cloud-managed. The host/port config maps to the cloud API.
 *       siteId maps to gatewayId in the Netgear Insight model.
 */

import {
  WlcAdapter,
  WlcConfig,
  WlcHealth,
  WlcAccessPoint,
  WlcSsid,
  WlcRadiusProfile,
} from './wlc-adapter';

export class NetgearWlcAdapter extends WlcAdapter {
  private siteId: string;

  constructor(config: WlcConfig) {
    super(config);
    // Netgear Insight uses API key auth
    this.headers['Authorization'] = `Bearer ${config.password}`;
    this.siteId = config.siteId ?? '';
  }

  getVendor() {
    return 'netgear' as const;
  }

  /** Test connectivity */
  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();

    if (!this.siteId) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: 'Gateway ID (siteId) is required for Netgear Insight API',
      };
    }

    const res = await this.apiRequest(`/v1/management/gateways/${this.siteId}`);
    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    const gateway = res.data?.gateway ?? res.data ?? {};
    return {
      online: true,
      latencyMs: Date.now() - start,
      model: gateway.modelName as string ?? gateway.model as string ?? undefined,
      firmwareVersion: gateway.firmwareVersion as string ?? gateway.version as string ?? undefined,
      serialNumber: gateway.serialNumber as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get full controller health */
  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();

    if (!this.siteId) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: 'Gateway ID (siteId) is required',
      };
    }

    const [gwRes, apRes, clientRes] = await Promise.all([
      this.apiRequest(`/v1/management/gateways/${this.siteId}`),
      this.apiRequest(`/v1/management/gateways/${this.siteId}/aps`),
      this.apiRequest(`/v1/management/gateways/${this.siteId}/clients`),
    ]);

    if (!gwRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: gwRes.error ?? 'Unable to reach Netgear Insight API',
      };
    }

    const gateway = gwRes.data?.gateway ?? gwRes.data ?? {};
    const apList: Record<string, unknown>[] = apRes.ok
      ? (Array.isArray(apRes.data?.aps) ? apRes.data.aps : apRes.data?.data ?? [])
      : [];
    const clientList: Record<string, unknown>[] = clientRes.ok
      ? (Array.isArray(clientRes.data?.clients) ? clientRes.data.clients : clientRes.data?.data ?? [])
      : [];

    return {
      online: true,
      latencyMs: Date.now() - start,
      firmwareVersion: gateway.firmwareVersion as string ?? gateway.version as string ?? undefined,
      model: gateway.modelName as string ?? gateway.model as string ?? undefined,
      serialNumber: gateway.serialNumber as string ?? undefined,
      totalAps: gateway.totalAps != null ? Number(gateway.totalAps) : (apList.length || undefined),
      onlineAps: gateway.onlineAps != null ? Number(gateway.onlineAps) : undefined,
      totalClients: gateway.totalClients != null ? Number(gateway.totalClients) : (clientList.length || undefined),
      lastSync: new Date(),
    };
  }

  /** Get all access points */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    if (!this.siteId) return [];

    const res = await this.apiRequest(`/v1/management/gateways/${this.siteId}/aps`);
    if (!res.ok) return [];

    const apList = Array.isArray(res.data?.aps) ? res.data.aps : res.data?.data ?? [];
    if (!Array.isArray(apList)) return [];

    return apList
      .filter((ap: Record<string, unknown>) => ap)
      .map((ap: Record<string, unknown>) => {
        const status = this.parseApStatus(ap.status as string ?? 'offline');
        return {
          id: (ap.macAddress as string ?? ap.mac as string ?? '').toLowerCase(),
          mac: (ap.macAddress as string ?? ap.mac as string ?? '').toLowerCase(),
          name: ap.name as string ?? ap.deviceName as string ?? '',
          model: ap.modelName as string ?? ap.model as string ?? '',
          firmware: ap.firmwareVersion as string ?? ap.version as string ?? '',
          status,
          ip: ap.ipAddress as string ?? ap.ip as string ?? undefined,
          serialNumber: ap.serialNumber as string ?? undefined,
          clients: Number(ap.connectedClients ?? ap.clientCount ?? 0),
          channel: ap.channel != null ? Number(ap.channel) : undefined,
          txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
          uptimeSeconds: ap.uptimeSeconds != null ? Number(ap.uptimeSeconds) : undefined,
          site: ap.siteName as string ?? undefined,
          floor: ap.floor as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: ap.lastSeen ? new Date(ap.lastSeen as string) : new Date(),
        };
      });
  }

  /** Get all SSIDs/WLANs */
  async getSsids(): Promise<WlcSsid[]> {
    if (!this.siteId) return [];

    const res = await this.apiRequest(`/v1/management/gateways/${this.siteId}/wlans`);
    if (!res.ok) return [];

    const wlanList = Array.isArray(res.data?.wlans) ? res.data.wlans : res.data?.data ?? [];
    if (!Array.isArray(wlanList)) return [];

    return wlanList
      .filter((wlan: Record<string, unknown>) => wlan)
      .map((wlan: Record<string, unknown>) => ({
        id: (wlan.id as string ?? wlan.wlanId as string ?? '').toString(),
        name: wlan.ssid as string ?? wlan.name as string ?? '',
        interface: wlan.interface as string ?? undefined,
        vlanId: wlan.vlanId != null ? Number(wlan.vlanId) : undefined,
        securityType: this.parseSecurityType(wlan.securityType as string ?? wlan.authentication as string ?? ''),
        enabled: wlan.enabled === true,
        broadcastSsid: wlan.broadcastSsid !== false && wlan.hiddenSsid !== true,
        clientCount: wlan.clientCount != null ? Number(wlan.clientCount) : undefined,
        maxClients: wlan.maxClients != null ? Number(wlan.maxClients) : undefined,
        band: this.parseBand(wlan.band as string ?? wlan.radioType as string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!this.siteId) {
      return { success: false, error: 'Gateway ID (siteId) is required' };
    }

    const res = await this.apiRequest(`/v1/management/gateways/${this.siteId}/clients/${mac}`, {
      method: 'DELETE',
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
  }

  /** Restart an AP by MAC */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!this.siteId) {
      return { success: false, error: 'Gateway ID (siteId) is required' };
    }

    const res = await this.apiRequest(`/v1/management/gateways/${this.siteId}/aps/${mac}/restart`, {
      method: 'POST',
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for Netgear (Vendor ID 331) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'netgear-default',
      name: 'Netgear Default',
      vendor: 'netgear',
      description: 'Default RADIUS VSA profile for Netgear Insight (Vendor ID 331)',
      attributes: [
        { vendorId: 331, attributeName: 'Netgear-VLAN-ID', attributeValue: '', vendorName: 'Netgear' },
        { vendorId: 331, attributeName: 'Netgear-User-Role', attributeValue: 'guest', vendorName: 'Netgear' },
      ],
      defaultRole: 'guest',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'online' || s === 'connected' || s === 'up') return 'online';
    if (s === 'offline' || s === 'disconnected' || s === 'down') return 'offline';
    if (s === 'provisioning' || s === 'updating') return 'provisioning';
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