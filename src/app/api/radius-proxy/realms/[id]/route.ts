import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// PUT /api/radius-proxy/realms/:id — Update realm
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { name, realm, stripRealm, status } = body;

    const existing = await db.radiusProxyRealm.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Realm not found" }, { status: 404 });
    }

    // Check name uniqueness if changing
    if (name && name.trim() && name.trim() !== existing.name) {
      const duplicate = await db.radiusProxyRealm.findFirst({
        where: { name: name.trim(), NOT: { id } },
      });
      if (duplicate) {
        return NextResponse.json({ error: "Realm with this name already exists" }, { status: 409 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (realm !== undefined) updateData.realm = realm.trim();
    if (stripRealm !== undefined) updateData.stripRealm = Boolean(stripRealm);
    if (status !== undefined) updateData.enabled = status !== "inactive";

    const updated = await db.radiusProxyRealm.update({
      where: { id },
      data: updateData,
      include: { servers: { orderBy: { priority: "asc" } } },
    });

    return NextResponse.json({
      realm: {
        id: updated.id,
        name: updated.name,
        realm: updated.realm,
        stripRealm: updated.stripRealm,
        status: updated.enabled ? "active" : "inactive",
        servers: updated.servers.map((s) => ({
          id: s.id,
          name: s.name,
          host: s.host,
          authPort: s.authPort,
          acctPort: s.acctPort,
          type: mapServerType(s.serverType),
          priority: s.priority,
          status: s.status === 1 ? "active" : "inactive",
          realmId: s.realmId,
        })),
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Realm PUT error:", error);
    return NextResponse.json({ error: "Failed to update realm" }, { status: 500 });
  }
}

function mapServerType(type: string): "auth" | "acct" | "both" {
  switch (type) {
    case "AUTH": return "auth";
    case "ACCT": return "acct";
    default: return "both";
  }
}
