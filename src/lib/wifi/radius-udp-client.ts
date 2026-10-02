/**
 * StaySuite Native RADIUS UDP Client
 *
 * Replaces radclient CLI spawns with persistent UDP socket communication.
 *
 * Performance improvement:
 *   radclient spawn: ~50-100ms per auth (fork + exec + process overhead)
 *   UDP socket:      ~1-3ms per auth (single packet round-trip)
 *
 * Features:
 *   - Persistent UDP socket reused across all requests in same PM2 worker
 *   - Sequential identifier allocation (prevents collision-based timeouts)
 *   - RADIUS packet encoding/decoding (RFC 2865)
 *   - Supports PAP authentication (User-Password attribute)
 *   - Message-Authenticator HMAC-MD5 for EAP compatibility
 */

import { createSocket, Socket } from 'dgram';
import { randomBytes, createHash, createHmac } from 'crypto';

// ─── RADIUS Protocol Constants (RFC 2865) ────────────────────────

const ACCESS_REQUEST = 1;
const ACCESS_ACCEPT = 2;
const ACCESS_REJECT = 3;
const ACCESS_CHALLENGE = 11;

// Attribute types
const ATTR_USER_NAME = 1;
const ATTR_USER_PASSWORD = 2;
const ATTR_NAS_IP_ADDRESS = 4;
const ATTR_NAS_PORT = 5;
const ATTR_NAS_PORT_TYPE = 61;
const ATTR_CALLED_STATION_ID = 30;
const ATTR_NAS_IDENTIFIER = 32;
const ATTR_NAS_PORT_ID = 87;
const ATTR_FRAMED_IP_ADDRESS = 8;
const ATTR_MESSAGE_AUTHENTICATOR = 80;

// ─── Configuration ────────────────────────────────────────────────

const RADIUS_SERVER = process.env.RADIUS_UDP_HOST || '127.0.0.1';
const RADIUS_PORT = parseInt(process.env.RADIUS_UDP_PORT || '1812', 10);
const RADIUS_TIMEOUT_MS = parseInt(process.env.RADIUS_TIMEOUT_MS || '3000', 10);

// ─── RADIUS Packet Encoding ──────────────────────────────────────

interface RadiusAttribute {
  type: number;
  value: Buffer;
}

function encodeAttribute(attr: RadiusAttribute): Buffer {
  const len = 2 + attr.value.length;
  if (len > 255) throw new Error('RADIUS attribute too long: ' + len);
  const buf = Buffer.alloc(len);
  buf.writeUInt8(attr.type, 0);
  buf.writeUInt8(len, 1);
  attr.value.copy(buf, 2);
  return buf;
}

function encodeStringAttr(type: number, value: string): RadiusAttribute {
  return { type, value: Buffer.from(value, 'utf8') };
}

function encodeIpAttr(type: number, ip: string): RadiusAttribute {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => p < 0 || p > 255)) {
    throw new Error('Invalid IP address: ' + ip);
  }
  return { type, value: Buffer.from(parts) };
}

function encodeIntAttr(type: number, value: number): RadiusAttribute {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return { type, value: buf };
}

/**
 * Encrypt User-Password attribute (RFC 2865 Section 5.2).
 */
function encryptUserPassword(password: string, authenticator: Buffer, secret: string): Buffer {
  const pwBuf = Buffer.from(password, 'utf8');
  const paddedLen = Math.max(16, Math.ceil((pwBuf.length + 1) / 16) * 16);
  const padded = Buffer.alloc(paddedLen);
  pwBuf.copy(padded);

  const secretBuf = Buffer.from(secret, 'utf8');
  const result = Buffer.alloc(paddedLen);

  let previous = authenticator;
  for (let i = 0; i < paddedLen; i += 16) {
    const hashInput = Buffer.concat([secretBuf, previous]);
    const hash = createHash('md5').update(hashInput).digest();
    for (let j = 0; j < 16; j++) {
      result[i + j] = padded[i + j] ^ hash[j];
    }
    previous = result.slice(i, i + 16);
  }

  return result;
}

/**
 * Build a complete RADIUS Access-Request packet with a given identifier.
 */
