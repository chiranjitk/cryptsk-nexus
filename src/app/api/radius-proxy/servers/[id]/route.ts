import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import type { ProxyServerType } from "@prisma/client";

// PUT /api/radius-proxy/servers/:id — Update a server
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { name, host, authPort, acctPort, type, priority, status, secret, realmId } = body;

    const existing = await db.radiusProxyServer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (host !== undefined) updateData.host = host.trim();
    if (authPort !== undefined) updateData.authPort = Number(authPort);
    if (acctPort !== undefined) updateData.acctPort = Number(acctPort);
    if (type !== undefined) updateData.serverType = mapToServerType(type);
    if (priority !== undefined) updateData.priority = Number(priority);
    if (secret !== undefined) updateData.secret = secret;
    if (status !== undefined) updateData.status = status !== "inactive" ? 1 : 0;
    if (realmId !== undefined) updateData.realmId = realmId;

    const updated = await db.radiusProxyServer.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ server: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Server PUT error:", error);
    return NextResponse.json({ error: "Failed to update server" }, { status: 500 });
  }
}

// DELETE /api/radius-proxy/servers/:id — Delete a server
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const existing = await db.radiusProxyServer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    await db.radiusProxyServer.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Server DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete server" }, { status: 500 });
  }
}

function mapToServerType(type: string): ProxyServerType {
  switch (type) {
    case "auth": return "AUTH";
    case "acct": return "ACCT";
    default: return "BOTH";
  }
}
