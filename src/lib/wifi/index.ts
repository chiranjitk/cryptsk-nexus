/**
 * WLC Adapter Factory & Metadata
 *
 * StaySuite HospitalityOS — WiFi LAN Controller Management Layer
 *
 * This module provides:
 * - Re-exports of all types and the base WlcAdapter class
 * - VENDOR_WLC_METADATA: Static metadata for each supported vendor
 * - WLC_VSA_TEMPLATES: Pre-built RADIUS VSA attribute templates per vendor
 * - createWlcAdapter(): Async factory with lazy dynamic imports
 */

// ── Type re-exports ──
export type {
  WlcConfig,
  WlcVendor,
  WlcHealth,
  WlcAccessPoint,
  WlcSsid,
  WlcRadiusVsa,
  WlcRadiusProfile,
} from './wlc-adapter';

export { WlcAdapter } from './wlc-adapter';

import type {
  WlcConfig,
  WlcVendor,
  WlcHealth,
  WlcAccessPoint,
  WlcSsid,
  WlcRadiusVsa,
  WlcRadiusProfile,
} from './wlc-adapter';
import { WlcAdapter } from './wlc-adapter';

// ── Vendor metadata ──

export interface VendorWlcMetadata {
  /** Human-readable vendor name */
  name: string;
  /** Short description of the vendor's WLC product line */
  description: string;
  /** Default API port for this vendor */
  apiPort: number;
  /** Default API base path (after host:port) */
  defaultPath: string;
  /** RADIUS Change-of-Authorization (CoA) port */
  coaPort: number;
  /** RADIUS Vendor ID (RFC or private enterprise number) */
  vendorId: number;
  /** Regions/markets where this vendor is popular */
  popularIn: string[];
}

/**
 * Static metadata for every supported WLC vendor.
 * Used for UI display, configuration defaults, and RADIUS integration.
 */
export const VENDOR_WLC_METADATA: Record<WlcVendor, VendorWlcMetadata> = {
  cisco_wlc: {
    name: 'Cisco WLC',
    description: 'Cisco Wireless LAN Controller (AIRESPACE) with RESTCONF API',
    apiPort: 443,
    defaultPath: '/restconf/',
    coaPort: 3799,
    vendorId: 9,
    popularIn: ['Global', 'Enterprise', 'Hospitality'],
  },
  aruba: {
    name: 'Aruba (HPE)',
    description: 'Aruba Mobility Controller with REST API v1',
    apiPort: 443,
    defaultPath: '/v1/',
    coaPort: 3799,
    vendorId: 14823,
    popularIn: ['Global', 'Enterprise', 'Hospitality'],
  },
  ruckus: {
    name: 'Ruckus (CommScope)',
    description: 'Ruckus SmartZone / ZoneDirector REST API',
    apiPort: 443,
    defaultPath: '/rest/v1/',
    coaPort: 3799,
    vendorId: 25053,
    popularIn: ['Hospitality', 'Education', 'Enterprise'],
  },
  huawei: {
    name: 'Huawei',
    description: 'Huawei AC (Access Controller) REST API v2',
    apiPort: 443,
    defaultPath: '/api/v2/',
    coaPort: 3799,
    vendorId: 2011,
    popularIn: ['China', 'APAC', 'EMEA', 'LATAM'],
  },
  ruijie: {
    name: 'Ruijie',
    description: 'Ruijie RG-BC Controller REST API v1',
    apiPort: 443,
    defaultPath: '/api/v1/',
    coaPort: 3799,
    vendorId: 25506,
    popularIn: ['China', 'APAC', 'Education'],
  },
  tplink: {
    name: 'TP-Link Omada',
    description: 'TP-Link Omada Controller REST API v2',
    apiPort: 443,
    defaultPath: '/api/v2/',
    coaPort: 3799,
    vendorId: 19388,
    popularIn: ['SMB', 'Hospitality', 'Residential'],
  },
  dlink: {
    name: 'D-Link',
    description: 'D-Link Nuclias Connect / DWS Controller REST API v1',
    apiPort: 443,
    defaultPath: '/api/v1/',
    coaPort: 3799,
    vendorId: 171,
    popularIn: ['SMB', 'Hospitality', 'APAC'],
  },
  unifi: {
    name: 'Ubiquiti UniFi',
    description: 'UniFi Network Application REST API',
    apiPort: 443,
    defaultPath: '/api/',
    coaPort: 3799,
    vendorId: 26825,
    popularIn: ['SMB', 'Hospitality', 'Residential', 'Enterprise'],
  },
  juniper: {
    name: 'Juniper Mist',
    description: 'Juniper Mist Cloud API (cloud-managed)',
    apiPort: 443,
    defaultPath: '/api/v1/',
    coaPort: 3799,
    vendorId: 2636,
    popularIn: ['Enterprise', 'North America', 'EMEA'],
  },
  fortinet: {
    name: 'Fortinet',
    description: 'FortiGate Wireless Controller REST API v2',
    apiPort: 443,
    defaultPath: '/api/v2/',
    coaPort: 3799,
    vendorId: 12356,
    popularIn: ['Enterprise', 'Government', 'Global'],
  },
  netgear: {
    name: 'Netgear Insight',
    description: 'Netgear Insight Cloud API (cloud-managed)',
    apiPort: 443,
    defaultPath: '/v1/',
    coaPort: 3799,
    vendorId: 331,
    popularIn: ['SMB', 'Hospitality', 'Residential'],
  },
  cambium: {
    name: 'Cambium cnMaestro',
    description: 'Cambium cnMaestro REST API v1',
    apiPort: 443,
    defaultPath: '/api/v1/',
    coaPort: 3799,
    vendorId: 4105,
    popularIn: ['WISP', 'Rural', 'Enterprise'],
  },
  grandstream: {
    name: 'Grandstream',
    description: 'Grandstream GWN Manager REST API',
    apiPort: 443,
    defaultPath: '/api/',
    coaPort: 3799,
    vendorId: 13925,
    popularIn: ['SMB', 'Hospitality', 'APAC'],
  },
  mikrotik: {
    name: 'MikroTik',
    description: 'MikroTik RouterOS REST API (CAPsMAN)',
    apiPort: 443,
    defaultPath: '/rest/',
    coaPort: 3799,
    vendorId: 14988,
    popularIn: ['WISP', 'SMB', 'Education', 'Global'],
  },
  generic: {
    name: 'Generic',
    description: 'Generic WLC adapter — extends base class with no vendor-specific logic',
    apiPort: 443,
    defaultPath: '/',
    coaPort: 3799,
    vendorId: 0,
    popularIn: [],
  },
};

