/**
 * Vendor-Agnostic RADIUS Attribute Utility (Server-Side)
 *
 * Cryptsk HospitalityOS is a multi-vendor, multi-NAS platform (MikroTik, Cisco, Aruba, Ruckus,
 * Huawei, Juniper, Fortinet, UniFi, pfSense, etc.). RADIUS attributes MUST be
 * set according to the NAS vendor type — never hardcoded to a single vendor.
 *
 * Architecture:
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ OPERATING MODES                                                          │
 * │                                                                          │
 * │ 1. EXTERNAL GATEWAY MODE                                                │
 * │    ┌────────────┐  query NAS vendors  ┌──────────────────────┐           │
 * │    │ PMS / RADIUS│ ─────────────────→ │ RadiusNAS table (type)│           │
 * │    │ Service     │                    └──────────────────────┘           │
 * │    └──────┬─────┘                              │                         │
 * │           │                                    ▼                         │
 * │           │    For EACH active vendor → generate vendor-specific VSA    │
 * │           │    (MikroTik, Cisco, ChilliSpot, etc.)                       │
 * │                                                                          │
 * │ 2. MULTIMODE (Cryptsk as Gateway + RADIUS)                             │
 * │    ┌────────────────────────────────────────────┐                       │
 * │    │  Cryptsk Product = Gateway + RADIUS Server │                       │
 * │    │  VSA: Cryptsk-* (Vendor ID 64179)          │                       │
 * │    └────────────────────────────────────────────┘                       │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * FREE RADIUS VENDOR DICTIONARIES:
 *   FreeRADIUS ships 300+ vendor dictionary files (e.g., /usr/share/freeradius/dictionary.mikrotik)
 *   that define each vendor's VSA names, types, and formats. Our vendor profile system maps
 *   300+ vendor identifiers to canonical profiles and knows which VSAs to use for each.
 *
 *   Cryptsk's own VSA dictionary is in: freeradius-install/etc/raddb/dictionary
 *   Vendor ID: 64179 (Cryptsk Private Limited)
 *
 *   Pure reading/parsing functions are in attribute-readers.ts (client-safe, no DB import).
 */

import { db } from '@/lib/db';

// ─── Re-export pure readers (client-safe) ────────────────────────────────
export {
  DATA_LIMIT_ATTRIBUTES,
  BANDWIDTH_ATTRIBUTES,
  ALL_VENDOR_SPECIFIC_ATTRIBUTES,
  CRYPTSK_ATTRIBUTES,
  readDataLimitMB,
  readDataLimitBytes,
  readBandwidthMbps,
  getBandwidthDisplay,
  hasDataLimit,
  getDataLimitDisplay,
  getSessionTimeoutDisplay,
  getValidityDisplay,
} from './attribute-readers';

// ─── Vendor Profile Keys ─────────────────────────────────────────────────

export type VendorProfile =
  | 'cryptsk'      // Cryptsk Private Limited — Multimode (Gateway + RADIUS)
  | 'mikrotik'
  | 'cisco'
  | 'aruba'
  | 'chillispot'
  | 'fortinet'
  | 'huawei'
  | 'juniper'
  | 'wispr'
  | 'other';

// ──────────────────────────────────────────────
// H5 FIX: Speed unit normalization
// ──────────────────────────────────────────────

/**
 * WiFiPlan stores speeds in Mbps throughout the schema.
 * However, some API consumers send speeds in bps or Kbps.
 * This helper auto-detects the unit and normalizes to Mbps.
 */
export const BPS_PER_MBPS = 1_000_000;
export const KBPS_PER_MBPS = 1_000;

export function normalizeSpeedToMbps(speed: number): number {
  if (speed <= 0) return 0;
  if (speed > 100_000) return speed / BPS_PER_MBPS;    // bps → Mbps
  if (speed > 1_000) return speed / KBPS_PER_MBPS;    // Kbps → Mbps
  return speed;                                         // already Mbps
}

