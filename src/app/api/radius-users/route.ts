import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

// Helper: Sync user to FreeRADIUS tables (radcheck, radreply, radusergroup)
async function syncToFreeRADIUS(
  username: string,
  password: string,
  groupName: string | null,
  maxSessions: number = 1
) {
  const uname = username.replace(/'/g, "''");
  const pwd = password.replace(/'/g, "''");
  const grp = groupName ? groupName.replace(/'/g, "''") : null;
  const rateLimit = grp
    ? (await db.$queryRawUnsafe<{ value: string }[]>(
        `SELECT value FROM radgroupreply WHERE groupname = '${grp}' AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1`
      ))[0]?.value || null
    : null;

  // Upsert radcheck: Cleartext-Password
  await db.$queryRawUnsafe(`
    INSERT INTO radcheck (username, attribute, op, value) VALUES ('${uname}', 'Cleartext-Password', ':=', '${pwd}')
    ON CONFLICT DO NOTHING
  `);

  // Upsert radcheck: Simultaneous-Use
  await db.$queryRawUnsafe(`
    INSERT INTO radcheck (username, attribute, op, value) VALUES ('${uname}', 'Simultaneous-Use', ':=', '${maxSessions}')
    ON CONFLICT DO NOTHING
  `);

  // Upsert radreply: Mikrotik-Rate-Limit from group if not exists
  if (rateLimit) {
    await db.$queryRawUnsafe(`
      INSERT INTO radreply (username, attribute, op, value) VALUES ('${uname}', 'Mikrotik-Rate-Limit', ':=', '${rateLimit.replace(/'/g, "''")}')
      ON CONFLICT DO NOTHING
    `);
  }

  // Upsert radusergroup
  if (grp) {
    await db.$queryRawUnsafe(`
      INSERT INTO radusergroup (username, groupname, priority) VALUES ('${uname}', '${grp}', 1)
      ON CONFLICT DO NOTHING
    `);
  }
}

// Helper: Remove user from FreeRADIUS tables
async function removeFromFreeRADIUS(username: string) {
  const uname = username.replace(/'/g, "''");
  await db.$queryRawUnsafe(`DELETE FROM radcheck WHERE username = '${uname}'`);
  await db.$queryRawUnsafe(`DELETE FROM radreply WHERE username = '${uname}'`);
  await db.$queryRawUnsafe(`DELETE FROM radusergroup WHERE username = '${uname}'`);
}

// Helper: Update user's group in FreeRADIUS
async function updateFreeRADIUSGroup(
  username: string,
  oldGroup: string | null,
  newGroup: string | null
) {
  const uname = username.replace(/'/g, "''");

  if (oldGroup && oldGroup !== newGroup) {
    await db.$queryRawUnsafe(`DELETE FROM radusergroup WHERE username = '${uname}' AND groupname = '${oldGroup.replace(/'/g, "''")}'`);
  }

  if (newGroup) {
    const grp = newGroup.replace(/'/g, "''");
    await db.$queryRawUnsafe(`
      INSERT INTO radusergroup (username, groupname, priority) VALUES ('${uname}', '${grp}', 1)
      ON CONFLICT (username, groupname) DO NOTHING
    `);

    // Update rate limit reply from group
    const rateLimit = (await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM radgroupreply WHERE groupname = '${grp}' AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1`
    ))[0]?.value;

    if (rateLimit) {
      await db.$queryRawUnsafe(`
        INSERT INTO radreply (username, attribute, op, value) VALUES ('${uname}', 'Mikrotik-Rate-Limit', ':=', '${rateLimit.replace(/'/g, "''")}')
        ON CONFLICT (username, attribute) DO UPDATE SET value = '${rateLimit.replace(/'/g, "''")}'
      `);
    }
  }
}

// GET /api/radius-users - List all RADIUS users (nested structure matching frontend RadiusUser interface)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const users = await db.radiusUser.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        Subscriber: {
          select: {
            id: true,
            name: true,
            code: true,
            phone: true,
            serviceUsername: true,
            servicePassword: true,
            radiusEnabled: true,
            radiusGroupId: true,
            sessionTimeout: true,
            idleTimeout: true,
            lastAuthAt: true,
            lastAuthResult: true,
            status: true,
            Plan: {
              select: {
                id: true,
                name: true,
                downloadSpeed: true,
                uploadSpeed: true,
                dataLimitGb: true,
                RadiusGroup: {
                  select: {
                    id: true,
                    name: true,
                    speedLimitDown: true,
                    speedLimitUp: true,
                    dataLimit: true,
                  },
                },
              },
            },
            RadiusGroup: {
              select: {
                id: true,
                name: true,
                speedLimitDown: true,
                speedLimitUp: true,
                dataLimit: true,
              },
            },
          },
        },
        _count: { select: { RadiusSession: true } },
      },
    });

    // Return in the nested structure the frontend expects (RadiusUser interface)
    const mapped = users.map((u) => ({
      id: u.id,
      subscriberId: u.subscriberId,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      subscriber: u.Subscriber,
      _count: u._count,
    }));

    return NextResponse.json({ users: mapped });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS users list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch RADIUS users" },
      { status: 500 }
    );
  }
}

// POST /api/radius-users - Create a new RADIUS user (thin record + enable RADIUS on subscriber + sync to FreeRADIUS)
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const {
      subscriberId,
      radiusGroupId,
      sessionTimeout,
      idleTimeout,
    } = body;

    // Validation
    const errors: string[] = [];
    if (!subscriberId?.trim()) errors.push("Subscriber ID is required");

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    // Check subscriber exists
    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      include: {
        RadiusUser: { select: { id: true } },
        RadiusGroup: { select: { name: true } },
        Plan: { select: { maxConcurrentSessions: true } },
      },
    });
    if (!subscriber) {
      return NextResponse.json(
        { error: "Subscriber not found" },
        { status: 404 }
      );
    }

    // Check if already has a RadiusUser record
    if (subscriber.RadiusUser) {
      return NextResponse.json(
        { error: "RADIUS user already exists for this subscriber" },
        { status: 409 }
      );
    }

    // Validate radiusGroupId if provided
    let groupName: string | null = null;
    if (radiusGroupId) {
      const group = await db.radiusGroup.findUnique({ where: { id: radiusGroupId } });
      if (!group) {
        return NextResponse.json({ error: "RADIUS group not found" }, { status: 404 });
      }
      groupName = group.name;
    } else if (subscriber.radiusGroupId) {
      // Use subscriber's existing group if not explicitly provided
      groupName = subscriber.RadiusGroup?.name || null;
    }

    // Create thin RadiusUser record
    const user = await db.radiusUser.create({
      data: {
        subscriberId,
      },
    });

    // Update subscriber: set radiusEnabled = true and optional RADIUS fields
    const updatedSubscriber = await db.subscriber.update({
      where: { id: subscriberId },
      data: {
        radiusEnabled: true,
        ...(radiusGroupId !== undefined && { radiusGroupId: radiusGroupId || null }),
        ...(sessionTimeout !== undefined && { sessionTimeout: sessionTimeout || null }),
        ...(idleTimeout !== undefined && { idleTimeout: idleTimeout || null }),
      },
    });

    // Sync to FreeRADIUS tables
    await syncToFreeRADIUS(
      subscriber.serviceUsername,
      subscriber.servicePassword,
      groupName,
      subscriber.Plan?.maxConcurrentSessions || 1
    );

    await auditCreate(request, "RadiusUser", user.id, {
      subscriberId,
      serviceUsername: subscriber.serviceUsername,
      radiusGroupId,
    });
    return NextResponse.json({
      User: {
        id: user.id,
        subscriberId: user.subscriberId,
        username: subscriber.serviceUsername,
        password: subscriber.servicePassword,
        radiusEnabled: updatedSubscriber.radiusEnabled,
        radiusGroupId: updatedSubscriber.radiusGroupId,
        sessionTimeout: updatedSubscriber.sessionTimeout,
        idleTimeout: updatedSubscriber.idleTimeout,
        createdAt: user.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS user create error:", error);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "RADIUS user already exists for this subscriber" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create RADIUS user" },
      { status: 500 }
    );
  }
}
