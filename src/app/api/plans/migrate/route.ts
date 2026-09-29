import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireAuth } from "@/lib/api-auth";

// Simple UUID format check (avoids Prisma crash on non-UUID strings)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v: string): boolean {
  return UUID_RE.test(v);
}

// POST /api/plans/migrate — migrate subscribers from one plan to another
export async function POST(req: NextRequest) {

  try {
    await requireAuth(req as unknown as import("next/server").NextRequest);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }

  try {
    await requirePermission(req, "subscribers.update");
    const body = await req.json();
    const { sourcePlanId, targetPlanId, subscriberIds } = body;

    if (!sourcePlanId || !targetPlanId) {
      return NextResponse.json({ error: "Source and target plan IDs are required" }, { status: 400 });
    }
    if (!isValidUUID(sourcePlanId)) {
      return NextResponse.json({ error: "Invalid source plan ID format" }, { status: 400 });
    }
    if (!isValidUUID(targetPlanId)) {
      return NextResponse.json({ error: "Invalid target plan ID format" }, { status: 400 });
    }
    if (sourcePlanId === targetPlanId) {
      return NextResponse.json({ error: "Source and target plans cannot be the same" }, { status: 400 });
    }

    // Also accept subscriberId (singular) for convenience
    const effectiveSubscriberIds = subscriberIds
      || (body.subscriberId ? [body.subscriberId] : null);

    const [sourcePlan, targetPlan] = await Promise.all([
      db.plan.findUnique({ where: { id: sourcePlanId } }),
      db.plan.findUnique({ where: { id: targetPlanId } }),
    ]);

    if (!sourcePlan) {
      return NextResponse.json({ error: "Source plan not found" }, { status: 404 });
    }
    if (!targetPlan) {
      return NextResponse.json({ error: "Target plan not found" }, { status: 404 });
    }
    if (targetPlan.status !== "ACTIVE") {
      return NextResponse.json({ error: "Target plan must be active" }, { status: 400 });
    }

    // Build where clause: if subscriberIds provided, use those; otherwise migrate all active
    const baseWhere: Record<string, unknown> = {
      planId: sourcePlanId,
      status: { not: "DISCONNECTED" },
    };
    if (effectiveSubscriberIds && Array.isArray(effectiveSubscriberIds) && effectiveSubscriberIds.length > 0) {
      baseWhere.id = { in: effectiveSubscriberIds };
    }

    // Count affected subscribers
    const subscriberCount = await db.subscriber.count({ where: baseWhere });

    if (subscriberCount === 0) {
      return NextResponse.json({ error: "No active subscribers found to migrate" }, { status: 400 });
    }

    // Capture the IDs of subscribers about to be migrated (before bulk update changes their planId)
    const subscribersToMigrate = await db.subscriber.findMany({
      where: baseWhere,
      select: { id: true, serviceUsername: true, radiusEnabled: true },
    });
    // Bulk update planId AND radiusGroupId for migrated subscribers
    const updateData: Record<string, unknown> = { planId: targetPlanId };
    if (targetPlan.groupId) {
      updateData.radiusGroupId = targetPlan.groupId;
    }
    const result = await db.subscriber.updateMany({
      where: baseWhere,
      data: updateData,
    });

    // Sync FreeRADIUS for migrated RADIUS-enabled subscribers (B2, B9, B11 fixes)
    let radiusSynced = 0;
    let radiusFailed = 0;
    try {
      // Resolve target plan's RADIUS group name
      const targetGroupName = targetPlan.groupId
        ? (await db.radiusGroup.findUnique({
            where: { id: targetPlan.groupId },
            select: { name: true },
          }))?.name || null
        : null;

      // Build the Mikrotik rate-limit string from the target plan's speeds
      // Plan stores speeds in Mbps (speedUnit defaults to MBPS)
      const rateLimitValue = `${targetPlan.downloadSpeed}M/${targetPlan.uploadSpeed}M`;

      // Only process subscribers that were actually migrated AND are RADIUS-enabled
      const radiusSubscribers = subscribersToMigrate.filter(
        (s) => s.radiusEnabled && s.serviceUsername
      );

      for (const sub of radiusSubscribers) {
        if (!sub.serviceUsername) continue;
        const uname = sub.serviceUsername.replace(/'/g, "''");

        try {
          // --- B2: Update radusergroup to the target plan's group name ---
          if (targetGroupName) {
            const grp = targetGroupName.replace(/'/g, "''");
            await db.$executeRawUnsafe(`
              UPDATE radusergroup
              SET groupname = '${grp}'
              WHERE username = '${uname}'
            `);
            // Ensure a row exists even if the user had no prior radusergroup entry
            await db.$executeRawUnsafe(`
              INSERT INTO radusergroup (username, groupname, priority)
              VALUES ('${uname}', '${grp}', 1)
              ON CONFLICT DO NOTHING
            `);
          }

          // --- B9: Update radreply Mikrotik-Rate-Limit with the target plan's speeds ---
          const escapedRate = rateLimitValue.replace(/'/g, "''");
          await db.$executeRawUnsafe(`
            INSERT INTO radreply (username, attribute, op, value)
            VALUES ('${uname}', 'Mikrotik-Rate-Limit', ':=', '${escapedRate}')
            ON CONFLICT (username, attribute) DO UPDATE SET value = '${escapedRate}'
          `);

          // --- B11: Update Simultaneous-Use in radcheck if sessions changed ---
          const maxSessions = targetPlan.maxConcurrentSessions || 1;
          await db.$executeRawUnsafe(`
            INSERT INTO radcheck (username, attribute, op, value)
            VALUES ('${uname}', 'Simultaneous-Use', ':=', '${maxSessions}')
            ON CONFLICT (username, attribute) DO UPDATE SET value = '${maxSessions}'
          `);

          radiusSynced++;
        } catch (syncErr) {
          console.error(`[Plan Migrate] RADIUS sync failed for ${sub.serviceUsername}:`, syncErr);
          radiusFailed++;
        }
      }
    } catch (radiusErr) {
      console.error("[Plan Migrate] RADIUS sync error:", radiusErr);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully migrated ${result.count} subscribers from "${sourcePlan.name}" to "${targetPlan.name}"`,
      migratedCount: result.count,
      radiusSynced,
      radiusFailed,
      sourcePlan: sourcePlan.name,
      targetPlan: targetPlan.name,
    });
  } catch (error: any) {
    console.error("Plan Migrate POST error:", error);
    if (error.message?.includes("403") || error.message?.includes("Insufficient")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to migrate subscribers" }, { status: 500 });
  }
}