export function mbpsToBps(mbps: number): number {
  return mbps * BPS_PER_MBPS;
}

export function mbpsToKbps(mbps: number): number {
  return mbps * KBPS_PER_MBPS;
}

// ─── Normalize Vendor String ─────────────────────────────────────────────

/**
 * Normalize a raw NAS vendor string to a canonical vendor profile key.
 * Mirrors the logic in freeradius-service/index.ts normalizeVendor().
 *
 * Maps 300+ vendor identifiers to one of:
 *   cryptsk, mikrotik, cisco, aruba, chillispot, fortinet, huawei, juniper, wispr, other
 *
 * IMPORTANT: 'cryptsk' is checked FIRST — when the product runs in MULTIMODE,
 * the NAS type should be set to 'cryptsk' so Cryptsk's own VSA are generated.
 */
export function normalizeVendor(rawVendor: string): VendorProfile {
  const v = (rawVendor || 'other').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

  const profiles: VendorProfile[] = ['cryptsk', 'mikrotik', 'cisco', 'aruba', 'chillispot', 'fortinet', 'huawei', 'juniper', 'wispr', 'other'];
  if (profiles.includes(v)) return v;

  // ── cryptsk (always first — own product) ──
  if (['cryptsk', 'cryptskpvtltd', 'cryptskprivate', 'cryptskpvt',
    'staysuite', 'hospitalityos', 'cryptskprivate limited', 'cryptskpvtltd'].includes(v)) return 'cryptsk';

  // ── mikrotik ──
  if (['mikrotik', 'mikrotikrouteros', 'routeros', 'mikrotikswitch', 'crs', 'switchos'].includes(v)) return 'mikrotik';

  // ── cisco ──
  if (['cisco', 'ciscomeraki', 'meraki', 'ciscowlc', 'ciscoios', 'ciscoasa',
    'ciscorevpn', 'ciscovpn', 'ciscoisg', 'ciscomerakims', 'ciscocucm', 'ciscocme'].includes(v)) return 'cisco';

  // ── aruba ──
  if (['aruba', 'arubahpe', 'hpe', 'arubaclearpass', 'clearpass',
    'hpprocurve', 'hpeofficeconnect', 'colubris'].includes(v)) return 'aruba';

  // ── chillispot ──
  if (['coovachilli', 'chilli', 'coova', 'chillispot', 'pfsense', 'opnsense',
    'openwrt', 'ddwrt', 'wifidog', 'wifidogng', 'openmesh', 'cloudtrax',
    'eduroam', 'captiveportal', 'captive', 'untangle', 'smoothwall', 'clearos',
    'endian', 'ipsecgeneric', 'sslvpngeneric', 'openvpn', 'wireguard',
    'mypublicwifi', 'wifisplash', 'guestgate', 'wifigate', 'handlink',
    'wifiplus', 'aquipia', 'velox', 'fon', 'gowex', 'socialwifi',
    'purplewifi', 'cloud4wifi', 'bintec', 'elmeg', 'kerio', 'stonesoft',
    'forcepoint', 'clavister', 'cyberguard', 'sputnik', 'wifika', 'patronsoft',
    'antlabs', 'firstspot', 'wirelesslogic', 'wifiglobal', 'iwire', 'mywifi',
    'nomadix', 'alepo', 'aptilo', 'ipass', 'devicescape', 'boingo', 'deepedge'].includes(v)) return 'chillispot';

  // ── fortinet ──
  if (['fortinet', 'fortigate', 'fortiwifi', 'fortinetvpn', 'forticlient',
    'fortisslvpn', 'sangfor', 'deepsecure', 'hillstone'].includes(v)) return 'fortinet';

  // ── huawei ──
  if (['huawei', 'airengine', 'huaweimea', 'huaweimme', 'huaweiims',
    'huaweime60', 'huaweiugw', 'fiberhome', 'fiberhomean5000'].includes(v)) return 'huawei';

  // ── juniper ──
  if (['juniper', 'junipermist', 'mist', 'junipersrx', 'junipere',
    'juniperive', 'pulsesecure', 'netscreen', 'ive', 'erx'].includes(v)) return 'juniper';

  // ── wispr (native WISPr vendors) ──
  if ([
    'unifi', 'ubiquiti', 'ubiquitiunifi', 'ubiquitiedgerouter',
    'ruckus', 'ruckuscommcope', 'commcope',
    'tplink', 'tplinkomada', 'omada', 'tplinkswitch',
    'netgear', 'netgearinsight', 'orbi', 'netgearswitch',
    'dlink', 'dlinknuclias', 'nuclias',
    'ruijie', 'ruijienetworks', 'reyee',
    'cambium', 'cnpilot', 'emp',
    'grandstream', 'gwn', 'grandstreampbx',
    'engenius', 'zyxel', 'nwa', 'zyxelswitch', 'zyxelnxc',
    'alcatel', 'nokia', 'alcatellucent', 'nokiaips',
    'extreme', 'extremenetworks', 'aerohive', 'hivemanager', 'enterasys',
    'xirrus', 'xirrusarray', 'bluesocket', 'trapeze', 'wavelink', 'telxon',
    'symbol', 'proxim', 'orinoco', 'breezecom', 'breezenet',
    'intellinet', 'nfon', 'buffalo', 'airstation',
    'asus', 'asuswrt', 'merlin',
    'edgecore', 'accton', 'altai', 'wili', 'wilimesh',
    'samsung', 'zte', 'ztemme', 'ztebras', 'ztebrass', 'brocade',
    'motorola', 'draytek', 'peplink', 'speedfusion', 'sophos',
    'avaya', 'avayacmu', 'dell', 'dellforce10', 'force10',
    'foundry', 'smc', 'perle', 'opengear', 'ubiquti', 'mellanox', 'nvidia',
    'arista', 'cumulus', 'alliedtelesis',
    'meru', 'adckentrox',
    'paloalto', 'checkpoint', 'sonicwall', 'watchguard', 'barracuda', 'barracudavpn',
    'redcreek', 'ravlin',
    'f5bigip', 'f5', 'citrix', 'netscaler', 'array', 'avedia',
    'freeradius', 'microsoftnps', 'ciscoacs', 'ciscoise',
    'rsa', 'rsasecurid', 'radiator', 'openradius', 'tacacsgeneric',
    'sierrawireless', 'airlink', 'teltonika', 'moxa', 'nport',
    'digi', 'diginternational', 'lantronix', 'inhand', 'quectel', 'ublox',
    'simcom', 'simtech', 'neoway', 'sequans', 'multitech', 'multiconnect',
    'robustel', 'fourfaith', 'f2x',
    'ericssonmme', 'ericssonse', 'smartedge',
    'nokiamme', 'nsn', 'stm', 'starent', 'staros',
    'broadsoft', 'genband', 'ribbon', 'metaswitch', 'sonus', 'sbc',
    'audiocodes', 'mediant', 'inventel', 'efficientip',
    'vodafone', 'telekom', 'orange', 'att', 'verizon',
    'chinatelecom', 'chinamobile', 'chinaunicom',
    'bsnl', 'jio', 'reliance', 'airtel', 'bharti',
    'sangoma', 'freepbx', 'digium', 'asterisk', 'mitel', 'mivoice', 'yealink',
    'polycom',
    'redback', 'broadband', 'ciscoiosbras', 'ascend', 'lucent',
    'nortel', 'shasta', 'paradigm', 'shiva', 'livingston', 'alcatelisam',
    '3com', 'h3c',
  ].includes(v)) return 'wispr';

  return 'other';
}

