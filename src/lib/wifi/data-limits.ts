/**
 * WiFi Data Limits Enforcement
 * 
 * Provides functions to check and enforce data limits for WiFi users.
 * Integrates with RADIUS to disable access when limits are exceeded.
 */

import { db } from '@/lib/db';
import { performImmediateDisconnect, enforceImmediateNftablesRemoval } from '@/lib/wifi/utils/immediate-disconnect';

// Types
export interface DataLimitCheck {
  exceeded: boolean;
  dataUsed: number; // in MB
  dataLimit: number | null; // in MB, null = unlimited
  percentUsed: number;
  remainingMB: number | null;
}

export interface SessionLimitCheck {
  exceeded: boolean;
  activeSessions: number;
  maxSessions: number;
}

/**
 * Check if a session has exceeded its data limit
 */
export async function checkDataLimit(sessionId: string): Promise<DataLimitCheck> {
  // Get session with WiFi user and plan info
  const session = await db.wiFiSession.findUnique({
    where: { id: sessionId },
    include: {
      plan: {
        select: {
          dataLimit: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Get WiFi user to check their data limit
  const wifiUser = session.planId
    ? await db.wiFiUser.findFirst({
        where: {
          planId: session.planId,
          guestId: session.guestId || undefined,
        },
      })
    : null;

  // Determine data limit (from plan or unlimited)
  let dataLimit: number | null = null;
  
  if (session.plan?.dataLimit) {
    dataLimit = session.plan.dataLimit;
  }

  // If no limit, return unlimited
  if (!dataLimit) {
    return {
      exceeded: false,
      dataUsed: session.dataUsed,
      dataLimit: null,
      percentUsed: 0,
      remainingMB: null,
    };
  }

  const dataUsedNum = Number(session.dataUsed);
  const percentUsed = Math.min(100, Math.round((dataUsedNum / dataLimit) * 100));
  const remainingMB = Math.max(0, dataLimit - dataUsedNum);
  const exceeded = dataUsedNum >= dataLimit;

  return {
    exceeded,
    dataUsed: dataUsedNum,
    dataLimit,
    percentUsed,
    remainingMB,
  };
}

/**
 * Check if a user has exceeded their concurrent session limit
 */
export async function checkConcurrentSessionLimit(
  userId: string,
  propertyId: string
): Promise<SessionLimitCheck> {
  // Get WiFi user
  const wifiUser = await db.wiFiUser.findFirst({
    where: {
      id: userId,
      propertyId,
    },
  });

  if (!wifiUser) {
    // Get AAA config for default limit
    const aaaConfig = await db.wiFiAAAConfig.findUnique({
      where: { propertyId },
    });

    const maxSessions = aaaConfig?.maxConcurrentSessions || 3;

    // Count active sessions for the user by username
    const activeSessions = await db.wiFiSession.count({
      where: {
        status: 'active',
        // This would need proper linking to WiFi user
      },
    });

    return {
      exceeded: activeSessions >= maxSessions,
      activeSessions,
      maxSessions,
    };
  }

  // Get max sessions from user or plan
  let maxSessions = wifiUser.maxSessions || 1;
  
  if (wifiUser.planId) {
    const plan = await db.wiFiPlan.findUnique({
      where: { id: wifiUser.planId },
      select: { sessionLimit: true },
    });
    if (plan?.sessionLimit) {
      maxSessions = plan.sessionLimit;
    }
  }

  // Count active sessions for this user
  const activeSessions = await db.wiFiSession.count({
    where: {
      guestId: wifiUser.guestId || undefined,
      status: 'active',
    },
  });

  return {
    exceeded: activeSessions >= maxSessions,
    activeSessions,
    maxSessions,
  };
}

/**
 * Enforce data limit on a session
 * If exceeded, terminate session and disable user
 */
export async function enforceDataLimit(sessionId: string): Promise<{
  terminated: boolean;
  reason?: string;
  dataLimit?: DataLimitCheck;
}> {
  const limitCheck = await checkDataLimit(sessionId);

  if (!limitCheck.exceeded) {
    return {
      terminated: false,
      dataLimit: limitCheck,
    };
  }

  // Get session details
  const session = await db.wiFiSession.findUnique({
    where: { id: sessionId },
    include: {
      plan: true,
    },
  });

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // Terminate the session
  await db.$transaction(async (tx) => {
    // Update session status
    await tx.wiFiSession.update({
      where: { id: sessionId },
      data: {
        status: 'terminated',
        endTime: new Date(),
      },
    });

    // Find WiFi user by guest or plan
    const wifiUser = await tx.wiFiUser.findFirst({
      where: {
        OR: [
          { guestId: session.guestId || 'none' },
          { planId: session.planId || 'none' },
        ],
      },
    });

    if (wifiUser) {
      // Add RadReply to disable access
      await tx.radReply.create({
        data: {
          wifiUserId: wifiUser.id,
          username: wifiUser.username,
          attribute: 'Session-Timeout',
          op: ':=',
          value: '1', // 1 second - effectively disable
          isActive: true,
        },
      });

      // Mark user as over limit
      await tx.wiFiUser.update({
        where: { id: wifiUser.id },
        data: {
          status: 'suspended',
        },
      });

      // CRITICAL-15 FIX: Immediately close all active sessions for this user
      // Don't wait for the next session engine cycle or Session-Timeout expiry
      await tx.wiFiSession.updateMany({
        where: {
          username: wifiUser.username,
          status: 'active',
        },
        data: {
          status: 'completed',
          endTime: new Date(),
        },
      });

      // Also close radacct sessions so accounting reflects the disconnect
      const closedRadacct = await tx.$executeRaw`
        UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Data-Limit-Exceeded'
        WHERE username = ${wifiUser.username} AND acctstoptime IS NULL
      `;
    }
  });

  // ═══════════════════════════════════════════════════════════
  // Network-Level Disconnect (local gateway)
  // ═══════════════════════════════════════════════════════════
  // For LOCAL GATEWAY (cryptsk) setups, the session engine is
  // the primary FUP enforcer — it reads nftables byte counters
  // every 60s and disconnects via nftables removal directly.
  //
  // This function (enforceDataLimit) is the SECONDARY safety net,
  // called from the accounting sync path when interim records
  // arrive from external NAS devices.
  //
  // For local gateway: only nftables removal + DB enforcement.
  // RADIUS DM/CoA is NOT used — the gateway IS the RADIUS server.
  // ═══════════════════════════════════════════════════════════
  try {
    const activeSession = await db.$queryRaw<Array<{
      framedipaddress: string;
      nasipaddress: string;
    }>>`
      SELECT framedipaddress, nasipaddress
      FROM radacct
      WHERE username = ${session.username || undefined}
      ORDER BY radacctid DESC
      LIMIT 1
    `;

    if (activeSession.length > 0) {
      const radSession = activeSession[0];
      const userIp = radSession.framedipaddress;
      const isLocalGateway = radSession.nasipaddress === '127.0.0.1'
        || radSession.nasipaddress === '::1'
        || !radSession.nasipaddress;

      if (userIp && userIp !== '' && userIp !== '0.0.0.0') {
        if (isLocalGateway) {
          // LOCAL GATEWAY: nftables removal only — session engine owns the disconnect
          const nftResult = enforceImmediateNftablesRemoval(userIp, session.username || undefined);
          console.log(
            `[DataLimit] Local gateway disconnect for ${session.username || 'unknown'} ` +
            `at ${userIp}: nftables=${nftResult.success ? 'OK' : 'FAIL'}`
          );
        } else {
          // EXTERNAL NAS: RADIUS DM + nftables (belt and suspenders)
          const disconnectResults = await performImmediateDisconnect(
            session.username || '',
            userIp,
            radSession.nasipaddress,
            null,
          );

          const dmOk = disconnectResults.find(r => r.method === 'radclient-dm')?.success;
          const nftOk = disconnectResults.find(r => r.method === 'nftables-removal')?.success;

          console.log(
            `[DataLimit] External NAS disconnect for ${session.username || 'unknown'} ` +
            `at ${userIp} (NAS ${radSession.nasipaddress}): DM=${dmOk ? 'OK' : 'FAIL'}, nftables=${nftOk ? 'OK' : 'FAIL'}`
          );
        }
      }
    }
  } catch (disconnectError) {
    // Network disconnect failed — non-fatal
    // DB enforcement already happened above
    console.error(
      `[DataLimit] Network disconnect error (non-fatal): ` +
      `${disconnectError instanceof Error ? disconnectError.message : String(disconnectError)}`
    );
  }

  return {
    terminated: true,
    reason: `Data limit exceeded: ${limitCheck.dataUsed}MB used of ${limitCheck.dataLimit}MB limit`,
    dataLimit: limitCheck,
  };
}

/**
 * Get data usage summary for a WiFi user
 */
export async function getDataUsageSummary(userId: string): Promise<{
  totalDataUsedMB: number;
  totalSessions: number;
  dataLimitMB: number | null;
  percentUsed: number;
  sessions: Array<{
    id: string;
    startTime: Date;
    endTime: Date | null;
    dataUsedMB: number;
    status: string;
  }>;
}> {
  const wifiUser = await db.wiFiUser.findUnique({
    where: { id: userId },
    include: {
      plan: {
        select: { dataLimit: true },
      },
    },
  });

  if (!wifiUser) {
    throw new Error(`WiFi user not found: ${userId}`);
  }

  // Get all sessions for this user
  const sessions = await db.wiFiSession.findMany({
    where: {
      OR: [
        { guestId: wifiUser.guestId || 'none' },
        { planId: wifiUser.planId || 'none' },
      ],
    },
    orderBy: { startTime: 'desc' },
    take: 100,
  });

  const totalDataUsedMB = sessions.reduce((acc, s) => acc + Number(s.dataUsed), 0);
  const totalSessions = sessions.length;
  
  const dataLimitMB = wifiUser.plan?.dataLimit || null;
  const percentUsed = dataLimitMB ? Math.min(100, Math.round((totalDataUsedMB / dataLimitMB) * 100)) : 0;

  return {
    totalDataUsedMB,
    totalSessions,
    dataLimitMB,
    percentUsed,
    sessions: sessions.map(s => ({
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      dataUsedMB: s.dataUsed,
      status: s.status,
    })),
  };
}

/**
 * Reset data usage for a WiFi user (e.g., on new billing cycle)
 */
export async function resetDataUsage(userId: string): Promise<void> {
  const wifiUser = await db.wiFiUser.findUnique({
    where: { id: userId },
  });

  if (!wifiUser) {
    throw new Error(`WiFi user not found: ${userId}`);
  }

  // Reset user's total bytes
  await db.wiFiUser.update({
    where: { id: userId },
    data: {
      totalBytesIn: 0,
      totalBytesOut: 0,
      status: 'active',
    },
  });

  // Re-enable RadCheck
  await db.radCheck.updateMany({
    where: {
      wifiUserId: userId,
      attribute: 'Cleartext-Password',
    },
    data: { isActive: true },
  });

  // Remove session timeout limit
  await db.radReply.updateMany({
    where: {
      wifiUserId: userId,
      attribute: 'Session-Timeout',
    },
    data: { isActive: false },
  });
}

/**
 * Check data limit for all active sessions (batch operation)
 */
export async function checkAllActiveSessions(): Promise<{
  checked: number;
  exceeded: Array<{ sessionId: string; dataUsed: number; dataLimit: number }>;
}> {
  const activeSessions = await db.wiFiSession.findMany({
    where: { status: 'active' },
    include: {
      plan: {
        select: { dataLimit: true },
      },
    },
  });

  const exceeded: Array<{ sessionId: string; dataUsed: number; dataLimit: number }> = [];

  for (const session of activeSessions) {
    try {
      const check = await checkDataLimit(session.id);
      if (check.exceeded && check.dataLimit) {
        exceeded.push({
          sessionId: session.id,
          dataUsed: check.dataUsed,
          dataLimit: check.dataLimit,
        });
      }
    } catch (error) {
      console.error(`Error checking session ${session.id}:`, error);
    }
  }

  return {
    checked: activeSessions.length,
    exceeded,
  };
}
