/**
 * MikroTik RouterOS Gateway Adapter
 * 
 * MikroTik RouterOS is widely used in hospitality WiFi deployments.
 * This adapter supports:
 * - RADIUS authentication (via FreeRADIUS)
 * - CoA for session management (via radclient through freeradius-service)
 * - REST API for configuration and monitoring
 * 
 * IMPORTANT: All CoA operations go through freeradius-service API (port 3010)
 * because CoA requires the radclient CLI tool. This adapter is a logical wrapper.
 * 
 * References:
 * - https://wiki.mikrotik.com/wiki/Manual:RouterOS_Wireless_CAPsMAN
 * - https://wiki.mikrotik.com/wiki/Manual:Hotspot
 * - https://wiki.mikrotik.com/wiki/Manual:REST_API
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

export interface MikrotikConfig extends GatewayConfig {
  vendor: 'mikrotik';
  // MikroTik-specific settings
  hotspotProfile?: string;
  capsManEnabled?: boolean;
  bridgeName?: string;
  externalPortal?: boolean;
}

/**
 * Helper to make requests to the freeradius-service
 * Used for all CoA operations that require radclient CLI
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
 * MikroTik RADIUS Attributes
 * 
 * Common attributes used by MikroTik RouterOS:
 * - Mikrotik-Rate-Limit: Upload/Download limit from NAS perspective (rx=upload, tx=download) (e.g., "10M/10M")
 * - Mikrotik-Group: User group for hotspot profiles
 * - Mikrotik-Recv-Limit: Receive limit in bytes
 * - Mikrotik-Xmit-Limit: Transmit limit in bytes
 * - Mikrotik-Wireless-Comment: Comment for wireless client
 * - Mikrotik-Wireless-VLANID: VLAN assignment
 */
export class MikrotikAdapter extends GatewayAdapter {
  protected mikrotikConfig: MikrotikConfig;

  constructor(config: MikrotikConfig) {
    super(config);
    this.mikrotikConfig = config;
  }

  getVendor() {
    return 'mikrotik' as const;
  }

