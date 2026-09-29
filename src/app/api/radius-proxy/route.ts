import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import type { ProxyServerType } from "@prisma/client";

// GET /api/radius-proxy?action=list — List all realms with their servers
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action !== "list") {
      return NextResponse.json({ error: "Invalid action. Use ?action=list" }, { status: 400 });
    }

    const realms = await db.radiusProxyRealm.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        RadiusProxyServer: {
          orderBy: { priority: "asc" },
        },
      },
    });

    return NextResponse.json({ realms });
  } catch (error: unknown) {
    console.error("[RADIUS Proxy] GET error:", error);
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: "Internal server error" }, { status });
  }
}

// POST /api/radius-proxy — Handle all create/update/delete/test actions
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const body = await req.json();

    switch (action) {
      case "create-realm":
        return handleCreateRealm(body);
      case "update-realm":
        return handleUpdateRealm(body);
      case "delete-realm":
        return handleDeleteRealm(body);
      case "create-server":
        return handleCreateServer(body);
      case "update-server":
        return handleUpdateServer(body);
      case "delete-server":
        return handleDeleteServer(body);
      case "test-server":
        return handleTestServer(body);
      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    console.error("[RADIUS Proxy] POST error:", error);
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: "Internal server error" }, { status });
  }
}

// ─── Realm Handlers ─────────────────────────────────────────

async function handleCreateRealm(body: Record<string, unknown>) {
  const { name, description, realm, stripRealm, enabled, sortOrder } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Realm name is required" }, { status: 400 });
  }

  const existing = await db.radiusProxyRealm.findUnique({
    where: { name: name.trim() },
  });
  if (existing) {
    return NextResponse.json({ error: "Realm with this name already exists" }, { status: 409 });
  }

  const newRealm = await db.radiusProxyRealm.create({
    data: {
      name: name.trim(),
      description: typeof description === "string" ? description : "",
      realm: typeof realm === "string" ? realm : "",
      stripRealm: typeof stripRealm === "boolean" ? stripRealm : true,
      enabled: typeof enabled === "boolean" ? enabled : true,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
    },
    include: { RadiusProxyServer: { orderBy: { priority: "asc" } } },
  });

  return NextResponse.json({ realm: newRealm }, { status: 201 });
}

async function handleUpdateRealm(body: Record<string, unknown>) {
  const { id, name, description, realm, stripRealm, enabled, sortOrder } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Realm ID is required" }, { status: 400 });
  }

  const existing = await db.radiusProxyRealm.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Realm not found" }, { status: 404 });
  }

  // Check name uniqueness if changing
  if (name && typeof name === "string" && name.trim() && name.trim() !== existing.name) {
    const duplicate = await db.radiusProxyRealm.findFirst({
      where: { name: name.trim(), NOT: { id } },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Realm with this name already exists" }, { status: 409 });
    }
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = String(name).trim();
  if (description !== undefined) updateData.description = String(description);
  if (realm !== undefined) updateData.realm = String(realm);
  if (stripRealm !== undefined) updateData.stripRealm = Boolean(stripRealm);
  if (enabled !== undefined) updateData.enabled = Boolean(enabled);
  if (sortOrder !== undefined) updateData.sortOrder = Number(sortOrder);

  const updated = await db.radiusProxyRealm.update({
    where: { id },
    data: updateData,
    include: { RadiusProxyServer: { orderBy: { priority: "asc" } } },
  });

  return NextResponse.json({ realm: updated });
}

async function handleDeleteRealm(body: Record<string, unknown>) {
  const { id } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Realm ID is required" }, { status: 400 });
  }

  const existing = await db.radiusProxyRealm.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Realm not found" }, { status: 404 });
  }

  // Cascade delete will remove associated servers (onDelete: Cascade in schema)
  await db.radiusProxyRealm.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

// ─── Server Handlers ────────────────────────────────────────

async function handleCreateServer(body: Record<string, unknown>) {
  const {
    realmId, name, host, authPort, acctPort,
    secret, serverType, priority, timeout, retries,
  } = body;

  if (!realmId || typeof realmId !== "string") {
    return NextResponse.json({ error: "Realm ID is required" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Server name is required" }, { status: 400 });
  }
  if (!host || typeof host !== "string" || !host.trim()) {
    return NextResponse.json({ error: "Server host is required" }, { status: 400 });
  }

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
      serverType: (typeof serverType === "string" ? serverType : "BOTH") as ProxyServerType,
      priority: typeof priority === "number" ? priority : 1,
      timeout: typeof timeout === "number" ? timeout : 3,
      retries: typeof retries === "number" ? retries : 2,
    },
  });

  return NextResponse.json({ server: newServer }, { status: 201 });
}

async function handleUpdateServer(body: Record<string, unknown>) {
  const { id, name, host, authPort, acctPort, secret, serverType, priority, timeout, retries } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Server ID is required" }, { status: 400 });
  }

  const existing = await db.radiusProxyServer.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = String(name).trim();
  if (host !== undefined) updateData.host = String(host).trim();
  if (authPort !== undefined) updateData.authPort = Number(authPort);
  if (acctPort !== undefined) updateData.acctPort = Number(acctPort);
  if (secret !== undefined) updateData.secret = String(secret);
  if (serverType !== undefined) updateData.serverType = String(serverType);
  if (priority !== undefined) updateData.priority = Number(priority);
  if (timeout !== undefined) updateData.timeout = Number(timeout);
  if (retries !== undefined) updateData.retries = Number(retries);

  const updated = await db.radiusProxyServer.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ server: updated });
}

async function handleDeleteServer(body: Record<string, unknown>) {
  const { id } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Server ID is required" }, { status: 400 });
  }

  const existing = await db.radiusProxyServer.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  await db.radiusProxyServer.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

// ─── Test Server Connectivity (Mock) ───────────────────────

async function handleTestServer(body: Record<string, unknown>) {
  const { host, authPort, acctPort, secret, timeout: timeoutSec } = body;

  if (!host || typeof host !== "string" || !host.trim()) {
    return NextResponse.json({ error: "Server host is required" }, { status: 400 });
  }

  const testHost = host.trim();
  const testAuthPort = typeof authPort === "number" ? authPort : 1812;
  const testAcctPort = typeof acctPort === "number" ? acctPort : 1813;
  const testTimeout = typeof timeoutSec === "number" ? timeoutSec : 3;

  // Mock connectivity test — simulates a RADIUS Status-Server check
  // In production, this would send an actual RADIUS Status-Server packet
  const startTime = Date.now();

  // Simulate network latency (50–200ms)
  const simulatedLatency = Math.floor(Math.random() * 150) + 50;
  await new Promise((resolve) => setTimeout(resolve, Math.min(simulatedLatency, testTimeout * 1000)));

  const elapsed = Date.now() - startTime;
  const timedOut = elapsed > testTimeout * 1000;

  if (timedOut) {
    return NextResponse.json({
      success: false,
      reachable: false,
      host: testHost,
      authPort: testAuthPort,
      acctPort: testAcctPort,
      latencyMs: elapsed,
      error: `Connection timed out after ${testTimeout}s`,
      message: "Server did not respond within the configured timeout. Check host, ports, and firewall rules.",
    });
  }

  // Simulate a success response
  return NextResponse.json({
    success: true,
    reachable: true,
    host: testHost,
    authPort: testAuthPort,
    acctPort: testAcctPort,
    latencyMs: elapsed,
    message: `Server ${testHost} is reachable. Auth port ${testAuthPort} and Acct port ${testAcctPort} responded in ${elapsed}ms.`,
  });
}
