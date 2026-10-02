import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth/tenant-context';

/**
 * POST /api/wifi/portal/test-lookup
 *
 * Admin debug tool — tests which portal a given client IP would resolve to.
 * Requires wifi.manage permission. Useful for verifying IP Pool → Portal Mappings.
 *
 * Body: { ip?: string }  — if omitted, uses the request's own client IP
 */
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const testIp = body.ip?.trim();

    // Use provided IP or extract from request headers
    let clientIp: string | null = null;
    if (testIp) {
      clientIp = testIp;
    } else {
      const xff = request.headers.get('x-forwarded-for');
      if (xff) clientIp = xff.split(',')[0].trim();
      if (!clientIp) clientIp = request.headers.get('x-real-ip')?.trim() || null;
    }

    if (!clientIp) {
      return NextResponse.json({
        success: false,
        error: { code: 'NO_IP', message: 'No client IP provided or detected' },
      }, { status: 400 });
    }

    // Validate IPv4 format
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clientIp)) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_IP', message: `Invalid IPv4 address: ${clientIp}` },
      }, { status: 400 });
    }

    const tenantId = user.tenantId;
    const results: Record<string, unknown>[] = [];

    // ── Step 1: Check PortalMapping subnet CIDR match ──
    const cidrMatches = await db.$queryRaw(Prisma.sql`
      SELECT pm.id, pm."portalId", pm.subnet, pm."ipPoolId", pm."fallbackPortalId", pm.priority,
             cp.name as "portalName", cp.enabled as "portalEnabled", cp."isDefault",
             ip.name as "poolName", ip.subnet::text as "poolSubnet"
      FROM "PortalMapping" pm
      JOIN "CaptivePortal" cp ON cp.id = pm."portalId"
      LEFT JOIN "IpPool" ip ON ip.id = pm."ipPoolId"
      WHERE pm.enabled = true
        AND pm.subnet IS NOT NULL
        AND (pm."tenantId" = ${tenantId}::uuid)
        AND pm.subnet ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+(/\\d+)?$'
        AND ${clientIp}::inet <<= CASE
          WHEN pm.subnet ~ '/' THEN pm.subnet::inet
          ELSE (pm.subnet || '/32')::inet
        END
      ORDER BY pm.priority DESC
      LIMIT 5
    `) as any[];

    results.push({
      step: '1 - CIDR Subnet Match (PortalMapping.subnet)',
      matches: cidrMatches.map((m: any) => ({
        mappingId: m.id,
        portalId: m.portalId,
        portalName: m.portalName,
        portalEnabled: m.portalEnabled,
        ipPoolId: m.ipPoolId,
        poolName: m.poolName,
        mappingSubnet: m.subnet,
        poolSubnet: m.poolSubnet,
        priority: m.priority,
        isDefault: m.isDefault,
      })),
    });

    // ── Step 2: Check IpPool + IpPoolRange match ──
    const rangeMatches = await db.$queryRaw(Prisma.sql`
      SELECT pm.id, pm."portalId", pm.subnet, pm."ipPoolId", pm."fallbackPortalId", pm.priority,
             cp.name as "portalName", cp.enabled as "portalEnabled",
             ip.name as "poolName", ip.subnet::text as "poolSubnet", ip.enabled as "poolEnabled",
             ipr."startIp"::text as "rangeStart", ipr."endIp"::text as "rangeEnd"
      FROM "PortalMapping" pm
      JOIN "CaptivePortal" cp ON cp.id = pm."portalId"
      LEFT JOIN "IpPool" ip ON (
        (pm."ipPoolId" IS NOT NULL AND ip.id = pm."ipPoolId")
        OR (
          pm."ipPoolId" IS NULL
          AND (
            ip.subnet::text = pm.subnet
            OR (ip.subnet IS NOT NULL AND pm.subnet IS NOT NULL
                AND replace(ip.subnet::text, '/32', '') = pm.subnet)
            OR (ip.subnet IS NOT NULL AND pm.subnet IS NOT NULL
                AND ip.subnet::text = replace(pm.subnet, '/32', ''))
            OR (pm.subnet IS NULL AND ip.subnet IS NULL)
          )
          AND ip."tenantId" = pm."tenantId"
        )
      )
      LEFT JOIN "IpPoolRange" ipr ON ipr."poolId" = ip.id
      WHERE pm.enabled = true
        AND (pm."tenantId" = ${tenantId}::uuid)
        AND (
          (ipr.id IS NOT NULL AND ${clientIp}::inet BETWEEN ipr."startIp" AND ipr."endIp")
          OR (ipr.id IS NULL AND ip.subnet IS NOT NULL AND ${clientIp}::inet <<= ip.subnet)
        )
      ORDER BY pm.priority DESC
      LIMIT 5
    `) as any[];

    results.push({
      step: '2 - IP Pool Range Match (ipPoolId FK + IpPoolRange)',
      matches: rangeMatches.map((m: any) => ({
        mappingId: m.id,
        portalId: m.portalId,
        portalName: m.portalName,
        portalEnabled: m.portalEnabled,
        ipPoolId: m.ipPoolId,
        poolName: m.poolName,
        poolSubnet: m.poolSubnet,
        poolEnabled: m.poolEnabled,
        mappingSubnet: m.subnet,
        rangeStart: m.rangeStart,
        rangeEnd: m.rangeEnd,
        priority: m.priority,
      })),
    });

    // ── Step 3: Check default portal ──
    const defaultPortal = await db.captivePortal.findFirst({
      where: { isDefault: true, enabled: true, tenantId },
      select: { id: true, name: true, slug: true },
    });

    results.push({
      step: '3 - Default Portal (isDefault=true)',
      defaultPortal: defaultPortal || 'None configured',
    });

    // ── All mappings for this tenant (for admin reference) ──
    const allMappings = await db.$queryRaw(Prisma.sql`
      SELECT pm.id, pm."portalId", pm.subnet, pm."ipPoolId", pm.enabled, pm.priority,
             cp.name as "portalName", cp.enabled as "portalEnabled",
             ip.name as "poolName", ip.subnet::text as "poolSubnet"
      FROM "PortalMapping" pm
      JOIN "CaptivePortal" cp ON cp.id = pm."portalId"
      LEFT JOIN "IpPool" ip ON ip.id = pm."ipPoolId"
      WHERE pm."tenantId" = ${tenantId}::uuid
      ORDER BY pm.enabled DESC, pm.priority DESC
    `) as any[];

    results.push({
      step: 'All Mappings (tenant reference)',
      totalMappings: allMappings.length,
      mappings: allMappings.map((m: any) => ({
        mappingId: m.id,
        portalName: m.portalName,
        portalEnabled: m.portalEnabled,
        ipPoolId: m.ipPoolId,
        poolName: m.poolName,
        poolSubnet: m.poolSubnet,
        mappingSubnet: m.subnet,
        enabled: m.enabled,
        priority: m.priority,
      })),
    });

    // ── All IP pools for this tenant ──
    const allPools = await db.$queryRaw(Prisma.sql`
      SELECT ip.id, ip.name, ip.subnet::text as subnet, ip.enabled,
             (SELECT COUNT(*)::int FROM "IpPoolRange" WHERE "poolId" = ip.id) as "rangeCount"
      FROM "IpPool" ip
      WHERE ip."tenantId" = ${tenantId}::uuid
      ORDER BY ip.enabled DESC, ip.name
    `) as any[];

    results.push({
      step: 'All IP Pools (tenant reference)',
      totalPools: allPools.length,
      pools: allPools.map((p: any) => ({
        poolId: p.id,
        poolName: p.name,
        subnet: p.subnet,
        enabled: p.enabled,
        rangeCount: p.rangeCount,
      })),
    });

    // ── Diagnosis ──
    const matchedInStep1 = cidrMatches.length > 0;
    const matchedInStep2 = rangeMatches.length > 0;
    let diagnosis: string;
    let wouldResolveTo: string;

    if (matchedInStep1) {
      const match = cidrMatches[0];
      if (match.portalEnabled) {
        diagnosis = `MATCH FOUND (Step 1): IP ${clientIp} matches subnet ${match.subnet} → portal "${match.portalName}"`;
        wouldResolveTo = match.portalId;
      } else {
        diagnosis = `MATCH FOUND BUT PORTAL DISABLED (Step 1): IP ${clientIp} matches subnet ${match.subnet} → portal "${match.portalName}" is disabled`;
        wouldResolveTo = match.fallbackPortalId || defaultPortal?.id || 'none';
      }
    } else if (matchedInStep2) {
      const match = rangeMatches[0];
      if (match.portalEnabled) {
        diagnosis = `MATCH FOUND (Step 2): IP ${clientIp} matches pool "${match.poolName}" range/subnet → portal "${match.portalName}"`;
        wouldResolveTo = match.portalId;
      } else {
        diagnosis = `MATCH FOUND BUT PORTAL DISABLED (Step 2): IP ${clientIp} matches pool "${match.poolName}" → portal "${match.portalName}" is disabled`;
        wouldResolveTo = match.fallbackPortalId || defaultPortal?.id || 'none';
      }
    } else if (defaultPortal) {
      diagnosis = `NO MATCH: IP ${clientIp} does not match any pool/subnet mapping. Will fall back to default portal "${defaultPortal.name}". Check: 1) Pool has correct subnet/ranges covering this IP, 2) Pool is mapped to the desired portal, 3) Mapping is enabled.`;
      wouldResolveTo = defaultPortal.id;
    } else {
      diagnosis = `NO MATCH & NO DEFAULT: IP ${clientIp} does not match any mapping and no default portal is configured.`;
      wouldResolveTo = 'none';
    }

    return NextResponse.json({
      success: true,
      testIp: clientIp,
      tenantId,
      diagnosis,
      wouldResolveTo,
      results,
    });
  } catch (error: unknown) {
    console.error('[Test Lookup] Error:', error);
    logWifi(request, 'create', 'portal_instance', undefined).catch(() => {});
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } },
      { status: 500 }
    );
  }
}
