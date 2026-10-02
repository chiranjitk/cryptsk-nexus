/**
 * Cisco WLC (Wireless LAN Controller) REST API Adapter
 *
 * Vendor: Cisco Systems
 * API: RESTCONF (AIRESPACE-WLC-MIB) — newer WLC firmware (8.5+)
 *       Classic REST API — older firmware
 * Auth: HTTP Basic Authentication
 * CoA Port: 3799
 * RADIUS Vendor ID: 9
 *
 * Endpoints:
 *   GET  /restconf/data/cisco-ap-manager/ap-capability   — AP list
 *   GET  /restconf/data/cisco-wlc-entity:system-info    — System health
 *   GET  /restconf/operations/cisco-ap-manager:show-ap-summary — AP summary
 *   GET  /restconf/data/cisco-wlan-mgr:wlan-config       — WLAN/SSID list
 *   POST /restconf/operations/cisco-wlc-entity:deauth-client — Disconnect client
 *   POST /restconf/operations/cisco-ap-manager:restart-ap    — Restart AP
 */

import {
  WlcAdapter,
  WlcConfig,
  WlcHealth,
  WlcAccessPoint,
  WlcSsid,
  WlcRadiusProfile,
} from './wlc-adapter';

export class CiscoWlcAdapter extends WlcAdapter {
  constructor(config: WlcConfig) {
    super(config);
    const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.headers['Authorization'] = `Basic ${creds}`;
  }

  getVendor() {
    return 'cisco_wlc' as const;
  }

  /** Test connectivity by fetching system info */
  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();
    // Try RESTCONF first (newer firmware)
    const res = await this.apiRequest('/restconf/data/cisco-wlc-entity:system-info/system');
    if (res.ok && res.data) {
      const sys = res.data?.['cisco-wlc-entity:system'] ?? res.data;
      return {
        online: true,
        latencyMs: Date.now() - start,
        model: sys.productName ?? sys['product-name'] ?? undefined,
        firmwareVersion: sys.softwareVersion ?? sys['software-version'] ?? undefined,
        serialNumber: sys.serialNumber ?? sys['serial-number'] ?? undefined,
        lastSync: new Date(),
      };
    }

    // Fallback: classic REST API
    const classic = await this.apiRequest('/');
    if (classic.ok) {
      return {
        online: true,
        latencyMs: Date.now() - start,
        lastSync: new Date(),
      };
    }