// ─── Query NAS Vendors from Database ─────────────────────────────────────

/**
 * Get all unique, active NAS vendor types from the RadiusNAS table.
 * Returns normalized vendor profile keys.
 *
 * Example: ['cryptsk'] — means the product is running in MULTIMODE
 *          ['mikrotik', 'cisco'] — external gateway mode with both vendors
 */
export async function getActiveNASVendors(propertyId?: string): Promise<VendorProfile[]> {
  try {
    const where = propertyId ? { propertyId, status: 'active' as const } : { status: 'active' as const };
    const nasEntries = await db.radiusNAS.findMany({
      where,
      select: { type: true },
      distinct: ['type'],
    });

    if (!nasEntries || nasEntries.length === 0) return ['other'];
    return nasEntries.map(n => normalizeVendor(n.type));
  } catch {
    return ['other'];
  }
}

// ─── Generate Vendor-Specific Attributes ─────────────────────────────────

/**
 * Generate bandwidth-related RADIUS reply attributes for one or more vendors.
 *
 * RFC-standard WISPr attributes are ALWAYS included (recognized by most NAS).
 * Vendor-specific attributes are added based on each vendor profile.
 *
 * @param vendors - Array of normalized vendor profiles
 * @param downloadMbps - Download speed in Mbps
 * @param uploadMbps - Upload speed in Mbps
 * @returns Array of { attribute, value } pairs to write to radreply
 */
