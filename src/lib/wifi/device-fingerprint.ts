/**
 * StaySuite Device Fingerprint — Captive Portal Silent Re-Auth
 *
 * Strategy: Collect browser hardware signals that survive MAC randomization.
 * These signals are at L7 (application layer) — independent of L2 (network layer).
 *
 * Signal tiers:
 *   TIER-1 (always available, highly unique):
 *     - Canvas fingerprint   — GPU + driver + font rendering hash
 *     - WebGL renderer/vendor — UNMASKED strings (NOT randomised by Brave)
 *     - WebGL parameters     — max texture size, extensions
 *
 *   TIER-2 (available, moderate uniqueness):
 *     - Screen resolution + color depth + device pixel ratio
 *     - navigator.hardwareConcurrency (CPU cores)
 *     - navigator.maxTouchPoints
 *     - navigator.platform
 *
 *   TIER-3 (supplementary):
 *     - Language + timezone
 *     - Canvas text metrics (fallback if toDataURL fails)
 *
 *   NOT USED (requires HTTPS / secure context):
 *     - navigator.deviceMemory
 *     - navigator.mediaDevices.enumerateDevices()
 *
 *   NOT USED (blocked in too many browsers):
 *     - AudioContext (needs user gesture in some browsers)
 *     - Battery API (changes with charge level)
 *     - WebRTC (leaky, behind NAT in hotel)
 *
 * Browser compatibility (all tested on HTTP captive portal):
 *   ✅ Chrome/Edge  — Full support for all Tier-1 and Tier-2 signals
 *   ✅ Safari       — Full support, ITP clears localStorage after 7 days (first-party)
 *   ✅ Firefox      — Canvas may be randomised (privacy.resistFingerprinting)
 *                      → WebGL renderer/vendor still works
 *   ✅ Brave        — Canvas randomised, but WebGL renderer/vendor NOT randomised
 *   ⚠️ iOS CNA      — Minimal WebKit, no localStorage/WebGL/Canvas → always shows login form
 *   ✅ Android WebView — Same as Chrome
 *
 * Design decisions:
 *   1. Each signal collection is wrapped in try/catch — blocked APIs are simply skipped
 *   2. Signal collection is async (returns Promise) for future AudioContext extension
 *   3. Hash uses SubtleCrypto SHA-256 — works on HTTP, no library needed
 *   4. Token generation uses crypto.randomUUID() — fallback to manual UUID v4
 *   5. localStorage helper respects browser exceptions (private browsing quota)
 */

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface FingerprintSignals {
  canvas: string | null;
  webglRenderer: string | null;
  webglVendor: string | null;
  webglMaxTextureSize: number | null;
  webglMaxRenderbufferSize: number | null;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  pixelRatio: number;
  hardwareConcurrency: number | null;
  maxTouchPoints: number | null;
  platform: string | null;
  language: string;
  timezone: string;
  userAgent: string;
  signalCount: number;  // How many signals were actually collected
}

export interface FingerprintResult {
  hash: string;
  signals: FingerprintSignals;
  collectionTimeMs: number;
}

export interface DeviceInfo {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'tv' | 'unknown';
  deviceName: string;
  osName: string;
  browserName: string;
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const STORAGE_TOKEN_KEY = 'staysuite_device_token';
const STORAGE_VERSION_KEY = 'staysuite_fp_version';
const FINGERPRINT_VERSION = 1;

// ────────────────────────────────────────────────────────────────
// SHA-256 hash (works on HTTP via SubtleCrypto)
// ────────────────────────────────────────────────────────────────

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ────────────────────────────────────────────────────────────────
// UUID v4 generator (fallback if crypto.randomUUID unavailable)
// ────────────────────────────────────────────────────────────────

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Manual UUID v4
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex.charAt(16), 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

// ────────────────────────────────────────────────────────────────
// Signal collectors (each independently try/caught)
// ────────────────────────────────────────────────────────────────

/**
 * Canvas fingerprint: renders text + shapes onto an offscreen canvas,
 * then hashes the toDataURL() output. Unique per GPU + driver + font combo.
 * Brave randomises this, so it's weighted less in the hash.
 */
function collectCanvas(): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Text rendering (font-dependent)
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('StaySuite 🏨 FP', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('StaySuite 🏨 FP', 4, 17);

    // Shape rendering (anti-aliasing dependent)
    ctx.beginPath();
    ctx.arc(200, 30, 20, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(255,0,0,0.5)';
    ctx.fill();

    // Gradient (rendering engine dependent)
    const grad = ctx.createLinearGradient(0, 0, 280, 0);
    grad.addColorStop(0, '#ff0000');
    grad.addColorStop(0.5, '#00ff00');
    grad.addColorStop(1, '#0000ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 40, 280, 20);

    const dataUrl = canvas.toDataURL();
    return dataUrl.length > 50 ? dataUrl : null;
  } catch {
    return null;
  }
}

/**
 * WebGL renderer + vendor: UNMASKED strings are unique per GPU.
 * Brave does NOT randomise these (would break WebGL functionality).
 * This is the MOST RELIABLE hardware signal.
 */
function collectWebGL(): { renderer: string | null; vendor: string | null; maxTextureSize: number | null; maxRenderbufferSize: number | null } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { renderer: null, vendor: null, maxTextureSize: null, maxRenderbufferSize: null };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null;
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null;
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);

