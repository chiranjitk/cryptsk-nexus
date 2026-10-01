import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * POST /api/wifi/captive/auth
 * Captive Portal WiFi Authentication (LEGACY)
 *
 * DEPRECATED: This endpoint supports only 3 methods (voucher, room, ldap).
 * New integrations should use /api/v1/wifi/auth (11 methods, full security).
 *
 * Security controls already applied:
 *   - CP-CRIT-01: nftables rate limiting
 *   - CP-CRIT-02: Room auth tenant scoping + rate limiting
 *   - CP-CRIT-03: Tenant isolation required
 *   - CP-CRIT-06: Atomic voucher claim (TOCTOU prevention)
 *   - CP-HIGH-07: Exact last name match
 *
 * Accepts three auth methods:
// REMOVED:  *  - voucher: { method: "voucher", code: "XXXX", tenantId: string }
// REMOVED:  *  - room:    { method: "room", roomNumber: "101", lastName: "Smith", tenantId: string }
 *  - ldap:    { method: "ldap", username: "jdoe", password: "secret", partnerId: string }
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lazy-import ldapjs to avoid issues when the package is not installed. */
async function getLdapjs() {
  let ldapjs: typeof import('ldapjs') | null = null;
  try {
    ldapjs = await import('ldapjs');
  } catch {
    throw new Error('ldapjs package is not installed');
  }
  return ldapjs;
}

/**
 * Perform LDAP authentication: admin bind → user search → user bind.
 * Returns the user DN on success, or throws on failure.
 */
async function authenticateViaLdap(params: {
  serverUrl: string;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
  usernameAttr: string;
  username: string;
  password: string;
  useTls: boolean;
  timeout: number;
  filterGroup?: string | null;
}): Promise<{ userDn: string; userAttributes: Record<string, string | string[]> }> {
  const ldapjs = await getLdapjs();
  let client: InstanceType<typeof ldapjs.Client> | null = null;
  let userClient: InstanceType<typeof ldapjs.Client> | null = null;

  try {
    // Step 1: Create client and bind with service account
    client = ldapjs.createClient({
      url: params.serverUrl,
      connectTimeout: params.timeout * 1000,
      timeout: params.timeout * 1000,
      tlsOptions: params.useTls ? { rejectUnauthorized: process.env.NODE_ENV !== 'development' } : undefined,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`LDAP connection timeout after ${params.timeout}s`)),
        params.timeout * 1000,
      );
      client!.on('connectError', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
      client!.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
      client!.on('connect', () => {
        client!.bind(params.bindDn, params.bindPassword, (bindErr) => {
          clearTimeout(timer);
          if (bindErr) reject(new Error(`Service account bind failed: ${bindErr.message}`));
          else resolve();
        });
      });
    });

    // Step 2: Search for the user by usernameAttr
    const safeUsername = params.username.replace(/[()\\*]/g, (c) => `\\${c}`);
    const filter = params.filterGroup
      ? `(&(${params.usernameAttr}=${safeUsername})(memberOf=${params.filterGroup}))`
      : `(${params.usernameAttr}=${safeUsername})`;

    const searchEntries: InstanceType<typeof ldapjs.SearchEntry>[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`LDAP search timeout after ${params.timeout}s`)),
        params.timeout * 1000,
      );
      client!.search(
        params.baseDn,
        { filter, scope: 'sub', attributes: ['dn', params.usernameAttr, 'cn', 'mail', 'memberOf'], sizeLimit: 1 },
        (err, res) => {
          if (err) { clearTimeout(timer); reject(new Error(`LDAP search failed: ${err.message}`)); return; }
          res.on('searchEntry', (entry) => searchEntries.push(entry));
          res.on('error', (searchErr) => { clearTimeout(timer); reject(new Error(`LDAP search error: ${searchErr.message}`)); });
          res.on('end', () => { clearTimeout(timer); resolve(); });
        },
      );
    });

    if (searchEntries.length === 0) {
      throw new Error('User not found in LDAP directory');
    }

    const userDn = searchEntries[0].dn.toString();

    // Parse user attributes
    const userAttributes: Record<string, string | string[]> = {};
    for (const attr of searchEntries[0].attributes) {
      const vals = attr.vals as Buffer[];
      if (vals.length === 1) {
        userAttributes[attr.type] = vals[0].toString('utf8');
      } else if (vals.length > 1) {
        userAttributes[attr.type] = vals.map((v) => v.toString('utf8'));
      }
    }

    // Step 3: Disconnect service account client
    try { await new Promise<void>((r) => client!.unbind(() => r())); } catch { /* ignore */ }
    try { client!.destroy(); } catch { /* ignore */ }
    client = null;

    // Step 4: Bind as the user with their password to verify credentials
    userClient = ldapjs.createClient({
      url: params.serverUrl,
      connectTimeout: params.timeout * 1000,
      timeout: params.timeout * 1000,
      tlsOptions: params.useTls ? { rejectUnauthorized: process.env.NODE_ENV !== 'development' } : undefined,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`User bind timeout after ${params.timeout}s`)),
        params.timeout * 1000,
      );
      userClient!.bind(userDn, params.password, (bindErr) => {
        clearTimeout(timer);
        if (bindErr) {
          const ldapErr = bindErr as Error & { name?: string };
          if (ldapErr.name === 'InvalidCredentialsError' || bindErr.message.includes('invalid credentials')) {
            reject(new Error('Invalid credentials'));
          } else {
            reject(new Error(`User bind failed: ${bindErr.message}`));
          }
        } else {
          resolve();
        }
      });
    });

    // Cleanup user client
    try { await new Promise<void>((r) => userClient!.unbind(() => r())); } catch { /* ignore */ }
    try { userClient!.destroy(); } catch { /* ignore */ }
    userClient = null;

    return { userDn, userAttributes };
  } finally {
    // Best-effort cleanup
    const close = async (c: InstanceType<typeof ldapjs.Client> | null) => {
      if (!c) return;
      try { await new Promise<void>((r) => c.unbind(() => r())); } catch { /* ignore */ }
      try { c.destroy(); } catch { /* ignore */ }
    };
    await close(client);
    await close(userClient);
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // CP-LOW-07: Add deprecation header to all legacy auth responses
  const deprecationHeaders = { 'X-Deprecation': 'true', 'Deprecation': 'true', 'Link': '</api/v1/wifi/auth>; rel="successor-version"' };

  try {
    const body = await request.json()
// REMOVED:     const { method, tenantId } = body

// REMOVED:     // CP-CRIT-03: tenantId is REQUIRED for all auth methods — no cross-tenant access
// REMOVED:     if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json(
// REMOVED:         { success: false, error: 'tenantId is required' },
        { status: 400 }
      )
    }
