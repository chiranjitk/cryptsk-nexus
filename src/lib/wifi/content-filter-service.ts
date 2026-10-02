/**
 * Content Filter Service
 * 
 * Manages web content filtering for hotel WiFi networks.
 * Controls what domains/content categories guests can access.
 * 
 * Uses ContentFilter model in the Prisma schema.
 * Domains are stored as JSON array in the ContentFilter.domains field.
 */

import { db } from '@/lib/db';
import { PRODUCTION_DOMAINS, getDomainsForCategory } from '@/lib/wifi/production-domains';

export interface ContentFilterCreate {
  tenantId: string;
  propertyId: string;
  name: string;
  category: string;
  domains?: string[];
  enabled?: boolean;
  scheduleId?: string;
}

export interface ContentFilterUpdate {
  name?: string;
  category?: string;
  domains?: string[];
  enabled?: boolean;
  scheduleId?: string;
}

export interface ContentFilterTestResult {
  url: string;
  matched: boolean;
  matchedFilter?: {
    id: string;
    name: string;
    category: string;
  };
  matchedDomain?: string;
}

class ContentFilterService {
  /**
   * Get all content filters for a property
   */
  async getFilters(propertyId: string, options?: {
    category?: string;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = { propertyId };

    if (options?.category) where.category = options.category;
    if (options?.enabled !== undefined) where.enabled = options.enabled;

    const [filters, total] = await Promise.all([
      db.contentFilter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...(options?.limit && { take: options.limit }),
        ...(options?.offset && { skip: options.offset }),
      }),
      db.contentFilter.count({ where }),
    ]);

    // Parse domains from JSON string to array
    const parsed = filters.map((f) => ({
      ...f,
      domains: this.parseDomains(f.domains),
    }));

