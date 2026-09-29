import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import type { ProxyServerType } from "@prisma/client";

// POST /api/radius-proxy/servers — Create a new server
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { realmId, name, host, authPort, acctPort, type, priority, status, secret } = body;

    if (!realmId) {
      return NextResponse.json({ error: "realmId is required" }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Server name is required" }, { status: 400 });
    }
    if (!host || !host.trim()) {
      return NextResponse.json({ error: "Server host is required" }, { status: 400 });
    }

    // Verify realm exists
    const realmExists = await db.radiusProxyRealm.findUnique({ where: { id: realmId } });
    if (!realmExists) {
      return NextResponse.json({ error: "Parent realm not found" }, { status: 404 });
    }

    const newServer = await db.radiusProxyServer.create({
      data: {
        realmId,
        name: name.trim(),
        host: host.trim(),
        authPort: typeof authPort === "number" ? authPort : 1812,
        acctPort: typeof acctPort === "number" ? acctPort : 1813,
        secret: typeof secret === "string" ? secret : "",
        serverType: mapToServerType(type),
        priority: typeof priority === "number" ? priority : 1,
        status: status !== "inactive" ? 1 : 0,
      },
    });

    return NextResponse.json({ server: newServer }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("RADIUS proxy servers POST error:", error);
    return NextResponse.json({ error: "Failed to create server" }, { status: 500 });
  }
}

// Helper: Map page server type to Prisma enum
function mapToServerType(type: string): ProxyServerType {
  switch (type) {
    case "auth": return "AUTH";
    case "acct": return "ACCT";
    default: return "BOTH";
  }
}
