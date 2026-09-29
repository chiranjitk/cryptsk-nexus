/**
 * CRYPTSKINTELLIGENT — /api/aaa/users
 *
 * Full CRUD against FreeRADIUS user tables (radcheck, radreply, radusergroup)
 * with Prisma-model enrichment (Subscriber, RadiusGroup).
 *
 * All SQL uses $queryRawUnsafe with parameterized $N placeholders for PostgreSQL.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

// ---------------------------------------------------------------------------
// Helper: SQL-escape a string for use inside DML (INSERT/UPDATE/DELETE)
// ---------------------------------------------------------------------------
function esc(val: string | null | undefined): string {
  if (val == null) return "NULL";
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// GET /api/aaa/users — List all AAA users (unique usernames from radcheck)
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const sp = request.nextUrl.searchParams;
    const search = sp.get("search") || "";
    const group = sp.get("group") || "";
    const status = sp.get("status") || "";
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const limit = Math.min(200, Math.max(10, parseInt(sp.get("limit") || "50")));
    const offset = (page - 1) * limit;

    // ---------- dynamic WHERE ----------
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push(`rc.username ILIKE $${params.length + 1}`);
      params.push(`%${search}%`);
    }
    if (group) {
      conditions.push(`ug.groupname = $${params.length + 1}`);
      params.push(group);
    }
    if (status) {
      const validStatuses = ["ACTIVE", "SUSPENDED", "INACTIVE", "DISCONNECTED", "TRIAL", "PENDING_ACTIVATION"];
      const upper = status.toUpperCase();
      if (validStatuses.includes(upper)) {
        conditions.push(`s.status = $${params.length + 1}`);
        params.push(upper);
      }
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // ---------- COUNT ----------
    const countRes = await db.$queryRawUnsafe<{ total: number }[]>(
      `SELECT CAST(COUNT(*) AS int) AS total
       FROM (SELECT DISTINCT rc.username FROM radcheck rc
             LEFT JOIN radusergroup ug ON ug.username = rc.username
             LEFT JOIN "Subscriber" s ON s."serviceUsername" = rc.username
             ${where}) _q`,
      ...params
    );
    const total = countRes[0]?.total ?? 0;

    // ---------- ROWS ----------
    const rows = await db.$queryRawUnsafe<
      {
        username: string;
        password: string | null;
        groupname: string | null;
        priority: number | null;
        sub_id: string | null;
        sub_name: string | null;
        sub_code: string | null;
        sub_phone: string | null;
        sub_email: string | null;
        sub_status: string | null;
        sub_enabled: boolean | null;
        sub_ip: string | null;
        sub_mac: string | null;
        sub_connection_type: string | null;
        rg_id: string | null;
        rg_name: string | null;
        rg_speed_down: number | null;
        rg_speed_up: number | null;
        rg_data_limit: number | null;
        rg_session_timeout: number | null;
      }[]
    >(
      `SELECT
         rc.username,
         (SELECT value FROM radcheck WHERE username = rc.username AND attribute = 'Cleartext-Password' LIMIT 1) AS password,
         ug.groupname,
         ug.priority,
         s.id AS sub_id,
         s.name AS sub_name,
         s.code AS sub_code,
         s.phone AS sub_phone,
         s.email AS sub_email,
         s.status AS sub_status,
         s."radiusEnabled" AS sub_enabled,
         s."ipAddress" AS sub_ip,
         s."macAddress" AS sub_mac,
         s."connectionType" AS sub_connection_type,
         rg.id AS rg_id,
         rg.name AS rg_name,
         rg."speedLimitDown" AS rg_speed_down,
         rg."speedLimitUp" AS rg_speed_up,
         rg."dataLimit" AS rg_data_limit,
         rg."sessionTimeout" AS rg_session_timeout
       FROM radcheck rc
       LEFT JOIN radusergroup ug ON ug.username = rc.username
       LEFT JOIN "Subscriber" s ON s."serviceUsername" = rc.username
       LEFT JOIN "RadiusGroup" rg ON rg.id = s."radiusGroupId"
       ${where}
       GROUP BY rc.username, ug.groupname, ug.priority,
                s.id, s.name, s.code, s.phone, s.email, s.status,
                s."radiusEnabled", s."ipAddress", s."macAddress", s."connectionType",
                rg.id, rg.name, rg."speedLimitDown", rg."speedLimitUp", rg."dataLimit", rg."sessionTimeout"
       ORDER BY rc.username
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params,
      limit,
      offset
    );

    // For each user, also fetch all radcheck and radreply attribute rows
    const usernames = rows.map((r) => r.username);

    // Batch-fetch radcheck attributes for these users
    let radcheckMap: Record<string, { attribute: string; op: string; value: string }[]> = {};
    if (usernames.length > 0) {
      const rcAttrs = await db.$queryRawUnsafe<
        { username: string; attribute: string; op: string; value: string }[]
      >(
        `SELECT username, attribute, op, value FROM radcheck WHERE username = ANY($1) ORDER BY username, attribute`,
        usernames
      );
      for (const attr of rcAttrs) {
        if (!radcheckMap[attr.username]) radcheckMap[attr.username] = [];
        radcheckMap[attr.username].push({
          attribute: attr.attribute,
          op: attr.op,
          value: attr.value,
        });
      }
    }

    // Batch-fetch radreply attributes for these users
    let radreplyMap: Record<string, { attribute: string; op: string; value: string }[]> = {};
    if (usernames.length > 0) {
      const rrAttrs = await db.$queryRawUnsafe<
        { username: string; attribute: string; op: string; value: string }[]
      >(
        `SELECT username, attribute, op, value FROM radreply WHERE username = ANY($1) ORDER BY username, attribute`,
        usernames
      );
      for (const attr of rrAttrs) {
        if (!radreplyMap[attr.username]) radreplyMap[attr.username] = [];
        radreplyMap[attr.username].push({
          attribute: attr.attribute,
          op: attr.op,
          value: attr.value,
        });
      }
    }

    // Map the response
    const users = rows.map((r) => ({
      username: r.username,
      password: r.password,
      checkAttributes: radcheckMap[r.username] || [],
      replyAttributes: radreplyMap[r.username] || [],
      group: r.groupname ? { name: r.groupname, priority: r.priority } : null,
      subscriber: r.sub_id
        ? {
            id: r.sub_id,
            name: r.sub_name,
            code: r.sub_code,
            phone: r.sub_phone,
            email: r.sub_email,
            status: r.sub_status,
            radiusEnabled: r.sub_enabled ?? false,
            ipAddress: r.sub_ip,
            macAddress: r.sub_mac,
            connectionType: r.sub_connection_type,
          }
        : null,
      radiusGroup: r.rg_id
        ? {
            id: r.rg_id,
            name: r.rg_name,
            speedLimitDown: r.rg_speed_down,
            speedLimitUp: r.rg_speed_up,
            dataLimit: r.rg_data_limit,
            sessionTimeout: r.rg_session_timeout,
          }
        : null,
    }));

    // ---------- STATS ----------
    const statsRows = await db.$queryRawUnsafe<
      {
        total_users: number;
        active_subscribers: number;
        radius_enabled: number;
      }[]
    >(`
      SELECT
        (SELECT CAST(COUNT(DISTINCT username) AS int) FROM radcheck) AS total_users,
        (SELECT CAST(COUNT(*) AS int) FROM "Subscriber" s WHERE s."serviceUsername" IN (SELECT DISTINCT username FROM radcheck) AND s.status = 'ACTIVE') AS active_subscribers,
        (SELECT CAST(COUNT(*) AS int) FROM "Subscriber" s WHERE s."serviceUsername" IN (SELECT DISTINCT username FROM radcheck) AND s."radiusEnabled" = true) AS radius_enabled
    `);
    const baseStats = statsRows[0] ?? {
      total_users: 0,
      active_subscribers: 0,
      radius_enabled: 0,
    };

    // Per-group counts
    const groupCounts = await db.$queryRawUnsafe<
      { groupname: string; count: number }[]
    >(
      `SELECT ug.groupname, CAST(COUNT(DISTINCT ug.username) AS int) AS count
       FROM radusergroup ug
       GROUP BY ug.groupname
       ORDER BY count DESC`
    );

    // Per-status counts (from Subscriber)
    const statusCounts = await db.$queryRawUnsafe<
      { status: string; count: number }[]
    >(
      `SELECT s.status, CAST(COUNT(*) AS int) AS count
       FROM "Subscriber" s
       WHERE s."serviceUsername" IN (SELECT DISTINCT username FROM radcheck)
       GROUP BY s.status
       ORDER BY count DESC`
    );

    return NextResponse.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      stats: {
        totalUsers: baseStats.total_users,
        activeSubscribers: baseStats.active_subscribers,
        radiusEnabled: baseStats.radius_enabled,
        byGroup: groupCounts.map((g) => ({
          group: g.groupname,
          count: g.count,
        })),
        byStatus: statusCounts.map((s) => ({
          status: s.status,
          count: s.count,
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
    console.error("[aaa/users] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list AAA users" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/aaa/users — Create a new AAA user
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    const {
      username,
      password,
      groupname,
      priority,
      checkAttributes,
      replyAttributes,
      subscriberData,
    } = body as {
      username: string;
      password: string;
      groupname?: string;
      priority?: number;
      checkAttributes?: { attribute: string; op?: string; value: string }[];
      replyAttributes?: { attribute: string; op?: string; value: string }[];
      subscriberData?: {
        name: string;
        code?: string;
        phone?: string;
        email?: string;
        planId?: string;
        areaId?: string;
        radiusGroupId?: string;
        ipAddress?: string;
        macAddress?: string;
        connectionType?: string;
      };
    };

    // ---------- validation ----------
    const errors: string[] = [];
    if (!username?.trim()) errors.push("username is required");
    if (!password?.trim()) errors.push("password is required");
    if (username && username.length > 64) errors.push("username must be ≤ 64 characters");
    if (password && password.length > 253) errors.push("password must be ≤ 253 characters");
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors.join("; ") },
        { status: 400 }
      );
    }

    // Check if user already exists in radcheck
    const existing = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM radcheck WHERE username = $1) AS exists`,
      username
    );
    if (existing[0]?.exists) {
      return NextResponse.json(
        { success: false, error: `User '${username}' already exists in radcheck` },
        { status: 409 }
      );
    }

    // Validate groupname if provided
    if (groupname) {
      const groupExists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS(SELECT 1 FROM "RadiusGroup" WHERE name = $1) AS exists`,
        groupname
      );
      if (!groupExists[0]?.exists) {
        return NextResponse.json(
          { success: false, error: `RADIUS group '${groupname}' does not exist` },
          { status: 400 }
        );
      }
    }

    // ---------- Insert into radcheck ----------

    // Primary password entry
    await db.$queryRawUnsafe(
      `INSERT INTO radcheck (username, attribute, op, value)
       VALUES ($1, 'Cleartext-Password', ':=', $2)`,
      username,
      password
    );

    // Extra check attributes
    if (checkAttributes?.length) {
      for (const attr of checkAttributes) {
        if (!attr.attribute || attr.value === undefined) continue;
        const op = attr.op || "==";
        await db.$queryRawUnsafe(
          `INSERT INTO radcheck (username, attribute, op, value)
           VALUES ($1, $2, $3, $4)`,
          username,
          attr.attribute,
          op,
          String(attr.value)
        );
      }
    }

    // ---------- Insert into radreply ----------
    if (replyAttributes?.length) {
      for (const attr of replyAttributes) {
        if (!attr.attribute || attr.value === undefined) continue;
        const op = attr.op || "=";
        await db.$queryRawUnsafe(
          `INSERT INTO radreply (username, attribute, op, value)
           VALUES ($1, $2, $3, $4)`,
          username,
          attr.attribute,
          op,
          String(attr.value)
        );
      }
    }

    // ---------- Insert into radusergroup ----------
    if (groupname) {
      const prio = priority ?? 1;
      await db.$queryRawUnsafe(
        `INSERT INTO radusergroup (username, groupname, priority)
         VALUES ($1, $2, $3)`,
        username,
        groupname,
        prio
      );
    }

    // ---------- Optionally create Subscriber ----------
    let subscriber: Record<string, unknown> | null = null;
    if (subscriberData) {
      const sd = subscriberData;

      // Validate planId if provided
      if (sd.planId) {
        const planExists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
          `SELECT EXISTS(SELECT 1 FROM "Plan" WHERE id = $1) AS exists`,
          sd.planId
        );
        if (!planExists[0]?.exists) {
          return NextResponse.json(
            { success: false, error: `Plan with id '${sd.planId}' not found` },
            { status: 400 }
          );
        }
      }

      // Generate subscriber code if not provided
      const code = sd.code || `CRY-${Date.now().toString(36).toUpperCase()}`;

      // Check code uniqueness
      const codeExists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS(SELECT 1 FROM "Subscriber" WHERE code = $1) AS exists`,
        code
      );
      if (codeExists[0]?.exists) {
        return NextResponse.json(
          { success: false, error: `Subscriber code '${code}' already in use` },
          { status: 409 }
        );
      }

      const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await db.$queryRawUnsafe(
        `INSERT INTO "Subscriber" (
           id, code, name, phone, email,
           "serviceUsername", "servicePassword",
           "planId", "areaId", "radiusGroupId",
           "ipAddress", "macAddress", "connectionType",
           "radiusEnabled", status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,'PENDING_ACTIVATION')`,
        id,
        code,
        sd.name || username,
        sd.phone || "",
        sd.email || "",
        username,
        password,
        sd.planId || null,
        sd.areaId || null,
        sd.radiusGroupId || null,
        sd.ipAddress || "",
        sd.macAddress || "",
        sd.connectionType || "FTTH"
      );

      subscriber = {
        id,
        code,
        name: sd.name || username,
        phone: sd.phone || "",
        email: sd.email || "",
        serviceUsername: username,
        status: "PENDING_ACTIVATION",
        radiusEnabled: true,
      };
    }

    await auditCreate(request, "AAAUser", username, {
      action: "create",
      username,
      groupname,
      hasSubscriber: !!subscriberData,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          username,
          password,
          group: groupname ? { name: groupname, priority: priority ?? 1 } : null,
          subscriber,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[aaa/users] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create AAA user" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT /api/aaa/users — Update an AAA user (action-based)
// ---------------------------------------------------------------------------
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    const { username, action } = body as { username: string; action: string };
    if (!username?.trim() || !action?.trim()) {
      return NextResponse.json(
        { success: false, error: "username and action are required" },
        { status: 400 }
      );
    }

    // Verify user exists
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM radcheck WHERE username = $1) AS exists`,
      username
    );
    if (!exists[0]?.exists) {
      return NextResponse.json(
        { success: false, error: `User '${username}' not found in radcheck` },
        { status: 404 }
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

        // Also update Subscriber.servicePassword if linked
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

        // Validate group
        const groupExists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
          `SELECT EXISTS(SELECT 1 FROM "RadiusGroup" WHERE name = $1) AS exists`,
          groupname
        );
        if (!groupExists[0]?.exists) {
          return NextResponse.json(
            { success: false, error: `RADIUS group '${groupname}' does not exist` },
            { status: 400 }
          );
        }

        // Remove existing group assignments
        await db.$queryRawUnsafe(
          `DELETE FROM radusergroup WHERE username = $1`,
          username
        );

        // Insert new
        await db.$queryRawUnsafe(
          `INSERT INTO radusergroup (username, groupname, priority) VALUES ($1, $2, $3)`,
          username,
          groupname,
          priority ?? 1
        );

        // Sync rate-limit from group to radreply
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

        // Update subscriber.radiusGroupId if linked
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

        await auditCreate(request, "AAAUser", username, {
          action: "change-group",
          groupname,
        });
        return NextResponse.json({ success: true, message: "Group updated" });
      }

      // ── Set user-specific reply attribute ────────────────
      case "set-reply-attr": {
        const { attribute, op, value } = body as {
          attribute: string;
          op?: string;
          value: string;
        };
        if (!attribute?.trim() || value === undefined || value === null) {
          return NextResponse.json(
            { success: false, error: "attribute and value are required" },
            { status: 400 }
          );
        }

        const attrOp = op || "=";

        // Upsert: delete existing attribute then re-insert
        await db.$queryRawUnsafe(
          `DELETE FROM radreply WHERE username = $1 AND attribute = $2`,
          username,
          attribute
        );
        await db.$queryRawUnsafe(
          `INSERT INTO radreply (username, attribute, op, value, "createdAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          username,
          attribute,
          attrOp,
          String(value)
        );

        await auditCreate(request, "AAAUser", username, {
          action: "set-reply-attr",
          attribute,
          value,
        });
        return NextResponse.json({ success: true, message: "Reply attribute set" });
      }

      // ── Remove user-specific reply attribute ─────────────
      case "remove-reply-attr": {
        const { attribute } = body as { attribute: string };
        if (!attribute?.trim()) {
          return NextResponse.json(
            { success: false, error: "attribute is required" },
            { status: 400 }
          );
        }

        await db.$queryRawUnsafe(
          `DELETE FROM radreply WHERE username = $1 AND attribute = $2`,
          username,
          attribute
        );

        await auditCreate(request, "AAAUser", username, {
          action: "remove-reply-attr",
          attribute,
        });
        return NextResponse.json({ success: true, message: "Reply attribute removed" });
      }

      // ── Set user-specific check attribute ────────────────
      case "set-check-attr": {
        const { attribute, op, value } = body as {
          attribute: string;
          op?: string;
          value: string;
        };
        if (!attribute?.trim() || value === undefined || value === null) {
          return NextResponse.json(
            { success: false, error: "attribute and value are required" },
            { status: 400 }
          );
        }

        const attrOp = op || "==";

        // Don't allow overwriting Cleartext-Password via this action (use change-password)
        if (attribute === "Cleartext-Password") {
          return NextResponse.json(
            { success: false, error: "Use action 'change-password' to update password" },
            { status: 400 }
          );
        }

        await db.$queryRawUnsafe(
          `DELETE FROM radcheck WHERE username = $1 AND attribute = $2`,
          username,
          attribute
        );
        await db.$queryRawUnsafe(
          `INSERT INTO radcheck (username, attribute, op, value, "createdAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          username,
          attribute,
          attrOp,
          String(value)
        );

        await auditCreate(request, "AAAUser", username, {
          action: "set-check-attr",
          attribute,
          value,
        });
        return NextResponse.json({ success: true, message: "Check attribute set" });
      }

      // ── Toggle RADIUS enabled on linked subscriber ───────
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
            { success: false, error: "No linked subscriber found for this username" },
            { status: 404 }
          );
        }

        // If disabling RADIUS, remove from FreeRADIUS tables
        if (!enabled) {
          await db.$queryRawUnsafe(
            `DELETE FROM radcheck WHERE username = $1`,
            username
          );
          await db.$queryRawUnsafe(
            `DELETE FROM radreply WHERE username = $1`,
            username
          );
          await db.$queryRawUnsafe(
            `DELETE FROM radusergroup WHERE username = $1`,
            username
          );
        }

        await auditCreate(request, "AAAUser", username, {
          action: "toggle-enabled",
          enabled,
        });
        return NextResponse.json({
          success: true,
          message: enabled ? "RADIUS enabled" : "RADIUS disabled and credentials removed",
        });
      }

      // ── Update subscriber status ─────────────────────────
      case "set-status": {
        const { status } = body as { status: string };
        const validStatuses = [
          "ACTIVE",
          "SUSPENDED",
          "INACTIVE",
          "DISCONNECTED",
          "TRIAL",
          "PENDING_ACTIVATION",
        ];
        if (!status || !validStatuses.includes(status.toUpperCase())) {
          return NextResponse.json(
            {
              success: false,
              error: `status must be one of: ${validStatuses.join(", ")}`,
            },
            { status: 400 }
          );
        }

        const result = await db.$queryRawUnsafe<{ updated: number }[]>(
          `UPDATE "Subscriber" SET status = $1 WHERE "serviceUsername" = $2 RETURNING 1 AS updated`,
          status.toUpperCase(),
          username
        );

        if ((result as unknown[]).length === 0) {
          return NextResponse.json(
            { success: false, error: "No linked subscriber found for this username" },
            { status: 404 }
          );
        }

        await auditCreate(request, "AAAUser", username, {
          action: "set-status",
          status,
        });
        return NextResponse.json({ success: true, message: "Subscriber status updated" });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}. Valid actions: change-password, change-group, set-reply-attr, remove-reply-attr, set-check-attr, toggle-enabled, set-status`,
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
    console.error("[aaa/users] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update AAA user" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/aaa/users — Delete an AAA user from FreeRADIUS tables
// Query params: username
// Optional body: { disableSubscriber: true }
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      userId = await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });

    const sp = request.nextUrl.searchParams;
    const username = sp.get("username");

    if (!username?.trim()) {
      return NextResponse.json(
        { success: false, error: "username query param is required" },
        { status: 400 }
      );
    }

    // Verify user exists
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM radcheck WHERE username = $1) AS exists`,
      username
    );
    if (!exists[0]?.exists) {
      return NextResponse.json(
        { success: false, error: `User '${username}' not found in radcheck` },
        { status: 404 }
      );
    }

    // Check if body has disableSubscriber flag
    let disableSubscriber = false;
    try {
      const body = await request.json();
      disableSubscriber = body.disableSubscriber === true;
    } catch {
      // No body — that's fine
    }

    // Delete from FreeRADIUS tables
    const deletedCheck = await db.$queryRawUnsafe<{ count: number }[]>(
      `DELETE FROM radcheck WHERE username = $1 RETURNING CAST(COUNT(*) AS int) AS count`,
      username
    );
    await db.$queryRawUnsafe(
      `DELETE FROM radreply WHERE username = $1`,
      username
    );
    await db.$queryRawUnsafe(
      `DELETE FROM radusergroup WHERE username = $1`,
      username
    );

    // Optionally disable the linked subscriber (NOT delete)
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
    console.error("[aaa/users] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete AAA user" },
      { status: 500 }
    );
  }
}