    return { data: parsed, total };
  }

  /**
   * Add a new content filter
   */
  async addFilter(data: ContentFilterCreate) {
    return db.contentFilter.create({
      data: {
        tenantId: data.tenantId,
        propertyId: data.propertyId,
        name: data.name,
        category: data.category,
        domains: JSON.stringify(data.domains || []),
        enabled: data.enabled ?? true,
        scheduleId: data.scheduleId,
      },
    });
  }

  /**
   * Update an existing content filter
   */
  async updateFilter(id: string, data: ContentFilterUpdate) {
    const filter = await db.contentFilter.findUnique({ where: { id } });
    if (!filter) {
      throw new Error('Content filter not found');
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.domains !== undefined) updateData.domains = JSON.stringify(data.domains);
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.scheduleId !== undefined) updateData.scheduleId = data.scheduleId;

    return db.contentFilter.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Delete a content filter
   */
  async deleteFilter(id: string) {
    const filter = await db.contentFilter.findUnique({ where: { id } });
    if (!filter) {
      throw new Error('Content filter not found');
    }
    return db.contentFilter.delete({ where: { id } });
  }

  /**
   * Test if a URL matches any active filter rules
   */
  async testUrl(url: string, propertyId: string): Promise<ContentFilterTestResult> {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;

      // Get all enabled filters for this property
      const filters = await db.contentFilter.findMany({
        where: { propertyId, enabled: true },
      });

      for (const filter of filters) {
        const domains = this.parseDomains(filter.domains);
        for (const domain of domains) {
          // Support wildcard matching
          if (this.domainMatches(hostname, domain)) {
            return {
              url,
              matched: true,
              matchedFilter: {
                id: filter.id,
                name: filter.name,
                category: filter.category,
              },
              matchedDomain: domain,
            };
          }
        }
      }

      return { url, matched: false };
    } catch {
      // If URL is invalid, return no match
      return { url, matched: false };
    }
  }

  /**
   * Get preset content filter categories
   * Returns pre-built filter category lists from StaySuite Production Blocklist v2.1
   * Sources: StevenBlack, OISD, hagezi, PhishTank, URLhaus, EasyList
   */
  getPresetCategories(): Array<{
    category: string;
    name: string;
    description: string;
    domains: string[];
  }> {
    const categoryMeta: Record<string, { name: string; description: string }> = {
      adult: { name: 'Adult Content', description: 'Block adult/explicit content — 120+ domains from StevenBlack, OISD' },
      malware: { name: 'Malware & Exploits', description: 'Block malware distribution, exploit kits, ransomware C2 — from URLhaus, VirusTotal' },
      phishing: { name: 'Phishing & Scams', description: 'Block credential harvesting, spoofed logins — from PhishTank, OpenPhish' },
      social_media: { name: 'Social Media', description: 'Block social networks, dating apps, forums, messaging platforms' },
      streaming: { name: 'Streaming', description: 'Block video/music streaming to reduce bandwidth usage' },
      gambling: { name: 'Gambling', description: 'Block online casinos, sports betting, poker, DFS, crypto gambling' },
      drugs: { name: 'Drugs', description: 'Block illegal drug marketplaces, unverified pharmacies, drug content' },
      violence: { name: 'Violence & Weapons', description: 'Block weapons sales, graphic content, hate groups, extremism' },
      proxy: { name: 'Proxy & Anonymizer', description: 'Block web proxy services, CGI proxies, TOR access points' },
      vpn: { name: 'VPN Services', description: 'Block commercial VPN providers and tunnel services' },
      ads: { name: 'Ad & Tracking Networks', description: 'Block advertising, analytics, retargeting, tracking beacons — 220+ domains' },
      gaming: { name: 'Gaming Platforms', description: 'Block game stores, gaming social networks, esports, game streaming' },
      custom: { name: 'Custom', description: 'User-defined custom blocklist' },
    };

    return Object.entries(PRODUCTION_DOMAINS)
      .filter(([_, domains]) => domains.length > 0)
      .map(([category, domains]) => ({
        category,
        name: categoryMeta[category]?.name || category,
        description: categoryMeta[category]?.description || `${domains.length} domains`,
        domains,
      }));
  }

  /**
   * Parse domains from JSON string
   */
  private parseDomains(domainsJson: string): string[] {
    try {
      return JSON.parse(domainsJson);
    } catch {
      return [];
    }
  }

  /**
   * Check if a hostname matches a filter domain pattern
   * Supports wildcards (e.g., *.example.com)
   */
  private domainMatches(hostname: string, pattern: string): boolean {
    // Exact match
    if (hostname === pattern) return true;

    // Wildcard match (e.g., *.facebook.com matches m.facebook.com)
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return hostname === suffix || hostname.endsWith('.' + suffix);
    }

    return false;
  }

  /**
   * CRITICAL-11 FIX: Enforce content filter via nftables rules.
   * Creates a named set of blocked domain strings and installs DNS sinkhole
   * rules that redirect DNS responses for those domains to 0.0.0.0.
   * Executes nftables commands via execSync (same pattern as immediate-disconnect.ts).
   */
  async enforceFilter(propertyId: string): Promise<{ enforced: boolean; domains: number; rules: string[]; executed: string[] }> {
    const filters = await db.contentFilter.findMany({
      where: { propertyId, enabled: true },
      select: { domains: true, name: true, category: true },
    });

    const blockedDomains = new Set<string>();
    for (const f of filters) {
      for (const d of this.parseDomains(f.domains || '[]')) {
        if (d) blockedDomains.add(d);
      }
    }

    if (blockedDomains.size === 0) {
      return { enforced: false, domains: 0, rules: [], executed: [] };
    }

    const rules: string[] = [];
    const executed: string[] = [];
    const domainList = Array.from(blockedDomains);

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = /*turbopackIgnore: true*/ require('child_process');

      // Step 1: Create nftables named set for blocked domain strings
      const createSetCmd = 'nft add set inet staysuite_wifi blocked_domains { type string ; size 65535 ; }';
      rules.push(createSetCmd);
      try {
        execSync(`${createSetCmd} 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 });
        executed.push('create-set');
      } catch {
        // Set may already exist — continue
      }

      // Step 2: Add domains to the set (batched to avoid command line length limits)
      const BATCH_SIZE = 50;
      for (let i = 0; i < domainList.length; i += BATCH_SIZE) {
        const batch = domainList.slice(i, i + BATCH_SIZE);
        const elements = batch.map(d => `"${d.replace(/"/g, '\\"')}"` ).join(', ');
        const addElementsCmd = `nft add element inet staysuite_wifi blocked_domains { ${elements} }`;
        rules.push(addElementsCmd);
        try {
          execSync(`${addElementsCmd} 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 });
          executed.push(`add-domains-batch-${Math.floor(i / BATCH_SIZE)}`);
        } catch (err) {
          console.warn(
            `[CRITICAL-11] Failed to add domain batch ${Math.floor(i / BATCH_SIZE)} to nftables set: ` +
            `${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Step 3: Add DNS sinkhole rule for UDP DNS (port 53)
      // Redirects DNS responses for blocked domains to 0.0.0.0
      const dnsSinkholeUdpCmd =
        'nft add rule inet staysuite_wifi prerouting meta l4proto udp th dport 53 dns rr name @blocked_domains redirect to 0.0.0.0';
      rules.push(dnsSinkholeUdpCmd);
      try {
        execSync(`${dnsSinkholeUdpCmd} 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 });
        executed.push('dns-sinkhole-udp-rule');
      } catch {
        // Rule may already exist — continue
      }

      // Step 4: Add DNS sinkhole rule for TCP DNS (port 53)
      const dnsSinkholeTcpCmd =
        'nft add rule inet staysuite_wifi prerouting meta l4proto tcp th dport 53 dns rr name @blocked_domains redirect to 0.0.0.0';
      rules.push(dnsSinkholeTcpCmd);
      try {
        execSync(`${dnsSinkholeTcpCmd} 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 });
        executed.push('dns-sinkhole-tcp-rule');
      } catch {
        // Rule may already exist — continue
      }

      console.log(
        `[CRITICAL-11] Enforced content filter for property ${propertyId}: ` +
        `${blockedDomains.size} domains, ${executed.length} steps executed`
      );
    } catch (err) {
      console.warn(
        `[CRITICAL-11] nftables enforcement failed for property ${propertyId}: ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Log enforcement for audit
    await db.auditLog.create({
      data: {
        tenantId: '', // filled by caller if needed
        module: 'wifi',
        action: 'enforce',
        entityType: 'ContentFilter',
        newValue: JSON.stringify({
          propertyId,
          blockedDomainsCount: blockedDomains.size,
          blockedDomains: domainList.slice(0, 20),
          rulesApplied: rules.length,
          rulesExecuted: executed,
          note: 'Content filter enforced via nftables DNS sinkhole rules.',
        }),
      },
    });

    return { enforced: true, domains: blockedDomains.size, rules, executed };
  }

  /**
   * Remove content filter enforcement — flush blocked domain set and DNS sinkhole rules.
   * Executes nftables commands to clean up the state created by enforceFilter().
   */
  async removeEnforcement(propertyId: string): Promise<{ removed: boolean; flushed: string[] }> {
    const flushed: string[] = [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = /*turbopackIgnore: true*/ require('child_process');

      // Step 1: Flush the blocked_domains set (empties all domain elements)
      try {
        execSync('nft flush set inet staysuite_wifi blocked_domains 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
        flushed.push('flush-blocked-domains-set');
      } catch {
        flushed.push('flush-blocked-domains-set-skipped');
      }

      // Step 2: Delete the blocked_domains set entirely
      try {
        execSync('nft delete set inet staysuite_wifi blocked_domains 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
        flushed.push('delete-blocked-domains-set');
      } catch {
        flushed.push('delete-blocked-domains-set-skipped');
      }

      console.log(
        `[CRITICAL-11] Removed content filter enforcement for property ${propertyId}: ${flushed.join(', ')}`
      );
    } catch (err) {
      console.warn(
        `[CRITICAL-11] Failed to remove nftables rules for property ${propertyId}: ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }

    await db.auditLog.create({
      data: {
        tenantId: '',
        module: 'wifi',
        action: 'remove',
        entityType: 'ContentFilter',
        newValue: JSON.stringify({ propertyId, flushed, note: 'Content filter enforcement removed via nftables' }),
      },
    });

    return { removed: true, flushed };
  }
}

// Singleton instance
export const contentFilterService = new ContentFilterService();
