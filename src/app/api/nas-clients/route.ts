/**
 * CRYPTSKINTELLIGENT — /api/nas-clients
 *
 * Full CRUD for FreeRADIUS `nas` table (NAS Client management).
 * Uses $queryRawUnsafe with parameterized $N placeholders for PostgreSQL.
 *
 * GET  — List all NAS clients with optional filtering
 * POST — Create new NAS client
 * PUT  — Update NAS client (not allowed for default/readonly)
 * DELETE — Delete NAS client (not allowed for default/readonly)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LOCALHOST_IPS = ["127.0.0.1", "localhost", "::1"];
const DEFAULT_SECRET = "CryptskRADIUS2026";
const DEFAULT_SHORTNAME = "localhost";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mask secret: show first 4 and last 4 chars, **** in between */
function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "";
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

/** Check if a NAS row is the default localhost entry */
function isDefaultLocalhost(
  nasname: string,
  shortname?: string | null
): boolean {
  return (
    DEFAULT_LOCALHOST_IPS.includes(nasname.toLowerCase()) ||
    (!!shortname && DEFAULT_LOCALHOST_IPS.includes(shortname.toLowerCase()))
  );
}

/** Ensure the default localhost NAS client exists */
async function ensureDefaultNasExists(): Promise<void> {
  const existing = await db.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS(SELECT 1 FROM nas WHERE nasname = ANY($1)) AS exists`,
    DEFAULT_LOCALHOST_IPS
  );

  if (!existing[0]?.exists) {
    await db.$queryRawUnsafe(
      `INSERT INTO nas (nasname, shortname, type, ports, secret, server, community, description, vendor, coa_enabled, status)
       VALUES ('127.0.0.1', 'localhost', 'other', 0, $1, NULL, NULL, 'Built-in gateway NAS (read-only)', 'linux', true, 'active')
       ON CONFLICT DO NOTHING`,
      DEFAULT_SECRET
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/nas-clients — List all NAS clients with optional filtering
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Ensure default localhost NAS exists
    await ensureDefaultNasExists();

    const sp = request.nextUrl.searchParams;
    const status = sp.get("status") || "";
    const vendor = sp.get("vendor") || "";
    const search = sp.get("search") || "";

    // ---------- Dynamic WHERE ----------
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push(`n.status = $${params.length + 1}`);
      params.push(status);
    }
    if (vendor) {
      conditions.push(`n.vendor = $${params.length + 1}`);
      params.push(vendor);
    }
    if (search) {
      conditions.push(
        `(n.nasname ILIKE $${params.length + 1} OR n.shortname ILIKE $${params.length + 1} OR n.description ILIKE $${params.length + 1})`
      );
      params.push(`%${search}%`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // ---------- Fetch NAS clients with active session counts ----------
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
        active_sessions: number;
      }[]
    >(
      `SELECT
         n.id,
         n.nasname,
         n.shortname,
         n.type,
         n.ports,
         n.secret,
         n.server,
         n.community,
         n.description,
         n.vendor,
         n.coa_enabled,
         n.status,
         n.area_id,
         CAST(COALESCE(sq.active_count, 0) AS int) AS active_sessions
       FROM nas n
       LEFT JOIN (
         SELECT nasipaddress, CAST(COUNT(*) AS int) AS active_count
         FROM radacct
         WHERE acctstoptime IS NULL
         GROUP BY nasipaddress
       ) sq ON sq.nasipaddress = n.nasname
       ${where}
       ORDER BY n.id`,
      ...params
    );

    // ---------- Build response ----------
    const clients = rows.map((r) => {
      const isDefault = isDefaultLocalhost(r.nasname, r.shortname);
      return {
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
        activeSessions: r.active_sessions,
        isDefault,
        isReadOnly: isDefault,
      };
    });

    // ---------- Stats ----------
    const total = clients.length;
    const active = clients.filter(
      (c) => c.status === "active" || c.status === "Active"
    ).length;
    const inactive = total - active;

    return NextResponse.json({
      success: true,
      data: clients,
      stats: { total, active, inactive },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[nas-clients] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list NAS clients" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/nas-clients — Create new NAS client
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
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
      nasname: string;
      shortname: string;
      secret: string;
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

    // ---------- Validation ----------
    const errors: string[] = [];
    if (!nasname?.trim()) errors.push("nasname (IP address) is required");
    if (!shortname?.trim()) errors.push("shortname is required");
    if (!secret?.trim()) errors.push("secret is required");

    // Validate IP format (basic check)
    if (nasname && !nasname.match(/^[\d.:a-fA-F]+$/)) {
      errors.push(
        "nasname must be a valid IP address or hostname"
      );
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors.join("; ") },
        { status: 400 }
      );
    }

    // Check for duplicate nasname
    const existing = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM nas WHERE nasname = $1) AS exists`,
      nasname.trim()
    );
    if (existing[0]?.exists) {
      return NextResponse.json(
        {
          success: false,
          error: `NAS client with nasname '${nasname}' already exists`,
        },
        { status: 409 }
      );
    }

    // ---------- Build vendor description suffix ----------
    let finalDescription = description || "";
    if (vendor?.trim()) {
      const vendorSuffix = `[vendor:${vendor.trim()}]`;
      if (finalDescription && !finalDescription.includes(vendorSuffix)) {
        finalDescription = `${finalDescription} ${vendorSuffix}`;
      } else if (!finalDescription) {
        finalDescription = vendorSuffix;
      }
    }

    // ---------- Insert ----------
    const nasType = type || "other";
    const nasStatus = status || "unknown";
    const coaEnabledVal = coaEnabled ?? false;
    const portsVal = ports ?? 0;

    const created = await db.$queryRawUnsafe<
      {
        id: number;
        nasname: string;
        shortname: string;
      }[]
    >(
      `INSERT INTO nas (nasname, shortname, type, ports, secret, server, community, description, vendor, coa_enabled, status, area_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, nasname, shortname`,
      nasname.trim(),
      shortname.trim(),
      nasType,
      portsVal,
      secret.trim(),
      server || null,
      community || null,
      finalDescription || null,
      vendor?.trim() || null,
      coaEnabledVal,
      nasStatus,
      areaId || null
    );

    const newClient = created[0];

    await auditCreate(request, "NasClient", String(newClient.id), {
      action: "create",
      nasname: nasname.trim(),
      shortname: shortname.trim(),
      vendor: vendor || null,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: newClient.id,
          nasname: newClient.nasname,
          shortname: newClient.shortname,
          type: nasType,
          ports: portsVal,
          secret: maskSecret(secret),
          server: server || null,
          community: community || null,
          description: finalDescription || null,
          vendor: vendor?.trim() || "",
          coaEnabled: coaEnabledVal,
          status: nasStatus,
          areaId: areaId || null,
          activeSessions: 0,
          isDefault: false,
          isReadOnly: false,
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
    console.error("[nas-clients] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create NAS client" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT /api/nas-clients — Update NAS client (not allowed for default/readonly)
// ---------------------------------------------------------------------------
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();

    const { id } = body as { id: number };
    if (!id) {
      return NextResponse.json(
        { success: false, error: "NAS client id is required" },
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
    >(`SELECT id, nasname, shortname FROM nas WHERE id = $1`, id);

    if (!existing[0]) {
      return NextResponse.json(
        { success: false, error: `NAS client with id ${id} not found` },
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
    const params: unknown[] = [];

    if (nasname !== undefined) {
      setClauses.push(`nasname = $${params.length + 1}`);
      params.push(nasname.trim());
    }
    if (shortname !== undefined) {
      setClauses.push(`shortname = $${params.length + 1}`);
      params.push(shortname.trim());
    }
    if (secret !== undefined) {
      setClauses.push(`secret = $${params.length + 1}`);
      params.push(secret.trim());
    }
    if (type !== undefined) {
      setClauses.push(`type = $${params.length + 1}`);
      params.push(type);
    }
    if (ports !== undefined) {
      setClauses.push(`ports = $${params.length + 1}`);
      params.push(ports);
    }
    if (server !== undefined) {
      setClauses.push(`server = $${params.length + 1}`);
      params.push(server || null);
    }
    if (community !== undefined) {
      setClauses.push(`community = $${params.length + 1}`);
      params.push(community || null);
    }
    if (description !== undefined) {
      setClauses.push(`description = $${params.length + 1}`);
      params.push(description || null);
    }
    if (vendor !== undefined) {
      setClauses.push(`vendor = $${params.length + 1}`);
      params.push(vendor || null);
    }
    if (coaEnabled !== undefined) {
      setClauses.push(`coa_enabled = $${params.length + 1}`);
      params.push(coaEnabled);
    }
    if (status !== undefined) {
      setClauses.push(`status = $${params.length + 1}`);
      params.push(status);
    }
    if (areaId !== undefined) {
      setClauses.push(`area_id = $${params.length + 1}`);
      params.push(areaId || null);
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    // Add id param
    params.push(id);

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
       WHERE id = $${params.length}
       RETURNING id, nasname, shortname, type, ports, secret, server, community, description, vendor, coa_enabled, status, area_id`,
      ...params
    );

    const client = updated[0];

    // Get active sessions count
    const sessionCount = await db.$queryRawUnsafe<
      { count: number }[]
    >(
      `SELECT CAST(COUNT(*) AS int) AS count FROM radacct WHERE nasipaddress = $1 AND acctstoptime IS NULL`,
      client.nasname
    );

    await auditCreate(request, "NasClient", String(id), {
      action: "update",
      fields: Object.keys(body).filter((k) => k !== "id"),
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
    console.error("[nas-clients] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update NAS client" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/nas-clients — Delete NAS client (not allowed for default/readonly)
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

    // Accept id from query params or body
    let nasId: string | null = null;

    // Try query params first
    const sp = request.nextUrl.searchParams;
    nasId = sp.get("id");

    // If not in query params, try body
    if (!nasId) {
      try {
        const body = await request.json();
        nasId = body.id ? String(body.id) : null;
      } catch {
        // No body
      }
    }

    if (!nasId) {
      return NextResponse.json(
        {
          success: false,
          error: "NAS client id is required (query param or body)",
        },
        { status: 400 }
      );
    }

    const numericId = parseInt(nasId, 10);
    if (isNaN(numericId)) {
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
    >(`SELECT id, nasname, shortname FROM nas WHERE id = $1`, numericId);

    if (!existing[0]) {
      return NextResponse.json(
        { success: false, error: `NAS client with id ${numericId} not found` },
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
    await db.$queryRawUnsafe(`DELETE FROM nas WHERE id = $1`, numericId);

    await auditCreate(request, "NasClient", nasId, {
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
    console.error("[nas-clients] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete NAS client" },
      { status: 500 }
    );
  }
}
