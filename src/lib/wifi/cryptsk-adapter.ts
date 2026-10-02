/**
 * Cryptsk Multimode Gateway Adapter
 *
 * Cryptsk Private Limited (Vendor ID 64179)
 *
 * This adapter is used when Cryptsk HospitalityOS operates in MULTIMODE —
 * acting as BOTH the captive-portal gateway AND the RADIUS server simultaneously.
 *
 * In this mode:
 *   - FreeRADIUS sends Access-Accept with Cryptsk VSA (Vendor 64179)
 *   - The built-in gateway engine enforces bandwidth, data limits, VLAN, etc.
 *   - CoA is handled internally (no external NAS to send packets to)
 *   - Sessions are tracked via radacct + internal gateway state
 *
 * VSA Dictionary: freeradius-install/etc/raddb/dictionary
 *   Cryptsk-Rate-Limit              (1)  string   - "50M/25M"
 *   Cryptsk-Bandwidth-Max-Down      (2)  integer  - bps
 *   Cryptsk-Bandwidth-Max-Up        (3)  integer  - bps
 *   Cryptsk-Total-Limit             (4)  integer  - bytes
 *   Cryptsk-Max-Input-Octets        (5)  integer  - bytes
 *   Cryptsk-Max-Output-Octets       (6)  integer  - bytes
 *   Cryptsk-Session-Timeout         (11) integer  - seconds
 *   Cryptsk-Idle-Timeout            (12) integer  - seconds
 *   Cryptsk-Max-Sessions            (13) integer  - count
 *   Cryptsk-Pool-Name               (21) string
 *   Cryptsk-VLAN-ID                 (22) integer
 *   Cryptsk-FUP-Rate-Limit          (41) string   - "5M/2M"
 *   Cryptsk-FUP-Threshold-Bytes     (42) integer  - bytes
 */

import {
  GatewayAdapter,
  GatewayConfig,
  CoARequest,
  CoAResponse,
  SessionInfo,
  GatewayStatus,
  BandwidthPolicy,
} from './gateway-adapter';

const RADIUS_SERVICE_URL = process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

export interface CryptskConfig extends GatewayConfig {
  vendor: 'cryptsk';
  // Cryptsk multimode-specific settings
  captivePortalEnabled?: boolean;
  portalPort?: number;
  gatewayInterface?: string;
  dhcpEnabled?: boolean;
  natEnabled?: boolean;
}

/**
 * Helper to make requests to the freeradius-service
 * In multimode, CoA is handled via internal API (no external NAS)
 */
async function freeradiusRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${RADIUS_SERVICE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedError;
    try {
      parsedError = JSON.parse(errorBody);
    } catch {
      parsedError = { error: errorBody };
    }
    return { success: false, status: response.status, ...parsedError };
  }

  return response.json();
}

/**
 * Cryptsk Multimode Adapter
 *
 * When Cryptsk operates as both gateway and RADIUS server:
 * - No external NAS to connect to (gateway IS the product)
 * - CoA operations are handled internally via the freeradius-service
 * - All Cryptsk VSA are understood natively by the gateway engine
 */
export class CryptskAdapter extends GatewayAdapter {
  protected cryptskConfig: CryptskConfig;

  constructor(config: CryptskConfig) {
    super(config);
    this.cryptskConfig = config;
  }

  getVendor() {
    return 'cryptsk' as const;
  }

  /**
   * Test connection — in multimode, this checks that FreeRADIUS is running
   * and the internal gateway is operational
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Check FreeRADIUS status
      const result = await freeradiusRequest('/api/status');

      if (result.success || result.running) {
        return {
          success: true,
          latency: Date.now() - startTime,
        };
      }

      return {
        success: false,
        latency: Date.now() - startTime,
        error: 'FreeRADIUS service not responding',
      };
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Send CoA — in multimode, handled internally via FreeRADIUS
   * No external NAS packet needed; FreeRADIUS updates its own session state
   */
  async sendCoA(request: CoARequest): Promise<CoAResponse> {
    try {
      const coaAttributes = this.buildCoAAttributes(request);

      // Internal CoA — goes through freeradius-service
      const result = await freeradiusRequest('/api/coa/disconnect', {
        method: 'POST',
        body: JSON.stringify({
          username: request.username,
          sessionId: request.sessionId,
          nasIp: this.config.ipAddress || '127.0.0.1',
          coaPort: this.config.coaPort || 3799,
          secret: this.config.coaSecret || this.config.radiusSecret,
          action: request.action,
          attributes: coaAttributes,
        }),
      });

      return {
        success: result.success !== false,
        message: result.message || `Cryptsk CoA ${request.action} completed`,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'CoA failed',
      };
    }
  }

