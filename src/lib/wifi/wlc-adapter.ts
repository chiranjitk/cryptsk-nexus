/**
 * WLC Adapter Base Class
 *
 * Abstract base class for vendor-specific Wireless LAN Controller adapters.
 * Each vendor (Cisco, Aruba, Ruckus, etc.) extends this class and implements
 * real API calls against the vendor's REST API.
 *
 * StaySuite HospitalityOS — WiFi LAN Controller Management Layer
 */

export interface WlcConfig {
  id: string;
  vendor: WlcVendor;
  name: string;
  host: string;          // IP or hostname
  port: number;          // API port (usually 443)
  username: string;
  password: string;
  useSsl: boolean;
  verifySsl: boolean;
  siteId?: string;       // For multi-site controllers (UniFi, Aruba Central, etc.)
  extraConfig?: Record<string, string>;
}

export type WlcVendor =
  'cisco_wlc' | 'aruba' | 'ruckus' | 'huawei' | 'ruijie' | 'tplink' | 'dlink'
  | 'unifi' | 'juniper' | 'fortinet' | 'netgear' | 'cambium' | 'grandstream'
  | 'mikrotik' | 'generic';

export interface WlcHealth {
  online: boolean;
  latencyMs?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  uptimeSeconds?: number;
  firmwareVersion?: string;
  model?: string;
  serialNumber?: string;
  totalAps?: number;
  onlineAps?: number;
  totalClients?: number;
  licenseStatus?: string;
  lastSync: Date;
  error?: string;
}

export interface WlcAccessPoint {
  id: string;           // MAC address as ID
  mac: string;
  name: string;
  model: string;
  firmware: string;
  status: 'online' | 'offline' | 'adopting' | 'provisioning';
  ip?: string;
  serialNumber?: string;
  clients: number;
  channel?: number;
  txPower?: number;
  uptimeSeconds?: number;
  site?: string;
  floor?: string;
  controllerId: string;
  lastSeen: Date;
}

export interface WlcSsid {
  id: string;
  name: string;
  interface?: string;
  vlanId?: number;
  securityType?: string;  // WPA2-PSK, WPA2-Enterprise, Open, etc.
  enabled: boolean;
  broadcastSsid: boolean;
  clientCount?: number;
  maxClients?: number;
  band?: string;         // 2.4GHz, 5GHz, dual
}

export interface WlcRadiusVsa {
  vendorId?: number;
  attributeName: string;
  attributeValue: string;
  vendorName?: string;
}

export interface WlcRadiusProfile {
  id: string;
  name: string;
  vendor: WlcVendor;
  description?: string;
  attributes: WlcRadiusVsa[];
  defaultVlan?: number;
  defaultRole?: string;
  defaultAcl?: string;
  bandwidthDown?: number;  // bps
  bandwidthUp?: number;    // bps
  sessionTimeout?: number; // seconds
  dataLimit?: number;      // bytes
}

export abstract class WlcAdapter {
  protected config: WlcConfig;
  protected baseUrl: string;
  protected headers: Record<string, string>;

  constructor(config: WlcConfig) {
    this.config = config;
    const protocol = config.useSsl ? 'https' : 'http';
    this.baseUrl = `${protocol}://${config.host}:${config.port}`;
    this.headers = { 'Content-Type': 'application/json' };
  }

  abstract getVendor(): WlcVendor;

  // Core methods — ALL must return real data, never placeholders
  abstract testConnection(): Promise<WlcHealth>;
  abstract getHealth(): Promise<WlcHealth>;
  abstract getAccessPoints(): Promise<WlcAccessPoint[]>;
  abstract getSsids(): Promise<WlcSsid[]>;

  // Optional — default implementations provided
  async getConnectedClients(): Promise<number> {
    const health = await this.getHealth();
    return health.totalClients ?? 0;
  }

  async disconnectClient(_mac: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Not supported by this vendor' };
  }

  async restartAp(_mac: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Not supported by this vendor' };
  }

  // Get default RADIUS VSA profile for this vendor
  abstract getDefaultRadiusProfile(): WlcRadiusProfile;

  /** Helper: Make HTTP request with auth and 15s timeout */
  protected async apiRequest(path: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
    try {
      const url = `${this.baseUrl}${path}`;
      const res = await fetch(url, {
        ...options,
        headers: { ...this.headers, ...options.headers },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
      }
      const data = await res.json().catch(() => null);
      return { ok: true, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Helper: Measure round-trip latency to controller */
  protected async measureLatency(): Promise<number> {
    const start = Date.now();
    await this.testConnection();
    return Date.now() - start;
  }
}