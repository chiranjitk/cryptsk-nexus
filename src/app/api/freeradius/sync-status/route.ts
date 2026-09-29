import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/freeradius/sync-status
 * Compares app Subscriber/Plan/Group records with FreeRADIUS tables
 * to detect sync drift.
 */
export async function GET() {
  await requireAuth({} as any).catch(() => {}); // optional auth

  try {
    // 1. App subscriber count vs RADIUS radcheck count
    const [appRadiusEnabled, radcheckCount, radreplyCount, radusergroupCount, radgroupreplyCount, radgroupcheckCount] =
      await Promise.all([
        db.subscriber.count({ where: { radiusEnabled: true } }),
        db.$queryRawUnsafe<{ c: bigint }[]>("SELECT COUNT(*) as c FROM radcheck"),
        db.$queryRawUnsafe<{ c: bigint }[]>("SELECT COUNT(*) as c FROM radreply"),
        db.$queryRawUnsafe<{ c: bigint }[]>("SELECT COUNT(*) as c FROM radusergroup"),
        db.$queryRawUnsafe<{ c: bigint }[]>("SELECT COUNT(*) as c FROM radgroupreply"),
        db.$queryRawUnsafe<{ c: bigint }[]>("SELECT COUNT(*) as c FROM radgroupcheck"),
      ]);

    const appCount = appRadiusEnabled;
    const radiusUsers = Number(radcheckCount[0]?.c ?? 0);
    const radiusReplies = Number(radreplyCount[0]?.c ?? 0);
    const radiusUserGroups = Number(radusergroupCount[0]?.c ?? 0);
    const radiusGroupReplies = Number(radgroupreplyCount[0]?.c ?? 0);
    const radiusGroupChecks = Number(radgroupcheckCount[0]?.c ?? 0);

    // 2. Find orphaned RADIUS entries (users in radcheck not in app)
    const orphans = await db.$queryRawUnsafe<{ username: string }[]>(`
      SELECT DISTINCT rc.username
      FROM radcheck rc
      LEFT JOIN "Subscriber" s ON s."serviceUsername" = rc.username AND s."radiusEnabled" = true
      WHERE s.id IS NULL
      LIMIT 20
    `);

    // 3. Find app subscribers missing from RADIUS
    const missing = await db.$queryRawUnsafe<{ "serviceUsername": string }[]>(`
      SELECT s."serviceUsername"
      FROM "Subscriber" s
      LEFT JOIN radcheck rc ON rc.username = s."serviceUsername"
      WHERE s."radiusEnabled" = true
        AND s."serviceUsername" IS NOT NULL
        AND s."serviceUsername" != ''
        AND rc.id IS NULL
      LIMIT 20
    `);

    // 4. Plan groups missing from radgroupreply
    const missingGroupAttrs = await db.$queryRawUnsafe<{ name: string }[]>(`
      SELECT g.name
      FROM "RadiusGroup" g
      LEFT JOIN radgroupreply rg ON rg.groupname = g.name
      WHERE rg.id IS NULL
      AND g.name != ''
      LIMIT 20
    `);

    const driftCount = orphans.length + missing.length + missingGroupAttrs.length;
    const status = driftCount === 0 ? "synced" : driftCount <= 5 ? "minor_drift" : "drifted";

    return NextResponse.json({
      status,
      app: {
        radiusEnabledSubscribers: appCount,
      },
      radius: {
        users: radiusUsers,
        replies: radiusReplies,
        userGroups: radiusUserGroups,
        groupReplies: radiusGroupReplies,
        groupChecks: radiusGroupChecks,
      },
      drift: {
        total: driftCount,
        orphanedRadiusUsers: orphans.map(o => o.username),
        missingRadiusUsers: missing.map(m => m.serviceUsername),
        missingGroupAttributes: missingGroupAttrs.map(g => g.name),
      },
    });
  } catch (error) {
    console.error("[RADIUS Sync Status] Error:", error);
    return NextResponse.json(
      { status: "error", error: "Failed to check RADIUS sync status" },
      { status: 500 }
    );
  }
}
