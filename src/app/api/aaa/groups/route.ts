/**
 * CRYPTSKINTELLIGENT ISP Platform — FreeRADIUS Group Policy Management
 *
 * Full CRUD on FreeRADIUS group tables (radgroupcheck, radgroupreply)
 * with enrichment from the RadiusGroup Prisma model.
 *
 * GET    /api/aaa/groups          — List all groups with attributes & user counts
 * POST   /api/aaa/groups          — Create a new group with check/reply attrs
 * PUT    /api/aaa/groups          — Update group attributes (add/remove/update)
 * DELETE /api/aaa/groups          — Delete a group and all its RADIUS entries
 */

import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Serialization helper for raw SQL rows (bigint → number) ────────────────

function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      serialized[key] = typeof value === "bigint" ? Number(value) : value;
    }
    return serialized;
  });
}

// ─── Valid RADIUS operators ──────────────────────────────────────────────────

const VALID_CHECK_OPS = ["==", ":=", "!=", ">", ">=", "<", "<=", "=~", "!~", "=*", "!*"];
const VALID_REPLY_OPS = ["=", ":=", "+=", "!=", ">", ">=", "<", "<=", "=~", "!~", "=*", "!*"];

// ─── Known RADIUS attributes for validation ──────────────────────────────────

const KNOWN_CHECK_ATTRS = [
  "Auth-Type", "Simultaneous-Use", "Login-Time", "Expire-After",
  "Session-Timeout", "Max-Daily-Session", "Max-Monthly-Session", "Access-Period",
  "Cleartext-Password", "Crypt-Password", "MD5-Password", "SHA-Password",
  "NT-Password", "LM-Password", "SSHA-Password",
  "Called-Station-Id", "Calling-Station-Id", "NAS-IP-Address", "NAS-Port",
  "Service-Type", "Framed-Protocol", "Huntgroup-Name",
];

const KNOWN_REPLY_ATTRS = [
  "Framed-Protocol", "Framed-IP-Address", "Framed-IP-Netmask", "Framed-Pool",
  "Framed-Route", "Framed-Routing", "Framed-MTU",
  "WISPr-Bandwidth-Max-Down", "WISPr-Bandwidth-Max-Up",
  "Mikrotik-Rate-Limit", "Mikrotik-Address-List", "Mikrotik-Recv-Limit",
  "Mikrotik-Xmit-Limit", "Mikrotik-Total-Limit", "Mikrotik-Link-Down",
  "Mikrotik-Wireless-Comment", "Mikrotik-Wireless-Forwarding",
  "Session-Timeout", "Idle-Timeout", "Acct-Interim-Interval",
  "Service-Type", "Class", "Reply-Message",
  "Delegated-IPv6-Prefix-Pool", "Framed-IPv6-Pool", "Framed-IPv6-Address",
  "Framed-IPv6-Prefix", "Framed-IPv6-Netmask", "Framed-Interface-Id",
  "IPv6-Prefix-Pool",
  "Filter-Id", "Ascend-Data-Rate", "Ascend-Xmit-Rate",
];