export function generateBandwidthAttributes(
  vendors: VendorProfile[],
  downloadMbps: number,
  uploadMbps: number,
): Array<{ attribute: string; value: string }> {
  const attrs: Array<{ attribute: string; value: string }> = [];
  const downloadBps = downloadMbps * 1000000;
  const uploadBps = uploadMbps * 1000000;

  // RFC-standard WISPr attributes — recognized by virtually all WiFi gateways
  attrs.push(
    { attribute: 'WISPr-Bandwidth-Max-Down', value: String(downloadBps) },
    { attribute: 'WISPr-Bandwidth-Max-Up', value: String(uploadBps) },
  );

  // Vendor-specific attributes (deduplicated by attribute name)
  const seen = new Set<string>();
  for (const vendor of vendors) {
    const vendorAttrs = getVendorBandwidthAttrs(vendor, downloadMbps, uploadMbps, downloadBps, uploadBps);
    for (const va of vendorAttrs) {
      if (!seen.has(va.attribute)) {
        seen.add(va.attribute);
        attrs.push(va);
      }
    }
  }

  return attrs;
}

/**
 * Generate session timeout, idle timeout, and data limit attributes for one or more vendors.
 *
 * STANDARD RFC attributes are ALWAYS included first (recognized by ALL NAS devices worldwide):
 *   - Session-Timeout (RFC 2865, attribute 27)
 *   - Idle-Timeout (RFC 2865, attribute 28)
 *   - Termination-Action (RFC 2865, attribute 29)
 *   - Acct-Interim-Interval (RFC 2869, attribute 85)
 *   - Max-Input-Octets / Max-Output-Octets (RFC 2865)
 *
 * Vendor-specific attributes are added after the standard ones.
 *
 * @param vendors - Array of normalized vendor profiles
 * @param timeoutMinutes - Session timeout in minutes (0 = no limit)
 * @param dataLimitMB - Data cap in MB (0/undefined = unlimited)
 * @param idleTimeoutSeconds - Idle timeout in seconds (0/undefined = no idle limit)
 * @param interimIntervalSeconds - Acct-Interim-Interval in seconds (default: 60)
 * @returns Array of { attribute, value } pairs to write to radreply
 */
