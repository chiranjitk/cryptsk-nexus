/**
 * WiFi Module — Shared Validation, Security, and Helper Utilities
 *
 * Provides centralized functions for:
 *  - Input validation (IP, MAC, CIDR, port, VLAN, DNS, URL)
 *  - CSV safe escaping (formula injection prevention)
 *  - PII masking (IP, MAC, email)
 *  - Path traversal prevention
 *  - fetchJSON with res.ok check
 */

// ─── IP Address Validation ─────────────────────────────────────────────────

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidIPv4(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const m = ip.trim().match(IPV4_REGEX);
  if (!m) return false;
  return m.slice(1, 5).every(o => {
    const n = parseInt(o, 10);
    return n >= 0 && n <= 255;
  });
}

export function isValidIPv6(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  // Basic IPv6 validation — supports compressed form (::)
  const pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return pattern.test(ip.trim());
}

export function isValidIP(ip: string): boolean {
  return isValidIPv4(ip) || isValidIPv6(ip);
}

// ─── MAC Address Validation ─────────────────────────────────────────────────

const MAC_REGEX = /^([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})$/;
const MAC_NO_SEP = /^[0-9a-fA-F]{12}$/;

export function isValidMAC(mac: string): boolean {
  if (!mac || typeof mac !== 'string') return false;
  const trimmed = mac.trim();
  if (MAC_REGEX.test(trimmed)) return true;
  if (MAC_NO_SEP.test(trimmed)) return true;
  return false;
}

/** Reject clearly invalid MAC addresses (broadcast / all-zeros).
 *  NOTE: Multicast MACs are NOT rejected here — hotel admins may need to
 *  whitelist IoT devices, VMs, or Android randomised MACs that can have the
 *  multicast bit set. The backend RADIUS layer handles actual traffic filtering. */
export function isSafeMAC(mac: string): boolean {
  const trimmed = mac.trim().toLowerCase().replace(/[:-]/g, '');
  if (!MAC_NO_SEP.test(trimmed)) return false;
  // Broadcast: ff:ff:ff:ff:ff:ff
  if (trimmed === 'ffffffffffff') return false;
  // All zeros
  if (trimmed === '000000000000') return false;
  return true;
}

// ─── CIDR Validation ───────────────────────────────────────────────────────

const CIDR_V4_REGEX = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/;
const CIDR_V6_REGEX = /^([0-9a-fA-F:]+)\/(\d{1,3})$/;

export function isValidCIDR(cidr: string): boolean {
  if (!cidr || typeof cidr !== 'string') return false;
  const trimmed = cidr.trim();

  const v4Match = trimmed.match(CIDR_V4_REGEX);
  if (v4Match) {
    if (!isValidIPv4(v4Match[1])) return false;
    const prefix = parseInt(v4Match[2], 10);
    return prefix >= 0 && prefix <= 32;
  }

  const v6Match = trimmed.match(CIDR_V6_REGEX);
  if (v6Match) {
    const prefix = parseInt(v6Match[2], 10);
    return prefix >= 0 && prefix <= 128;
  }

  return false;
}

/** Restrict scan CIDR to RFC 1918 private ranges, max /24 */
export function isSafeScanCIDR(cidr: string): boolean {
  const m = cidr.trim().match(CIDR_V4_REGEX);
  if (!m) return false;
  const ip = m[1];
  const prefix = parseInt(m[2], 10);

  // Max /24 for scan (256 hosts)
  if (prefix < 24) return false;

  // RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  const octets = ip.split('.').map(Number);
  if (octets[0] === 10) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;

  return false;
}

/** Convert CIDR to network address */
export function cidrToNetwork(cidr: string): string | null {
  const m = cidr.trim().match(CIDR_V4_REGEX);
  if (!m) return null;
  const ipParts = m[1].split('.').map(Number);
  const prefix = parseInt(m[2], 10);
  if (prefix < 0 || prefix > 32) return null;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = ipParts.map((octet, i) => (octet & (mask >>> (24 - i * 8))) & 0xff);
  return network.join('.');
}

/** Convert CIDR to broadcast address */
export function cidrToBroadcast(cidr: string): string | null {
  const m = cidr.trim().match(CIDR_V4_REGEX);
  if (!m) return null;
  const ipParts = m[1].split('.').map(Number);
  const prefix = parseInt(m[2], 10);
  if (prefix < 0 || prefix > 32) return null;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const broadcast = ipParts.map((octet, i) => ((octet | (~mask >>> (24 - i * 8)))) & 0xff);
  return broadcast.join('.');
}