  /**
   * Build CoA attributes with Cryptsk VSA
   */
  private buildCoAAttributes(request: CoARequest): Record<string, string> {
    const attrs: Record<string, string> = {
      'User-Name': request.username,
      'Acct-Session-Id': request.sessionId,
    };

    switch (request.action) {
      case 'disconnect':
        attrs['Cryptsk-User-Profile'] = 'disconnected';
        break;
      case 'reauthorize':
        attrs['Session-Timeout'] = '0';
        break;
      case 'update':
        Object.assign(attrs, request.attributes);
        break;
    }

    return attrs;
  }

  /**
   * Get gateway status — in multimode, returns internal service health
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      const result = await freeradiusRequest('/api/status');

      return {
        online: result.success !== false || result.running === true,
        firmwareVersion: result.version || 'Cryptsk Multimode',
        cpuUsage: result.cpuUsage,
        memoryUsage: result.memoryUsage,
        uptime: result.uptime,
        totalClients: result.activeSessions || result.totalActive || 0,
        lastSeen: new Date(),
      };
    } catch {
      return {
        online: false,
        lastSeen: new Date(),
      };
    }
  }

  /**
   * Get active sessions — reads from RADIUS accounting (primary source)
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const result = await freeradiusRequest('/api/accounting?status=active&limit=200');

      if (!result || !result.sessions) {
        return [];
      }

      return (result.sessions || []).map((session: Record<string, unknown>) => ({
        sessionId: String(session.acctSessionId || session.sessionId || ''),
        username: String(session.username || ''),
        ipAddress: String(session.framedIpAddress || session.ipAddress || ''),
        macAddress: String(session.callingStationId || session.macAddress || ''),
        nasIpAddress: String(session.nasIpAddress || '127.0.0.1'),
        startTime: new Date(String(session.acctStartTime || session.startTime || new Date())),
        duration: Number(session.acctSessionTime || session.sessionTime || 0),
        bytesIn: Number(session.acctInputOctets || session.inputOctets || 0),
        bytesOut: Number(session.acctOutputOctets || session.outputOctets || 0),
        status: 'active' as const,
        apName: String(session.calledStationId || session.apMac || 'Cryptsk Gateway'),
        additionalInfo: {
          nasPortId: session.nasPortId,
          connectInfo: session.connectInfo,
        },
      }));
    } catch {
      return [];
    }
  }

  /**
   * Disconnect a session via internal CoA
   */
  async disconnectSession(sessionId: string, username: string): Promise<CoAResponse> {
    try {
      const result = await freeradiusRequest('/api/coa/disconnect', {
        method: 'POST',
        body: JSON.stringify({
          username,
          sessionId,
          nasIp: this.config.ipAddress || '127.0.0.1',
          coaPort: this.config.coaPort || 3799,
          secret: this.config.coaSecret || this.config.radiusSecret,
        }),
      });

      return {
        success: result.success !== false,
        message: result.message || 'Session disconnected via Cryptsk CoA',
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Disconnect failed',
      };
    }
  }

  /**
   * Update bandwidth for a session via internal CoA
   */
  async updateBandwidth(
    sessionId: string,
    username: string,
    policy: BandwidthPolicy
  ): Promise<CoAResponse> {
    const attributes = this.getRadiusAttributes(policy);

    try {
      const result = await freeradiusRequest('/api/coa/bandwidth', {
        method: 'POST',
        body: JSON.stringify({
          username,
          sessionId,
          nasIp: this.config.ipAddress || '127.0.0.1',
          coaPort: this.config.coaPort || 3799,
          secret: this.config.coaSecret || this.config.radiusSecret,
          attributes,
        }),
      });

      return {
        success: result.success !== false,
        message: result.message || 'Bandwidth updated via Cryptsk CoA',
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Bandwidth update failed',
      };
    }
  }

