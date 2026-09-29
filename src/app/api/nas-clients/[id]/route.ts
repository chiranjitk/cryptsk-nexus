/**
 * CRYPTSKINTELLIGENT — /api/nas-clients/[id]
 *
 * Single NAS client detail, update, and delete operations.
 * Next.js 16 pattern: params is a Promise.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LOCALHOST_IPS = ["127.0.0.1", "localhost", "::1"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "";
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

function isDefaultLocalhost(
  nasname: string,
  shortname?: string | null
): boolean {
  return (
    DEFAULT_LOCALHOST_IPS.includes(nasname.toLowerCase()) ||
    (!!shortname && DEFAULT_LOCALHOST_IPS.includes(shortname.toLowerCase()))
  );
}

// ---------------------------------------------------------------------------
// GET /api/nas-clients/[id] — Single NAS client detail
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id: rawId } = await params;
    const nasId = parseInt(rawId, 10);

    if (isNaN(nasId)) {
      return NextResponse.json(
        { success: false, error: "id must be a valid number" },
        { status: 400 }
      );
    }

    // ---------- Fetch NAS client ----------
    const rows = await db.$queryRawUnsafe<
      {
        id: number;
        nasname: string;
        shortname: string | null;
        type: string | null;
        ports: number | null;
        secret: string | null;
        server: string | null;
        community: string | null;
        description: string | null;
        vendor: string | null;
        coa_enabled: boolean | null;
        status: string | null;
        area_id: string | null;
      }[]
    >(
      `SELECT id, nasname, shortname, type, ports, secret, server, community,
              description, vendor, coa_enabled, status, area_id
       FROM nas WHERE id = $1`,
      nasId
    );

    if (!rows[0]) {
      return NextResponse.json(
        { success: false, error: `NAS client with id ${nasId} not found` },
        { status: 404 }
      );
    }

    const r = rows[0];
    const isDefault = isDefaultLocalhost(r.nasname, r.shortname);

    // ---------- Active sessions count ----------
    const sessionCount = await db.$queryRawUnsafe<{ count: number }[]>(
      `SELECT CAST(COUNT(*) AS int) AS count FROM radacct WHERE nasipaddress = $1 AND acctstoptime IS NULL`,
      r.nasname
    );

    // ---------- Recent auth attempts (last 5 from radpostauth) ----------
    let recentAuth: {
      username: string;
      reply: string;
      authdate: string;
      nasipaddress: string;
      clientipaddress: string;
    }[] = [];

    try {
      const authRows = await db.$queryRawUnsafe<
        {
          username: string;
          reply: string;
          authdate: string;
          nasipaddress: string;
          clientipaddress: string;
        }[]
      >(
        `SELECT username, reply, authdate,
                CAST(nasipaddress AS text) AS nasipaddress,
                CAST(clientipaddress AS text) AS clientipaddress
         FROM radpostauth
         WHERE CAST(nasipaddress AS text) = $1
         ORDER BY authdate DESC
         LIMIT 5`,
        r.nasname
      );
      recentAuth = authRows;
    } catch {
      // radpostauth may not exist — non-critical
    }

    // ---------- Total sessions (historical) ----------
    const totalSessions = await db.$queryRawUnsafe<{ count: number }[]>(
      `SELECT CAST(COUNT(*) AS int) AS count FROM radacct WHERE nasipaddress = $1`,
      r.nasname
    );

    // ---------- Build response ----------
    return NextResponse.json({
      success: true,
      data: {
        id: r.id,
        nasname: r.nasname,
        shortname: r.shortname,
        type: r.type || "other",
        ports: r.ports,
        secret: isDefault ? r.secret : maskSecret(r.secret),
        server: r.server,
        community: r.community,
        description: r.description,
        vendor: r.vendor || "",
        coaEnabled: r.coa_enabled ?? false,
        status: r.status || "unknown",
        areaId: r.area_id,
        isDefault,
        isReadOnly: isDefault,
        // Enriched data
        activeSessions: sessionCount[0]?.count ?? 0,
        totalSessions: totalSessions[0]?.count ?? 0,
        recentAuthAttempts: recentAuth.map((a) => ({
          username: a.username,
          result: a.reply,
          date: a.authdate,
          nasIp: a.nasipaddress,
          clientIp: a.clientipaddress,
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
    console.error("[nas-clients/[id]] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch NAS client details" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT /api/nas-clients/[id] — Update single NAS client
// ---------------------------------------------------------------------------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id: rawId } = await params;
    const nasId = parseInt(rawId, 10);

    if (isNaN(nasId)) {
      return NextResponse.json(
        { success: false, error: "id must be a valid number" },
        { status: 400 }
      );
    }

    // ---------- Fetch and validate ----------
    const existing = await db.$queryRawUnsafe<
      {
        id: number;
        nasname: string;
        shortname: string | null;
      }[]
    >(`SELECT id, nasname, shortname FROM nas WHERE id = $1`, nasId);

    if (!existing[0]) {
      return NextResponse.json(
        { success: false, error: `NAS client with id ${nasId} not found` },
        { status: 404 }
      );
    }

    // Check if default/readonly
    if (isDefaultLocalhost(existing[0].nasname, existing[0].shortname)) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot update the built-in localhost NAS client (read-only)",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      nasname,
      shortname,
      secret,
      type,
      ports,
      server,
      community,
      description,
      vendor,
      coaEnabled,
      status,
      areaId,
    } = body as {
      nasname?: string;
      shortname?: string;
      secret?: string;
      type?: string;
      ports?: number;
      server?: string;
      community?: string;
      description?: string;
      vendor?: string;
      coaEnabled?: boolean;
      status?: string;
      areaId?: string;
    };

    // ---------- Build dynamic SET clause ----------
    const setClauses: string[] = [];
    const sqlParams: unknown[] = [];

    if (nasname !== undefined) {
      setClauses.push(`nasname = $${sqlParams.length + 1}`);
      sqlParams.push(nasname.trim());
    }
    if (shortname !== undefined) {
      setClauses.push(`shortname = $${sqlParams.length + 1}`);
      sqlParams.push(shortname.trim());
    }
    if (secret !== undefined) {
      setClauses.push(`secret = $${sqlParams.length + 1}`);
      sqlParams.push(secret.trim());
    }
    if (type !== undefined) {
      setClauses.push(`type = $${sqlParams.length + 1}`);
      sqlParams.push(type);
    }
    if (ports !== undefined) {
      setClauses.push(`ports = $${sqlParams.length + 1}`);
      sqlParams.push(ports);
    }
    if (server !== undefined) {
      setClauses.push(`server = $${sqlParams.length + 1}`);
      sqlParams.push(server || null);
    }
    if (community !== undefined) {
      setClauses.push(`community = $${sqlParams.length + 1}`);
      sqlParams.push(community || null);
    }
    if (description !== undefined) {
      setClauses.push(`description = $${sqlParams.length + 1}`);
      sqlParams.push(description || null);
    }
    if (vendor !== undefined) {
      setClauses.push(`vendor = $${sqlParams.length + 1}`);
      sqlParams.push(vendor || null);
    }
    if (coaEnabled !== undefined) {
      setClauses.push(`coa_enabled = $${sqlParams.length + 1}`);
      sqlParams.push(coaEnabled);
    }
    if (status !== undefined) {
      setClauses.push(`status = $${sqlParams.length + 1}`);
      sqlParams.push(status);
    }
    if (areaId !== undefined) {
      setClauses.push(`area_id = $${sqlParams.length + 1}`);
      sqlParams.push(areaId || null);
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    // Add id param
    sqlParams.push(nasId);

    const updated = await db.$queryRawUnsafe<
      {
        id: number;
        nasname: string;
        shortname: string | null;
        type: string | null;
        ports: number | null;
        secret: string | null;
        server: string | null;
        community: string | null;
        description: string | null;
        vendor: string | null;
        coa_enabled: boolean | null;
        status: string | null;
        area_id: string | null;
      }[]
    >(
      `UPDATE nas SET ${setClauses.join(", ")}
       WHERE id = $${sqlParams.length}
       RETURNING id, nasname, shortname, type, ports, secret, server, community, description, vendor, coa_enabled, status, area_id`,
      ...sqlParams
    );

    const client = updated[0];

    // Get active sessions count
    const sessionCount = await db.$queryRawUnsafe<{ count: number }[]>(
      `SELECT CAST(COUNT(*) AS int) AS count FROM radacct WHERE nasipaddress = $1 AND acctstoptime IS NULL`,
      client.nasname
    );

    await auditCreate(request, "NasClient", String(nasId), {
      action: "update",
      fields: Object.keys(body),
    });

    return NextResponse.json({
      success: true,
      data: {
        id: client.id,
        nasname: client.nasname,
        shortname: client.shortname,
        type: client.type || "other",
        ports: client.ports,
        secret: maskSecret(client.secret),
        server: client.server,
        community: client.community,
        description: client.description,
        vendor: client.vendor || "",
        coaEnabled: client.coa_enabled ?? false,
        status: client.status || "unknown",
        areaId: client.area_id,
        activeSessions: sessionCount[0]?.count ?? 0,
        isDefault: false,
        isReadOnly: false,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[nas-clients/[id]] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update NAS client" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/nas-clients/[id] — Delete single NAS client
// ---------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id: rawId } = await params;
    const nasId = parseInt(rawId, 10);

    if (isNaN(nasId)) {
      return NextResponse.json(
        { success: false, error: "id must be a valid number" },
        { status: 400 }
      );
    }

    // ---------- Fetch and validate ----------
    const existing = await db.$queryRawUnsafe<
      {
        id: number;
        nasname: string;
        shortname: string | null;
      }[]
    >(`SELECT id, nasname, shortname FROM nas WHERE id = $1`, nasId);

    if (!existing[0]) {
      return NextResponse.json(
        { success: false, error: `NAS client with id ${nasId} not found` },
        { status: 404 }
      );
    }

    // Check if default/readonly
    if (isDefaultLocalhost(existing[0].nasname, existing[0].shortname)) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete the built-in localhost NAS client (read-only)",
        },
        { status: 403 }
      );
    }

    // Check for active sessions on this NAS
    const activeSessions = await db.$queryRawUnsafe<{ count: number }[]>(
      `SELECT CAST(COUNT(*) AS int) AS count FROM radacct WHERE nasipaddress = $1 AND acctstoptime IS NULL`,
      existing[0].nasname
    );

    if ((activeSessions[0]?.count ?? 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete NAS client '${existing[0].nasname}' — it has ${activeSessions[0]?.count} active session(s). Disconnect all sessions first.`,
        },
        { status: 409 }
      );
    }

    // ---------- Delete ----------
    await db.$queryRawUnsafe(`DELETE FROM nas WHERE id = $1`, nasId);

    await auditCreate(request, "NasClient", String(nasId), {
      action: "delete",
      nasname: existing[0].nasname,
    });

    return NextResponse.json({
      success: true,
      message: `NAS client '${existing[0].nasname}' deleted successfully`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[nas-clients/[id]] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete NAS client" },
      { status: 500 }
    );
  }
}