// REMOVED:     const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Invalid tenant' },
        { status: 400 }
      )
    }

    // -----------------------------------------------------------------------
    // method=voucher
    // Rate limiting: Enforced at network layer by nftables (CP-CRIT-01).
    // No application-level rate limiting is implemented here.
    // Error responses use generic messages to prevent voucher enumeration.
    // -----------------------------------------------------------------------
    if (method === 'voucher') {
      const { code } = body
      if (!code || typeof code !== 'string' || code.trim().length < 1) {
        return NextResponse.json(
          { success: false, error: 'Voucher code is required' },
          { status: 400 }
        )
      }

      // CP-LOW-04: Code is uppercased for case-insensitive matching.
      // Voucher codes are generated uppercase by the credential engine.
      // Note: The WiFiVoucher.code column uses case-sensitive unique in SQLite.
      const trimmedCode = code.trim().toUpperCase();

      // CP-CRIT-03: Scope voucher lookup to tenant
      const voucher = await db.wiFiVoucher.findFirst({
// REMOVED:         where: { code: trimmedCode, tenantId },
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              downloadSpeed: true,
              uploadSpeed: true,
              sessionTimeoutSec: true,
              dataLimit: true,
            },
          },
        },
      });

      if (!voucher) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired voucher' },
          { status: 401 }
        )
      }

      // Check voucher status
      if (voucher.isUsed) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired voucher' },
          { status: 401 }
        )
      }
      if (voucher.status === 'expired') {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired voucher' },
          { status: 401 }
        )
      }
      if (voucher.status === 'revoked') {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired voucher' },
          { status: 401 }
        )
      }

      // Voucher Expiry Enforcement: check both validFrom and validUntil dates
      if (voucher.validFrom && new Date(voucher.validFrom) > new Date()) {
        return NextResponse.json(
          { success: false, error: 'Voucher is not yet valid' },
          { status: 401 }
        );
      }
      if (voucher.validUntil && new Date(voucher.validUntil) < new Date()) {
        await db.wiFiVoucher.update({
          where: { id: voucher.id },
          data: { status: 'expired' },
        });
        return NextResponse.json(
          { success: false, error: 'Voucher has expired' },
          { status: 401 }
        )
      }

      // CP-CRIT-06: Atomic voucher claim — use WHERE guard to prevent TOCTOU race
      const now = new Date();
      const [updatedVoucher] = await db.$queryRaw<Array<{ id: string; isUsed: boolean }>>(`
        UPDATE "WiFiVoucher" SET "isUsed" = true, "usedAt" = ${now}, "status" = 'used'
        WHERE id = ${voucher.id} AND "isUsed" = false
        RETURNING id, "isUsed"
      `);

      if (!updatedVoucher || !updatedVoucher.isUsed) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired voucher' },
          { status: 401 }
        );
      }

      // Create or update WiFi session for the voucher user
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const bandwidthLimit = voucher.plan
        ? `${Math.round((voucher.plan.downloadSpeed || 0) / 1000000)}Mbps`
        : '10Mbps';
      const sessionExpiry = voucher.plan?.sessionTimeoutSec
        ? new Date(now.getTime() + voucher.plan.sessionTimeoutSec * 1000)
        : new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Log successful auth
      try {
        // Find a partnerId for the auth log (from voucher's tenant)
        const voucherPartner = await db.partner.findFirst({
// REMOVED:           where: { tenantId: voucher.tenantId },
          select: { id: true },
        });
        if (voucherPartner) {
          await db.radiusAuthLog.create({
            data: {
              partnerId: voucherPartner.id,
              username: trimmedCode,
              authResult: 'Access-Accept',
              authType: 'PAP',
              replyMessage: 'Voucher validated successfully',
            },
          });
        }
      } catch { /* best-effort */ }

      return NextResponse.json({
        success: true,
        method: 'voucher',
        sessionId,
        network: 'Guest WiFi',
        bandwidthLimit,
        expiresAt: sessionExpiry.toISOString(),
        plan: voucher.plan ? { id: voucher.plan.id, name: voucher.plan.name } : null,
        message: 'Voucher validated successfully',
      })
    }

    // -----------------------------------------------------------------------
    // method=room
    // Rate limiting: Enforced at network layer by nftables (CP-CRIT-02).