function buildAccessRequest(params: {
  username: string;
  password: string;
  secret: string;
  nasIp: string;
  calledStationId: string;
  nasIdentifier: string;
  clientIp?: string;
  nasPortId?: string;
  identifier: number;
}): Buffer {
  // Generate random 16-byte authenticator
  const authenticator = randomBytes(16);

  // Build attributes
  const attrs: RadiusAttribute[] = [
    encodeStringAttr(ATTR_USER_NAME, params.username),
    { type: ATTR_USER_PASSWORD, value: encryptUserPassword(params.password, authenticator, params.secret) },
    encodeIpAttr(ATTR_NAS_IP_ADDRESS, params.nasIp),
    encodeIntAttr(ATTR_NAS_PORT, 0),
    encodeIntAttr(ATTR_NAS_PORT_TYPE, 19), // Wireless-802.11
  ];

  if (params.calledStationId) {
    attrs.push(encodeStringAttr(ATTR_CALLED_STATION_ID, params.calledStationId));
  }
  if (params.nasIdentifier) {
    attrs.push(encodeStringAttr(ATTR_NAS_IDENTIFIER, params.nasIdentifier));
  }
  if (params.nasPortId) {
    attrs.push(encodeStringAttr(ATTR_NAS_PORT_ID, params.nasPortId));
  }
  if (params.clientIp && params.clientIp !== '0.0.0.0' && params.clientIp !== '127.0.0.1' && params.clientIp !== '::1') {
    try {
      attrs.push(encodeIpAttr(ATTR_FRAMED_IP_ADDRESS, params.clientIp));
    } catch { /* skip invalid IPs */ }
  }

  // Add Message-Authenticator placeholder (16 zero bytes)
  const msgAuthAttr: RadiusAttribute = { type: ATTR_MESSAGE_AUTHENTICATOR, value: Buffer.alloc(16) };
  attrs.push(msgAuthAttr);

  // Encode all attributes
  const attrBuffers = attrs.map(encodeAttribute);
  const totalAttrLen = attrBuffers.reduce((sum, b) => sum + b.length, 0);

  // RADIUS packet: [code:1][identifier:1][length:2][authenticator:16][attributes]
  const packetLen = 1 + 1 + 2 + 16 + totalAttrLen;
  const packet = Buffer.alloc(packetLen);

  packet.writeUInt8(ACCESS_REQUEST, 0);
  packet.writeUInt8(params.identifier & 0xFF, 1); // Use provided identifier
  packet.writeUInt16BE(packetLen, 2);
  authenticator.copy(packet, 4);

  let offset = 20;
  for (const attrBuf of attrBuffers) {
    attrBuf.copy(packet, offset);
    offset += attrBuf.length;
  }

  // Calculate Message-Authenticator HMAC-MD5 over the entire packet
  // with the Message-Authenticator value field set to 16 zero bytes
  const hmac = createHmac('md5', params.secret);
  hmac.update(packet);
  const msgAuthHash = hmac.digest();

  // Write HMAC into the Message-Authenticator value field
  // Position: packetLen - 16 (last 16 bytes of the last attribute)
  // But we need to find the exact position: type(1) + length(1) + value(16) = 18 bytes
  // Value starts at: packetLen - 16
  msgAuthHash.copy(packet, packetLen - 16);

  return packet;
}

/**
 * Parse RADIUS response attributes from a packet.
 */
function parseResponseAttributes(packet: Buffer): Record<string, string> {
  const attrs: Record<string, string> = {};
  let offset = 20;

  while (offset < packet.length) {
    if (offset + 2 > packet.length) break;
    const type = packet.readUInt8(offset);
    const len = packet.readUInt8(offset + 1);
    if (len < 3 || offset + len > packet.length) break;

    const value = packet.slice(offset + 2, offset + len);

    switch (type) {
      case 1: attrs['User-Name'] = value.toString('utf8'); break;
      case 4: if (value.length >= 4) attrs['NAS-IP-Address'] = value[0] + '.' + value[1] + '.' + value[2] + '.' + value[3]; break;
      case 8:
        if (value.length === 4) attrs['Framed-IP-Address'] = value[0] + '.' + value[1] + '.' + value[2] + '.' + value[3];
        break;
      case 11: if (value.length >= 4) attrs['Filter-Id'] = value.toString('utf8'); break;
      case 27: if (value.length >= 4) attrs['Session-Timeout'] = value.readUInt32BE(0).toString(); break;
      case 29: if (value.length >= 4) attrs['Termination-Action'] = value.readUInt32BE(0).toString(); break;
      default:
        try {
          const str = value.toString('utf8');
          if (/^[\x20-\x7e]+$/.test(str)) {
            attrs['Attr-' + type] = str;
          } else {
            attrs['Attr-' + type] = value.toString('hex');
          }
        } catch {
          attrs['Attr-' + type] = value.toString('hex');
        }
    }
    offset += len;
  }
  return attrs;
}

