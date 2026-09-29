import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/radius-users/[id] - Get single RADIUS user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const user = await db.radiusUser.findUnique({
      where: { id },
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
                name: true,
                RadiusGroup: { select: { id: true, name: true } },
              },
            },
            RadiusGroup: { select: { id: true, name: true, speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true } },
          },
        },
        RadiusSession: {
          orderBy: { startTime: "desc" },
          take: 10,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "RADIUS user not found" },
        { status: 404 }
      );
    }

    // Map to a flat shape: username/password come from subscriber
    const mapped = {
      id: user.id,
      subscriberId: user.subscriberId,
      username: user.Subscriber.serviceUsername,
      password: user.Subscriber.servicePassword,
      subscriberName: user.Subscriber.name,
      subscriberCode: user.Subscriber.code,
      subscriberPhone: user.Subscriber.phone,
      subscriberStatus: user.Subscriber.status,
      radiusEnabled: user.Subscriber.radiusEnabled,
      radiusGroupId: user.Subscriber.radiusGroupId,
      radiusGroupName: user.Subscriber.RadiusGroup?.name || "",
      sessionTimeout: user.Subscriber.sessionTimeout,
      idleTimeout: user.Subscriber.idleTimeout,
      lastAuthAt: user.Subscriber.lastAuthAt,
      lastAuthResult: user.Subscriber.lastAuthResult,
      planName: user.Subscriber.Plan?.name || "",
      planGroup: user.Subscriber.Plan?.RadiusGroup?.name || "",
      sessions: user.RadiusSession,
      createdAt: user.createdAt,
    };

    return NextResponse.json({ user: mapped });
  } catch (error) {
    console.error("RADIUS user get error:", error);
    return NextResponse.json(
      { error: "Failed to fetch RADIUS user" },
      { status: 500 }
    );
  }
}

// Helper: Update user's group in FreeRADIUS tables
async function syncGroupToFreeRADIUS(
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
    await db.$queryRawUnsafe(`INSERT INTO radusergroup (username, groupname, priority) VALUES ('${uname}', '${grp}', 1) ON CONFLICT (username, groupname) DO NOTHING`);
    const rateLimit = (await db.$queryRawUnsafe<{ value: string }[]>(`SELECT value FROM radgroupreply WHERE groupname = '${grp}' AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1`))[0]?.value;
    if (rateLimit) {
      const rl = rateLimit.replace(/'/g, "''");
      await db.$queryRawUnsafe(`INSERT INTO radreply (username, attribute, op, value) VALUES ('${uname}', 'Mikrotik-Rate-Limit', ':=', '${rl}') ON CONFLICT (username, attribute) DO UPDATE SET value = '${rl}'`);
    }
  }
}