  /**
   * Make a REST API call to the MikroTik router
   *
   * MikroTik REST API (RouterOS 7.x) uses JSON endpoints under /rest/.
   * Authentication is via HTTP Basic auth.
   *
   * @param endpoint - REST API path (e.g., '/ip/hotspot/active')
   * @param method - HTTP method (GET, PUT, POST, PATCH, DELETE)
   * @param body - Request body for PUT/POST/PATCH
   */
  private async restApi(endpoint: string, method: string = 'GET', body?: unknown): Promise<unknown> {
    const apiPort = this.config.apiPort || 8081;
    const baseUrl = `http://${this.config.ipAddress}:${apiPort}/rest`;
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiUsername && this.config.apiPassword) {
      headers['Authorization'] = `Basic ${Buffer.from(`${this.config.apiUsername}:${this.config.apiPassword}`).toString('base64')}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`MikroTik REST API ${method} ${endpoint} returned ${response.status}: ${errorText}`);
    }

    // Some endpoints return empty body on success (e.g., PUT /set)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return null;
  }

  /**
   * Test connection to MikroTik router
   * Uses MikroTik REST API at /rest/system/resource
   * Falls back to basic HTTP connectivity check
   */
  async testConnection(): Promise<{ success: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      await this.restApi('/system/resource');
      const latency = Date.now() - startTime;
      return { success: true, latency };
    } catch (error) {
      // If we got a 401/403, the connection itself works
      const latency = Date.now() - startTime;
      if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) {
        return { success: true, latency };
      }
      return {
        success: false,
        latency,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Send CoA (Change of Authorization) to MikroTik
   * 
   * Routes through freeradius-service API which uses radclient CLI.
   * CoA packets are sent to the MikroTik NAS on the CoA port (default 3799).
   * 
   * MikroTik supports CoA via RADIUS on port 3799.
   * Requires hotspot configuration with CoA enabled.
   */
  async sendCoA(request: CoARequest): Promise<CoAResponse> {
    try {
      const coaAttributes = this.buildCoAAttributes(request);

      // Route through freeradius-service which has radclient CLI
      const result = await freeradiusRequest('/api/coa/disconnect', {
        method: 'POST',
        body: JSON.stringify({
          username: request.username,
          sessionId: request.sessionId,
          nasIp: this.config.ipAddress,
          coaPort: this.config.coaPort,
          secret: this.config.coaSecret || this.config.radiusSecret,
          action: request.action,
          attributes: coaAttributes,
        }),
      });

      return {
        success: result.success !== false,
        message: result.message || `CoA ${request.action} sent`,
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
   * Build CoA attributes based on action type
   */
  private buildCoAAttributes(request: CoARequest): Record<string, string> {
    const attrs: Record<string, string> = {
      'User-Name': request.username,
      'Acct-Session-Id': request.sessionId,
    };

    switch (request.action) {
      case 'disconnect':
        // MikroTik uses specific attribute for disconnect
        attrs['Mikrotik-Wireless-Comment'] = 'Session terminated by PMS';
        break;
      case 'reauthorize':
        // Force re-authentication
        attrs['Session-Timeout'] = '0';
        break;
      case 'update':
        // Update session with new attributes
        Object.assign(attrs, request.attributes);
        break;
    }

    return attrs;
  }

  /**
   * Get gateway status from MikroTik REST API
   * Aggregates data from MikroTik API and RADIUS accounting
   */
  async getStatus(): Promise<GatewayStatus> {
    try {
      // Fetch system info and hotspot active users in parallel
      const [sysData, activeUsers, interfaces] = await Promise.allSettled([
        this.restApi('/system/resource') as Promise<Record<string, unknown>>,
        this.restApi('/ip/hotspot/active') as Promise<unknown[]>,
        this.restApi('/interface') as Promise<unknown[]>,
      ]);

      const data = sysData.status === 'fulfilled' ? sysData.value : {};
      const hotspotUsers = activeUsers.status === 'fulfilled' && Array.isArray(activeUsers.value) ? activeUsers.value : [];
      const ifaceList = interfaces.status === 'fulfilled' && Array.isArray(interfaces.value) ? interfaces.value : [];

      // Calculate total traffic from interfaces
      let totalRxBytes = 0;
      let totalTxBytes = 0;
      for (const iface of ifaceList) {
        const i = iface as Record<string, unknown>;
        totalRxBytes += Number(i['rx-byte'] || 0);
        totalTxBytes += Number(i['tx-byte'] || 0);
      }

      return {
        online: true,
        firmwareVersion: (data['version'] as string) || undefined,
        cpuUsage: data['cpu-load'] != null ? Number(data['cpu-load']) : undefined,
        memoryUsage: data['total-memory'] && data['free-memory']
          ? Math.round(((Number(data['total-memory']) - Number(data['free-memory'])) / Number(data['total-memory'])) * 100)
          : undefined,
        uptime: data['uptime'] ? this.parseMikrotikUptime(String(data['uptime'])) : undefined,
        totalClients: hotspotUsers.length,
        lastSeen: new Date(),
        // Add custom data for extended status
        customData: {
          activeHotspotUsers: hotspotUsers.length,
          totalRxBytes,
          totalTxBytes,
          cpuLoad: Number(data['cpu-load'] || 0),
          totalMemory: Number(data['total-memory'] || 0),
          freeMemory: Number(data['free-memory'] || 0),
          uptimeStr: String(data['uptime'] || ''),
          boardName: String(data['board-name'] || ''),
          architecture: String(data['architecture-name'] || ''),
          cpuCount: Number(data['cpu-count'] || 0),
          cpuFrequency: Number(data['cpu-frequency'] || 0),
          version: String(data['version'] || ''),
          interfaces: ifaceList.map((iface) => {
            const i = iface as Record<string, unknown>;
            return {
              name: String(i['name'] || ''),
              type: String(i['type'] || ''),
              running: i['running'] === 'true',
              rxByte: Number(i['rx-byte'] || 0),
              txByte: Number(i['tx-byte'] || 0),
              rxPacket: Number(i['rx-packet'] || 0),
              txPacket: Number(i['tx-packet'] || 0),
              macAddress: String(i['mac-address'] || ''),
            };
          }),
        },
      };
    } catch {
      // Fallback: try to get active sessions count from accounting
      try {
        const accountingResult = await freeradiusRequest('/api/accounting/active?nasIp=' + this.config.ipAddress);
        return {
          online: true,
          totalClients: accountingResult.count || accountingResult.totalActive || 0,
          lastSeen: new Date(),
        };
      } catch {
        // Ignore accounting check failure
      }

      try {
        const accountingResult = await freeradiusRequest('/api/accounting?status=active&nasIp=' + this.config.ipAddress + '&limit=1');
        if (accountingResult.sessions && accountingResult.sessions.length > 0) {
          return {
            online: true,
            totalClients: accountingResult.totalActive || accountingResult.count || 0,
            lastSeen: new Date(),
          };
        }
      } catch {
        // Ignore accounting check failure
      }

      return {
        online: false,
        lastSeen: new Date(),
      };
    }
  }

  /**
   * Get active sessions
   * Parses from RADIUS accounting data (primary source of truth)
   * MikroTik hotspot active list is secondary
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
        nasIpAddress: String(session.nasIpAddress || ''),
        startTime: new Date(String(session.acctStartTime || session.startTime || new Date())),
        duration: Number(session.acctSessionTime || session.sessionTime || 0),
        bytesIn: Number(session.acctInputOctets || session.inputOctets || 0),
        bytesOut: Number(session.acctOutputOctets || session.outputOctets || 0),
        status: 'active' as const,
        apName: String(session.calledStationId || session.apMac || ''),
        vlanId: session.vlanId ? Number(session.vlanId) : undefined,
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
   * Disconnect a session via CoA
   * Proxies to freeradius-service /api/coa/disconnect
   */
  async disconnectSession(sessionId: string, username: string): Promise<CoAResponse> {
    try {
      const result = await freeradiusRequest('/api/coa/disconnect', {
        method: 'POST',
        body: JSON.stringify({
          username,
          sessionId,
          nasIp: this.config.ipAddress,
          coaPort: this.config.coaPort,
          secret: this.config.coaSecret || this.config.radiusSecret,
        }),
      });

      return {
        success: result.success !== false,
        message: result.message || 'Disconnect sent',
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
   * Update bandwidth for a session via CoA
   * Proxies to freeradius-service /api/coa/bandwidth
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
          nasIp: this.config.ipAddress,
          coaPort: this.config.coaPort,
          secret: this.config.coaSecret || this.config.radiusSecret,
          attributes,
        }),
      });

      return {
        success: result.success !== false,
        message: result.message || 'Bandwidth update sent',
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
   * Get MikroTik-specific RADIUS attributes
   * 
   * MikroTik Rate Limit Format:
   * - Simple: "10M" (10 Mbps both ways)
   * - Separate: "10M/5M" (10M rx / 5M tx)
   * - Burst: "10M/10M 20M/20M 5M/5M 10" (limit/burst limit/burst threshold/burst time)
   *
   * In MikroTik NAS context: rx = upload (from client to NAS), tx = download (from NAS to client)
   */
  getRadiusAttributes(policy: BandwidthPolicy): Record<string, string> {
    const attrs = super.getRadiusAttributes(policy);

    // MikroTik-specific rate limit attribute
    const downloadMbps = policy.downloadSpeed / 1000000; // bps to Mbps
    const uploadMbps = policy.uploadSpeed / 1000000;

    // rx=upload(rx from NAS perspective), tx=download(tx from NAS perspective)
    attrs['Mikrotik-Rate-Limit'] = `${uploadMbps}M/${downloadMbps}M`;

    // Data limit
    if (policy.dataLimit && policy.dataLimit > 0) {
      attrs['Mikrotik-Total-Limit'] = String(policy.dataLimit);
    }

    return attrs;
  }

  /**
   * Format bandwidth for MikroTik
   * MikroTik uses: rx-rate/tx-rate (upload/download from NAS perspective)
   */
  formatBandwidthLimit(download: number, upload: number): string {
    const formatRate = (bps: number): string => {
      if (bps >= 1000000000) return `${bps / 1000000000}G`;
      if (bps >= 1000000) return `${bps / 1000000}M`;
      if (bps >= 1000) return `${bps / 1000}k`;
      return String(bps);
    };

    // rx=upload, tx=download from NAS perspective
    return `${formatRate(upload)}/${formatRate(download)}`;
  }

  /**
   * Get MikroTik health check endpoints
   */
  getHealthCheckEndpoints(): string[] {
    return [
      '/rest/system/resource',
      '/rest/ip/hotspot/user/profile',
    ];
  }

  /**
   * Get VLAN attribute for MikroTik
   */
  getVLANAttribute(vlanId: number): Record<string, string> {
    return {
      'Mikrotik-Wireless-VLANID': String(vlanId),
      'Tunnel-Type': 'VLAN',
      'Tunnel-Medium-Type': 'IEEE-802',
      'Tunnel-Private-Group-Id': String(vlanId),
    };
  }

  /**
   * Create MikroTik hotspot user profile attributes
   */
  createHotspotProfile(profileName: string, policy: BandwidthPolicy): Record<string, string> {
    const attrs = this.getRadiusAttributes(policy);
    attrs['Mikrotik-Group'] = profileName;
    return attrs;
  }

  /**
   * Push configuration to MikroTik router via REST API
   *
   * This method uses the MikroTik REST API to actually apply configuration
   * changes to the router, rather than just generating a script.
   *
   * Configuration steps:
   * 1. Update hotspot profile (login URL, RADIUS auth, accounting)
   * 2. Add walled garden entries
   * 3. Enable/configure hotspot
   * 4. Configure RADIUS client
   * 5. Configure CoA port
   * 6. Configure DNS and DHCP (optional)
   */
  async pushConfig(wifiConfig: {
    ssid?: string;
    vlanId?: number;
    captivePortal?: boolean;
    sessionTimeout?: number;
    idleTimeout?: number;
    staySuiteServerIp?: string;
    portalCallbackUrl?: string;
    walledGardenIps?: string[];
    radiusSecret?: string;
    authMethods?: string; // Comma-separated: pap,chap,mschapv2,eap,mac-auth
  }): Promise<{ success: boolean; message: string; details: Record<string, boolean> }> {
    const details: Record<string, boolean> = {};
    const errors: string[] = [];
    const staySuiteIp = wifiConfig.staySuiteServerIp || '10.0.2.2';
    const radiusSecret = wifiConfig.radiusSecret || this.config.radiusSecret || process.env.RADIUS_SECRET || '';
    if (!radiusSecret) {
      console.warn('[CRIT-001] RADIUS_SECRET is not set and no per-NAS secret configured. MikroTik RADIUS provisioning will fail.');
    }

    // ── 1. Update hotspot profile ──
    // MikroTik RouterOS v7 uses 'html-directory-override' for external portal URL
    // (NOT 'login-url' which is not a valid REST API parameter).
    // Set html-directory=none + html-directory-override=<portal URL> for external captive portal.
    try {
      // Get current hotspot profiles
      const profiles = await this.restApi('/ip/hotspot/profile') as Record<string, unknown>[];
      if (profiles && profiles.length > 0) {
        // Prefer updating the "staysuite-hsprof" profile if it exists, else the first profile
        const targetProfile = (profiles as Record<string, unknown>[]).find(
          p => String(p['name'] || '').includes('staysuite')
        ) || profiles[0];
        const profileId = (targetProfile as Record<string, unknown>)['.id'];

        const portalUrl = wifiConfig.portalCallbackUrl
          || `http://${staySuiteIp}:3000/connect?mac=$mac&identity=$identity&ip=$ip`;

        // Convert authMethods (pap,chap,mschapv2,eap-tls,eap-ttls,eap-peap,eap-md5,mac-auth) to MikroTik login-by
        // pap → http-pap, chap → http-chap, mac-auth → mac, eap-*/mschapv2 → RADIUS-level only
        // EAP methods also need http-chap/http-pap for the initial captive portal redirect
        const rawAuthMethods = wifiConfig.authMethods || 'pap,chap,mschapv2';
        const authMethodList = rawAuthMethods.split(',').map(s => s.trim());
        const loginByMethods: string[] = [];
        if (authMethodList.includes('chap')) loginByMethods.push('http-chap');
        if (authMethodList.includes('pap')) loginByMethods.push('http-pap');
        // EAP methods (eap-tls, eap-ttls, eap-peap, eap-md5) are handled at RADIUS level
        // but also need http-chap/http-pap for the initial captive portal redirect
        if (authMethodList.some(m => m.startsWith('eap'))) {
          if (!loginByMethods.includes('http-chap')) loginByMethods.push('http-chap');
          if (!loginByMethods.includes('http-pap')) loginByMethods.push('http-pap');
        }
        if (authMethodList.includes('mac-auth')) loginByMethods.push('mac');
        if (loginByMethods.length === 0) loginByMethods.push('http-chap', 'http-pap');
        const loginBy = loginByMethods.join(',');

        const profileUpdate: Record<string, unknown> = {
          '.id': profileId,
          'html-directory': 'none',
          'html-directory-override': portalUrl,
          'login-by': loginBy,
          'use-radius': 'yes',
          'radius-accounting': 'yes',
        };

        await this.restApi('/ip/hotspot/profile/set', 'POST', profileUpdate);
        details['hotspotProfile'] = true;
      } else {
        details['hotspotProfile'] = false;
        errors.push('No hotspot profile found');
      }
    } catch (err) {
      details['hotspotProfile'] = false;
      errors.push(`Hotspot profile: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 2. Add walled garden entries ──
    try {
      // Get existing walled garden entries to avoid duplicates
      const existingWg = await this.restApi('/ip/hotspot/walled-garden') as Record<string, unknown>[];
      const existingHosts = new Set(
        (existingWg || []).map((e: Record<string, unknown>) => String(e['dst-host'] || ''))
      );

      const walledGardenEntries = [
        ...(wifiConfig.walledGardenIps || []),
        staySuiteIp,
      ];

      for (const host of walledGardenEntries) {
        if (host && !existingHosts.has(host)) {
          await this.restApi('/ip/hotspot/walled-garden/add', 'POST', {
            'dst-host': host,
            'comment': `StaySuite ${host === staySuiteIp ? 'Portal' : 'Whitelisted'}`,
          });
        }
      }
      details['walledGarden'] = true;
    } catch (err) {
      details['walledGarden'] = false;
      errors.push(`Walled garden: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 3. Enable/configure hotspot ──
    try {
      const hotspots = await this.restApi('/ip/hotspot') as Record<string, unknown>[];
      if (hotspots && hotspots.length > 0) {
        // Update existing hotspot
        const hotspotId = (hotspots[0] as Record<string, unknown>)['.id'];
        await this.restApi('/ip/hotspot/set', 'POST', {
          '.id': hotspotId,
          'disabled': 'no',
        });
      }
      // If no hotspot exists, we'd need to create one — but that requires
      // knowing the interface name, so we skip creation and let the admin handle it
      details['hotspot'] = true;
    } catch (err) {
      details['hotspot'] = false;
      errors.push(`Hotspot: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 4. Configure RADIUS client ──
    try {
      const radiusEntries = await this.restApi('/radius') as Record<string, unknown>[];
      const existingStaySuite = (radiusEntries || []).find(
        (e: Record<string, unknown>) => String(e['comment'] || '').includes('StaySuite')
      );

      if (existingStaySuite) {
        // Update existing RADIUS entry
        await this.restApi('/radius/set', 'POST', {
          '.id': (existingStaySuite as Record<string, unknown>)['.id'],
          'address': staySuiteIp,
          'secret': radiusSecret,
          'service': 'hotspot',
          'timeout': '3000ms',
        });
      } else {
        // Add new RADIUS entry
        await this.restApi('/radius/add', 'POST', {
          'address': staySuiteIp,
          'secret': radiusSecret,
          'service': 'hotspot',
          'timeout': '3000ms',
          'comment': 'StaySuite FreeRADIUS',
        });
      }
      details['radius'] = true;
    } catch (err) {
      details['radius'] = false;
      errors.push(`RADIUS: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 5. Configure CoA port ──
    try {
      await this.restApi('/radius/incoming/set', 'POST', {
        'accept': 'yes',
        'port': String(this.config.coaPort || 3799),
      });
      details['coa'] = true;
    } catch (err) {
      details['coa'] = false;
      errors.push(`CoA: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 6. Configure DNS (optional — point to StaySuite for captive portal) ──
    try {
      await this.restApi('/ip/dns/set', 'POST', {
        'allow-remote-requests': 'yes',
      });
      details['dns'] = true;
    } catch (err) {
      details['dns'] = false;
      // DNS config is optional, don't add to errors
    }

    const allSuccess = Object.values(details).every(v => v);
    const successCount = Object.values(details).filter(v => v).length;
    const totalSteps = Object.keys(details).length;

    return {
      success: allSuccess,
      message: allSuccess
        ? `Configuration pushed successfully (${successCount}/${totalSteps} steps completed)`
        : `Partial push: ${successCount}/${totalSteps} steps completed. Errors: ${errors.join('; ')}`,
      details,
    };
  }

  /**
   * Get active hotspot users from MikroTik REST API
   * Returns the list of currently connected hotspot clients
   */
  async getActiveHotspotUsers(): Promise<Record<string, unknown>[]> {
    try {
      const result = await this.restApi('/ip/hotspot/active');
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  /**
   * Get hotspot configuration from MikroTik REST API
   * Returns hotspot server config and profile config
   */
  async getHotspotConfig(): Promise<{
    hotspots: Record<string, unknown>[];
    profiles: Record<string, unknown>[];
  }> {
    try {
      const [hotspots, profiles] = await Promise.all([
        this.restApi('/ip/hotspot'),
        this.restApi('/ip/hotspot/profile'),
      ]);
      return {
        hotspots: Array.isArray(hotspots) ? hotspots : [],
        profiles: Array.isArray(profiles) ? profiles : [],
      };
    } catch {
      return { hotspots: [], profiles: [] };
    }
  }

  /**
   * Get system resource information from MikroTik REST API
   * Reusable method for system info retrieval
   */
  async getSystemInfo(): Promise<unknown> {
    return this.restApi('/system/resource');
  }

  /**
   * Parse MikroTik uptime string (e.g., "10w2d3h4m5s") to seconds
   */
  private parseMikrotikUptime(uptime: string): number {
    let total = 0;
    const weekMatch = uptime.match(/(\d+)w/);
    const dayMatch = uptime.match(/(\d+)d/);
    const hourMatch = uptime.match(/(\d+)h/);
    const minMatch = uptime.match(/(\d+)m(?!s)/);  // m not followed by s
    const secMatch = uptime.match(/(\d+)s/);

    if (weekMatch) total += parseInt(weekMatch[1], 10) * 604800;
    if (dayMatch) total += parseInt(dayMatch[1], 10) * 86400;
    if (hourMatch) total += parseInt(hourMatch[1], 10) * 3600;
    if (minMatch) total += parseInt(minMatch[1], 10) * 60;
    if (secMatch) total += parseInt(secMatch[1], 10);

    return total;
  }
}