// ─── RADIUS UDP Client ───────────────────────────────────────────

interface PendingRequest {
  resolve: (result: RadiusAuthResult) => void;
  timer: ReturnType<typeof setTimeout>;
  sentAt: number;
}

export interface RadiusAuthResult {
  accepted: boolean;
  replyAttrs: Record<string, string>;
  rejectReason?: string;
}

class RadiusUdpClient {
  private socket: Socket | null = null;
  private pending = new Map<number, PendingRequest>(); // identifier -> pending request
  private nextIdentifier = 0; // Sequential identifier (prevents collisions)
  private secret: string;
  private nasConfig: { calledStationId: string; nasSecret: string; nasIdentifier: string } | null = null;
  private nasConfigTs = 0;
  private nasConfigTtl = 60000;
  private connectPromise: Promise<void> | null = null;
  private initialized = false;

  constructor() {
    this.secret = process.env.RADIUS_SECRET || 'localkey';
  }

  private async ensureSocket(): Promise<void> {
    if (this.socket && this.initialized) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      try {
        const sock = createSocket('udp4');

        sock.on('message', (msg: Buffer) => {
          this.handleResponse(msg);
        });

        sock.on('error', (err: Error) => {
          console.error('[RADIUS-UDP] Socket error:', err.message);
          for (const [id, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.resolve({ accepted: false, replyAttrs: {}, rejectReason: 'RADIUS_SOCKET_ERROR' });
          }
          this.pending.clear();
          this.socket = null;
          this.initialized = false;
        });

        sock.bind(() => {
          this.socket = sock;
          this.initialized = true;
          console.log('[RADIUS-UDP] Socket bound on port', sock.address().port);
          resolve();
        });

        setTimeout(() => {
          if (!this.initialized) {
            sock.close();
            reject(new Error('RADIUS UDP socket bind timeout'));
          }
        }, 5000);
      } catch (err) {
        reject(err);
      }
    });