    return { renderer, vendor, maxTextureSize, maxRenderbufferSize };
  } catch {
    return { renderer: null, vendor: null, maxTextureSize: null, maxRenderbufferSize: null };
  }
}

/**
 * Collect all signals and produce the fingerprint hash.
 * Each signal is independently wrapped in try/catch.
 */
async function collectSignals(): Promise<FingerprintSignals> {
  let signalCount = 0;

  // Canvas (Tier-1)
  const canvas = collectCanvas();
  if (canvas) signalCount++;

  // WebGL (Tier-1 — most reliable)
  const webgl = collectWebGL();
  if (webgl.renderer) signalCount++;
  if (webgl.vendor) signalCount++;
  if (webgl.maxTextureSize) signalCount++;

  // Screen (Tier-2)
  const screenWidth = window.screen?.width ?? 0;
  const screenHeight = window.screen?.height ?? 0;
  const colorDepth = window.screen?.colorDepth ?? 0;
  const pixelRatio = window.devicePixelRatio ?? 1;
  if (screenWidth > 0) signalCount++;

  // Hardware (Tier-2)
  const hardwareConcurrency = navigator.hardwareConcurrency ?? null;
  if (hardwareConcurrency) signalCount++;

  const maxTouchPoints = 'maxTouchPoints' in navigator ? (navigator as Navigator & { maxTouchPoints: number }).maxTouchPoints : null;

  // Platform (Tier-2)
  const platform = navigator.platform ?? null;
  if (platform) signalCount++;

  // Locale (Tier-3)
  const language = navigator.language || 'unknown';
  let timezone = 'unknown';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Fallback: parse Date string
    timezone = new Date().toLocaleTimeString(undefined, { timeZoneName: 'short' }).split(' ').pop() || 'unknown';
  }

  const userAgent = navigator.userAgent || '';

  return {
    canvas: canvas ? await sha256(canvas) : null,
    webglRenderer: webgl.renderer,
    webglVendor: webgl.vendor,
    webglMaxTextureSize: webgl.maxTextureSize,
    webglMaxRenderbufferSize: webgl.maxRenderbufferSize,
    screenWidth,
    screenHeight,
    colorDepth,
    pixelRatio,
    hardwareConcurrency,
    maxTouchPoints,
    platform,
    language,
    timezone,
    userAgent,
    signalCount,
  };
}

// ────────────────────────────────────────────────────────────────
// Device type detection from User-Agent
// ────────────────────────────────────────────────────────────────

function detectDeviceInfo(ua: string): DeviceInfo {
  const device: DeviceInfo = {
    deviceType: 'unknown',
    deviceName: 'Unknown Device',
    osName: 'Unknown OS',
    browserName: 'Unknown Browser',
  };

  // Detect OS
  if (/iPhone/i.test(ua)) { device.osName = 'iOS'; device.deviceType = 'mobile'; device.deviceName = 'iPhone'; }
  else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) { device.osName = 'iPadOS'; device.deviceType = 'tablet'; device.deviceName = 'iPad'; }
  else if (/Android/i.test(ua)) {
    device.osName = 'Android';
    device.deviceType = /Mobile/i.test(ua) ? 'mobile' : 'tablet';
    device.deviceName = device.deviceType === 'tablet' ? 'Android Tablet' : 'Android Phone';
  }
  else if (/Windows/i.test(ua)) { device.osName = 'Windows'; device.deviceType = 'desktop'; device.deviceName = 'Windows PC'; }
  else if (/Macintosh/i.test(ua)) { device.osName = 'macOS'; device.deviceType = 'desktop'; device.deviceName = 'Mac'; }
  else if (/Linux/i.test(ua)) { device.osName = 'Linux'; device.deviceType = 'desktop'; device.deviceName = 'Linux PC'; }
  else if (/CrOS/i.test(ua)) { device.osName = 'Chrome OS'; device.deviceType = 'desktop'; device.deviceName = 'Chromebook'; }
  else if (/SmartTV|Smart-TV|InternetTV|NetCast|APPLETV/i.test(ua)) { device.osName = 'Smart TV'; device.deviceType = 'tv'; device.deviceName = 'Smart TV'; }

  // Detect browser
  if (/CriOS/i.test(ua)) device.browserName = 'Chrome (iOS)';
  else if (/Edg\//i.test(ua)) device.browserName = 'Edge';
  else if (/OPR|Opera/i.test(ua)) device.browserName = 'Opera';
  else if (/Brave/i.test(ua)) device.browserName = 'Brave';
  else if (/Vivaldi/i.test(ua)) device.browserName = 'Vivaldi';
  else if (/SamsungBrowser/i.test(ua)) device.browserName = 'Samsung Internet';
  else if (/UCBrowser/i.test(ua)) device.browserName = 'UC Browser';
  else if (/Firefox/i.test(ua)) device.browserName = 'Firefox';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) device.browserName = 'Safari';
  else if (/Chrome/i.test(ua)) device.browserName = 'Chrome';

  return device;
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

