/**
 * CRYPTSKINTELLIGENT — /api/aaa/users/[username]
 *
 * Single-user operations against FreeRADIUS tables.
 * Next.js 16 pattern: params is a Promise.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

// ---------------------------------------------------------------------------
// GET /api/aaa/users/[username] — Get full detail for a single AAA user
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    await requireAuth(request);
    const { username: rawUsername } = await params;
    const username = decodeURIComponent(rawUsername);

    // Verify user exists
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM radcheck WHERE username = $1) AS exists`,
      username
    );
    if (!exists[0]?.exists) {
      return NextResponse.json(
        { success: false, error: `User '${username}' not found` },
        { status: 404 }
      );
    }

    // Fetch all radcheck attributes
    const checkAttrs = await db.$queryRawUnsafe<
      { id: number; attribute: string; op: string; value: string; created_at: string }[]
    >(
      `SELECT id, attribute, op, value, "createdAt" as created_at
       FROM radcheck
       WHERE username = $1
       ORDER BY attribute`,
      username
    );

    // Fetch all radreply attributes
    const replyAttrs = await db.$queryRawUnsafe<
      { id: number; attribute: string; op: string; value: string; created_at: string }[]
    >(
      `SELECT id, attribute, op, value, "createdAt" as created_at
       FROM radreply
       WHERE username = $1
       ORDER BY attribute`,
      username
    );

    // Fetch group assignments (can be multiple)
    const groups = await db.$queryRawUnsafe<
      { id: number; groupname: string; priority: number }[]
    >(
      `SELECT id, groupname, priority
       FROM radusergroup
       WHERE username = $1
       ORDER BY priority`,
      username
    );

    // Fetch linked subscriber
    const subscribers = await db.$queryRawUnsafe<
      {
        id: string;
        name: string;
        code: string;
        phone: string;
        email: string;
        status: string;
        radiusEnabled: boolean;
        ipAddress: string;
        macAddress: string;
        connectionType: string;
        planId: string | null;
        planName: string | null;
        areaId: string | null;
        areaName: string | null;
        radiusGroupId: string | null;
        sessionTimeout: number | null;
        idleTimeout: number | null;
        lastAuthAt: string | null;
        lastAuthResult: string;
      }[]
    >(
      `SELECT
         s.id, s.name, s.code, s.phone, s.email, s.status,
         s."radiusEnabled", s."ipAddress", s."macAddress", s."connectionType",
         s."planId", p.name AS "planName",
         s."areaId", a.name AS "areaName",
         s."radiusGroupId",
         s."sessionTimeout", s."idleTimeout",
         s."lastAuthAt", s."lastAuthResult"
       FROM "Subscriber" s
       LEFT JOIN "Plan" p ON p.id = s."planId"
       LEFT JOIN "Area" a ON a.id = s."areaId"
       WHERE s."serviceUsername" = $1`,
      username
    );
    const subscriber = subscribers[0] || null;

    // Fetch radius group details
    let radiusGroup: Record<string, unknown> | null = null;
    if (subscriber?.radiusGroupId) {
      const rgRows = await db.$queryRawUnsafe<
        {
          id: string;
          name: string;
          description: string;
          speedLimitDown: number;
          speedLimitUp: number;
          dataLimit: number | null;
          sessionTimeout: number | null;
          priority: number;
        }[]
      >(
        `SELECT id, name, description, "speedLimitDown", "speedLimitUp",
                "dataLimit", "sessionTimeout", priority
         FROM "RadiusGroup"
         WHERE id = $1`,
        subscriber.radiusGroupId
      );
      radiusGroup = rgRows[0] || null;
    }

    // Fetch group reply attributes (for inherited attributes display)
    let groupReplyAttrs: { attribute: string; op: string; value: string }[] = [];
    const primaryGroup = groups[0];
    if (primaryGroup) {
      groupReplyAttrs = await db.$queryRawUnsafe<
        { attribute: string; op: string; value: string }[]
      >(
        `SELECT attribute, op, value FROM radgroupreply WHERE groupname = $1 ORDER BY attribute`,
        primaryGroup.groupname
      );
    }

    // Fetch group check attributes (for inherited check display)
    let groupCheckAttrs: { attribute: string; op: string; value: string }[] = [];
    if (primaryGroup) {
      groupCheckAttrs = await db.$queryRawUnsafe<
        { attribute: string; op: string; value: string }[]
      >(
        `SELECT attribute, op, value FROM radgroupcheck WHERE groupname = $1 ORDER BY attribute`,
        primaryGroup.groupname
      );
    }

    // Fetch recent auth attempts (last 10)
    const recentAuth = await db.$queryRawUnsafe<
      { reply: string; authdate: string; nasipaddress: string; clientipaddress: string }[]
    >(
      `SELECT reply, authdate,
              CAST(nasipaddress AS text) AS "nasIp",
              CAST(clientipaddress AS text) AS "clientIp"
       FROM radpostauth
       WHERE username = $1
       ORDER BY authdate DESC
       LIMIT 10`,
      username
    );

    // Fetch active session (if any)
    const activeSessions = await db.$queryRawUnsafe<
      {
        sessionId: string;
        nasIp: string;
        framedIp: string;
        startTime: string;
        callingStationId: string;
      }[]
    >(
      `SELECT
         acctsessionid AS "sessionId",
         CAST(nasipaddress AS text) AS "nasIp",
         CAST(framedipaddress AS text) AS "framedIp",
         acctstarttime AS "startTime",
         callingstationid AS "callingStationId"
       FROM radacct
       WHERE username = $1 AND acctstoptime IS NULL`,
      username
    );

    return NextResponse.json({
      success: true,
      data: {
        username,
        checkAttributes: checkAttrs.map((a) => ({
          id: a.id,
          attribute: a.attribute,
          op: a.op,
          value: a.value,
          createdAt: a.created_at,
        })),
        replyAttributes: replyAttrs.map((a) => ({
          id: a.id,
          attribute: a.attribute,
          op: a.op,
          value: a.value,
          createdAt: a.created_at,
        })),
        groups: groups.map((g) => ({
          id: g.id,
          name: g.groupname,
          priority: g.priority,
        })),
        // Inherited group attributes (read-only info)
        groupCheckAttributes: groupCheckAttrs,
        groupReplyAttributes: groupReplyAttrs,
        subscriber: subscriber
          ? {
              id: subscriber.id,
              name: subscriber.name,
              code: subscriber.code,
              phone: subscriber.phone,
              email: subscriber.email,
              status: subscriber.status,
              radiusEnabled: subscriber.radiusEnabled,
              ipAddress: subscriber.ipAddress,
              macAddress: subscriber.macAddress,
              connectionType: subscriber.connectionType,
              planId: subscriber.planId,
              planName: subscriber.planName,
              areaId: subscriber.areaId,
              areaName: subscriber.areaName,
              sessionTimeout: subscriber.sessionTimeout,
              idleTimeout: subscriber.idleTimeout,
              lastAuthAt: subscriber.lastAuthAt,
              lastAuthResult: subscriber.lastAuthResult,
            }
          : null,
        radiusGroup,
        recentAuthAttempts: recentAuth.map((a) => ({
          result: a.reply,
          date: a.authdate,
          nasIp: a.nasipaddress,
          clientIp: a.clientipaddress,
        })),
        activeSessions: activeSessions.map((s) => ({
          sessionId: s.sessionId,
          nasIp: s.nasIp,
          framedIp: s.framedIp,
          startTime: s.startTime,
          callingStationId: s.callingStationId,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[aaa/users/[username]] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch AAA user details" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT /api/aaa/users/[username] — Update a specific user (body-based actions)
// ---------------------------------------------------------------------------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { userId } = await requireAuth(request);
    const { username: rawUsername } = await params;
    const username = decodeURIComponent(rawUsername);

    // Verify user exists
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM radcheck WHERE username = $1) AS exists`,
      username
    );
    if (!exists[0]?.exists) {
      return NextResponse.json(
        { success: false, error: `User '${username}' not found` },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { action } = body as { action: string };

    if (!action?.trim()) {
      return NextResponse.json(
        { success: false, error: "action is required" },
        { status: 400 }
      );
    }

    switch (action) {
      // ── Change password ──────────────────────────────────
      case "change-password": {
        const { newPassword } = body as { newPassword: string };
        if (!newPassword?.trim()) {
          return NextResponse.json(
            { success: false, error: "newPassword is required" },
            { status: 400 }
          );
        }

        await db.$queryRawUnsafe(
          `UPDATE radcheck SET value = $1 WHERE username = $2 AND attribute = 'Cleartext-Password'`,
          newPassword,
          username
        );
        await db.$queryRawUnsafe(
          `UPDATE "Subscriber" SET "servicePassword" = $1 WHERE "serviceUsername" = $2`,
          newPassword,
          username
        );

        await auditCreate(request, "AAAUser", username, { action: "change-password" });
        return NextResponse.json({ success: true, message: "Password updated" });
      }

      // ── Change group ─────────────────────────────────────
      case "change-group": {
        const { groupname, priority } = body as {
          groupname: string;
          priority?: number;
        };
        if (!groupname?.trim()) {
          return NextResponse.json(
            { success: false, error: "groupname is required" },
            { status: 400 }
          );
        }

        const groupExists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
          `SELECT EXISTS(SELECT 1 FROM "RadiusGroup" WHERE name = $1) AS exists`,
          groupname
        );
        if (!groupExists[0]?.exists) {
          return NextResponse.json(
            { success: false, error: `RADIUS group '${groupname}' not found` },
            { status: 400 }
          );
        }

        await db.$queryRawUnsafe(
          `DELETE FROM radusergroup WHERE username = $1`,
          username
        );
        await db.$queryRawUnsafe(
          `INSERT INTO radusergroup (username, groupname, priority) VALUES ($1, $2, $3)`,
          username,
          groupname,
          priority ?? 1
        );

        // Sync rate-limit from group
        const rateLimit = await db.$queryRawUnsafe<{ value: string }[]>(
          `SELECT value FROM radgroupreply WHERE groupname = $1 AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1`,
          groupname
        );
        if (rateLimit[0]?.value) {
          await db.$queryRawUnsafe(
            `INSERT INTO radreply (username, attribute, op, value, "createdAt") VALUES ($1, 'Mikrotik-Rate-Limit', ':=', $2, NOW())
             ON CONFLICT DO NOTHING`,
            username,
            rateLimit[0].value
          );
        }

        // Update subscriber link
        const rgId = await db.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM "RadiusGroup" WHERE name = $1 LIMIT 1`,
          groupname
        );
        if (rgId[0]?.id) {
          await db.$queryRawUnsafe(
            `UPDATE "Subscriber" SET "radiusGroupId" = $1 WHERE "serviceUsername" = $2`,
            rgId[0].id,
            username
          );
        }

        await auditCreate(request, "AAAUser", username, { action: "change-group", groupname });
        return NextResponse.json({ success: true, message: "Group updated" });
      }

      // ── Batch set reply attributes (replaces all) ────────
      case "set-reply-attrs": {
        const { attributes } = body as {
          attributes: { attribute: string; op?: string; value: string }[];
        };
        if (!Array.isArray(attributes)) {
          return NextResponse.json(
            { success: false, error: "attributes array is required" },
            { status: 400 }
          );
        }

        // Delete all existing reply attrs
        await db.$queryRawUnsafe(
          `DELETE FROM radreply WHERE username = $1`,
          username
        );

        // Insert new ones
        for (const attr of attributes) {
          if (!attr.attribute || attr.value === undefined) continue;
          await db.$queryRawUnsafe(
            `INSERT INTO radreply (username, attribute, op, value, "createdAt")
             VALUES ($1, $2, $3, $4, NOW())`,
            username,
            attr.attribute,
            attr.op || "=",
            String(attr.value)
          );
        }

        await auditCreate(request, "AAAUser", username, {
          action: "set-reply-attrs",
          count: attributes.length,
        });
        return NextResponse.json({ success: true, message: "Reply attributes updated" });
      }

      // ── Batch set check attributes (replaces all except password) ─
      case "set-check-attrs": {
        const { attributes } = body as {
          attributes: { attribute: string; op?: string; value: string }[];
        };
        if (!Array.isArray(attributes)) {
          return NextResponse.json(
            { success: false, error: "attributes array is required" },
            { status: 400 }
          );
        }

        // Delete all check attrs except Cleartext-Password
        await db.$queryRawUnsafe(
          `DELETE FROM radcheck WHERE username = $1 AND attribute != 'Cleartext-Password'`,
          username
        );

        // Insert new ones (skip Cleartext-Password)
        for (const attr of attributes) {
          if (!attr.attribute || attr.value === undefined) continue;
          if (attr.attribute === "Cleartext-Password") continue;
          await db.$queryRawUnsafe(
            `INSERT INTO radcheck (username, attribute, op, value, "createdAt")
             VALUES ($1, $2, $3, $4, NOW())`,
            username,
            attr.attribute,
            attr.op || "==",
            String(attr.value)
          );
        }

        await auditCreate(request, "AAAUser", username, {
          action: "set-check-attrs",
          count: attributes.length,
        });
        return NextResponse.json({ success: true, message: "Check attributes updated" });
      }

      // ── Toggle RADIUS enabled ────────────────────────────
      case "toggle-enabled": {
        const { enabled } = body as { enabled: boolean };
        if (typeof enabled !== "boolean") {
          return NextResponse.json(
            { success: false, error: "enabled (boolean) is required" },
            { status: 400 }
          );
        }

        const result = await db.$queryRawUnsafe<{ updated: number }[]>(
          `UPDATE "Subscriber" SET "radiusEnabled" = $1 WHERE "serviceUsername" = $2 RETURNING 1 AS updated`,
          enabled,
          username
        );

        if ((result as unknown[]).length === 0) {
          return NextResponse.json(
            { success: false, error: "No linked subscriber found" },
            { status: 404 }
          );
        }

        if (!enabled) {
          await db.$queryRawUnsafe(`DELETE FROM radcheck WHERE username = $1`, username);
          await db.$queryRawUnsafe(`DELETE FROM radreply WHERE username = $1`, username);
          await db.$queryRawUnsafe(`DELETE FROM radusergroup WHERE username = $1`, username);
        }

        await auditCreate(request, "AAAUser", username, { action: "toggle-enabled", enabled });
        return NextResponse.json({
          success: true,
          message: enabled ? "RADIUS enabled" : "RADIUS disabled and credentials removed",
        });
      }

      // ── Disconnect active sessions (CoA) ─────────────────
      case "disconnect": {
        // Find active sessions for this user
        const sessions = await db.$queryRawUnsafe<
          { acctsessionid: string; nasipaddress: string }[]
        >(
          `SELECT acctsessionid, CAST(nasipaddress AS text) FROM radacct
           WHERE username = $1 AND acctstoptime IS NULL`,
          username
        );

        if (sessions.length === 0) {
          return NextResponse.json({
            success: true,
            message: "No active sessions to disconnect",
            sessionsTerminated: 0,
          });
        }

        // Terminate sessions in radacct (set stop time)
        await db.$queryRawUnsafe(
          `UPDATE radacct
           SET acctstoptime = NOW(),
               acctsessiontime = CAST(EXTRACT(EPOCH FROM (NOW() - acctstarttime)) AS int),
               acctterminatecause = 'Admin-Reset'
           WHERE username = $1 AND acctstoptime IS NULL`,
          username
        );

        await auditCreate(request, "AAAUser", username, {
          action: "disconnect",
          sessionsTerminated: sessions.length,
        });
        return NextResponse.json({
          success: true,
          message: `${sessions.length} session(s) terminated`,
          sessionsTerminated: sessions.length,
        });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}. Valid: change-password, change-group, set-reply-attrs, set-check-attrs, toggle-enabled, disconnect`,
          },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[aaa/users/[username]] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update AAA user" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/aaa/users/[username] — Delete a single AAA user
// Optional query params: disableSubscriber=true
// ---------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { userId } = await requireAuth(request);
    const { username: rawUsername } = await params;
    const username = decodeURIComponent(rawUsername);

    // Verify user exists
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM radcheck WHERE username = $1) AS exists`,
      username
    );
    if (!exists[0]?.exists) {
      return NextResponse.json(
        { success: false, error: `User '${username}' not found` },
        { status: 404 }
      );
    }

    // Check disableSubscriber query param
    const sp = request.nextUrl.searchParams;
    const disableSubscriber = sp.get("disableSubscriber") === "true";

    // Delete from FreeRADIUS tables
    const deletedCheck = await db.$queryRawUnsafe<{ count: number }[]>(
      `DELETE FROM radcheck WHERE username = $1 RETURNING CAST(COUNT(*) AS int) AS count`,
      username
    );
    await db.$queryRawUnsafe(`DELETE FROM radreply WHERE username = $1`, username);
    await db.$queryRawUnsafe(`DELETE FROM radusergroup WHERE username = $1`, username);

    // Optionally disable subscriber
    if (disableSubscriber) {
      await db.$queryRawUnsafe(
        `UPDATE "Subscriber"
         SET "radiusEnabled" = false, status = 'DISCONNECTED', "servicePassword" = ''
         WHERE "serviceUsername" = $1`,
        username
      );
    }

    await auditCreate(request, "AAAUser", username, {
      action: "delete",
      username,
      disableSubscriber,
    });

    return NextResponse.json({
      success: true,
      message: `User '${username}' deleted from FreeRADIUS tables`,
      deleted: {
        radcheck: deletedCheck[0]?.count ?? 0,
        radreply: true,
        radusergroup: true,
        subscriberDisabled: disableSubscriber,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[aaa/users/[username]] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete AAA user" },
      { status: 500 }
    );
  }
}