    this.connectPromise.catch(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  private async getNasConfig(): Promise<{ calledStationId: string; nasSecret: string; nasIdentifier: string }> {
    if (this.nasConfig && (Date.now() - this.nasConfigTs) < this.nasConfigTtl) {
      return this.nasConfig;
    }

    try {
      const { db } = await import('@/lib/db');
      const systemNas = await db.radiusNAS.findFirst({
        where: { ipAddress: '127.0.0.1', status: 'active' },
        select: { calledStationId: true, secret: true, nasIdentifier: true },
      });
      this.nasConfig = {
        calledStationId: systemNas?.calledStationId || '00:00:00:00:00:01',
        nasSecret: systemNas?.secret || process.env.RADIUS_SECRET || 'localkey',
        nasIdentifier: systemNas?.nasIdentifier || 'cryptsk-gateway',
      };
    } catch {
      this.nasConfig = {
        calledStationId: '00:00:00:00:00:01',
        nasSecret: process.env.RADIUS_SECRET || 'localkey',
        nasIdentifier: 'cryptsk-gateway',
      };
    }
    this.nasConfigTs = Date.now();
    return this.nasConfig;
  }

  /**
   * Allocate a unique identifier for a new request.
   * Skips identifiers that are already in use by pending requests.
   */
  private allocateIdentifier(): number {
    for (let i = 0; i < 256; i++) {
      const id = this.nextIdentifier;
      this.nextIdentifier = (this.nextIdentifier + 1) & 0xFF;
      if (!this.pending.has(id)) {
        return id;
      }
    }
    // All 256 identifiers are in use — this is extremely unlikely
    // but handle it by overwriting the oldest pending entry
    const oldestId = this.pending.keys().next().value;
    if (oldestId !== undefined) {
      const old = this.pending.get(oldestId)!;
      clearTimeout(old.timer);
      old.resolve({ accepted: false, replyAttrs: {}, rejectReason: 'RADIUS_ID_EXHAUSTED' });
      this.pending.delete(oldestId);
      return oldestId;
    }
    return this.nextIdentifier++;
  }

  private handleResponse(msg: Buffer): void {
    if (msg.length < 20) return;

    const code = msg.readUInt8(0);
    const identifier = msg.readUInt8(1);
    const length = msg.readUInt16BE(2);

    if (msg.length < length) return;

    const pending = this.pending.get(identifier);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(identifier);

    const elapsed = Date.now() - pending.sentAt;

    if (code === ACCESS_ACCEPT) {
      const replyAttrs = parseResponseAttributes(msg);
      if (elapsed > 100) {
        console.log('[RADIUS-UDP] Accept in ' + elapsed + 'ms for id=' + identifier);
      }
      pending.resolve({ accepted: true, replyAttrs });
    } else if (code === ACCESS_REJECT) {
      const replyAttrs = parseResponseAttributes(msg);
      let rejectReason = 'INVALID_CREDENTIALS';
      const allValues = Object.values(replyAttrs).join(' ');
      if (allValues.includes('Simultaneous-Use') || allValues.includes('simul_count')) {
        rejectReason = 'MAX_SESSIONS_REACHED';
      } else if (allValues.includes('Expiration') || allValues.includes('expired')) {
        rejectReason = 'ACCOUNT_EXPIRED';
      }
      pending.resolve({ accepted: false, replyAttrs, rejectReason });
    } else if (code === ACCESS_CHALLENGE) {
      pending.resolve({ accepted: false, replyAttrs: {}, rejectReason: 'CHALLENGE_REQUIRED' });
    } else {
      pending.resolve({ accepted: false, replyAttrs: {}, rejectReason: 'UNKNOWN_RESPONSE' });
    }
  }

  async authenticate(username: string, password: string, clientIp?: string): Promise<RadiusAuthResult> {
    try {
      await this.ensureSocket();
    } catch (err) {
      console.error('[RADIUS-UDP] Socket init failed:', err instanceof Error ? err.message : String(err));
      return { accepted: false, replyAttrs: {}, rejectReason: 'RADIUS_SOCKET_INIT_ERROR' };
    }

    if (!this.socket) {
      return { accepted: false, replyAttrs: {}, rejectReason: 'RADIUS_SOCKET_ERROR' };
    }

    const nasConfig = await this.getNasConfig();

    // Allocate a unique identifier
    const identifier = this.allocateIdentifier();

    // Build the RADIUS Access-Request packet
    const packet = buildAccessRequest({
      username,
      password,
      secret: nasConfig.nasSecret,
      nasIp: '127.0.0.1',
      calledStationId: nasConfig.calledStationId,
      nasIdentifier: nasConfig.nasIdentifier,
      clientIp: clientIp || undefined,
      nasPortId: clientIp || 'client_' + Date.now(),
      identifier,
    });

    return new Promise<RadiusAuthResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(identifier);
        resolve({ accepted: false, replyAttrs: {}, rejectReason: 'RADIUS_TIMEOUT' });
      }, RADIUS_TIMEOUT_MS);

      this.pending.set(identifier, { resolve, timer, sentAt: Date.now() });

      this.socket!.send(packet, RADIUS_PORT, RADIUS_SERVER, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(identifier);
          resolve({ accepted: false, replyAttrs: {}, rejectReason: 'RADIUS_SEND_ERROR' });
        }
      });
    });
  }

  close(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.initialized = false;
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({ accepted: false, replyAttrs: {}, rejectReason: 'RADIUS_SHUTDOWN' });
    }
    this.pending.clear();
  }
}

// ─── Singleton Instance ──────────────────────────────────────────

const GLOBAL_KEY = '__radiusUdpClient';

function getRadiusUdpClient(): RadiusUdpClient {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new RadiusUdpClient();
    console.log('[RADIUS-UDP] Native RADIUS UDP client initialized');
  }
  return g[GLOBAL_KEY];
}

/**
 * Authenticate via native RADIUS UDP client.
 */
export async function radiusUdpAuth(username: string, password: string, clientIp?: string): Promise<RadiusAuthResult> {
  try {
    const client = getRadiusUdpClient();
    return await client.authenticate(username, password, clientIp);
  } catch (err) {
    console.error('[RADIUS-UDP] Auth failed:', err instanceof Error ? err.message : String(err));
    return { accepted: false, replyAttrs: {}, rejectReason: 'RADIUS_UDP_ERROR' };
  }
}
