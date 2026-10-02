/**
 * Cambium cnMaestro REST API Adapter
 *
 * Vendor: Cambium Networks
 * API: cnMaestro REST API v1
 * Auth: POST /api/login → Bearer token
 * Endpoints:
 *   POST /api/login                                        — Authenticate
 *   GET  /api/v1/system/status                             — System status
 *   GET  /api/v1/networks                                  — Network list
 *   GET  /api/v1/networks/{id}/devices                     — Device list (APs)
 *   GET  /api/v1/networks/{id}/devices/{mac}               — Single device details
 *   GET  /api/v1/ssids                                     — SSID list
 *   GET  /api/v1/clients                                   — Client list
 *   POST /api/v1/networks/{id}/devices/{mac}/restart       — Restart AP
 *   DELETE /api/v1/clients/{mac}                           — Disconnect client
 * RADIUS Vendor ID: 4105
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

export class CambiumWlcAdapter extends WlcAdapter {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private networkId: string;

  constructor(config: WlcConfig) {
    super(config);
    this.networkId = config.siteId ?? '';
  }

  getVendor() {
    return 'cambium' as const;
  }

  /** Authenticate with cnMaestro */
  private async authenticate(): Promise<boolean> {
    if (this.token && this.tokenExpiresAt > Date.now()) {
      this.headers['Authorization'] = `Bearer ${this.token}`;
      return true;
    }

    const res = await this.apiRequest('/api/login', {
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

    const token = res.data.token as string ?? res.data.access_token as string;
    if (!token) return false;

    this.token = token;
    this.tokenExpiresAt = Date.now() + 30 * 60 * 1000; // 30 min
    this.headers['Authorization'] = `Bearer ${this.token}`;
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

    const res = await this.apiRequest('/api/v1/system/status');
    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    const status = res.data?.status ?? res.data ?? {};
    return {
      online: true,
      latencyMs: Date.now() - start,
      firmwareVersion: status.version as string ?? status.firmwareVersion as string ?? undefined,
      model: status.model as string ?? undefined,
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

    const [statusRes, deviceRes, clientRes] = await Promise.all([
      this.apiRequest('/api/v1/system/status'),
      this.networkId
        ? this.apiRequest(`/api/v1/networks/${this.networkId}/devices`)
        : this.apiRequest('/api/v1/networks'),
      this.apiRequest('/api/v1/clients'),
    ]);

    if (!statusRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: statusRes.error ?? 'Unable to reach cnMaestro',
      };
    }

    const status = statusRes.data?.status ?? statusRes.data ?? {};
    const deviceList: Record<string, unknown>[] = deviceRes.ok
      ? (Array.isArray(deviceRes.data?.devices) ? deviceRes.data.devices : Array.isArray(deviceRes.data) ? deviceRes.data : deviceRes.data?.data ?? [])
      : [];
    const clientList: Record<string, unknown>[] = clientRes.ok
      ? (Array.isArray(clientRes.data?.clients) ? clientRes.data.clients : Array.isArray(clientRes.data) ? clientRes.data : clientRes.data?.data ?? [])
      : [];

    const onlineDevices = deviceList.filter(
      (d: Record<string, unknown>) => (d.status as string ?? '').toLowerCase() === 'online' || (d.connectionState as string ?? '').toLowerCase() === 'connected'
    ).length;

    return {
      online: true,
      latencyMs: Date.now() - start,
      firmwareVersion: status.version as string ?? status.firmwareVersion as string ?? undefined,
      model: status.model as string ?? undefined,
      totalAps: deviceList.length || undefined,
      onlineAps: onlineDevices || undefined,
      totalClients: clientList.length || undefined,
      lastSync: new Date(),
    };
  }

  /** Get all access points */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    if (!(await this.authenticate())) return [];
    if (!this.networkId) return [];

    const res = await this.apiRequest(`/api/v1/networks/${this.networkId}/devices`);
    if (!res.ok) return [];

    const deviceList = Array.isArray(res.data?.devices) ? res.data.devices : Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    if (!Array.isArray(deviceList)) return [];

    // Filter for AP-type devices
    const apDevices = deviceList.filter(
      (d: Record<string, unknown>) => {
        const t = (d.deviceType as string ?? d.type as string ?? '').toLowerCase();
        return t.includes('ap') || t.includes('access point');
      }
    );

    return apDevices
      .filter((ap: Record<string, unknown>) => ap)
      .map((ap: Record<string, unknown>) => {
        const status = this.parseApStatus(ap.status as string ?? ap.connectionState as string ?? 'offline');
        return {
          id: (ap.mac as string ?? ap.macAddress as string ?? '').toLowerCase(),
          mac: (ap.mac as string ?? ap.macAddress as string ?? '').toLowerCase(),
          name: ap.name as string ?? ap.deviceName as string ?? '',
          model: ap.model as string ?? ap.productName as string ?? '',
          firmware: ap.softwareVersion as string ?? ap.firmwareVersion as string ?? '',
          status,
          ip: ap.ipAddress as string ?? ap.ip as string ?? undefined,
          serialNumber: ap.serialNumber as string ?? ap.serial as string ?? undefined,
          clients: Number(ap.clientCount ?? ap.connectedClients ?? 0),
          channel: ap.channel != null ? Number(ap.channel) : undefined,
          txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
          uptimeSeconds: ap.uptimeSeconds != null ? Number(ap.uptimeSeconds) : undefined,
          site: ap.siteName as string ?? ap.networkName as string ?? undefined,
          floor: ap.floor as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: ap.lastSeen ? new Date(ap.lastSeen as string) : new Date(),
        };
      });
  }

  /** Get all SSIDs */
  async getSsids(): Promise<WlcSsid[]> {
    if (!(await this.authenticate())) return [];

    const res = await this.apiRequest('/api/v1/ssids');
    if (!res.ok) return [];

    const ssidList = Array.isArray(res.data?.ssids) ? res.data.ssids : Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    if (!Array.isArray(ssidList)) return [];

    return ssidList
      .filter((ssid: Record<string, unknown>) => ssid)
      .map((ssid: Record<string, unknown>) => ({
        id: (ssid.id as string ?? ssid.ssidId as string ?? '').toString(),
        name: ssid.ssid as string ?? ssid.name as string ?? '',
        interface: ssid.interface as string ?? undefined,
        vlanId: ssid.vlanId != null ? Number(ssid.vlanId) : undefined,
        securityType: this.parseSecurityType(ssid.securityType as string ?? ssid.authentication as string ?? ''),
        enabled: ssid.enabled === true,
        broadcastSsid: ssid.hiddenSsid !== true && ssid.hideSsid !== true,
        clientCount: ssid.clientCount != null ? Number(ssid.clientCount) : undefined,
        maxClients: ssid.maxClients != null ? Number(ssid.maxClients) : undefined,
        band: this.parseBand(ssid.band as string ?? ssid.radioType as string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.authenticate())) {
      return { success: false, error: 'Authentication failed' };
    }

    const res = await this.apiRequest(`/api/v1/clients/${mac}`, { method: 'DELETE' });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
  }

  /** Restart an AP by MAC */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.authenticate()) || !this.networkId) {
      return { success: false, error: 'Authentication or network ID required' };
    }

    const res = await this.apiRequest(`/api/v1/networks/${this.networkId}/devices/${mac}/restart`, {
      method: 'POST',
    });
    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for Cambium (Vendor ID 4105) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'cambium-default',
      name: 'Cambium Default',
      vendor: 'cambium',
      description: 'Default RADIUS VSA profile for Cambium cnMaestro (Vendor ID 4105)',
      attributes: [
        { vendorId: 4105, attributeName: 'Cambium-VLAN-ID', attributeValue: '', vendorName: 'Cambium' },
        { vendorId: 4105, attributeName: 'Cambium-QoS', attributeValue: '0', vendorName: 'Cambium' },
        { vendorId: 4105, attributeName: 'Cambium-Profile', attributeValue: 'default', vendorName: 'Cambium' },
      ],
      defaultRole: 'default',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'online' || s === 'connected') return 'online';
    if (s === 'offline' || s === 'disconnected') return 'offline';
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