  /**
   * Get Cryptsk-specific RADIUS attributes
   *
   * Cryptsk Rate Limit Format (same as MikroTik for migration compatibility):
   *   "50M/25M" — 50 Mbps down / 25 Mbps up
   *
   * All Cryptsk VSA use Vendor ID 64179 (Cryptsk Private Limited)
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);

    // Cryptsk-specific rate limit (Vendor 64179, Attr 1)
    const downloadMbps = policy.downloadSpeed / 1000000; // bps to Mbps
    const uploadMbps = policy.uploadSpeed / 1000000;

    attrs['Cryptsk-Rate-Limit'] = `${downloadMbps}M/${uploadMbps}M`;

    // Cryptsk bandwidth attrs (Vendor 64179, Attr 2-3)
    attrs['Cryptsk-Bandwidth-Max-Down'] = String(policy.downloadSpeed);
    attrs['Cryptsk-Bandwidth-Max-Up'] = String(policy.uploadSpeed);

    // Data limit (Vendor 64179, Attr 4-6)
    if (policy.dataLimit && policy.dataLimit > 0) {
      attrs['Cryptsk-Total-Limit'] = String(policy.dataLimit);
      attrs['Cryptsk-Max-Input-Octets'] = String(policy.dataLimit);
      attrs['Cryptsk-Max-Output-Octets'] = String(policy.dataLimit);
    }

    // Session timeout (Vendor 64179, Attr 11)
    if (policy.sessionTimeout) {
      attrs['Cryptsk-Session-Timeout'] = String(policy.sessionTimeout);
    }

    return attrs;
  }

  /**
   * Format bandwidth for Cryptsk — "D/U" Mbps format
   */
  formatBandwidthLimit(download: number, upload: number): string {
    const formatRate = (bps: number): string => {
      if (bps >= 1000000000) return `${bps / 1000000000}G`;
      if (bps >= 1000000) return `${bps / 1000000}M`;
      if (bps >= 1000) return `${bps / 1000}k`;
      return String(bps);
    };

    return `${formatRate(download)}/${formatRate(upload)}`;
  }

  /**
   * Get Cryptsk health check endpoints
   */
  getHealthCheckEndpoints(): string[] {
    return [
      '/api/status',
      '/api/accounting?status=active&limit=1',
    ];
  }

  /**
   * Get VLAN attribute for Cryptsk (Vendor 64179, Attr 22)
   */
  getVLANAttribute(vlanId: number): Record<string, string> {
    return {
      'Cryptsk-VLAN-ID': String(vlanId),
      'Tunnel-Type': 'VLAN',
      'Tunnel-Medium-Type': 'IEEE-802',
      'Tunnel-Private-Group-Id': String(vlanId),
    };
  }

  /**
   * Create Cryptsk user profile attributes
   */
  createUserProfile(profileName: string, policy: BandwidthPolicy): Record<string, string> {
    const attrs = this.getRadiusAttributes(policy);
    attrs['Cryptsk-User-Profile'] = profileName;
    return attrs;
  }

  /**
   * Create FUP (Fair Usage Policy) attributes for Cryptsk
   */
  createFUPAttributes(
    postFupDownMbps: number,
    postFupUpMbps: number,
    thresholdBytes: number,
  ): Record<string, string> {
    return {
      'Cryptsk-FUP-Rate-Limit': `${postFupDownMbps}M/${postFupUpMbps}M`,
      'Cryptsk-FUP-Threshold-Bytes': String(thresholdBytes),
    };
  }

  /**
   * Create IP pool assignment attribute
   */
  getPoolAttribute(poolName: string): Record<string, string> {
    return {
      'Cryptsk-Pool-Name': poolName,
    };
  }
}
