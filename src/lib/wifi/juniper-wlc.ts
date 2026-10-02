/**
 * Juniper Mist Cloud API Adapter
 *
 * Vendor: Juniper Networks (Mist)
 * API: Juniper Mist Cloud REST API v1
 * Host: api.mist.com (cloud-managed, not on-prem controller)
 * Auth: Bearer token in header "Authorization: Token <api_token>"
 * Endpoints:
 *   GET  /api/v1/orgs/{orgId}/sites                              — Site list
 *   GET  /api/v1/sites/{siteId}/stats                           — Site statistics
 *   GET  /api/v1/sites/{siteId}/apstats                         — AP statistics
 *   GET  /api/v1/sites/{siteId}/apstats/{mac}                   — Single AP stats
 *   GET  /api/v1/sites/{siteId}/wlans                           — WLAN/SSID config
 *   GET  /api/v1/sites/{siteId}/clients                         — Client list
 *   DELETE /api/v1/sites/{siteId}/clients/{mac}                 — Disconnect client
 *   POST /api/v1/sites/{siteId}/aps/{mac}/restart               — Restart AP
 * RADIUS Vendor ID: 2636
 * CoA Port: 3799
 *
 * Note: siteId maps to config.siteId. Organization ID can be passed via extraConfig.orgId.
 */

import {
  WlcAdapter,
  WlcConfig,
  WlcHealth,
  WlcAccessPoint,
  WlcSsid,
  WlcRadiusProfile,
} from './wlc-adapter';

export class JuniperWlcAdapter extends WlcAdapter {
  private siteId: string;
  private orgId: string | undefined;

  constructor(config: WlcConfig) {
    super(config);
    // Mist uses the password field for the API token
    this.headers['Authorization'] = `Token ${config.password}`;
    // Override base URL to use Mist cloud API
    this.siteId = config.siteId ?? '';
    this.orgId = config.extraConfig?.orgId;
  }

  getVendor() {
    return 'juniper' as const;
  }

  /** Test connectivity by fetching site stats */
  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();