// ─── GET /api/aaa/groups ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    // Build WHERE clause for search
    const whereClause = search
      ? `WHERE gname ILIKE $1`
      : "";
    const params: unknown[] = search ? [`%${search}%`] : [];

    // Main query: distinct groupnames from both tables + enrichment
    const [groupRows, totalResult] = await Promise.all([
      db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM (
          SELECT DISTINCT groupname AS gname FROM radgroupcheck
          UNION
          SELECT DISTINCT groupname AS gname FROM radgroupreply
        ) AS distinct_groups
        ${whereClause}
        ORDER BY gname ASC
        LIMIT ${limit} OFFSET ${offset}`,
        ...params
      ),
      db.$queryRawUnsafe<{ count: string }[]>(
        `SELECT CAST(COUNT(*) AS text) AS count FROM (
          SELECT DISTINCT groupname FROM radgroupcheck
          UNION
          SELECT DISTINCT groupname FROM radgroupreply
        ) AS all_groups
        ${whereClause}`,
        ...params
      ),
    ]);

    const totalGroups = Number(totalResult[0]?.count || 0);

    if (groupRows.length === 0) {
      return NextResponse.json({
        success: true,
        groups: [],
        pagination: { page, limit, total: totalGroups, totalPages: 0 },
        stats: { totalGroups: 0, totalUsersAcrossGroups: 0 },
      });
    }

    // Fetch check attrs, reply attrs, user counts, and RadiusGroup enrichment for all groups
    const groupNames = groupRows.map((r) => r.gname as string);

    // Check attributes
    const checkRows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, groupname, attribute, op, value
       FROM radgroupcheck
       WHERE groupname = ANY($1)
       ORDER BY groupname, attribute`,
      groupNames
    );

    // Reply attributes
    const replyRows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, groupname, attribute, op, value
       FROM radgroupreply
       WHERE groupname = ANY($1)
       ORDER BY groupname, attribute`,
      groupNames
    );

    // User counts from radusergroup
    const userCountRows = await db.$queryRawUnsafe<{ groupname: string; user_count: string }[]>(
      `SELECT groupname, CAST(COUNT(*) AS text) AS user_count
       FROM radusergroup
       WHERE groupname = ANY($1)
       GROUP BY groupname`,
      groupNames
    );

    // RadiusGroup Prisma enrichment
    const enrichedGroups = await db.radiusGroup.findMany({
      where: { name: { in: groupNames } },
      select: {
        id: true,
        name: true,
        description: true,
        priority: true,
        speedLimitDown: true,
        speedLimitUp: true,
        dataLimit: true,
        sessionTimeout: true,
        framedIpv6Pool: true,
        delegatedIpv6PrefixPool: true,
      },
    });

    // Build maps
    const checkMap = new Map<string, Record<string, unknown>[]>();
    for (const row of checkRows) {
      const gn = row.groupname as string;
      if (!checkMap.has(gn)) checkMap.set(gn, []);
      checkMap.get(gn)!.push(row);
    }

    const replyMap = new Map<string, Record<string, unknown>[]>();
    for (const row of replyRows) {
      const gn = row.groupname as string;
      if (!replyMap.has(gn)) replyMap.set(gn, []);
      replyMap.get(gn)!.push(row);
    }

    const userCountMap = new Map<string, number>();
    let totalUsersAcrossGroups = 0;
    for (const row of userCountRows) {
      const count = Number(row.user_count);
      userCountMap.set(row.groupname, count);
      totalUsersAcrossGroups += count;
    }

    const enrichedMap = new Map<string, Record<string, unknown>>();
    for (const eg of enrichedGroups) {
      enrichedMap.set(eg.name, eg as unknown as Record<string, unknown>);
    }

    // Assemble final groups array
    const groups = groupRows.map((row) => {
      const gname = row.gname as string;
      const checks = serializeRows(checkMap.get(gname) || []);
      const replies = serializeRows(replyMap.get(gname) || []);
      const userCount = userCountMap.get(gname) || 0;
      const enrichment = enrichedMap.get(gname) || null;

      return {
        groupname: gname,
        checkAttrs: checks,
        replyAttrs: replies,
        userCount,
        checkCount: checks.length,
        replyCount: replies.length,
        enrichment,
        description: enrichment?.description || "",
        priority: enrichment?.priority || 0,
      };
    });

    const totalPages = Math.ceil(totalGroups / limit);

    return NextResponse.json({
      success: true,
      groups,
      pagination: { page, limit, total: totalGroups, totalPages },
      stats: {
        totalGroups,
        totalUsersAcrossGroups,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[aaa/groups] GET error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── POST /api/aaa/groups ────────────────────────────────────────────────────

interface CreateGroupBody {
  groupname: string;
  description?: string;
  priority?: number;
  speedLimitDown?: number;
  speedLimitUp?: number;
  dataLimit?: number;
  sessionTimeout?: number;
  checkAttrs?: { attribute: string; op?: string; value: string }[];
  replyAttrs?: { attribute: string; op?: string; value: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const rawBody: Record<string, unknown> = await req.json();

    // Accept both 'name' and 'groupname', 'checkAttributes' and 'checkAttrs', etc.
    const body: CreateGroupBody = {
      groupname: (rawBody.groupname as string) || (rawBody.name as string) || '',
      description: rawBody.description as string | undefined,
      priority: rawBody.priority as number | undefined,
      speedLimitDown: rawBody.speedLimitDown as number | undefined,
      speedLimitUp: rawBody.speedLimitUp as number | undefined,
      dataLimit: rawBody.dataLimit as number | undefined,
      sessionTimeout: rawBody.sessionTimeout as number | undefined,
      checkAttrs: (rawBody.checkAttrs as CreateGroupBody['checkAttrs']) || (rawBody.checkAttributes as CreateGroupBody['checkAttrs']),
      replyAttrs: (rawBody.replyAttrs as CreateGroupBody['replyAttrs']) || (rawBody.replyAttributes as CreateGroupBody['replyAttrs']),
    };

    const { groupname, description, priority, speedLimitDown, speedLimitUp, dataLimit, sessionTimeout, checkAttrs, replyAttrs } = body;

    // ── Validate groupname
    if (!groupname?.trim()) {
      return NextResponse.json({ success: false, error: "groupname is required" }, { status: 400 });
    }

    const trimmedName = groupname.trim();

    if (trimmedName.length > 64) {
      return NextResponse.json({ success: false, error: "groupname must not exceed 64 characters" }, { status: 400 });
    }

    // ── Validate no duplicate
    const existing = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(
        SELECT 1 FROM radgroupcheck WHERE groupname = $1
        UNION
        SELECT 1 FROM radgroupreply WHERE groupname = $1
      ) AS exists`,
      trimmedName
    );

    if (existing[0]?.exists) {
      return NextResponse.json({ success: false, error: `Group '${trimmedName}' already exists in FreeRADIUS tables` }, { status: 409 });
    }

    // Also check RadiusGroup Prisma model
    const existingPrisma = await db.radiusGroup.findUnique({ where: { name: trimmedName } });
    if (existingPrisma) {
      return NextResponse.json({ success: false, error: `Group '${trimmedName}' already exists in RadiusGroup model` }, { status: 409 });
    }

    // ── Validate and insert check attributes
    if (checkAttrs && checkAttrs.length > 0) {
      for (const attr of checkAttrs) {
        if (!attr.attribute?.trim()) {
          return NextResponse.json({ success: false, error: "Each check attribute must have a non-empty 'attribute'" }, { status: 400 });
        }
        if (!attr.value?.trim()) {
          return NextResponse.json({ success: false, error: `Check attribute '${attr.attribute}' must have a non-empty 'value'` }, { status: 400 });
        }
        const op = attr.op || "==";
        if (!VALID_CHECK_OPS.includes(op)) {
          return NextResponse.json({ success: false, error: `Invalid operator '${op}' for check attribute '${attr.attribute}'. Valid: ${VALID_CHECK_OPS.join(", ")}` }, { status: 400 });
        }
        if (attr.attribute.length > 64 || attr.value.length > 253) {
          return NextResponse.json({ success: false, error: `Attribute '${attr.attribute}' exceeds field length limits (attribute: 64, value: 253)` }, { status: 400 });
        }
      }

      // Batch insert check attributes
      for (const attr of checkAttrs) {
        const op = attr.op || "==";
        await db.$queryRawUnsafe(
          `INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES ($1, $2, $3, $4)`,
          trimmedName, attr.attribute.trim(), op, attr.value.trim()
        );
      }
    }

    // ── Validate and insert reply attributes
    if (replyAttrs && replyAttrs.length > 0) {
      for (const attr of replyAttrs) {
        if (!attr.attribute?.trim()) {
          return NextResponse.json({ success: false, error: "Each reply attribute must have a non-empty 'attribute'" }, { status: 400 });
        }
        if (!attr.value?.trim()) {
          return NextResponse.json({ success: false, error: `Reply attribute '${attr.attribute}' must have a non-empty 'value'` }, { status: 400 });
        }
        const op = attr.op || "=";
        if (!VALID_REPLY_OPS.includes(op)) {
          return NextResponse.json({ success: false, error: `Invalid operator '${op}' for reply attribute '${attr.attribute}'. Valid: ${VALID_REPLY_OPS.join(", ")}` }, { status: 400 });
        }
        if (attr.attribute.length > 64 || attr.value.length > 253) {
          return NextResponse.json({ success: false, error: `Attribute '${attr.attribute}' exceeds field length limits (attribute: 64, value: 253)` }, { status: 400 });
        }
      }

      // Batch insert reply attributes
      for (const attr of replyAttrs) {
        const op = attr.op || "=";
        await db.$queryRawUnsafe(
          `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ($1, $2, $3, $4)`,
          trimmedName, attr.attribute.trim(), op, attr.value.trim()
        );
      }
    }

    // ── Create/update RadiusGroup Prisma model for enrichment
    await db.radiusGroup.upsert({
      where: { name: trimmedName },
      create: {
        name: trimmedName,
        description: description || "",
        priority: priority || 0,
        speedLimitDown: speedLimitDown || 0,
        speedLimitUp: speedLimitUp || 0,
        dataLimit: dataLimit ?? null,
        sessionTimeout: sessionTimeout ?? null,
      },
      update: {
        description: description || "",
        priority: priority || 0,
        speedLimitDown: speedLimitDown || 0,
        speedLimitUp: speedLimitUp || 0,
        dataLimit: dataLimit ?? null,
        sessionTimeout: sessionTimeout ?? null,
      },
    });

    // ── Fetch the created data back for response
    const [checks, replies] = await Promise.all([
      db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT id, groupname, attribute, op, value FROM radgroupcheck WHERE groupname = $1 ORDER BY attribute`,
        trimmedName
      ),
      db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT id, groupname, attribute, op, value FROM radgroupreply WHERE groupname = $1 ORDER BY attribute`,
        trimmedName
      ),
    ]);

    const radiusGroup = await db.radiusGroup.findUnique({ where: { name: trimmedName } });

    return NextResponse.json({
      success: true,
      RadiusGroup: {
        groupname: trimmedName,
        checkAttrs: serializeRows(checks),
        replyAttrs: serializeRows(replies),
        checkCount: checks.length,
        replyCount: replies.length,
        userCount: 0,
        enrichment: radiusGroup,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[aaa/groups] POST error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── PUT /api/aaa/groups ─────────────────────────────────────────────────────

interface UpdateGroupAction {
  groupname: string;
  action:
    | "add-check"
    | "remove-check"
    | "add-reply"
    | "remove-reply"
    | "update-check"
    | "update-reply"
    | "rename"
    | "update-enrichment"
    | "replace-checks"
    | "replace-replies";
  // For add-check / add-reply
  attribute?: string;
  op?: string;
  value?: string;
  // For remove-check / remove-reply / update-check / update-reply — by row id
  id?: number | string;
  // For update operations — new values
  newAttribute?: string;
  newOp?: string;
  newValue?: string;
  // For rename
  newGroupname?: string;
  // For update-enrichment
  description?: string;
  priority?: number;
  speedLimitDown?: number;
  speedLimitUp?: number;
  dataLimit?: number | null;
  sessionTimeout?: number | null;
  framedIpv6Pool?: string;
  delegatedIpv6PrefixPool?: string;
  // For replace-checks / replace-replies — full arrays
  checkAttrs?: { attribute: string; op?: string; value: string }[];
  replyAttrs?: { attribute: string; op?: string; value: string }[];
}

export async function PUT(req: NextRequest) {
  try {
    await requireAuth(req);
    const body: UpdateGroupAction = await req.json();

    const { groupname, action } = body;

    if (!groupname?.trim()) {
      return NextResponse.json({ success: false, error: "groupname is required" }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ success: false, error: "action is required. Valid: add-check, remove-check, add-reply, remove-reply, update-check, update-reply, rename, update-enrichment, replace-checks, replace-replies" }, { status: 400 });
    }

    const trimmedName = groupname.trim();

    // ── Verify group exists in FreeRADIUS tables
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(
        SELECT 1 FROM radgroupcheck WHERE groupname = $1
        UNION
        SELECT 1 FROM radgroupreply WHERE groupname = $1
      ) AS exists`,
      trimmedName
    );

    if (!exists[0]?.exists) {
      return NextResponse.json({ success: false, error: `Group '${trimmedName}' not found` }, { status: 404 });
    }

    // ── Handle each action ──

    switch (action) {
      // ── ADD CHECK ATTRIBUTE ────────────────────────────────────────────
      case "add-check": {
        if (!body.attribute?.trim()) {
          return NextResponse.json({ success: false, error: "attribute is required for add-check" }, { status: 400 });
        }
        if (!body.value?.trim() && body.value !== "0") {
          return NextResponse.json({ success: false, error: "value is required for add-check" }, { status: 400 });
        }
        const op = body.op || "==";
        if (!VALID_CHECK_OPS.includes(op)) {
          return NextResponse.json({ success: false, error: `Invalid check operator '${op}'` }, { status: 400 });
        }

        // Check for duplicate attribute within the same group
        const dupCheck = await db.$queryRawUnsafe<{ count: string }[]>(
          `SELECT CAST(COUNT(*) AS text) AS count FROM radgroupcheck WHERE groupname = $1 AND attribute = $2`,
          trimmedName, body.attribute.trim()
        );
        if (Number(dupCheck[0]?.count) > 0) {
          return NextResponse.json({ success: false, error: `Check attribute '${body.attribute}' already exists for group '${trimmedName}'` }, { status: 409 });
        }

        const result = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES ($1, $2, $3, $4) RETURNING id, groupname, attribute, op, value`,
          trimmedName, body.attribute.trim(), op, body.value.trim()
        );

        return NextResponse.json({ success: true, action: "add-check", attribute: serializeRows(result)[0] });
      }

      // ── REMOVE CHECK ATTRIBUTE ────────────────────────────────────────
      case "remove-check": {
        if (!body.id) {
          return NextResponse.json({ success: false, error: "id is required for remove-check" }, { status: 400 });
        }
        const numId = Number(body.id);

        // Verify the row belongs to this group
        const verify = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT id, attribute FROM radgroupcheck WHERE id = $1 AND groupname = $2`,
          numId, trimmedName
        );
        if (verify.length === 0) {
          return NextResponse.json({ success: false, error: `Check attribute id ${numId} not found for group '${trimmedName}'` }, { status: 404 });
        }

        await db.$queryRawUnsafe(`DELETE FROM radgroupcheck WHERE id = $1`, numId);

        return NextResponse.json({ success: true, action: "remove-check", removed: { id: numId, attribute: verify[0].attribute } });
      }

      // ── ADD REPLY ATTRIBUTE ────────────────────────────────────────────
      case "add-reply": {
        if (!body.attribute?.trim()) {
          return NextResponse.json({ success: false, error: "attribute is required for add-reply" }, { status: 400 });
        }
        if (!body.value?.trim() && body.value !== "0") {
          return NextResponse.json({ success: false, error: "value is required for add-reply" }, { status: 400 });
        }
        const op = body.op || "=";
        if (!VALID_REPLY_OPS.includes(op)) {
          return NextResponse.json({ success: false, error: `Invalid reply operator '${op}'` }, { status: 400 });
        }

        // Check for duplicate
        const dupReply = await db.$queryRawUnsafe<{ count: string }[]>(
          `SELECT CAST(COUNT(*) AS text) AS count FROM radgroupreply WHERE groupname = $1 AND attribute = $2`,
          trimmedName, body.attribute.trim()
        );
        if (Number(dupReply[0]?.count) > 0) {
          return NextResponse.json({ success: false, error: `Reply attribute '${body.attribute}' already exists for group '${trimmedName}'` }, { status: 409 });
        }

        const result = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ($1, $2, $3, $4) RETURNING id, groupname, attribute, op, value`,
          trimmedName, body.attribute.trim(), op, body.value.trim()
        );

        return NextResponse.json({ success: true, action: "add-reply", attribute: serializeRows(result)[0] });
      }

      // ── REMOVE REPLY ATTRIBUTE ────────────────────────────────────────
      case "remove-reply": {
        // Support both id-based and attribute-based removal
        if (body.id) {
          const numId = Number(body.id);
          const verify = await db.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT id, attribute FROM radgroupreply WHERE id = $1 AND groupname = $2`,
            numId, trimmedName
          );
          if (verify.length === 0) {
            return NextResponse.json({ success: false, error: `Reply attribute id ${numId} not found for group '${trimmedName}'` }, { status: 404 });
          }
          await db.$queryRawUnsafe(`DELETE FROM radgroupreply WHERE id = $1`, numId);
          return NextResponse.json({ success: true, action: "remove-reply", removed: { id: numId, attribute: verify[0].attribute } });
        } else if (body.attribute?.trim()) {
          const attr = body.attribute.trim();
          const verify = await db.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT id, attribute FROM radgroupreply WHERE groupname = $1 AND attribute = $2`,
            trimmedName, attr
          );
          if (verify.length === 0) {
            return NextResponse.json({ success: false, error: `Reply attribute '${attr}' not found for group '${trimmedName}'` }, { status: 404 });
          }
          await db.$queryRawUnsafe(`DELETE FROM radgroupreply WHERE groupname = $1 AND attribute = $2`, trimmedName, attr);
          return NextResponse.json({ success: true, action: "remove-reply", removed: { attribute: attr, deletedCount: verify.length } });
        } else {
          return NextResponse.json({ success: false, error: "id or attribute is required for remove-reply" }, { status: 400 });
        }
      }

      // ── UPDATE CHECK ATTRIBUTE ────────────────────────────────────────
      case "update-check": {
        if (!body.id) {
          return NextResponse.json({ success: false, error: "id is required for update-check" }, { status: 400 });
        }
        const numId = Number(body.id);

        const verify = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT id, groupname, attribute, op, value FROM radgroupcheck WHERE id = $1 AND groupname = $2`,
          numId, trimmedName
        );
        if (verify.length === 0) {
          return NextResponse.json({ success: false, error: `Check attribute id ${numId} not found for group '${trimmedName}'` }, { status: 404 });
        }

        const current = verify[0];
        const newAttribute = body.newAttribute || (current.attribute as string);
        const newOp = body.newOp || (current.op as string);
        const newValue = body.newValue !== undefined ? body.newValue : (current.value as string);

        if (!VALID_CHECK_OPS.includes(newOp)) {
          return NextResponse.json({ success: false, error: `Invalid check operator '${newOp}'` }, { status: 400 });
        }

        // Check for duplicate attribute if attribute name is changing
        if (newAttribute !== current.attribute) {
          const dupCheck = await db.$queryRawUnsafe<{ count: string }[]>(
            `SELECT CAST(COUNT(*) AS text) AS count FROM radgroupcheck WHERE groupname = $1 AND attribute = $2 AND id != $3`,
            trimmedName, newAttribute, numId
          );
          if (Number(dupCheck[0]?.count) > 0) {
            return NextResponse.json({ success: false, error: `Check attribute '${newAttribute}' already exists for group '${trimmedName}'` }, { status: 409 });
          }
        }

        const result = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `UPDATE radgroupcheck SET attribute = $1, op = $2, value = $3 WHERE id = $4 RETURNING id, groupname, attribute, op, value`,
          newAttribute, newOp, newValue, numId
        );

        return NextResponse.json({ success: true, action: "update-check", attribute: serializeRows(result)[0] });
      }

      // ── UPDATE REPLY ATTRIBUTE ────────────────────────────────────────
      case "update-reply": {
        // Support both id-based and attribute-based update
        let numId: number;
        let current: Record<string, unknown>;

        if (body.id) {
          numId = Number(body.id);
          const verify = await db.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT id, groupname, attribute, op, value FROM radgroupreply WHERE id = $1 AND groupname = $2`,
            numId, trimmedName
          );
          if (verify.length === 0) {
            return NextResponse.json({ success: false, error: `Reply attribute id ${numId} not found for group '${trimmedName}'` }, { status: 404 });
          }
          current = verify[0];
        } else if (body.attribute?.trim()) {
          const attr = body.attribute.trim();
          const verify = await db.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT id, groupname, attribute, op, value FROM radgroupreply WHERE groupname = $1 AND attribute = $2`,
            trimmedName, attr
          );
          if (verify.length === 0) {
            return NextResponse.json({ success: false, error: `Reply attribute '${attr}' not found for group '${trimmedName}'` }, { status: 404 });
          }
          current = verify[0];
          numId = Number(current.id);
        } else {
          return NextResponse.json({ success: false, error: "id or attribute is required for update-reply" }, { status: 400 });
        }

        const newAttribute = body.newAttribute || (current.attribute as string);
        const newOp = body.newOp || (current.op as string);
        const newValue = body.newValue !== undefined ? body.newValue : (current.value as string);

        if (!VALID_REPLY_OPS.includes(newOp)) {
          return NextResponse.json({ success: false, error: `Invalid reply operator '${newOp}'` }, { status: 400 });
        }

        if (newAttribute !== current.attribute) {
          const dupReply = await db.$queryRawUnsafe<{ count: string }[]>(
            `SELECT CAST(COUNT(*) AS text) AS count FROM radgroupreply WHERE groupname = $1 AND attribute = $2 AND id != $3`,
            trimmedName, newAttribute, numId
          );
          if (Number(dupReply[0]?.count) > 0) {
            return NextResponse.json({ success: false, error: `Reply attribute '${newAttribute}' already exists for group '${trimmedName}'` }, { status: 409 });
          }
        }

        const result = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `UPDATE radgroupreply SET attribute = $1, op = $2, value = $3 WHERE id = $4 RETURNING id, groupname, attribute, op, value`,
          newAttribute, newOp, newValue, numId
        );

        return NextResponse.json({ success: true, action: "update-reply", attribute: serializeRows(result)[0] });
      }

      // ── RENAME GROUP ──────────────────────────────────────────────────
      case "rename": {
        if (!body.newGroupname?.trim()) {
          return NextResponse.json({ success: false, error: "newGroupname is required for rename" }, { status: 400 });
        }
        const newName = body.newGroupname.trim();

        if (newName.length > 64) {
          return NextResponse.json({ success: false, error: "newGroupname must not exceed 64 characters" }, { status: 400 });
        }

        // Check if new name already exists
        const newNameExists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
          `SELECT EXISTS(
            SELECT 1 FROM radgroupcheck WHERE groupname = $1
            UNION
            SELECT 1 FROM radgroupreply WHERE groupname = $1
          ) AS exists`,
          newName
        );
        if (newNameExists[0]?.exists) {
          return NextResponse.json({ success: false, error: `Group '${newName}' already exists` }, { status: 409 });
        }

        // Check RadiusGroup
        const rgExists = await db.radiusGroup.findUnique({ where: { name: newName } });
        if (rgExists) {
          return NextResponse.json({ success: false, error: `Group '${newName}' already exists in RadiusGroup model` }, { status: 409 });
        }

        // Rename in radgroupcheck
        await db.$queryRawUnsafe(`UPDATE radgroupcheck SET groupname = $1 WHERE groupname = $2`, newName, trimmedName);

        // Rename in radgroupreply
        await db.$queryRawUnsafe(`UPDATE radgroupreply SET groupname = $1 WHERE groupname = $2`, newName, trimmedName);

        // Rename in radusergroup
        await db.$queryRawUnsafe(`UPDATE radusergroup SET groupname = $1 WHERE groupname = $2`, newName, trimmedName);

        // Rename in RadiusGroup Prisma model
        const existingRG = await db.radiusGroup.findUnique({ where: { name: trimmedName } });
        if (existingRG) {
          await db.radiusGroup.update({ where: { name: trimmedName }, data: { name: newName } });
        }

        return NextResponse.json({ success: true, action: "rename", oldGroupname: trimmedName, newGroupname: newName });
      }

      // ── UPDATE ENRICHMENT (RadiusGroup Prisma model) ──────────────────
      case "update-enrichment": {
        const updateData: Record<string, unknown> = {};
        if (body.description !== undefined) updateData.description = body.description;
        if (body.priority !== undefined) updateData.priority = Number(body.priority);
        if (body.speedLimitDown !== undefined) updateData.speedLimitDown = Number(body.speedLimitDown);
        if (body.speedLimitUp !== undefined) updateData.speedLimitUp = Number(body.speedLimitUp);
        if (body.dataLimit !== undefined) updateData.dataLimit = body.dataLimit ?? null;
        if (body.sessionTimeout !== undefined) updateData.sessionTimeout = body.sessionTimeout ?? null;
        if (body.framedIpv6Pool !== undefined) updateData.framedIpv6Pool = body.framedIpv6Pool;
        if (body.delegatedIpv6PrefixPool !== undefined) updateData.delegatedIpv6PrefixPool = body.delegatedIpv6PrefixPool;

        // Upsert the RadiusGroup model
        const enriched = await db.radiusGroup.upsert({
          where: { name: trimmedName },
          create: {
            name: trimmedName,
            description: (body.description as string) || "",
            priority: Number(body.priority) || 0,
            speedLimitDown: Number(body.speedLimitDown) || 0,
            speedLimitUp: Number(body.speedLimitUp) || 0,
            dataLimit: body.dataLimit ?? null,
            sessionTimeout: body.sessionTimeout ?? null,
            framedIpv6Pool: (body.framedIpv6Pool as string) || "",
            delegatedIpv6PrefixPool: (body.delegatedIpv6PrefixPool as string) || "",
          },
          update: updateData,
        });

        return NextResponse.json({ success: true, action: "update-enrichment", enrichment: enriched });
      }

      // ── REPLACE ALL CHECK ATTRIBUTES ──────────────────────────────────
      case "replace-checks": {
        if (!Array.isArray(body.checkAttrs)) {
          return NextResponse.json({ success: false, error: "checkAttrs array is required for replace-checks" }, { status: 400 });
        }

        // Validate all attrs before deleting
        for (const attr of body.checkAttrs) {
          if (!attr.attribute?.trim() || (!attr.value?.trim() && attr.value !== "0")) {
            return NextResponse.json({ success: false, error: "Each check attribute must have non-empty attribute and value" }, { status: 400 });
          }
          const op = attr.op || "==";
          if (!VALID_CHECK_OPS.includes(op)) {
            return NextResponse.json({ success: false, error: `Invalid check operator '${op}'` }, { status: 400 });
          }
        }

        // Delete all existing checks
        await db.$queryRawUnsafe(`DELETE FROM radgroupcheck WHERE groupname = $1`, trimmedName);

        // Insert new ones
        for (const attr of body.checkAttrs) {
          const op = attr.op || "==";
          await db.$queryRawUnsafe(
            `INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES ($1, $2, $3, $4)`,
            trimmedName, attr.attribute.trim(), op, attr.value.trim()
          );
        }

        const newChecks = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT id, groupname, attribute, op, value FROM radgroupcheck WHERE groupname = $1 ORDER BY attribute`,
          trimmedName
        );

        return NextResponse.json({ success: true, action: "replace-checks", checkAttrs: serializeRows(newChecks), count: newChecks.length });
      }

      // ── REPLACE ALL REPLY ATTRIBUTES ──────────────────────────────────
      case "replace-replies": {
        if (!Array.isArray(body.replyAttrs)) {
          return NextResponse.json({ success: false, error: "replyAttrs array is required for replace-replies" }, { status: 400 });
        }

        for (const attr of body.replyAttrs) {
          if (!attr.attribute?.trim() || (!attr.value?.trim() && attr.value !== "0")) {
            return NextResponse.json({ success: false, error: "Each reply attribute must have non-empty attribute and value" }, { status: 400 });
          }
          const op = attr.op || "=";
          if (!VALID_REPLY_OPS.includes(op)) {
            return NextResponse.json({ success: false, error: `Invalid reply operator '${op}'` }, { status: 400 });
          }
        }

        await db.$queryRawUnsafe(`DELETE FROM radgroupreply WHERE groupname = $1`, trimmedName);

        for (const attr of body.replyAttrs) {
          const op = attr.op || "=";
          await db.$queryRawUnsafe(
            `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ($1, $2, $3, $4)`,
            trimmedName, attr.attribute.trim(), op, attr.value.trim()
          );
        }

        const newReplies = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT id, groupname, attribute, op, value FROM radgroupreply WHERE groupname = $1 ORDER BY attribute`,
          trimmedName
        );

        return NextResponse.json({ success: true, action: "replace-replies", replyAttrs: serializeRows(newReplies), count: newReplies.length });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action '${action}'. Valid actions: add-check, remove-check, add-reply, remove-reply, update-check, update-reply, rename, update-enrichment, replace-checks, replace-replies`,
        }, { status: 400 });
    }
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[aaa/groups] PUT error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/aaa/groups ──────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }

    const { searchParams } = new URL(req.url);
    const groupname = searchParams.get("groupname")?.trim();

    if (!groupname) {
      return NextResponse.json({ success: false, error: "groupname query parameter is required" }, { status: 400 });
    }

    // Verify group exists
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(
        SELECT 1 FROM radgroupcheck WHERE groupname = $1
        UNION
        SELECT 1 FROM radgroupreply WHERE groupname = $1
      ) AS exists`,
      groupname
    );

    if (!exists[0]?.exists) {
      return NextResponse.json({ success: false, error: `Group '${groupname}' not found` }, { status: 404 });
    }

    // Count users assigned to this group before deletion
    const userCountResult = await db.$queryRawUnsafe<{ count: string }[]>(
      `SELECT CAST(COUNT(*) AS text) AS count FROM radusergroup WHERE groupname = $1`,
      groupname
    );
    const affectedUsers = Number(userCountResult[0]?.count || 0);

    // Count check/reply attrs
    const [checkCountResult, replyCountResult] = await Promise.all([
      db.$queryRawUnsafe<{ count: string }[]>(
        `SELECT CAST(COUNT(*) AS text) AS count FROM radgroupcheck WHERE groupname = $1`,
        groupname
      ),
      db.$queryRawUnsafe<{ count: string }[]>(
        `SELECT CAST(COUNT(*) AS text) AS count FROM radgroupreply WHERE groupname = $1`,
        groupname
      ),
    ]);
    const deletedChecks = Number(checkCountResult[0]?.count || 0);
    const deletedReplies = Number(replyCountResult[0]?.count || 0);

    // Execute all deletions in a logical sequence
    // 1. Delete all radgroupcheck entries
    await db.$queryRawUnsafe(`DELETE FROM radgroupcheck WHERE groupname = $1`, groupname);

    // 2. Delete all radgroupreply entries
    await db.$queryRawUnsafe(`DELETE FROM radgroupreply WHERE groupname = $1`, groupname);

    // 3. Remove all radusergroup assignments for this group
    await db.$queryRawUnsafe(`DELETE FROM radusergroup WHERE groupname = $1`, groupname);

    // 4. Remove RadiusGroup Prisma model if exists
    try {
      await db.radiusGroup.deleteMany({ where: { name: groupname } });
    } catch {
      // RadiusGroup might not exist, that's fine
    }

    return NextResponse.json({
      success: true,
      deleted: {
        groupname,
        deletedChecks,
        deletedReplies,
        unassignedUsers: affectedUsers,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[aaa/groups] DELETE error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
