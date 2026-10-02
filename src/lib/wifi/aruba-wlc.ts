/**
 * Aruba Mobility Controller REST API Adapter
 *
 * Vendor: Aruba Networks (HPE / Hewlett Packard Enterprise)
 * API: ArubaOS REST API v1
 * Auth: POST /v1/api/login → session cookie (SESSION)
 * Endpoints:
 *   POST /v1/api/login                                        — Authentication
 *   POST /v1/api/logout                                       — Logout
 *   GET  /v1/configuration/showcommand?command=show version    — Firmware info
 *   GET  /v1/configuration/showcommand?command=show ap-count  — AP counts
 *   GET  /v1/configuration/showcommand?command=show user-count — Client counts
 *   GET  /v1/configuration/showcommand?command=show ap database summary — AP list
 *   GET  /v1/configuration/showcommand?command=show wlan       — SSID list
 *   GET  /v1/configuration/showcommand?command=show cpu        — CPU usage
 *   GET  /v1/configuration/showcommand?command=show memory     — Memory usage
 *   POST /v1/configuration/showcommand?command=...             — Execute commands
 * RADIUS Vendor ID: 14823
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

interface ArubaSession {
  cookie: string;
  expiresAt: number;
}

export class ArubaWlcAdapter extends WlcAdapter {
  private session: ArubaSession | null = null;

  constructor(config: WlcConfig) {
    super(config);
  }

  getVendor() {
    return 'aruba' as const;
  }

  /** Authenticate and obtain session cookie */
  private async authenticate(): Promise<boolean> {
    if (this.session && this.session.expiresAt > Date.now()) return true;

    const res = await this.apiRequest('/v1/api/login', {
      method: 'POST',
      body: JSON.stringify({
        user: this.config.username,
        password: this.config.password,
      }),
    });

    if (!res.ok) {
      this.session = null;
      return false;
    }

    // The session cookie is returned in a Set-Cookie header
    // Since fetch doesn't expose Set-Cookie directly in all runtimes,
    // we also check for a token in the response body
    const data = res.data ?? {};
    const token = data._global_result?.UIDARUBA as string | undefined;
    if (token) {
      this.session = {
        cookie: `SESSION=${token}`,
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 min
      };
      this.headers['Cookie'] = this.session.cookie;
      return true;
    }

    return false;
  }

  /** Execute an Aruba "show" command via the REST API */
  private async showCommand(command: string): Promise<{ [key: string]: any } | null> {
    if (!(await this.authenticate())) return null;

    const res = await this.apiRequest(
      `/v1/configuration/showcommand?command=${encodeURIComponent(command)}`,
      {
        headers: this.session ? { Cookie: this.session.cookie } : {},
      }
    );

    if (!res.ok) return null;
    return res.data as Record<string, unknown> | null;
  }

  /** Test connectivity by running a simple show command */
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

    const data = await this.showCommand('show version');
    if (!data) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: 'No response from show version',
      };
    }

    const versionData = data.Version ?? data._data?.Version ?? data;
    return {
      online: true,
      latencyMs: Date.now() - start,
      firmwareVersion: versionData.SW_Version as string ?? versionData.Version as string ?? undefined,
      model: versionData.Model as string ?? versionData.Product_Name as string ?? undefined,
      serialNumber: versionData.Serial_Number as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get comprehensive health: CPU, memory, uptime, APs, clients */
  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();

    const [versionData, cpuData, memData, apCountData, userCountData] = await Promise.all([
      this.showCommand('show version'),
      this.showCommand('show cpu'),
      this.showCommand('show memory'),
      this.showCommand('show ap-count'),
      this.showCommand('show user-count'),
    ]);

    if (!versionData && !cpuData) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: 'Unable to reach controller',
      };
    }

    const ver = versionData?.Version ?? versionData?._data?.Version ?? {};
    const cpu = cpuData?.CPU ?? cpuData?._data?.CPU ?? {};
    const mem = memData?.Memory ?? memData?._data?.Memory ?? {};
    const apCount = apCountData?.AP_Count ?? apCountData?._data?.AP_Count ?? {};
    const userCount = userCountData?.User_Count ?? userCountData?._data?.User_Count ?? {};

    const cpuUsage = this.extractPercent(cpu.CPU_Usage as string ?? cpu.Utilization as string);
    const memUsage = this.extractPercent(mem.System_Memory_Usage_Percent as string ?? mem.Utilization as string);

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: cpuUsage ?? undefined,
      memoryUsage: memUsage ?? undefined,
      uptimeSeconds: ver.Up_Time ? this.parseUptime(ver.Up_Time as string) : undefined,
      firmwareVersion: ver.SW_Version as string ?? ver.Version as string ?? undefined,
      model: ver.Model as string ?? ver.Product_Name as string ?? undefined,
      serialNumber: ver.Serial_Number as string ?? undefined,
      totalAps: Number(apCount.Total_APs ?? apCount.Total ?? 0) || undefined,
      onlineAps: Number(apCount.Up_APs ?? apCount.Up ?? 0) || undefined,
      totalClients: Number(userCount.Total_Users ?? userCount.Total ?? 0) || undefined,
      lastSync: new Date(),
    };
  }

  /** Get all access points via "show ap database summary" */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    const data = await this.showCommand('show ap database summary');
    if (!data) return [];

    const apList = data.AP_Database ?? data._data?.AP_Database ?? data.AP ?? data;
    const aps = Array.isArray(apList) ? apList : apList.AP ?? [apList];

    if (!Array.isArray(aps)) return [];

    return aps
      .filter((ap: Record<string, unknown>) => ap)
      .map((ap: Record<string, unknown>) => {
        const status = this.parseApStatus(
          ap.Status as string ?? ap['AP Status'] as string ?? 'offline'
        );
        return {
          id: (ap.MAC_Address as string ?? ap['MAC Address'] as string ?? '').toLowerCase(),
          mac: (ap.MAC_Address as string ?? ap['MAC Address'] as string ?? '').toLowerCase(),
          name: ap.Name as string ?? ap['AP Name'] as string ?? '',
          model: ap.Model as string ?? ap['AP Model'] as string ?? '',
          firmware: ap.Software_Version as string ?? ap['SW Version'] as string ?? '',
          status,
          ip: ap.IP_Address as string ?? ap.IP as string ?? undefined,
          serialNumber: ap.Serial_Number as string ?? ap.Serial as string ?? undefined,
          clients: Number(ap.Number_of_Users ?? ap.Clients ?? 0),
          channel: ap.Channel != null ? Number(ap.Channel) : undefined,
          txPower: ap.Tx_Power != null ? Number(ap.Tx_Power) : undefined,
          uptimeSeconds: ap.Up_Time ? this.parseUptime(ap.Up_Time as string) : undefined,
          site: ap.Site as string ?? ap.Location as string ?? undefined,
          floor: ap.Floor as string ?? undefined,
          controllerId: this.config.id,
          lastSeen: new Date(),
        };
      });
  }

  /** Get all SSIDs via "show wlan" */
  async getSsids(): Promise<WlcSsid[]> {
    const data = await this.showCommand('show wlan');
    if (!data) return [];

    const wlanList = data.WLAN_Table ?? data._data?.WLAN_Table ?? data.WLAN ?? data;
    const wlans = Array.isArray(wlanList) ? wlanList : wlanList.WLAN ?? [wlanList];

    if (!Array.isArray(wlans)) return [];

    return wlans
      .filter((wlan: Record<string, unknown>) => wlan)
      .map((wlan: Record<string, unknown>) => ({
        id: (wlan.WLAN_ID as string ?? wlan.ID as string ?? '').toString(),
        name: wlan.essid as string ?? wlan.SSID as string ?? wlan['ESSID'] as string ?? '',
        interface: wlan.Interface_Name as string ?? wlan.interface as string ?? undefined,
        vlanId: wlan.VLAN != null ? Number(wlan.VLAN) : undefined,
        securityType: this.parseSecurityType(wlan.auth as string ?? wlan.Security as string ?? ''),
        enabled: wlan.Status === 'Up' || wlan.Enabled === true || wlan.status === 'up',
        broadcastSsid: wlan.Hide_SSID !== true && wlan.hide_ssid !== true,
        clientCount: wlan.Number_of_Users != null ? Number(wlan.Number_of_Users) : undefined,
        maxClients: wlan.Max_Users != null ? Number(wlan.Max_Users) : undefined,
        band: this.parseBand(wlan.Radio as string ?? wlan.radio as string ?? ''),
      }));
  }

  /** Disconnect a client by MAC */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.authenticate())) {
      return { success: false, error: 'Authentication failed' };
    }

    const res = await this.apiRequest(
      `/v1/configuration/showcommand?command=${encodeURIComponent(`user blacklists mac ${mac}`)}`,
      {
        method: 'POST',
        headers: this.session ? { Cookie: this.session.cookie } : {},
      }
    );

    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
  }

  /** Restart an AP by MAC */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    if (!(await this.authenticate())) {
      return { success: false, error: 'Authentication failed' };
    }

    const res = await this.apiRequest(
      `/v1/configuration/showcommand?command=${encodeURIComponent(`ap reboot ${mac}`)}`,
      {
        method: 'POST',
        headers: this.session ? { Cookie: this.session.cookie } : {},
      }
    );

    return res.ok
      ? { success: true }
      : { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
  }

  /** Default RADIUS VSA profile for Aruba (Vendor ID 14823) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'aruba-default',
      name: 'Aruba Default',
      vendor: 'aruba',
      description: 'Default RADIUS VSA profile for Aruba Mobility Controller (Vendor ID 14823). Bandwidth format: ${down}M/${up}M',
      attributes: [
        { vendorId: 14823, attributeName: 'Aruba-User-Role', attributeValue: 'guest', vendorName: 'Aruba' },
        { vendorId: 14823, attributeName: 'Aruba-BW-Contract', attributeValue: '10M/5M', vendorName: 'Aruba' },
        { vendorId: 14823, attributeName: 'Filter-Id', attributeValue: '', vendorName: 'Aruba' },
      ],
      defaultRole: 'guest',
    };
  }

  // ── Helpers ──

  private extractPercent(val: string | undefined): number | null {
    if (!val) return null;
    const match = String(val).match(/([\d.]+)\s*%/);
    return match ? Number(match[1]) : null;
  }

  private parseUptime(raw: string): number {
    if (!raw) return 0;
    // Format: "X days, HH:MM:SS" or "X days, HH Hours, MM Minutes, SS Seconds"
    let totalSeconds = 0;
    const dayMatch = raw.match(/(\d+)\s*day/);
    if (dayMatch) totalSeconds += Number(dayMatch[1]) * 86400;
    const hourMatch = raw.match(/(\d+)\s*hour/i);
    if (hourMatch) totalSeconds += Number(hourMatch[1]) * 3600;
    const minMatch = raw.match(/(\d+)\s*min/i);
    if (minMatch) totalSeconds += Number(minMatch[1]) * 60;
    const secMatch = raw.match(/(\d+)\s*sec/i);
    if (secMatch) totalSeconds += Number(secMatch[1]);
    // Also try HH:MM:SS format
    if (totalSeconds === 0) {
      const hms = raw.match(/(\d+):(\d+):(\d+)/);
      if (hms) {
        totalSeconds = Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
      }
    }
    return totalSeconds;
  }

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'up' || s === 'online' || s === 'active') return 'online';
    if (s === 'down' || s === 'offline' || s === 'inactive') return 'offline';
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
    if (s.includes('open') || s === 'none' || s.includes('open')) return 'Open';
    return raw;
  }

  private parseBand(raw: string): string {
    if (!raw) return 'dual';
    const s = raw.toLowerCase();
    if (s.includes('5') && s.includes('2.4')) return 'dual';
    if (s.includes('5')) return '5GHz';
    if (s.includes('2.4') || s.includes('2_4')) return '2.4GHz';
    return 'dual';
  }
}