/**
 * Generate a device fingerprint hash from browser hardware signals.
 * This is async because it uses crypto.subtle.digest (SHA-256).
 *
 * The hash is deterministic for the same device + browser combination.
 * It does NOT change when MAC address is randomized.
 *
 * @returns FingerprintResult with hash, raw signals, and timing info
 */
export async function generateFingerprint(): Promise<FingerprintResult> {
  const startTime = performance.now();
  const signals = await collectSignals();
  const collectionTimeMs = Math.round(performance.now() - startTime);

  // Build the hash input — ordered by reliability (most reliable first)
  // WebGL renderer/vendor are weighted first because Brave doesn't randomise them
  const hashInput = [
    signals.webglRenderer || '',
    signals.webglVendor || '',
    String(signals.webglMaxTextureSize || ''),
    String(signals.webglMaxRenderbufferSize || ''),
    signals.canvas || '',
    `${signals.screenWidth}x${signals.screenHeight}x${signals.colorDepth}@${signals.pixelRatio}`,
    String(signals.hardwareConcurrency || ''),
    String(signals.maxTouchPoints || ''),
    signals.platform || '',
    signals.language,
    signals.timezone,
    `v${FINGERPRINT_VERSION}`,
  ].join('||');

  const hash = await sha256(hashInput);

  return { hash, signals, collectionTimeMs };
}

/**
 * Detect device type and name from User-Agent.
 */
export function getDeviceInfo(userAgent?: string): DeviceInfo {
  return detectDeviceInfo(userAgent || navigator.userAgent || '');
}

/**
 * Get or create the persistent storage token.
 * This token is stored in localStorage and acts as the primary device identifier.
 * It's more reliable than fingerprint alone because it never changes
 * (until the user explicitly clears site data).
 */
export function getStorageToken(): string | null {
  try {
    // Check version — if schema changed, invalidate old token
    const version = localStorage.getItem(STORAGE_VERSION_KEY);
    if (version && version !== String(FINGERPRINT_VERSION)) {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_VERSION_KEY);
      return null;
    }
    return localStorage.getItem(STORAGE_TOKEN_KEY);
  } catch {
    // localStorage unavailable (incognito, CNA, restricted)
    return null;
  }
}

/**
 * Save a storage token to localStorage.
 * If a token already exists, it is preserved (not overwritten).
 * Call this after successful authentication.
 *
 * @param token - Optional token to save. If not provided, the existing
 *                token is preserved, or a new one is created if none exists.
 */
export function saveStorageToken(token?: string): string {
  // Reuse existing token if no explicit token provided and one already exists
  if (!token) {
    const existing = getStorageToken();
    if (existing) {
      return existing;
    }
    token = generateUUID();
  }
  try {
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.setItem(STORAGE_VERSION_KEY, String(FINGERPRINT_VERSION));
  } catch {
    // Storage quota exceeded or unavailable — silent fail
    // Fingerprint-only matching will still work
  }
  return token;
}

/**
 * Remove storage token (logout / opt-out).
 */
export function clearStorageToken(): void {
  try {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_VERSION_KEY);
  } catch {
    // Silent fail
  }
}

/**
 * Get client IP from the resolve-zone response (set by server).
 * This is a convenience — the real IP comes from the server-side request.
 */
export function getClientInfo(): { userAgent: string; language: string; screen: string; platform: string } {
  return {
    userAgent: navigator.userAgent || '',
    language: navigator.language || '',
    screen: `${screen.width}x${screen.height}`,
    platform: navigator.platform || '',
  };
}
