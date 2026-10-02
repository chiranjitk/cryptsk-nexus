/**
 * Generic WLC Adapter
 *
 * A minimal adapter implementation for vendors not explicitly supported.
 * Returns offline status for all health/AP/SSID queries since there is
 * no vendor-specific API to call.
 *
 * StaySuite HospitalityOS — WiFi LAN Controller Management Layer
 */

import {
  WlcAdapter,
  WlcConfig,
  WlcHealth,
  WlcAccessPoint,
  WlcSsid,
  WlcRadiusProfile,
} from './wlc-adapter';

export class GenericWlcAdapter extends WlcAdapter {
  constructor(config: WlcConfig) {
    super(config);
    const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.headers['Authorization'] = `Basic ${creds}`;
  }

  getVendor() {
    return 'generic' as const;
  }

  async testConnection(): Promise<WlcHealth> {
    const start = Date.now();
    const res = await this.apiRequest('/');
    return {
      online: res.ok,
      latencyMs: Date.now() - start,
      lastSync: new Date(),
      error: res.ok ? undefined : res.error,
    };
  }

  async getHealth(): Promise<WlcHealth> {
    const start = Date.now();
    return {
      online: false,
      latencyMs: Date.now() - start,
      lastSync: new Date(),
      error: 'Generic adapter does not implement health monitoring',
    };
  }

  async getAccessPoints(): Promise<WlcAccessPoint[]> {
    return [];
  }

  async getSsids(): Promise<WlcSsid[]> {
    return [];
  }

  getDefaultRadiusProfile(): WlcRadiusProfile {
    return {
      id: 'generic-default',
      name: 'Generic Default',
      vendor: 'generic',
      description: 'Default RADIUS VSA profile for generic/unknown WLC vendor. No vendor-specific attributes.',
      attributes: [],
      defaultRole: 'guest',
    };
  }
}