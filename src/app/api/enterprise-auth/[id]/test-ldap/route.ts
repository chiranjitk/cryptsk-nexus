import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { serverHost, serverPort, useTls, baseDn, bindDn, bindPassword, connectionTimeout, tlsCert } = body;

    // Find the subscriber's LDAP config
    const subscriber = await db.enterpriseSubscriber.findUnique({
      where: { id },
      include: { LdapConfig: true },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const host = serverHost || subscriber.LdapConfig?.serverHost;
    const port = serverPort || subscriber.LdapConfig?.serverPort || 636;
    const tls = useTls !== undefined ? useTls : (subscriber.LdapConfig?.useTls ?? true);
    const base = baseDn || subscriber.LdapConfig?.baseDn;
    const bind = bindDn || subscriber.LdapConfig?.bindDn;
    const pass = bindPassword || subscriber.LdapConfig?.bindPassword;
    const timeout = (connectionTimeout || subscriber.LdapConfig?.connectionTimeout || 5) * 1000;
    const cert = tlsCert || subscriber.LdapConfig?.tlsCert;

    if (!host || !base || !bind || !pass) {
      return NextResponse.json({ error: "LDAP configuration incomplete" }, { status: 400 });
    }

    // Simulate LDAP connection test (in production, use ldapjs)
    // For now, we simulate a connection attempt with a timeout
    const startTime = Date.now();

    // Update health status to unknown while testing
    if (subscriber.ldapConfigId) {
      await db.ldapConfig.update({
        where: { subscriberId: id },
        data: { healthStatus: "unknown", lastCheckedAt: new Date() },
      });
    }

    // Simulated test — attempt DNS resolution + TCP connection
    let reachable = false;
    let latencyMs = 0;
    let errorMsg: string | null = null;

    try {
      // Use Node.js net module to test TCP connectivity
      const net = await import("net");
      const result = await new Promise<{ reachable: boolean; latency: number }>((resolve) => {
        const socket = new net.Socket();
        const timer = setTimeout(() => {
          socket.destroy();
          resolve({ reachable: false, latency: timeout });
        }, timeout);

        socket.connect(port, host, () => {
          latencyMs = Date.now() - startTime;
          clearTimeout(timer);
          socket.destroy();
          resolve({ reachable: true, latency: latencyMs });
        });

        socket.on("error", (err: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          socket.destroy();
          resolve({ reachable: false, latency: Date.now() - startTime });
          errorMsg = err.message;
        });
      });

      reachable = result.reachable;
      latencyMs = result.latency;
    } catch {
      errorMsg = "Connection test failed";
    }

    // Update health status
    const healthStatus = reachable ? "reachable" : "unreachable";
    if (subscriber.ldapConfigId) {
      await db.ldapConfig.update({
        where: { subscriberId: id },
        data: { healthStatus, lastCheckedAt: new Date() },
      });
    }

    if (reachable) {
      return NextResponse.json({
        success: true,
        message: `LDAP server at ${host}:${port} is reachable (${latencyMs}ms)`,
        latencyMs,
        serverHost: host,
        serverPort: port,
        healthStatus,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `Cannot connect to LDAP server at ${host}:${port}`,
        details: errorMsg,
        healthStatus,
      }, { status: 502 });
    }
  } catch (error: unknown) {
    const msg = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : "LDAP test failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