/** Check if two CIDR ranges overlap */
export function cidrOverlap(a: string, b: string): boolean {
  const netA = cidrToNetwork(a);
  const netB = cidrToNetwork(b);
  if (!netA || !netB) return false;

  const bcA = cidrToBroadcast(a);
  const bcB = cidrToBroadcast(b);
  if (!bcA || !bcB) return false;

  const numA = ipToLong(netA);
  const numB = ipToLong(netB);
  const bcNumA = ipToLong(bcA);
  const bcNumB = ipToLong(bcB);

  return numA <= bcNumB && numB <= bcNumA;
}

function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// ─── Port Validation ───────────────────────────────────────────────────────

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function clampPort(value: unknown, fallback = 80): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(65535, Math.floor(n)));
}

// ─── VLAN Validation ───────────────────────────────────────────────────────

export function isValidVLAN(vlan: number): boolean {
  return Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094;
}

export function clampVLAN(value: unknown, fallback = 1): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(4094, Math.floor(n)));
}

// ─── DNS Record Validation ──────────────────────────────────────────────────

export function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') return false;
  const trimmed = domain.trim();
  if (trimmed.length > 253 || trimmed.length < 1) return false;
  // Standard domain label validation (supports wildcards for DNS)
  const labels = trimmed.split('.');
  if (labels.length < 2) return false;
  const labelRegex = /^(\*|[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)$/;
  return labels.every(l => l.length > 0 && l.length <= 63 && labelRegex.test(l));
}

/** Validate DNS record type matches expected value format */
export function isValidDNSRecord(type: string, value: string): boolean {
  const v = (value || '').trim();
  switch (type?.toUpperCase()) {
    case 'A':
      return isValidIPv4(v);
    case 'AAAA':
      return isValidIPv6(v);
    case 'CNAME':
    case 'NS':
    case 'MX':
    case 'TXT':
      return isValidDomain(v) || v.length > 0;
    case 'SRV':
      return v.split(/\s+/).length >= 3;
    default:
      return v.length > 0;
  }
}

// ─── URL Validation ────────────────────────────────────────────────────────

const SAFE_URL_REGEX = /^https?:\/\/.+/i;

export function isValidURL(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return SAFE_URL_REGEX.test(url.trim());
}

/** Validate URL is safe (http/https only, reject javascript:, data:, etc.) */
export function isSafeURL(url: string): boolean {
  const trimmed = (url || '').trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) return false;
  if (trimmed.startsWith('vbscript:')) return false;
  return true;
}

// ─── Numeric Validation ────────────────────────────────────────────────────

export function clampPositive(value: unknown, min = 1, max = Infinity, fallback = 1): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n) || n < min) return fallback;
  return max === Infinity ? Math.floor(n) : Math.min(max, Math.floor(n));
}

export function clampNonNegative(value: unknown, max = Infinity, fallback = 0): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return max === Infinity ? Math.floor(n) : Math.min(max, Math.floor(n));
}

// ─── Gateway IP in Subnet Check ────────────────────────────────────────────

export function isGatewayInSubnet(gateway: string, cidr: string): boolean {
  const network = cidrToNetwork(cidr);
  const broadcast = cidrToBroadcast(cidr);
  if (!network || !broadcast) return false;
  if (!isValidIPv4(gateway)) return false;

  const gwNum = ipToLong(gateway);
  const netNum = ipToLong(network);
  const bcNum = ipToLong(broadcast);

  return gwNum > netNum && gwNum < bcNum;
}

// ─── Path Traversal Prevention ────────────────────────────────────────────

const ALLOWED_SCRIPT_DIR = '/etc/staysuite/scripts/';

export function isSafeScriptPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  const trimmed = path.trim();
  // Reject null bytes
  if (trimmed.includes('\0')) return false;
  // Reject path traversal
  if (trimmed.includes('..')) return false;
  // Must be absolute and within allowed directory
  if (!trimmed.startsWith('/')) return false;
  const resolved = trimmed.replace(/\/+/g, '/');
  return resolved.startsWith(ALLOWED_SCRIPT_DIR) || resolved.startsWith('/tmp/');
}

// ─── LDAP Injection Prevention ────────────────────────────────────────────

