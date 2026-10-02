/**
 * MikroTik RouterOS REST API Adapter (CAPsMAN)
 *
 * Vendor: MikroTik
 * API: RouterOS REST API (/rest/)
 * Auth: HTTP Basic Authentication
 * Endpoints:
 *   GET  /rest/system/resource                          — System resource info (CPU, mem, uptime)
 *   GET  /rest/system/identity                          — Device identity/name
 *   GET  /rest/caps-man/registration-table              — Registered APs
 *   GET  /rest/caps-man/access-point                    — CAPsMAN access points
 *   GET  /rest/caps-man/management                      — CAPsMAN management interfaces (SSIDs)
 *   GET  /rest/caps-man/interface                       — CAPsMAN interface config
 *   GET  /rest/ip/hotspot/active                        — Active clients (if using hotspot)
 *   GET  /rest/caps-man/aaa                             — AAA/RADIUS config
 *   POST /rest/caps-man/registration-table/remove       — Remove/deauth AP registration
 *   POST /rest/caps-man/remote-cap/restart              — Restart remote CAP
 * RADIUS Vendor ID: 14988
 * CoA Port: 3799
 *
 * Note: MikroTik REST API returns arrays of objects. Each resource is a collection.
 */

import {
  WlcAdapter,
  WlcConfig,
  WlcHealth,
  WlcAccessPoint,
  WlcSsid,
  WlcRadiusProfile,
} from './wlc-adapter';

export class MikrotikWlcAdapter extends WlcAdapter {
  constructor(config: WlcConfig) {
    super(config);
    const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.headers['Authorization'] = `Basic ${creds}`;
  }

  getVendor() {
    return 'mikrotik' as const;
  }

  /** Test connectivity by fetching system resource */
  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();
    const res = await this.apiRequest('/rest/system/resource');