// REMOVED:     // tenantId is REQUIRED — cross-tenant room queries are blocked (CP-CRIT-03).
    // -----------------------------------------------------------------------
    if (method === 'room') {
      const { roomNumber, lastName } = body
      if (!roomNumber || typeof roomNumber !== 'string' || roomNumber.trim().length < 1) {
        return NextResponse.json(
          { success: false, error: 'Room number is required' },
          { status: 400 }
        )
      }
      if (!lastName || typeof lastName !== 'string' || lastName.trim().length < 1) {
        return NextResponse.json(
          { success: false, error: 'Last name is required' },
          { status: 400 }
        )
      }

      const trimmedRoom = roomNumber.trim();
      const trimmedLastName = lastName.trim().toLowerCase();

      // CP-CRIT-03: ALWAYS scope room lookup to tenant
      const room = await db.room.findFirst({
        where: {
          number: trimmedRoom,
// REMOVED:           property: { tenantId },
        },
        include: {
// REMOVED:           property: { select: { id: true, name: true, tenantId: true } },
          bookings: {
            where: {
              status: { in: ['confirmed', 'checked_in'] },
              checkOut: { gte: new Date() },
            },
            include: {
              primaryGuest: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            take: 1,
          },
        },
      });

      if (!room) {
        return NextResponse.json(
          { success: false, error: 'Room not found' },
          { status: 401 }
        )
      }

      // Check if any active booking in this room matches the last name
      const activeBooking = room.bookings.length > 0 ? room.bookings[0] : null;
      if (!activeBooking) {
        return NextResponse.json(
          { success: false, error: 'No active booking found for this room' },
          { status: 401 }
        )
      }

      // CP-HIGH-07: Exact match (case-insensitive) — no substring matching
      const guestLastName = (activeBooking.primaryGuest?.lastName || '').toLowerCase().trim();
      if (guestLastName !== trimmedLastName) {
        return NextResponse.json(
          { success: false, error: 'Last name does not match reservation' },
          { status: 401 }
        )
      }

      const now = new Date();
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Log successful auth
      try {
        await db.radiusAuthLog.create({
          data: {
            partnerId: room.partnerId,
            username: `room_${trimmedRoom}_${activeBooking.primaryGuestId}`,
            authResult: 'Access-Accept',
            authType: 'PAP',
            replyMessage: 'Room authentication successful',
          },
        });
      } catch { /* best-effort */ }

      return NextResponse.json({
        success: true,
        method: 'room',
        roomNumber: trimmedRoom,
        sessionId,
        guestName: activeBooking.primaryGuest ? `${activeBooking.primaryGuest.firstName} ${activeBooking.primaryGuest.lastName}` : null,
        bookingId: activeBooking.id,
        network: 'Guest WiFi',
        bandwidthLimit: '10Mbps',
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        message: 'Room authentication successful',
      })
    }

    // -----------------------------------------------------------------------
    // method=ldap — LDAP / Active Directory authentication
    // -----------------------------------------------------------------------
    if (method === 'ldap') {
      const { username, password, partnerId } = body

      // Validate required fields
      if (!username || typeof username !== 'string' || username.trim().length < 1) {
        return NextResponse.json(
          { success: false, error: 'Username is required' },
          { status: 400 },
        )
      }
      if (!password || typeof password !== 'string' || password.length < 1) {
        return NextResponse.json(
          { success: false, error: 'Password is required' },
          { status: 400 },
        )
      }

      // CP-CRIT-03: partnerId is REQUIRED for LDAP — never fall back to "any active config"
      if (!partnerId || typeof partnerId !== 'string') {
        return NextResponse.json(
          { success: false, error: 'partnerId is required for LDAP authentication' },
          { status: 400 },
        )
      }

      const ldapConfig = await db.radiusLDAPConfig.findUnique({ where: { partnerId } });
      if (!ldapConfig || !ldapConfig.enabled) {
        return NextResponse.json(
          { success: false, error: 'LDAP authentication is not configured for this property' },
          { status: 400 },
        )
      }

      // Step 2: Get tenant/property for creating WiFiUser
// REMOVED:       const effectiveTenantId = ldapConfig.tenantId;
      const effectivePropertyId = ldapConfig.partnerId;

      // Step 3: Authenticate against LDAP server
      let ldapResult: { userDn: string; userAttributes: Record<string, string | string[]> };
      try {
        ldapResult = await authenticateViaLdap({
          serverUrl: ldapConfig.serverUrl,
          baseDn: ldapConfig.baseDn,
          bindDn: ldapConfig.bindDn,
          bindPassword: ldapConfig.bindPassword,
          usernameAttr: ldapConfig.usernameAttr || 'sAMAccountName',
          username: username.trim(),
          password,
          useTls: ldapConfig.useTls,
          timeout: ldapConfig.timeout || 30,
          filterGroup: ldapConfig.filterGroup,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'LDAP authentication failed';

        // Log failed auth attempt
        try {
          await db.radiusAuthLog.create({
            data: {
              partnerId: effectivePropertyId,
              username: username.trim(),
              authResult: 'Access-Reject',
              authType: 'PAP',
              replyMessage: errorMessage,
            },
          });
        } catch {
          // Best-effort logging
        }

        return NextResponse.json(
          { success: false, error: errorMessage },
          { status: 401 },
        )
      }

      // Step 4: Create or update WiFiUser record
      const now = new Date();
      // CP-HIGH-11: Use portal session timeout instead of hardcoded 24h
      let sessionTimeoutMin = 1440; // default 24h fallback
      try {
        const portal = await db.captivePortal.findFirst({
          where: { partnerId: effectivePropertyId, enabled: true },
          select: { sessionTimeout: true },
        });
        if (portal?.sessionTimeout) sessionTimeoutMin = portal.sessionTimeout;
      } catch { /* use default */ }
      const validUntil = new Date(now.getTime() + sessionTimeoutMin * 60 * 1000);

      try {
        await db.wiFiUser.upsert({
          where: { username: username.trim() },
          update: {
            status: 'active',
            userType: 'ldap',
            validFrom: now,
            validUntil,
            radiusSynced: true,
            radiusSyncedAt: now,
          },
          create: {
// REMOVED:             tenantId: effectiveTenantId,
            partnerId: effectivePropertyId,
            username: username.trim(),
            password: `__ldap__${Date.now()}`, // Placeholder — actual auth is via LDAP
            status: 'active',
            userType: 'ldap',
            validFrom: now,
            validUntil,
            radiusSynced: true,
            radiusSyncedAt: now,
          },
        });
      } catch (dbErr) {
        console.error('[captive-auth:ldap] Failed to create/update WiFiUser:', dbErr);
        // Don't fail auth just because DB write failed — user already authenticated
      }

      // Step 5: Log successful auth
      try {
        await db.radiusAuthLog.create({
          data: {
            partnerId: effectivePropertyId,
            username: username.trim(),
            authResult: 'Access-Accept',
            authType: 'PAP',
            replyMessage: 'LDAP authentication successful',
          },
        });
      } catch {
        // Best-effort logging
      }

      // Step 6: Return success
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return NextResponse.json({
        success: true,
        method: 'ldap',
        sessionId,
        username: username.trim(),
        userDn: ldapResult.userDn,
        network: 'Guest WiFi',
        bandwidthLimit: '100Mbps',
        expiresAt: validUntil.toISOString(),
        sessionTimeoutMinutes: sessionTimeoutMin,
        message: 'LDAP authentication successful',
      })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid authentication method' },
      { status: 400 }
    )
  } catch {
    logWifi(request, 'session_start', 'session', undefined).catch(() => {});
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