export function sanitizeLDAPFilter(value: string): string {
  // Escape LDAP special characters: \ * ( ) NUL
  return value.replace(/[\x00\\*()]/g, (ch) => {
    switch (ch) {
      case '\x00': return '\\00';
      case '\\': return '\\5c';
      case '*': return '\\2a';
      case '(': return '\\28';
      case ')': return '\\29';
      default: return ch;
    }
  });
}

// ─── CSV Safe Escaping (Formula Injection Prevention) ─────────────────────

/**
 * Escape a value for safe CSV output.
 * - Wraps in quotes if contains comma, quote, newline, or tab
 * - Escapes quotes by doubling them
 * - Prepends apostrophe for formula injection (=, +, -, @, tab, CR)
 */
export function csvSafeEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);

  // Prevent CSV formula injection: prepend single quote if starts with dangerous char
  const firstChar = str.charAt(0);
  if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@' ||
      firstChar === '\t' || firstChar === '\r') {
    return "'" + csvWrap(str);
  }

  return csvWrap(str);
}

function csvWrap(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes('\t')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ─── PII Masking ───────────────────────────────────────────────────────────

/** Mask IPv4 address: 192.168.1.100 → 192.168.***.100 */
export function maskIP(ip: string): string {
  if (!ip || typeof ip !== 'string') return ip;
  const trimmed = ip.trim();
  const parts = trimmed.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.${parts[3]}`;
  }
  // IPv6: show first and last 4 chars
  if (trimmed.includes(':')) {
    const segments = trimmed.split(':');
    if (segments.length >= 3) {
      return `${segments[0]}:${segments[1]}:****`;
    }
  }
  return trimmed;
}

/** Mask MAC address: AA:BB:CC:DD:EE:FF → AA:BB:CC:XX:XX:XX */
export function maskMAC(mac: string): string {
  if (!mac || typeof mac !== 'string') return mac;
  const trimmed = mac.trim();
  const parts = trimmed.replace(/[:-]/g, '');
  if (parts.length !== 12) return trimmed;
  const visible = parts.substring(0, 6);
  return visible.replace(/(.{2})/g, '$1:').replace(/:$/, '') + ':XX:XX:XX';
}

/** Mask email: john@example.com → j***@example.com */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return email;
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 1) return trimmed.substring(0, 1) + '***@' + trimmed.substring(atIndex + 1);
  return trimmed[0] + '***@' + trimmed.substring(atIndex + 1);
}

// ─── fetchJSON Helper ──────────────────────────────────────────────────────

export async function fetchJSON<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data: T; status: number }> {
  const res = await fetch(url, options);
  let data: T;
  try {
    data = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return { ok: res.ok, data, status: res.status };
}

// ─── Debounce Helper ───────────────────────────────────────────────────────

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ─── ReDoS Prevention ─────────────────────────────────────────────────────

/** Check if a regex pattern might cause ReDoS (simple heuristic) */
export function isSafeRegex(pattern: string): boolean {
  // Reject patterns with nested quantifiers like (a+)+, (a*)*
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) return false;
  // Reject patterns with overlapping alternations
  if (/(.)\1{2,}/.test(pattern)) return false;
  // Reject empty groups with quantifiers
  if (/\(\)[+*]/.test(pattern)) return false;
  return true;
}

// ─── Email / Phone Validation ──────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

/** International phone: optional +, 6–15 digits, spaces/dashes/dots allowed. */
const PHONE_REGEX = /^\+?[\d][\d\s\-().]{6,18}\d$/;

export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (trimmed.length < 7 || trimmed.length > 20) return false;
  if (!PHONE_REGEX.test(trimmed)) return false;
  // Count digits only — must be 6-15.
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
}

// ─── CSV Export Helpers ────────────────────────────────────────────────────

/** Maximum rows we export in a single CSV download. Larger data sets would
 *  freeze the browser building the string and risk OOM. */
export const CSV_EXPORT_MAX_ROWS = 50_000;

/** Throws / toasts helper: returns true if the dataset is too large to export. */
export function csvExportExceedsLimit(rowCount: number): boolean {
  return rowCount > CSV_EXPORT_MAX_ROWS;
}

// Alias kept for compatibility — task brief refers to `safeCsvEscape`.
export const safeCsvEscape = csvSafeEscape;

// ─── MAC Normalization ─────────────────────────────────────────────────────

/** Normalize a MAC address to canonical AA:BB:CC:DD:EE:FF form.
 *  Accepts colon/hyphen/no-separator variants; uppercases; returns '' if the
 *  input is not a valid 12-hex-digit MAC. */
export function normalizeMAC(input: string): string {
  if (!input || typeof input !== 'string') return '';
  const hex = input.trim().replace(/[:-\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(hex)) return '';
  return hex.match(/.{2}/g)!.join(':');
}

// ─── PII Masking for JSON Payloads ─────────────────────────────────────────

/** Field-name patterns that indicate PII when masking payloads. */
const PII_FIELD_PATTERNS = [
  /^firstName$/i, /^lastName$/i, /^name$/i, /^fullName$/i, /^guestName$/i,
  /^guestFirstName$/i, /^guestLastName$/i, /^guestFullName$/i,
  /^email$/i, /^emailAddress$/i, /^guestEmail$/i,
  /^phone$/i, /^mobile$/i, /^phoneNumber$/i, /^guestPhone$/i, /^mobileNumber$/i,
  /^mac$/i, /^macAddress$/i, /^clientMac$/i, /^stationId$/i,
  /^reservationId$/i, /^bookingId$/i, /^reservationRef$/i, /^bookingRef$/i,
  /^externalReservationId$/i, /^externalRef$/i,
  /^roomNumber$/i, /^room$/i, /^roomNo$/i,
  /^passport$/i, /^passportNumber$/i, /^idNumber$/i, /^nationalId$/i,
  /^address$/i, /^streetAddress$/i, /^postalCode$/i, /^zip$/i,
  /^creditCard$/i, /^cardNumber$/i, /^ccNumber$/i, /^cvv$/i,
  /^ip$/i, /^ipAddress$/i, /^clientIp$/i, /^framedIp$/i, /^framedIpAddress$/i,
  /^dob$/i, /^dateOfBirth$/i,
];

function isPIIField(key: string): boolean {
  return PII_FIELD_PATTERNS.some(p => p.test(key));
}

function maskScalar(key: string, value: string): string {
  if (value == null) return value;
  const s = String(value);
  if (/^[0-9.]+$/.test(s) && s.includes('.')) {
    // Looks like an IP
    return maskIP(s);
  }
  if (/^[0-9a-fA-F:-]{12,17}$/.test(s) && s.includes(':')) {
    return maskMAC(s);
  }
  if (s.includes('@')) {
    return maskEmail(s);
  }
  // Generic PII value mask — preserve length for layout but mask middle chars.
  if (s.length <= 2) return s.charAt(0) + '*';
  if (s.length <= 6) return s.charAt(0) + '*'.repeat(s.length - 2) + s.charAt(s.length - 1);
  return s.substring(0, 2) + '*'.repeat(Math.min(s.length - 4, 8)) + s.substring(s.length - 2);
}

/** Recursively walk an object/array and redact PII fields. Returns a string
 *  representation suitable for display (JSON.stringify with masked values). */
export function maskPII(payload: unknown): string {
  if (payload == null) return '';
  let parsed: unknown;
  if (typeof payload === 'string') {
    try { parsed = JSON.parse(payload); } catch { return payload; }
  } else {
    parsed = payload;
  }
  const redact = (node: unknown): unknown => {
    if (node == null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(redact);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (v != null && typeof v === 'object') {
        out[k] = redact(v);
      } else if (isPIIField(k) && typeof v === 'string' && v.length > 0) {
        out[k] = maskScalar(k, v);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  try {
    return JSON.stringify(redact(parsed), null, 2);
  } catch {
    return String(payload);
  }
}

/** Recursively walk an object/array and redact PII fields. Returns the redacted
 *  object (NOT a string) so callers can use it in API responses. Use this for
 *  DB-level redaction before serializing event payloads to the client. */
export function redactPII<T = unknown>(payload: T): T {
  if (payload == null) return payload;
  let parsed: unknown;
  if (typeof payload === 'string') {
    try { parsed = JSON.parse(payload); } catch { return payload as unknown as T; }
  } else {
    parsed = payload;
  }
  const redact = (node: unknown): unknown => {
    if (node == null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(redact);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (v != null && typeof v === 'object') {
        out[k] = redact(v);
      } else if (isPIIField(k) && typeof v === 'string' && v.length > 0) {
        out[k] = maskScalar(k, v);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  try {
    return redact(parsed) as T;
  } catch {
    return payload;
  }
}

/** Mask a single scalar value (e.g. for top-level event fields like guestName,
 *  roomNumber, externalRef). */
export function maskScalarField(field: string, value: string): string {
  if (!value) return value;
  if (isPIIField(field)) return maskScalar(field, value);
  return value;
}