    if (!res.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: res.error ?? 'Connection failed',
      };
    }

    // RouterOS REST returns an array with one element
    const data = Array.isArray(res.data) ? res.data[0] : res.data ?? {};
    return {
      online: true,
      latencyMs: Date.now() - start,
      model: data['board-name'] as string ?? data.platform as string ?? undefined,
      firmwareVersion: data.version as string ?? data['version'] as string ?? undefined,
      serialNumber: data['serial-number'] as string ?? data.serialNumber as string ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get full controller health */
  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();

    const [resourceRes, identityRes, regRes, apRes, mgmtRes] = await Promise.all([
      this.apiRequest('/rest/system/resource'),
      this.apiRequest('/rest/system/identity'),
      this.apiRequest('/rest/caps-man/registration-table'),
      this.apiRequest('/rest/caps-man/access-point'),
      this.apiRequest('/rest/caps-man/management'),
    ]);

    if (!resourceRes.ok) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
        error: resourceRes.error ?? 'Unable to reach RouterOS',
      };
    }

    const resource = Array.isArray(resourceRes.data) ? resourceRes.data[0] : resourceRes.data ?? {};
    const identity = identityRes.ok
      ? (Array.isArray(identityRes.data) ? identityRes.data[0] : identityRes.data ?? {})
      : {};
    const registrations: Record<string, unknown>[] = regRes.ok ? (Array.isArray(regRes.data) ? regRes.data : []) : [];
    const apList: Record<string, unknown>[] = apRes.ok ? (Array.isArray(apRes.data) ? apRes.data : []) : [];
    const mgmtList: Record<string, unknown>[] = mgmtRes.ok ? (Array.isArray(mgmtRes.data) ? mgmtRes.data : []) : [];

    // Calculate CPU and memory from RouterOS values (load-average and total/free memory)
    const cpuLoad = resource['cpu-load'] != null ? Number(resource['cpu-load']) : undefined;
    const totalMemory = resource['total-memory'] != null ? Number(resource['total-memory']) : 0;
    const freeMemory = resource['free-memory'] != null ? Number(resource['free-memory']) : 0;
    const memoryUsage = totalMemory > 0 ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : undefined;

    // Uptime in MikroTik is a string like "1w2d3h4m5s"
    const uptimeSeconds = resource.uptime ? this.parseUptime(resource.uptime as string) : undefined;

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: cpuLoad,
      memoryUsage,
      uptimeSeconds,
      firmwareVersion: resource.version as string ?? undefined,
      model: resource['board-name'] as string ?? resource.platform as string ?? undefined,
      serialNumber: resource['serial-number'] as string ?? undefined,
      totalAps: registrations.length || apList.length || undefined,
      onlineAps: registrations.length || undefined,
      totalClients: undefined, // RouterOS CAPsMAN doesn't have a single client count endpoint
      lastSync: new Date(),
    };
  }

  /** Get all access points from registration table */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    const res = await this.apiRequest('/rest/caps-man/registration-table');
    if (!res.ok) return [];

    const registrations: Record<string, unknown>[] = Array.isArray(res.data) ? res.data : [];
    return registrations
      .filter((reg) => reg)
      .map((reg) => {
        const mac = (reg.mac_address as string ?? reg['mac-address'] as string ?? '').toLowerCase();
        return {
          id: mac,
          mac,
          name: reg.name as string ?? reg['interface'] as string ?? '',
          model: reg['board'] as string ?? reg.board as string ?? '',
          firmware: reg.version as string ?? reg['software-id'] as string ?? '',
          status: 'online' as const, // If registered, it's online
          ip: reg.ip as string ?? reg.address as string ?? undefined,
          serialNumber: reg['serial-number'] as string ?? undefined,
          clients: Number(reg['registered-clients'] ?? reg.clients ?? 0),
          channel: reg.channel != null ? Number(reg.channel) : undefined,
          txPower: undefined, // Not available in registration table
          uptimeSeconds: reg.uptime ? this.parseUptime(reg.uptime as string) : undefined,
          site: reg.bridge as string ?? undefined,
          floor: undefined,
          controllerId: this.config.id,
          lastSeen: new Date(),
        };
      });
  }

  /** Get all SSIDs from CAPsMAN management interfaces */
  async getSsids(): Promise<WlcSsid[]> {
    const res = await this.apiRequest('/rest/caps-man/management');
    if (!res.ok) return [];

    const mgmtList: Record<string, unknown>[] = Array.isArray(res.data) ? res.data : [];
    return mgmtList
      .filter((mgmt) => mgmt)
      .map((mgmt) => {
        const disabled = mgmt.disabled as boolean | string;
        return {
          id: (mgmt['.id'] as string ?? '').toString(),
          name: mgmt.name as string ?? mgmt.ssid as string ?? '',
          interface: mgmt['interface'] as string ?? undefined,
          vlanId: undefined, // Managed at datapath/interface level
          securityType: this.parseSecurityType(
            mgmt.security as string ?? mgmt['security-profile'] as string ?? ''
          ),
          enabled: disabled !== true && disabled !== 'true' && disabled !== 'yes',
          broadcastSsid: mgmt['hide-ssid'] !== true && mgmt.hideSsid !== true,
          clientCount: undefined,
          maxClients: undefined,
          band: this.parseBand(mgmt['client-to-client-forwarding'] as string ?? ''),
        };
      });
  }

  /** Default RADIUS VSA profile for MikroTik (Vendor ID 14988) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'mikrotik-default',
      name: 'MikroTik Default',
      vendor: 'mikrotik',
      description: 'Default RADIUS VSA profile for MikroTik CAPsMAN (Vendor ID 14988). Rate-limit format: ${rx}k/${tx}k.',
      attributes: [
        { vendorId: 14988, attributeName: 'MikroTik-VLAN-ID', attributeValue: '', vendorName: 'MikroTik' },
        { vendorId: 14988, attributeName: 'MikroT-Rate-Limit', attributeValue: '0/0', vendorName: 'MikroTik' },
        { vendorId: 14988, attributeName: 'MikroTik-User-Group', attributeValue: 'default', vendorName: 'MikroTik' },
      ],
      defaultRole: 'default',
    };
  }

  // ── Helpers ──

  /** Parse MikroTik uptime string like "1w2d3h4m5s" to seconds */
  private parseUptime(raw: string): number {
    if (!raw) return 0;
    let totalSeconds = 0;
    const weeks = raw.match(/(\d+)w/);
    if (weeks) totalSeconds += Number(weeks[1]) * 7 * 86400;
    const days = raw.match(/(\d+)d/);
    if (days) totalSeconds += Number(days[1]) * 86400;
    const hours = raw.match(/(\d+)h/);
    if (hours) totalSeconds += Number(hours[1]) * 3600;
    const minutes = raw.match(/(\d+)m(?!s)/);
    if (minutes) totalSeconds += Number(minutes[1]) * 60;
    const seconds = raw.match(/(\d+)s/);
    if (seconds) totalSeconds += Number(seconds[1]);
    return totalSeconds;
  }

  private parseSecurityType(raw: string): string {
    if (!raw) return 'Unknown';
    const s = raw.toLowerCase();
    if (s.includes('wpa3') && s.includes('enterprise')) return 'WPA3-Enterprise';
    if (s.includes('wpa3')) return 'WPA3-PSK';
    if (s.includes('wpa2') && s.includes('enterprise')) return 'WPA2-Enterprise';
    if (s.includes('wpa2')) return 'WPA2-PSK';
    if (s.includes('wpa')) return 'WPA-PSK';
    if (s === 'none' || s.includes('open')) return 'Open';
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