// Helper: Remove user from FreeRADIUS tables
async function removeFromFreeRADIUS(username: string) {
  const uname = username.replace(/'/g, "''");
  await db.$queryRawUnsafe(`DELETE FROM radcheck WHERE username = '${uname}'`);
  await db.$queryRawUnsafe(`DELETE FROM radreply WHERE username = '${uname}'`);
  await db.$queryRawUnsafe(`DELETE FROM radusergroup WHERE username = '${uname}'`);
}

// PUT /api/radius-users/[id] - Update RADIUS user (updates subscriber's RADIUS fields + syncs to FreeRADIUS)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const body = await request.json();
    const {
      serviceUsername,
      servicePassword,
      radiusGroupId,
      sessionTimeout,
      idleTimeout,
    } = body;

    const existing = await db.radiusUser.findUnique({ 
      where: { id },
      include: {
        Subscriber: { select: { radiusGroupId: true, RadiusGroup: { select: { name: true } } } },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "RADIUS user not found" },
        { status: 404 }
      );
    }
    const oldGroupName = existing.Subscriber?.RadiusGroup?.name || null;

    // Build update data for subscriber
    const subscriberUpdate: Record<string, unknown> = {};

    if (serviceUsername !== undefined) {
      if (!serviceUsername?.trim()) {
        return NextResponse.json({ error: "Service username is required" }, { status: 400 });
      }
      // Check uniqueness
      const dup = await db.subscriber.findFirst({
        where: { serviceUsername: serviceUsername.trim(), NOT: { id: existing.subscriberId } },
      });
      if (dup) {
        return NextResponse.json({ error: "Service username already exists" }, { status: 409 });
      }
      subscriberUpdate.serviceUsername = serviceUsername.trim();
    }

    if (servicePassword !== undefined && servicePassword !== "") {
      subscriberUpdate.servicePassword = servicePassword.trim();
    }

    if (radiusGroupId !== undefined) {
      if (radiusGroupId) {
        const group = await db.radiusGroup.findUnique({ where: { id: radiusGroupId } });
        if (!group) {
          return NextResponse.json({ error: "RADIUS group not found" }, { status: 404 });
        }
      }
      subscriberUpdate.radiusGroupId = radiusGroupId || null;
    }

    if (sessionTimeout !== undefined) {
      subscriberUpdate.sessionTimeout = sessionTimeout || null;
    }

    if (idleTimeout !== undefined) {
      subscriberUpdate.idleTimeout = idleTimeout || null;
    }

    // Update subscriber's RADIUS fields
    const updatedSubscriber = await db.subscriber.update({
      where: { id: existing.subscriberId },
      data: subscriberUpdate,
      include: {
        RadiusGroup: { select: { id: true, name: true } },
      },
    });

    // Refresh the RadiusUser record (touch updatedAt)
    await db.radiusUser.update({
      where: { id },
      data: {},
    });

    // Sync changes to FreeRADIUS tables
    if (servicePassword !== undefined) {
      const pwd = servicePassword.trim().replace(/'/g, "''");
      await db.$queryRawUnsafe(`UPDATE radcheck SET value = '${pwd}' WHERE username = '${updatedSubscriber.serviceUsername.replace(/'/g, "''")}' AND attribute = 'Cleartext-Password'`);
    }
    if (radiusGroupId !== undefined) {
      await syncGroupToFreeRADIUS(updatedSubscriber.serviceUsername, oldGroupName, updatedSubscriber.RadiusGroup?.name || null);
    }

    await auditUpdate(request, "RadiusUser", id, body, existing);

    return NextResponse.json({
      User: {
        id: existing.id,
        subscriberId: existing.subscriberId,
        username: updatedSubscriber.serviceUsername,
        password: updatedSubscriber.servicePassword,
        radiusGroupId: updatedSubscriber.radiusGroupId,
        radiusGroupName: updatedSubscriber.RadiusGroup?.name || null,
        sessionTimeout: updatedSubscriber.sessionTimeout,
        idleTimeout: updatedSubscriber.idleTimeout,
        radiusEnabled: updatedSubscriber.radiusEnabled,
        updatedAt: new Date(),
      },
    });
  } catch (error: unknown) {
    console.error("RADIUS user update error:", error);
    return NextResponse.json(
      { error: "Failed to update RADIUS user" },
      { status: 500 }
    );
  }
}

// DELETE /api/radius-users/[id] - Delete RADIUS user and disable RADIUS on subscriber
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const existing = await db.radiusUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "RADIUS user not found" },
        { status: 404 }
      );
    }

    const deletedRecord = { ...existing };

    // Get subscriber info for FreeRADIUS cleanup
    const sub = await db.subscriber.findUnique({ where: { id: existing.subscriberId }, select: { serviceUsername: true } });

    // Delete RadiusUser record
    await db.radiusUser.delete({ where: { id } });

    // Disable RADIUS on subscriber
    await db.subscriber.update({
      where: { id: existing.subscriberId },
      data: { radiusEnabled: false },
    });

    // Remove from FreeRADIUS tables
    if (sub?.serviceUsername) {
      await removeFromFreeRADIUS(sub.serviceUsername);
    }

    await auditDelete(request, "RadiusUser", id, deletedRecord);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("RADIUS user delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete RADIUS user" },
      { status: 500 }
    );
  }
}