export function generateSessionAttributes(
  vendors: VendorProfile[],
  timeoutMinutes: number,
  dataLimitMB?: number,
  idleTimeoutSeconds?: number,
  interimIntervalSeconds?: number,
): Array<{ attribute: string; value: string }> {
  const attrs: Array<{ attribute: string; value: string }> = [];

  // ── STANDARD RFC attributes (recognized by ALL NAS devices) ──

  // RFC 2865 — Session-Timeout: recognized by ALL NAS devices
  if (timeoutMinutes > 0) {
    attrs.push({ attribute: 'Session-Timeout', value: String(timeoutMinutes * 60) });
  }

  // RFC 2865 — Idle-Timeout: recognized by ALL NAS devices
  // Every NAS in the world understands this attribute and enforces idle disconnect.
  if (idleTimeoutSeconds && idleTimeoutSeconds > 0) {
    attrs.push({ attribute: 'Idle-Timeout', value: String(idleTimeoutSeconds) });
  }

  // RFC 2865 — Termination-Action: RADIUS-Request (default)
  // Only include when setting a session timeout (not for data-limit-only updates)
  if (timeoutMinutes > 0) {
    attrs.push({ attribute: 'Termination-Action', value: 'RADIUS-Request' });

    // RFC 2869 — Acct-Interim-Interval: default 60 seconds
    // Only include when setting a session timeout to avoid resetting
    // a custom interim interval when updating only the data limit.
    const interimInterval = interimIntervalSeconds || 60;
    attrs.push({ attribute: 'Acct-Interim-Interval', value: String(interimInterval) });
  }

  // ── Vendor-specific data cap attributes (deduplicated) ──
  if (dataLimitMB && dataLimitMB > 0) {
    const dataLimitBytes = dataLimitMB * 1024 * 1024;
    const seen = new Set<string>();
    for (const vendor of vendors) {
      const vendorAttrs = getVendorDataLimitAttrs(vendor, dataLimitBytes);
      for (const va of vendorAttrs) {
        if (!seen.has(va.attribute)) {
          seen.add(va.attribute);
          attrs.push(va);
        }
      }
    }
  }

  return attrs;
}

/**
 * Generate idle timeout attributes — standard RFC + vendor-specific.
 *
 * This is a convenience function for when you need to update idle timeout
 * independently of session timeout and data limit.
 *
 * @param vendors - Array of normalized vendor profiles
 * @param idleTimeoutSeconds - Idle timeout in seconds
 * @returns Array of { attribute, value } pairs to write to radreply
 */
export function generateIdleTimeoutAttributes(
  vendors: VendorProfile[],
  idleTimeoutSeconds: number,
): Array<{ attribute: string; value: string }> {
  const attrs: Array<{ attribute: string; value: string }> = [];

  if (idleTimeoutSeconds <= 0) return attrs;

  // RFC 2865 — Idle-Timeout: recognized by ALL NAS devices
  attrs.push({ attribute: 'Idle-Timeout', value: String(idleTimeoutSeconds) });

  // Cryptsk-Idle-Timeout: only when Cryptsk is an active vendor
  if (vendors.includes('cryptsk')) {
    attrs.push({ attribute: 'Cryptsk-Idle-Timeout', value: String(idleTimeoutSeconds) });
  }

  return attrs;
}

// ─── Vendor-Specific Attribute Generators ────────────────────────────────

