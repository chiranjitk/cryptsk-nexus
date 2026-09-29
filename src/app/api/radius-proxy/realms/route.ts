import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// GET /api/radius-proxy/realms — List all proxy realms with servers
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const realms = await db.radiusProxyRealm.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        servers: {
          orderBy: { priority: "asc" },
        },
      },
    });

    // Map to the format the page component expects
    const mapped = realms.map((r) => ({
      id: r.id,
      name: r.name,
      realm: r.realm,
      stripRealm: r.stripRealm,
      status: r.enabled ? "active" : "inactive",
      servers: r.servers.map((s) => ({
        id: s.id,
        name: s.name,
        host: s.host,
        authPort: s.authPort,
        acctPort: s.acctPort,
        type: mapServerType(s.serverType),
        priority: s.priority,
        status: s.status === 1 ? "active" : s.status === 0 ? "inactive" : "error",
        secret: s.secret,
        realmId: s.realmId,
      })),
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ realms: mapped });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS proxy realms GET error:", error);
    return NextResponse.json({ error: "Failed to fetch realms" }, { status: 500 });
  }
}

// POST /api/radius-proxy/realms — Create a new realm
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { name, realm, stripRealm, status } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Realm name is required" }, { status: 400 });
    }
    if (!realm || !realm.trim()) {
      return NextResponse.json({ error: "Realm suffix is required" }, { status: 400 });
    }

    // Check for duplicate name
    const existing = await db.radiusProxyRealm.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Realm with this name already exists" }, { status: 409 });
    }

    const newRealm = await db.radiusProxyRealm.create({
      data: {
        name: name.trim(),
        realm: realm.trim(),
        stripRealm: stripRealm !== false,
        enabled: status !== "inactive",
      },
      include: { servers: { orderBy: { priority: "asc" } } },
    });

    return NextResponse.json({
      realm: {
        id: newRealm.id,
        name: newRealm.name,
        realm: newRealm.realm,
        stripRealm: newRealm.stripRealm,
        status: newRealm.enabled ? "active" : "inactive",
        servers: [],
        createdAt: newRealm.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS proxy realms POST error:", error);
    return NextResponse.json({ error: "Failed to create realm" }, { status: 500 });
  }
}

// Helper: Map Prisma server type to page type
function mapServerType(type: string): "auth" | "acct" | "both" {
  switch (type) {
    case "AUTH": return "auth";
    case "ACCT": return "acct";
    default: return "both";
  }
}
