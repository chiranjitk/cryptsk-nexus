/**
 * Fortinet FortiGate Wireless Controller REST API Adapter
 *
 * Vendor: Fortinet
 * API: FortiGate REST API v2 (/api/v2/cmdb/)
 * Auth: POST /api/v2/cmdb/system/admin/login → session token (in "ccsrftoken" cookie or response header)
 * Endpoints:
 *   POST /api/v2/cmdb/system/admin/login                    — Authenticate
 *   GET  /api/v2/cmdb/system/status                         — System status
 *   GET  /api/v2/cmdb/wireless-controller/wtp               — WTP/AP list
 *   GET  /api/v2/cmdb/wireless-controller/vap               — VAP/SSID list
 *   GET  /api/v2/cmdb/wireless-controller/setting           — WLC settings
 *   GET  /api/v2/monitor/wifi/client                        — Client list
 *   POST /api/v2/cmdb/wireless-controller/wtp/{mkey}/deauth — Deauth AP clients
 * RADIUS Vendor ID: 12356
 * CoA Port: 3799
 *
 * Note: FortiGate uses "mkey" as the unique identifier for WTP entries.
 */

import {
  WlcAdapter,
  WlcConfig,
  WlcHealth,
  WlcAccessPoint,
  WlcSsid,
  WlcRadiusProfile,
} from './wlc-adapter';

export class FortinetWlcAdapter extends WlcAdapter {
  private sessionToken: string | null = null;
  private csrfToken: string | null = null;

  constructor(config: WlcConfig) {
    super(config);
  }

  getVendor() {
    return 'fortinet' as const;
  }