function getVendorBandwidthAttrs(
  vendor: VendorProfile,
  downloadMbps: number,
  uploadMbps: number,
  downloadBps: number,
  uploadBps: number,
): Array<{ attribute: string; value: string }> {
  const attrs: Array<{ attribute: string; value: string }> = [];

  switch (vendor) {
    case 'cryptsk':
      // Cryptsk Multimode — use Cryptsk's own VSA (Vendor ID 64179)
      // Cryptsk-Rate-Limit: MikroTik-compatible "D/U" format for easy migration
      attrs.push(
        { attribute: 'Cryptsk-Rate-Limit', value: `${downloadMbps}M/${uploadMbps}M` },
        { attribute: 'Cryptsk-Bandwidth-Max-Down', value: String(downloadBps) },
        { attribute: 'Cryptsk-Bandwidth-Max-Up', value: String(uploadBps) },
      );
      break;

    case 'mikrotik':
      // rx=upload, tx=download from NAS perspective
      attrs.push({ attribute: 'Mikrotik-Rate-Limit', value: `${uploadMbps}M/${downloadMbps}M` });
      break;

    case 'cisco':
      // Dual-format Cisco-AVPair for maximum compatibility:
      // 1. Meraki MR: bandwidth-limit-down/up in kbps (semicolon-delimited)
      // 2. Cisco IOS/ISG: sub:Ingress/Egress-Committed-Data-Rate in bps (newline-delimited)
      // The NAS will use the format it understands and ignore the other.
      const ciscoDownKbps = Math.ceil(downloadBps / 1000);
      const ciscoUpKbps = Math.ceil(uploadBps / 1000);
      attrs.push(
        { attribute: 'Cisco-AVPair', value: `sub:Ingress-Committed-Data-Rate=${downloadBps}\nsub:Egress-Committed-Data-Rate=${uploadBps}` },
        { attribute: 'Cisco-AVPair-0', value: `bandwidth-limit-down=${ciscoDownKbps}kbps;bandwidth-limit-up=${ciscoUpKbps}kbps` },
      );
      break;

    case 'aruba':
      // Aruba: Filter-Id references a firewall policy on the controller/ClearPass
      attrs.push(
        { attribute: 'Filter-Id', value: 'guest-wifi' },
        { attribute: 'Aruba-User-Role', value: 'guest' },
      );
      break;

    case 'chillispot':
      attrs.push(
        { attribute: 'ChilliSpot-Bandwidth-Max-Down', value: String(downloadBps) },
        { attribute: 'ChilliSpot-Bandwidth-Max-Up', value: String(uploadBps) },
      );
      break;

    case 'fortinet':
      // Fortinet: Fortinet-Group assigns firewall policy group on FortiGate.
      // Filter-Id provides fallback policy matching for older FortiOS versions.
      attrs.push(
        { attribute: 'Fortinet-Group', value: 'guest-wifi' },
        { attribute: 'Filter-Id', value: 'guest-wifi' },
      );
      break;

    case 'huawei':
    case 'juniper':
    case 'wispr':
      // These vendors use WISPr natively — WISPr attrs already added above
      break;

    default:
      // Unknown/other vendor: write ChilliSpot attrs for broad compatibility.
      // Do NOT write Mikrotik-specific attrs — we don't know if the NAS is Mikrotik.
      // WISPr attrs are already included above as the universal baseline.
      attrs.push(
        { attribute: 'ChilliSpot-Bandwidth-Max-Down', value: String(downloadBps) },
        { attribute: 'ChilliSpot-Bandwidth-Max-Up', value: String(uploadBps) },
      );
      break;
  }

  return attrs;
}