    return {
      online: false,
      latencyMs: Date.now() - start,
      lastSync: new Date(),
      error: res.error ?? classic.error ?? 'Connection failed',
    };
  }

  /** Get full controller health: CPU, memory, uptime, AP/client counts */
  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();

    // Fetch system info and AP stats in parallel
    const [sysRes, apRes, clientRes] = await Promise.all([
      this.apiRequest('/restconf/data/cisco-wlc-entity:system-info/system'),
      this.apiRequest('/restconf/data/cisco-ap-manager/ap-capability'),
      this.apiRequest('/restconf/data/cisco-client-mgr:client-info'),
    ]);

    if (!sysRes.ok) {
      // Try classic endpoints
      const classicSys = await this.apiRequest('/systeminfo');
      if (!classicSys.ok) {
        return {
          online: false,
          latencyMs: Date.now() - start,
          lastSync: new Date(),
          error: sysRes.error ?? 'Unable to reach controller',
        };
      }
      // Parse classic response
      const d = classicSys.data ?? {};
      return {
        online: true,
        latencyMs: Date.now() - start,
        cpuUsage: d.cpuUsagePercent != null ? Number(d.cpuUsagePercent) : undefined,
        memoryUsage: d.memoryUsagePercent != null ? Number(d.memoryUsagePercent) : undefined,
        uptimeSeconds: d.upTime != null ? Number(d.upTime) : undefined,
        firmwareVersion: d.softwareVersion ?? undefined,
        model: d.productName ?? d.model ?? undefined,
        serialNumber: d.serialNumber ?? undefined,
        totalAps: d.totalAps != null ? Number(d.totalAps) : undefined,
        onlineAps: d.onlineAps != null ? Number(d.onlineAps) : undefined,
        totalClients: d.totalClients != null ? Number(d.totalClients) : undefined,
        licenseStatus: d.licenseStatus ?? undefined,
        lastSync: new Date(),
      };
    }

    const sys = sysRes.data?.['cisco-wlc-entity:system'] ?? sysRes.data ?? {};
    const apData = apRes.data?.['cisco-ap-manager:ap-capability'] ?? apRes.data;
    const apList = Array.isArray(apData) ? apData : apData?.['ap-capability'] ?? [];

    // Client count from client manager
    const clientData = clientRes.data?.['cisco-client-mgr:client-info'] ?? clientRes.data;
    const clientList = Array.isArray(clientData) ? clientData : clientData?.['client-info'] ?? [];

    const totalAps = apList.length;
    const onlineAps = apList.filter(
      (ap: Record<string, unknown>) => (ap.status as string ?? ap.apState ?? '') !== 'DOWN'
    ).length;

    return {
      online: true,
      latencyMs: Date.now() - start,
      cpuUsage: sys.cpuUsagePercent != null ? Number(sys.cpuUsagePercent) : undefined,
      memoryUsage: sys.memoryUsagePercent != null ? Number(sys.memoryUsagePercent) : undefined,
      uptimeSeconds: sys.upTime != null ? Number(sys.upTime) : undefined,
      firmwareVersion: sys.softwareVersion ?? sys['software-version'] ?? undefined,
      model: sys.productName ?? sys['product-name'] ?? undefined,
      serialNumber: sys.serialNumber ?? sys['serial-number'] ?? undefined,
      totalAps,
      onlineAps,
      totalClients: clientList.length || undefined,
      licenseStatus: sys.licenseStatus ?? undefined,
      lastSync: new Date(),
    };
  }

  /** Get list of all access points on this controller */
  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    const res = await this.apiRequest('/restconf/data/cisco-ap-manager/ap-capability');
    if (!res.ok) {
      // Fallback to classic AP list
      const classic = await this.apiRequest('/ap');
      if (!classic.ok) return [];
      const aps = Array.isArray(classic.data) ? classic.data : classic.data?.ap ?? classic.data?.data ?? [];
      return aps.map((ap: Record<string, unknown>) => this.mapClassicAp(ap));
    }

    const raw = res.data?.['cisco-ap-manager:ap-capability'] ?? res.data;
    const list = Array.isArray(raw) ? raw : raw?.['ap-capability'] ?? [];
    return list.map((ap: Record<string, unknown>) => this.mapRestconfAp(ap));
  }

  /** Get all configured SSIDs/WLANs */
  async getSsids(): Promise<WlcSsid[]> {
    const res = await this.apiRequest('/restconf/data/cisco-wlan-mgr:wlan-config');
    if (!res.ok) {
      // Fallback: classic WLAN list
      const classic = await this.apiRequest('/wlan');
      if (!classic.ok) return [];
      const wlans = Array.isArray(classic.data) ? classic.data : classic.data?.wlan ?? classic.data?.data ?? [];
      return wlans.map((w: Record<string, unknown>) => this.mapClassicSsid(w));
    }

    const raw = res.data?.['cisco-wlan-mgr:wlan-config'] ?? res.data;
    const list = Array.isArray(raw) ? raw : raw?.['wlan-config'] ?? [];
    return list.map((wlan: Record<string, unknown>) => this.mapRestconfSsid(wlan));
  }

  /** Disconnect a specific client by MAC address */
  async disconnectClient(mac: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.apiRequest('/restconf/operations/cisco-client-mgr:deauth-client', {
      method: 'POST',
      body: JSON.stringify({
        'cisco-client-mgr:input': {
          macAddress: mac,
        },
      }),
    });
    if (!res.ok) {
      return { success: false, error: res.error ?? `Disconnect failed: HTTP ${res.status}` };
    }
    return { success: true };
  }

  /** Restart a specific AP by MAC address */
  async restartAp(mac: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.apiRequest('/restconf/operations/cisco-ap-manager:restart-ap', {
      method: 'POST',
      body: JSON.stringify({
        'cisco-ap-manager:input': {
          macAddress: mac,
        },
      }),
    });
    if (!res.ok) {
      return { success: false, error: res.error ?? `Restart failed: HTTP ${res.status}` };
    }
    return { success: true };
  }

  /** Get default RADIUS VSA profile for Cisco WLC (Vendor ID 9) */
  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'cisco-default',
      name: 'Cisco WLC Default',
      vendor: 'cisco_wlc',
      description: 'Default RADIUS VSA profile for Cisco WLC using Airespace attributes (Vendor ID 9)',
      attributes: [
        { vendorId: 9, attributeName: 'Airespace-ACL-Name', attributeValue: '', vendorName: 'Airespace' },
        { vendorId: 9, attributeName: 'Airespace-QOS-Level', attributeValue: 'silver', vendorName: 'Airespace' },
        { vendorId: 9, attributeName: 'Airespace-VLAN-Id', attributeValue: '', vendorName: 'Airespace' },
        { vendorId: 9, attributeName: 'Cisco-AVPair', attributeValue: 'sub:Ingress-Committed-Data-Rate=0', vendorName: 'Cisco' },
        { vendorId: 9, attributeName: 'Cisco-AVPair', attributeValue: 'sub:Egress-Committed-Data-Rate=0', vendorName: 'Cisco' },
      ],
      defaultRole: 'silver',
      defaultAcl: 'none',
    };
  }

  // ── Private mapping helpers ──

  private mapRestconfAp(ap: Record<string, unknown>): WlcAccessPoint {
    const status = this.parseApStatus(
      ap.status as string ?? ap.apState as string ?? 'offline'
    );
    return {
      id: String(ap.macAddress ?? ap['mac-address'] ?? '').toLowerCase(),
      mac: String(ap.macAddress ?? ap['mac-address'] ?? '').toLowerCase(),
      name: ap.name as string ?? ap.apName as string ?? '',
      model: ap.model as string ?? ap.apModel as string ?? '',
      firmware: String(ap.softwareVersion ?? ap['software-version'] ?? ''),
      status,
      ip: ap.ipAddress as string ?? ap.ip as string ?? undefined,
      serialNumber: String(ap.serialNumber ?? ap['serial-number'] ?? '') || undefined,
      clients: Number(ap.clientCount ?? ap['client-count'] ?? 0),
      channel: ap.channel != null ? Number(ap.channel) : undefined,
      txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
      uptimeSeconds: ap.upTime != null ? Number(ap.upTime) : undefined,
      site: ap.location as string ?? undefined,
      floor: ap.floor as string ?? undefined,
      controllerId: this.config.id,
      lastSeen: new Date(),
    };
  }

  private mapClassicAp(ap: Record<string, unknown>): WlcAccessPoint {
    const status = this.parseApStatus(
      ap.status as string ?? ap.apState as string ?? 'offline'
    );
    return {
      id: (ap.macAddr as string ?? ap.mac as string ?? '').toLowerCase(),
      mac: (ap.macAddr as string ?? ap.mac as string ?? '').toLowerCase(),
      name: ap.name as string ?? '',
      model: ap.model as string ?? '',
      firmware: ap.softwareVersion as string ?? '',
      status,
      ip: ap.ipAddr as string ?? ap.ip as string ?? undefined,
      serialNumber: ap.serialNumber as string ?? undefined,
      clients: Number(ap.clientCount ?? 0),
      channel: ap.channel != null ? Number(ap.channel) : undefined,
      txPower: ap.txPower != null ? Number(ap.txPower) : undefined,
      uptimeSeconds: ap.upTime != null ? Number(ap.upTime) : undefined,
      controllerId: this.config.id,
      lastSeen: new Date(),
    };
  }

  private mapRestconfSsid(wlan: Record<string, unknown>): WlcSsid {
    return {
      id: (wlan.wlanId as string ?? wlan['wlan-id'] ?? wlan.ssid as string ?? '').toString(),
      name: wlan.ssid as string ?? wlan.wlanSsid as string ?? wlan.name as string ?? '',
      interface: wlan.interfaceName as string ?? wlan.interface as string ?? undefined,
      vlanId: wlan.vlanId != null ? Number(wlan.vlanId) : undefined,
      securityType: wlan.security as string ?? wlan.wpaAuthKeyMgmt as string ?? undefined,
      enabled: wlan.status === 'Enabled' || wlan.enabled === true || wlan.adminState === 'ENABLED',
      broadcastSsid: wlan.broadcastSsid !== false && wlan.hideSsid !== true,
      clientCount: wlan.clientCount != null ? Number(wlan.clientCount) : undefined,
      maxClients: wlan.maxClientCount != null ? Number(wlan.maxClientCount) : undefined,
      band: wlan.radioPolicy as string ?? wlan.band as string ?? 'dual',
    };
  }

  private mapClassicSsid(wlan: Record<string, unknown>): WlcSsid {
    return {
      id: (wlan.wlanId as string ?? wlan.id as string ?? '').toString(),
      name: wlan.ssid as string ?? wlan.name as string ?? '',
      interface: wlan.interface as string ?? undefined,
      vlanId: wlan.vlanId != null ? Number(wlan.vlanId) : undefined,
      securityType: wlan.security as string ?? undefined,
      enabled: wlan.status === 'Enabled' || wlan.enabled === true,
      broadcastSsid: wlan.broadcastSsid !== false,
      clientCount: wlan.clientCount != null ? Number(wlan.clientCount) : undefined,
      maxClients: wlan.maxClients != null ? Number(wlan.maxClients) : undefined,
      band: wlan.radioPolicy as string ?? 'dual',
    };
  }

  private parseApStatus(raw: string): WlcAccessPoint['status'] {
    const s = raw?.toLowerCase() ?? 'offline';
    if (s === 'up' || s === 'connected' || s === 'joined' || s === 'registered') return 'online';
    if (s === 'down' || s === 'disconnected' || s === 'unreachable') return 'offline';
    if (s === 'downloading' || s === 'image-download') return 'provisioning';
    return 'offline';
  }
}