/**
 * Portal Whitelist Service
 * 
 * Manages the captive portal whitelist — domains that guests can access
 * without authentication. Typically includes hotel services, emergency contacts,
 * and essential information.
 * 
 * Uses PortalWhitelist model in the Prisma schema.
 */

import { db } from '@/lib/db';

export interface WhitelistEntryCreate {
  propertyId: string;
  domain: string;
  path?: string;
  description?: string;
  protocol?: 'http' | 'https' | 'both';
  bypassAuth?: boolean;
  priority?: number;
  status?: string;
}

export interface WhitelistEntryUpdate {
  domain?: string;
  path?: string;
  description?: string;
  protocol?: 'http' | 'https' | 'both';
  bypassAuth?: boolean;
  priority?: number;
  status?: string;
}

class PortalWhitelistService {
  /**
   * Get all whitelist entries for a property
   */
  async getWhitelist(propertyId: string, options?: {
    status?: string;
    protocol?: string;
    bypassAuth?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = { propertyId };

    if (options?.status) where.status = options.status;
    if (options?.protocol) where.protocol = options.protocol;
    if (options?.bypassAuth !== undefined) where.bypassAuth = options.bypassAuth;

    const [entries, total] = await Promise.all([
      db.portalWhitelist.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { domain: 'asc' }],
        ...(options?.limit && { take: options.limit }),
        ...(options?.offset && { skip: options.offset }),
      }),
      db.portalWhitelist.count({ where }),
    ]);

    return { data: entries, total };
  }

  /**
   * Add a new whitelist entry
   */
  async addWhitelistEntry(data: WhitelistEntryCreate) {
    return db.portalWhitelist.create({
      data: {
        propertyId: data.propertyId,
        domain: data.domain.toLowerCase().trim(),
        path: data.path || null,
        description: data.description,
        protocol: data.protocol || 'https',
        bypassAuth: data.bypassAuth ?? true,
        priority: data.priority || 0,
        status: data.status || 'active',
      },
    });
  }

  /**
   * Update an existing whitelist entry
   */
  async updateWhitelistEntry(id: string, data: WhitelistEntryUpdate) {
    const entry = await db.portalWhitelist.findUnique({ where: { id } });
    if (!entry) {
      throw new Error('Whitelist entry not found');
    }

    const updateData: Record<string, unknown> = {};
    if (data.domain !== undefined) updateData.domain = data.domain.toLowerCase().trim();
    if (data.path !== undefined) updateData.path = data.path;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.protocol !== undefined) updateData.protocol = data.protocol;
    if (data.bypassAuth !== undefined) updateData.bypassAuth = data.bypassAuth;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.status !== undefined) updateData.status = data.status;

    return db.portalWhitelist.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Delete a whitelist entry
   */
  async deleteWhitelistEntry(id: string) {
    const entry = await db.portalWhitelist.findUnique({ where: { id } });
    if (!entry) {
      throw new Error('Whitelist entry not found');
    }
    return db.portalWhitelist.delete({ where: { id } });
  }

  /**
   * Get preset hotel services for quick whitelisting
   * Returns common hotel-related domains that should be accessible without auth
   */
  getPresetServices(): Array<{
    domain: string;
    description: string;
    category: string;
    bypassAuth: boolean;
    protocol: string;
  }> {
    return [
      // Hotel own services
      { domain: '{hotel_domain}', description: 'Hotel Website', category: 'hotel', bypassAuth: true, protocol: 'both' },
      { domain: '{hotel_domain}', path: '/booking', description: 'Hotel Booking Engine', category: 'hotel', bypassAuth: true, protocol: 'https' },
      { domain: '{hotel_domain}', path: '/wifi', description: 'Hotel WiFi Portal', category: 'hotel', bypassAuth: true, protocol: 'https' },

      // Booking & payment
      { domain: 'booking.com', description: 'Booking.com', category: 'booking', bypassAuth: true, protocol: 'https' },
      { domain: 'expedia.com', description: 'Expedia', category: 'booking', bypassAuth: true, protocol: 'https' },
      { domain: 'hotels.com', description: 'Hotels.com', category: 'booking', bypassAuth: true, protocol: 'https' },
      { domain: 'agoda.com', description: 'Agoda', category: 'booking', bypassAuth: true, protocol: 'https' },
      { domain: 'airbnb.com', description: 'Airbnb', category: 'booking', bypassAuth: true, protocol: 'https' },

      // Payment
      { domain: 'paypal.com', description: 'PayPal', category: 'payment', bypassAuth: true, protocol: 'https' },
      { domain: 'stripe.com', description: 'Stripe Payments', category: 'payment', bypassAuth: true, protocol: 'https' },
      { domain: 'visa.com', description: 'Visa Verification', category: 'payment', bypassAuth: true, protocol: 'https' },
      { domain: 'mastercard.com', description: 'Mastercard SecureCode', category: 'payment', bypassAuth: true, protocol: 'https' },

      // Maps & navigation
      { domain: 'maps.google.com', description: 'Google Maps', category: 'navigation', bypassAuth: true, protocol: 'https' },
      { domain: 'maps.apple.com', description: 'Apple Maps', category: 'navigation', bypassAuth: true, protocol: 'https' },
      { domain: 'map.baidu.com', description: 'Baidu Maps', category: 'navigation', bypassAuth: true, protocol: 'https' },

      // Transport
      { domain: 'uber.com', description: 'Uber', category: 'transport', bypassAuth: true, protocol: 'https' },
      { domain: 'lyft.com', description: 'Lyft', category: 'transport', bypassAuth: true, protocol: 'https' },
      { domain: 'grab.com', description: 'Grab', category: 'transport', bypassAuth: true, protocol: 'https' },

      // Airlines
      { domain: 'checkin航空公司.com', description: 'Airline Check-in', category: 'travel', bypassAuth: true, protocol: 'https' },

      // Email (for work travelers)
      { domain: 'mail.google.com', description: 'Gmail', category: 'communication', bypassAuth: true, protocol: 'https' },
      { domain: 'outlook.live.com', description: 'Outlook', category: 'communication', bypassAuth: true, protocol: 'https' },

      // Emergency & essential
      { domain: 'who.int', description: 'World Health Organization', category: 'essential', bypassAuth: true, protocol: 'https' },
      { domain: 'cdc.gov', description: 'CDC', category: 'essential', bypassAuth: true, protocol: 'https' },
      { domain: 'google.com', description: 'Google Search (Limited)', category: 'essential', bypassAuth: true, protocol: 'https' },
    ];
  }

  /**
   * Export whitelist as DNS redirect configuration
   * Generates nftables-compatible DNS redirect rules for the captive portal
   */
  async exportAsDnsConfig(propertyId: string): Promise<{
    format: string;
    entries: Array<{
      domain: string;
      action: string;
      redirectIp: string;
    }>;
    rawConfig: string;
  }> {
    const { data: entries } = await this.getWhitelist(propertyId, { status: 'active' });

    const redirectIp = '10.0.0.1'; // Captive portal IP
    const dnsEntries = entries.map((entry) => ({
      domain: entry.domain,
      action: 'redirect',
      redirectIp,
    }));

    // Generate DNS redirect configuration
    // Format compatible with dnsmasq address directive
    const lines = ['# Portal Whitelist DNS Config', `# Property: ${propertyId}`, `# Generated: ${new Date().toISOString()}`, ''];

    for (const entry of entries) {
      if (entry.bypassAuth) {
        lines.push(`# ${entry.description || entry.domain} - bypass auth`);
        if (entry.protocol === 'http' || entry.protocol === 'both') {
          lines.push(`address=/${entry.domain}/${redirectIp}`);
        }
        if (entry.protocol === 'https' || entry.protocol === 'both') {
          lines.push(`address=/${entry.domain}/${redirectIp}`);
        }
      }
    }

    return {
      format: 'dnsmasq-address',
      entries: dnsEntries,
      rawConfig: lines.join('\n'),
    };
  }
}

// Singleton instance
export const portalWhitelistService = new PortalWhitelistService();