  /** Authenticate with FortiGate */
  private async authenticate(): Promise<boolean> {
    if (this.sessionToken) return true;

    const res = await this.apiRequest('/api/v2/cmdb/system/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: this.config.username,
        secretkey: this.config.password,
      }),
    });

    if (!res.ok || !res.data) {
      return false;
    }

    this.sessionToken = res.data.session as string ?? res.data.id as string ?? null;
    if (this.sessionToken) {
      this.headers['X-API-KEY'] = this.sessionToken;
      this.headers['ccsrftoken'] = res.data.csrftoken as string ?? '';
      this.csrfToken = res.data.csrftoken as string ?? null;
    }
    return this.sessionToken != null;
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

    const res = await this.apiRequest('/api/v2/cmdb/system/status');
    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    const status = res.data?.results?.[0] ?? res.data ?? {};
    return {
      online: true,
      latencyMs: Date.now() - start,
      model: status.HardwareModel as string ?? status.model as string ?? undefined,
      firmwareVersion: status.Current_Ver as string ?? status.version as string ?? undefined,
      serialNumber: status.Serial_No as string ?? status.serialNumber as string ?? undefined,
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

    const [statusRes, wlcRes, wtpRes, clientRes] = await Promise.all([
      this.apiRequest('/api/v2/cmdb/system/status'),
      this.apiRequest('/api/v2/cmdb/wireless-controller/setting'),
      this.apiRequest('/api/v2/cmdb/wireless-controller/wtp'),
      this.apiRequest('/api/v2/monitor/wifi/client'),
    ]);

    if (!statusRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: statusRes.error ?? 'Unable to reach controller',
      };
    }

    const status = statusRes.data?.results?.[0] ?? statusRes.data ?? {};
    const wtpList = wtpRes.ok
      ? (Array.isArray(wtpRes.data?.results) ? wtpRes.data.results : wtpRes.data?.data ?? [])
      : [];
    const clientList = clientRes.ok
      ? (Array.isArray(clientRes.data?.results) ? clientRes.data.results : clientRes.data?.data ?? [])
      : [];

    const onlineWtps = wtpList.filter(
      (wtp: Record<string, unknown>) => (wtp.status as string ?? '').toLowerCase() === 'up'
    ).length;

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: status.CPU_Usage != null ? Number(status.CPU_Usage) : undefined,
      memoryUsage: status.Memory_Usage != null ? Number(status.Memory_Usage) : undefined,
      uptimeSeconds: status.Uptime != null ? Number(status.Uptime) : undefined,
      firmwareVersion: status.Current_Ver as string ?? status.version as string ?? undefined,
      model: status.HardwareModel as string ?? status.model as string ?? undefined,
      serialNumber: status.Serial_No as string ?? status.serialNumber as string ?? undefined,
      totalAps: wtpList.length || undefined,
      onlineAps: onlineWtps || undefined,
      totalClients: clientList.length || undefined,
      licenseStatus: status.License_Status as string ?? status.licenseStatus as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get all access points (WTPs in FortiGate terminology) */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    if (!(await this.authenticate())) return [];

    const res = await this.apiRequest('/api/v2/cmdb/wireless-controller/wtp');
    if (!res.ok) return [];

    const wtpList = Array.isArray(res.data?.results) ? res.data.results : res.data?.data ?? [];
    if (!Array.isArray(wtpList)) return [];

    return wtpList
      .filter((wtp: Record<string, unknown>) => wtp)
      .map((wtp: Record<string, unknown>) => {
        const status = this.parseApStatus(wtp.status as string ?? 'offline');
        return {
          id: (wtp.wtp_id as string ?? wtp.mkey as string ?? wtp.mac as string ?? '').toLowerCase(),
          mac: (wtp.wtp_id as string ?? wtp.mac as string ?? '').toLowerCase(),
          name: wtp.name as string ?? '',
          model: wtp.model as string ?? wtp.wtp_model as string ?? '',
          firmware: wtp.firmware_version as string ?? wtp.version as string ?? '',
          status,
          ip: wtp.ip as string ?? wtp.ip_address as string ?? undefined,
          serialNumber: wtp.serial_no as string ?? wtp.serialNumber as string ?? undefined,
          clients: Number(wtp.client_count ?? wtp.clients ?? 0),
          channel: wtp.channel != null ? Number(wtp.channel) : undefined,
          txPower: wtp.tx_power != null ? Number(wtp.tx_power) : undefined,
          uptimeSeconds: wtp.up_time != null ? Number(wtp.up_time) : undefined,
          site: wtp.location as string ?? undefined,
          floor: wtp.floor as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: new Date(),
        };
      });
  }

  /** Get all VAPs/SSIDs */
  async getSsids(): Promise<WlcSsid[]> {
    if (!(await this.authenticate())) return [];

    const res = await this.apiRequest('/api/v2/cmdb/wireless-controller/vap');
    if (!res.ok) return [];

    const vapList = Array.isArray(res.data?.results) ? res.data.results : res.data?.data ?? [];
    if (!Array.isArray(vapList)) return [];

    return vapList
      .filter((vap: Record<string, unknown>) => vap)
      .map((vap: Record<string, unknown>) => ({
        id: (vap.mkey as string ?? vap.name as string ?? '').toString(),
        name: vap.ssid as string ?? vap.name as string ?? '',
        interface: vap.interface as string ?? undefined,
        vlanId: vap.vlan_id != null ? Number(vap.vlan_id) : undefined,
        securityType: this.parseSecurityType(vap.security as string ?? vap.authentication as string ?? ''),
        enabled: vap.status === 'up' || vap.enabled === true,
        broadcastSsid: vap.broadcast_ssid !== false && vap.hide_ssid !== true,
        clientCount: vap.client_count != null ? Number(vap.client_count) : undefined,
        maxClients: vap.max_clients != null ? Number(vap.max_clients) : undefined,
        band: this.parseBand(vap.band as string ?? vap.radio as string ?? ''),
      }));
  }

  /** Default RADIUS VSA profile for Fortinet (Vendor ID 12356) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'fortinet-default',
      name: 'Fortinet Default',
      vendor: 'fortinet',
      description: 'Default RADIUS VSA profile for FortiGate Wireless Controller (Vendor ID 12356)',
      attributes: [
        { vendorId: 12356, attributeName: 'Fortinet-Group', attributeValue: 'guest', vendorName: 'Fortinet' },
        { vendorId: 12356, attributeName: 'Fortinet-VLAN-ID', attributeValue: '', vendorName: 'Fortinet' },
        { vendorId: 12356, attributeName: 'Fortinet-User-Group', attributeValue: 'guest', vendorName: 'Fortinet' },
      ],
      defaultRole: 'guest',
    };
  }

  // ── Helpers ──

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'up' || s === 'online' || s === 'connected') return 'online';
    if (s === 'down' || s === 'offline') return 'offline';
    if (s === 'provisioning' || s === 'configuring') return 'provisioning';
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