    if (!this.siteId) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: 'Site ID is required for Mist Cloud API',
      };
    }

    const res = await this.apiRequest(`/api/v1/sites/${this.siteId}/stats`);
    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    const stats = res.data ?? {};
    return {
      online: true,
      latencyMs: Date.now() - start,
      firmwareVersion: stats.firmware_version as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get full controller health via site stats */
  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();

    if (!this.siteId) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: 'Site ID is required for Mist Cloud API',
      };
    }

    const [statsRes, apRes, clientRes] = await Promise.all([
      this.apiRequest(`/api/v1/sites/${this.siteId}/stats`),
      this.apiRequest(`/api/v1/sites/${this.siteId}/apstats`),
      this.apiRequest(`/api/v1/sites/${this.siteId}/clients`),
    ]);

    if (!statsRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: statsRes.error ?? 'Unable to reach Mist API',
      };
    }

    const stats = statsRes.data ?? {};
    const apList: Record<string, unknown>[] = apRes.ok ? (Array.isArray(apRes.data) ? apRes.data : []) : [];
    const clientList: Record<string, unknown>[] = clientRes.ok ? (Array.isArray(clientRes.data) ? clientRes.data : []) : [];

    return {
      online: true,
      latencyMs: Date.now() - start,
      firmwareVersion: stats.firmware_version as string ?? undefined,
      totalAps: stats.ap_count != null ? Number(stats.ap_count) : (apList.length || undefined),
      onlineAps: stats.online_ap_count != null ? Number(stats.online_ap_count) : undefined,
      totalClients: stats.client_count != null ? Number(stats.client_count) : (clientList.length || undefined),
      lastSync: new Date(),
    };
  }

  /** Get all access points */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    if (!this.siteId) return [];

    const res = await this.apiRequest(`/api/v1/sites/${this.siteId}/apstats`);
    if (!res.ok) return [];

    const apList: Record<string, unknown>[] = Array.isArray(res.data) ? res.data : [];
    return apList
      .filter((ap) => ap)
      .map((ap) => {
        const status = this.parseApStatus(ap.status as string ?? 'offline');
        return {
          id: (ap.mac as string ?? '').toLowerCase(),
          mac: (ap.mac as string ?? '').toLowerCase(),
          name: ap.name as string ?? '',
          model: ap.model as string ?? '',
          firmware: ap.firmware_version as string ?? ap.version as string ?? '',
          status,
          ip: ap.ip as string ?? undefined,
          serialNumber: ap.serial as string ?? undefined,
          clients: Number(ap.client_count ?? ap.clients ?? 0),
          channel: ap.channel != null ? Number(ap.channel) : undefined,
          txPower: ap.tx_power != null ? Number(ap.tx_power) : undefined,
          uptimeSeconds: ap.uptime != null ? Number(ap.uptime) : undefined,
          site: ap.site_name as string ?? undefined,
          floor: ap.floor_name as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: ap.last_seen ? new Date(ap.last_seen as string) : new Date(),
        };
      });
  }

  /** Get all SSIDs/WLANs */
  async getSsids(): Promise<WlcSsid[]> {
    if (!this.siteId) return [];

    const res = await this.apiRequest(`/api/v1/sites/${this.siteId}/wlans`);
    if (!res.ok) return [];

    const wlanList: Record<string, unknown>[] = Array.isArray(res.data) ? res.data : [];
    return wlanList
      .filter((wlan) => wlan)
      .map((wlan) => ({
        id: (wlan.id as string ?? '').toString(),
        name: wlan.ssid as string ?? wlan.name as string ?? '',
        interface: wlan.network_name as string ?? undefined,
        vlanId: wlan.vlan_id != null ? Number(wlan.vlan_id) : undefined,
        securityType: this.parseSecurityType(wlan.auth_type as string ?? wlan.security as string ?? ''),
        enabled: wlan.enabled === true,
        broadcastSsid: wlan.hide_ssid !== true,
        clientCount: wlan.client_count != null ? Number(wlan.client_count) : undefined,
        maxClients: wlan.max_clients != null ? Number(wlan.max_clients) : undefined,
        band: this.parseBand(wlan.bands as string[] ?? wlan.band as string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!this.siteId) {
      return { success: false, error: 'Site ID is required' };
    }

    const res = await this.apiRequest(`/api/v1/sites/${this.siteId}/clients/${mac}`, {
      method: 'DELETE',
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
  }

  /** Restart an AP by MAC */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!this.siteId) {
      return { success: false, error: 'Site ID is required' };
    }

    const res = await this.apiRequest(`/api/v1/sites/${this.siteId}/aps/${mac}/restart`, {
      method: 'POST',
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for Juniper (Vendor ID 2636) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'juniper-default',
      name: 'Juniper Mist Default',
      vendor: 'juniper',
      description: 'Default RADIUS VSA profile for Juniper Mist (Vendor ID 2636)',
      attributes: [
        { vendorId: 2636, attributeName: 'Juniper-VLAN-Name', attributeValue: 'default', vendorName: 'Juniper' },
        { vendorId: 2636, attributeName: 'Juniper-User-Role', attributeValue: 'guest', vendorName: 'Juniper' },
        { vendorId: 2636, attributeName: 'Juniper-Filter', attributeValue: '', vendorName: 'Juniper' },
      ],
      defaultRole: 'guest',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'online' || s === 'connected' || s === 'up') return 'online';
    if (s === 'offline' || s === 'down' || s === 'disconnected') return 'offline';
    if (s === 'provisioning') return 'provisioning';
    return 'offline';
  }

  private parseSecurityType(raw: string): string {
    if (!raw) return 'Unknown';
    const s = raw.toLowerCase();
    if (s === 'psk' || s === 'wpa-psk') return 'WPA2-PSK';
    if (s === 'eap' || s === '802.1x' || s.includes('enterprise')) return 'WPA2-Enterprise';
    if (s === 'open' || s === 'none') return 'Open';
    return raw;
  }

  private parseBand(raw: string | string[]): string {
    if (!raw) return 'dual';
    const bands = Array.isArray(raw) ? raw : [raw];
    const joined = bands.join(' ').toLowerCase();
    if (joined.includes('5') && joined.includes('2.4')) return 'dual';
    if (joined.includes('5')) return '5GHz';
    if (joined.includes('2.4')) return '2.4GHz';
    return 'dual';
  }
}