function getVendorDataLimitAttrs(
  vendor: VendorProfile,
  dataLimitBytes: number,
): Array<{ attribute: string; value: string }> {
  const attrs: Array<{ attribute: string; value: string }> = [];

  switch (vendor) {
    case 'cryptsk':
      // Cryptsk Multimode — use Cryptsk's own VSA (Vendor ID 64179)
      attrs.push(
        { attribute: 'Cryptsk-Total-Limit', value: String(dataLimitBytes) },
        { attribute: 'Cryptsk-Max-Input-Octets', value: String(dataLimitBytes) },
        { attribute: 'Cryptsk-Max-Output-Octets', value: String(dataLimitBytes) },
      );
      break;

    case 'mikrotik':
      attrs.push({ attribute: 'Mikrotik-Total-Limit', value: String(dataLimitBytes) });
      break;

    case 'cisco':
      // Dual-format Cisco data limit for maximum compatibility:
      // 1. Cisco IOS/ISG: sub:quota-in/out in bytes
      // 2. Meraki MR: data-limit in bytes
      attrs.push(
        { attribute: 'Cisco-AVPair-1', value: `sub:quota-in=${dataLimitBytes}\nsub:quota-out=${dataLimitBytes}` },
        { attribute: 'Cisco-AVPair-2', value: `data-limit=${dataLimitBytes}` },
      );
      break;

    case 'aruba':
      // Aruba: Use Filter-Id for bandwidth policy profile + HPE-ARUBA VSAs for data cap
      // Aruba natively supports Filter-Id which references a firewall policy on the controller
      attrs.push(
        { attribute: 'Filter-Id', value: 'guest-wifi' },
        { attribute: 'Aruba-User-Role', value: 'guest' },
      );
      break;

    case 'chillispot':
      attrs.push(
        { attribute: 'ChilliSpot-Max-Total-Octets', value: String(dataLimitBytes) },
        { attribute: 'ChilliSpot-Max-Input-Octets', value: String(dataLimitBytes) },
        { attribute: 'ChilliSpot-Max-Output-Octets', value: String(dataLimitBytes) },
      );
      break;

    case 'fortinet':
      // Fortinet data limits enforced via firewall policy on FortiGate.
      // Write Filter-Id referencing the policy group for consistency.
      attrs.push(
        { attribute: 'Fortinet-Group', value: 'guest-wifi' },
        { attribute: 'Filter-Id', value: 'guest-wifi' },
      );
      break;

    case 'huawei':
    case 'juniper':
    case 'wispr':
      // These use WISPr natively or have no specific data cap VSA
      break;

    default:
      // Unknown/other vendor: write ChilliSpot attrs for broad compatibility.
      attrs.push(
        { attribute: 'ChilliSpot-Max-Total-Octets', value: String(dataLimitBytes) },
        { attribute: 'ChilliSpot-Max-Input-Octets', value: String(dataLimitBytes) },
        { attribute: 'ChilliSpot-Max-Output-Octets', value: String(dataLimitBytes) },
      );
      break;
  }

  return attrs;
}

/**
 * Get all known data-limit attribute names that have a value set.
 * Used for deleting old vendor attrs before writing new ones.
 * Only includes vendor-specific attributes (no bare RFC Max-*-Octets,
 * as those don't exist in any FreeRADIUS dictionary and cause parse failures).
 */
export function getActiveDataLimitAttrs(attributes: Record<string, string> | undefined): string[] {
  if (!attributes) return [];
  return [
    // Vendor-specific attributes (dictionaries ARE loaded in FreeRADIUS)
    'Cryptsk-Total-Limit', 'Cryptsk-Max-Input-Octets', 'Cryptsk-Max-Output-Octets',
    'Mikrotik-Total-Limit',
    'ChilliSpot-Max-Total-Octets', 'ChilliSpot-Max-Input-Octets', 'ChilliSpot-Max-Output-Octets',
  ].filter(attr => {
    const val = attributes[attr];
    return val && Number(val) > 0;
  });
}

/**
 * Get all known session/idle timeout attribute names that have a value set.
 * Used for deleting old vendor attrs before writing new ones.
 */
export function getActiveTimeoutAttrs(attributes: Record<string, string> | undefined): string[] {
  if (!attributes) return [];
  return [
    // Standard RFC attributes
    'Session-Timeout', 'Idle-Timeout', 'Acct-Interim-Interval',
    // Vendor-specific attributes
    'Cryptsk-Session-Timeout', 'Cryptsk-Idle-Timeout',
  ].filter(attr => {
    const val = attributes[attr];
    return val && Number(val) > 0;
  });
}

/**
 * Get all known bandwidth attribute names that have a value set.
 * Used for deleting old vendor attrs before writing new ones.
 */
export function getActiveBandwidthAttrs(attributes: Record<string, string> | undefined): string[] {
  if (!attributes) return [];
  return [
    'Cryptsk-Rate-Limit', 'Cryptsk-Bandwidth-Max-Down', 'Cryptsk-Bandwidth-Max-Up',
    'Mikrotik-Rate-Limit',
    'ChilliSpot-Bandwidth-Max-Down', 'ChilliSpot-Bandwidth-Max-Up',
    'WISPr-Bandwidth-Max-Down', 'WISPr-Bandwidth-Max-Up',
    'Cisco-AVPair',
  ].filter(attr => {
    const val = attributes[attr];
    return val && val.length > 0;
  });
}