// ── VSA Templates ──

export interface WlcVsaTemplate {
  vendorId: number;
  vendorName: string;
  attributes: {
    attributeName: string;
    description: string;
    formatExample: string;
  }[];
}

/**
 * Pre-built RADIUS VSA attribute templates for each vendor.
 * These templates document the vendor-specific attributes used in
 * RADIUS Access-Accept and CoA-Request messages.
 */
export const WLC_VSA_TEMPLATES: Record<WlcVendor, WlcVsaTemplate[]> = {
  cisco_wlc: [
    {
      vendorId: 9,
      vendorName: 'Airespace (Cisco WLC)',
      attributes: [
        { attributeName: 'Airespace-ACL-Name', description: 'Assign an ACL policy to the client session', formatExample: 'acl-guest-access' },
        { attributeName: 'Airespace-QOS-Level', description: 'QoS level: platinum, gold, silver, bronze', formatExample: 'silver' },
        { attributeName: 'Airespace-VLAN-Id', description: 'Assign VLAN ID to client', formatExample: '100' },
        { attributeName: 'Cisco-AVPair', description: 'Ingress/egress committed data rate (bps)', formatExample: 'sub:Ingress-Committed-Data-Rate=5000000' },
        { attributeName: 'Cisco-AVPair', description: 'Egress committed data rate (bps)', formatExample: 'sub:Egress-Committed-Data-Rate=2500000' },
      ],
    },
  ],
  aruba: [
    {
      vendorId: 14823,
      vendorName: 'Aruba Networks',
      attributes: [
        { attributeName: 'Aruba-User-Role', description: 'Assign a firewall role to the client', formatExample: 'guest' },
        { attributeName: 'Aruba-BW-Contract', description: 'Bandwidth contract in format ${down}M/${up}M', formatExample: '10M/5M' },
        { attributeName: 'Filter-Id', description: 'Apply an ACL filter', formatExample: 'guest-filter' },
      ],
    },
  ],
  ruckus: [
    {
      vendorId: 25053,
      vendorName: 'Ruckus Networks',
      attributes: [
        { attributeName: 'Ruckus-Bandwidth-Max-Down', description: 'Max downstream bandwidth (kbps)', formatExample: '10240' },
        { attributeName: 'Ruckus-Bandwidth-Max-Up', description: 'Max upstream bandwidth (kbps)', formatExample: '5120' },
        { attributeName: 'Ruckus-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'Ruckus-User-Role', description: 'Assign user role', formatExample: 'guest' },
        { attributeName: 'Ruckus-Session-Timeout', description: 'Session timeout in seconds', formatExample: '3600' },
      ],
    },
  ],
  huawei: [
    {
      vendorId: 2011,
      vendorName: 'Huawei',
      attributes: [
        { attributeName: 'HW-VLAN-Id', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'HW-User-Group', description: 'Assign user group', formatExample: 'guest' },
        { attributeName: 'Huawei-AVPair', description: 'QoS profile assignment', formatExample: 'qos-profile=default' },
        { attributeName: 'Huawei-AVPair', description: 'Rate limit in kbps', formatExample: 'rate-limit=10240' },
      ],
    },
  ],
  ruijie: [
    {
      vendorId: 25506,
      vendorName: 'Ruijie',
      attributes: [
        { attributeName: 'Ruijie-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'Ruijie-User-Group', description: 'Assign user group', formatExample: 'guest' },
        { attributeName: 'Ruijie-QoS-Profile', description: 'QoS profile name', formatExample: 'default' },
        { attributeName: 'Ruijie-Bandwidth-Limit', description: 'Bandwidth limit in kbps', formatExample: '10240' },
      ],
    },
  ],
  tplink: [
    {
      vendorId: 19388,
      vendorName: 'TP-Link',
      attributes: [
        { attributeName: 'TP-Link-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'TP-Link-User-Group', description: 'Assign user group', formatExample: 'guest' },
        { attributeName: 'TP-Link-QoS-Level', description: 'QoS level (0-7 or named)', formatExample: '1' },
        { attributeName: 'TP-Link-Bandwidth', description: 'Bandwidth in format down/up (kbps)', formatExample: '10240/5120' },
      ],
    },
  ],
  dlink: [
    {
      vendorId: 171,
      vendorName: 'D-Link',
      attributes: [
        { attributeName: 'D-Link-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'D-Link-User-Group', description: 'Assign user group', formatExample: 'guest' },
        { attributeName: 'D-Link-Filter-Id', description: 'Apply filter/ACL', formatExample: 'guest-filter' },
      ],
    },
  ],
  unifi: [
    {
      vendorId: 26825,
      vendorName: 'Ubiquiti UniFi',
      attributes: [
        { attributeName: 'UniFi-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'UniFi-User-Group', description: 'Assign user group', formatExample: 'default' },
      ],
    },
    {
      vendorId: 14122,
      vendorName: 'WISPr (Wi-Fi Internet Service Provider roaming)',
      attributes: [
        { attributeName: 'WISPr-Bandwidth-Max-Down', description: 'Max downstream bandwidth (bps)', formatExample: '10240000' },
        { attributeName: 'WISPr-Bandwidth-Max-Up', description: 'Max upstream bandwidth (bps)', formatExample: '5120000' },
        { attributeName: 'WISPr-Session-Terminate-Time', description: 'Session termination time (ISO 8601)', formatExample: '2025-01-01T00:00:00Z' },
      ],
    },
  ],
  juniper: [
    {
      vendorId: 2636,
      vendorName: 'Juniper Networks',
      attributes: [
        { attributeName: 'Juniper-VLAN-Name', description: 'Assign VLAN by name', formatExample: 'guest-vlan' },
        { attributeName: 'Juniper-User-Role', description: 'Assign user role', formatExample: 'guest' },
        { attributeName: 'Juniper-Filter', description: 'Apply firewall filter', formatExample: 'guest-filter' },
      ],
    },
  ],
  fortinet: [
    {
      vendorId: 12356,
      vendorName: 'Fortinet',
      attributes: [
        { attributeName: 'Fortinet-Group', description: 'Assign firewall group/policy', formatExample: 'guest' },
        { attributeName: 'Fortinet-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'Fortinet-User-Group', description: 'Assign user group', formatExample: 'guest' },
      ],
    },
  ],
  netgear: [
    {
      vendorId: 331,
      vendorName: 'Netgear',
      attributes: [
        { attributeName: 'Netgear-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'Netgear-User-Role', description: 'Assign user role', formatExample: 'guest' },
      ],
    },
  ],
  cambium: [
    {
      vendorId: 4105,
      vendorName: 'Cambium Networks',
      attributes: [
        { attributeName: 'Cambium-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'Cambium-QoS', description: 'QoS profile or level', formatExample: '0' },
        { attributeName: 'Cambium-Profile', description: 'Client profile name', formatExample: 'default' },
      ],
    },
  ],
  grandstream: [
    {
      vendorId: 13925,
      vendorName: 'Grandstream',
      attributes: [
        { attributeName: 'Grandstream-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'Grandstream-Profile', description: 'Client profile name', formatExample: 'default' },
      ],
    },
  ],
  mikrotik: [
    {
      vendorId: 14988,
      vendorName: 'MikroTik',
      attributes: [
        { attributeName: 'MikroTik-VLAN-ID', description: 'Assign VLAN ID', formatExample: '100' },
        { attributeName: 'MikroT-Rate-Limit', description: 'Rate limit in format ${rx}k/${tx}k', formatExample: '10240k/5120k' },
        { attributeName: 'MikroTik-User-Group', description: 'Assign user group', formatExample: 'default' },
      ],
    },
  ],
  generic: [],
};

// ── Adapter factory (lazy imports) ──

/**
 * Create a WLC adapter instance for the given vendor configuration.
 * Uses lazy dynamic imports so only the required adapter is loaded.
 *
 * @param config - WLC configuration including vendor type, credentials, and host
 * @returns A concrete WlcAdapter instance for the specified vendor
 * @throws Error if the vendor is not supported
 */
export async function createWlcAdapter(config: WlcConfig): Promise<WlcAdapter> {
  const vendor = config.vendor;

  // Lazy-import the correct adapter class based on vendor
  switch (vendor) {
    case 'cisco_wlc': {
      const { CiscoWlcAdapter } = await import('./cisco-wlc');
      return new CiscoWlcAdapter(config);
    }
    case 'aruba': {
      const { ArubaWlcAdapter } = await import('./aruba-wlc');
      return new ArubaWlcAdapter(config);
    }
    case 'ruckus': {
      const { RuckusWlcAdapter } = await import('./ruckus-wlc');
      return new RuckusWlcAdapter(config);
    }
    case 'huawei': {
      const { HuaweiWlcAdapter } = await import('./huawei-wlc');
      return new HuaweiWlcAdapter(config);
    }
    case 'ruijie': {
      const { RuijieWlcAdapter } = await import('./ruijie-wlc');
      return new RuijieWlcAdapter(config);
    }
    case 'tplink': {
      const { TplinkWlcAdapter } = await import('./tplink-wlc');
      return new TplinkWlcAdapter(config);
    }
    case 'dlink': {
      const { DlinkWlcAdapter } = await import('./dlink-wlc');
      return new DlinkWlcAdapter(config);
    }
    case 'unifi': {
      const { UnifiWlcAdapter } = await import('./unifi-wlc');
      return new UnifiWlcAdapter(config);
    }
    case 'juniper': {
      const { JuniperWlcAdapter } = await import('./juniper-wlc');
      return new JuniperWlcAdapter(config);
    }
    case 'fortinet': {
      const { FortinetWlcAdapter } = await import('./fortinet-wlc');
      return new FortinetWlcAdapter(config);
    }
    case 'netgear': {
      const { NetgearWlcAdapter } = await import('./netgear-wlc');
      return new NetgearWlcAdapter(config);
    }
    case 'cambium': {
      const { CambiumWlcAdapter } = await import('./cambium-wlc');
      return new CambiumWlcAdapter(config);
    }
    case 'grandstream': {
      const { GrandstreamWlcAdapter } = await import('./grandstream-wlc');
      return new GrandstreamWlcAdapter(config);
    }
    case 'mikrotik': {
      const { MikrotikWlcAdapter } = await import('./mikrotik-wlc');
      return new MikrotikWlcAdapter(config);
    }
    case 'generic': {
      // Generic adapter — uses base class with minimal implementation
      const { GenericWlcAdapter } = await import('./generic-wlc');
      return new GenericWlcAdapter(config);
    }
    default:
      throw new Error(`Unsupported WLC vendor: ${vendor}`);
  }
}

/**
 * Get vendor metadata by vendor type string.
 */
export function getVendorMetadata(vendor: WlcVendor): VendorWlcMetadata {
  return VENDOR_WLC_METADATA[vendor];
}

/**
 * Get VSA templates for a specific vendor.
 */
export function getVsaTemplates(vendor: WlcVendor): WlcVsaTemplate[] {
  return WLC_VSA_TEMPLATES[vendor] ?? [];
}

/**
 * Check if a vendor requires a siteId for API calls.
 */
export function requiresSiteId(vendor: WlcVendor): boolean {
  switch (vendor) {
    case 'unifi':
    case 'juniper':
    case 'netgear':
    case 'cambium':
    case 'tplink':
      return true;
    default:
      return false;
  }
}

/**
 * Check if a vendor uses cloud-based management (no on-prem controller IP).
 */
export function isCloudManaged(vendor: WlcVendor): boolean {
  switch (vendor) {
    case 'juniper':
    case 'netgear':
      return true;
    default:
      return false;
  }
}