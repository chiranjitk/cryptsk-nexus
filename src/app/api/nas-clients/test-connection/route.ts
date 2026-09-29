/**
 * CRYPTSKINTELLIGENT — /api/nas-clients/test-connection
 *
 * Test NAS connectivity by sending a UDP probe to the specified NAS IP.
 * Uses Node.js `dgram` module for basic UDP port reachability.
 *
 * POST body:
 *   { nasId: string }                                   — lookup NAS by DB id
 *   OR
 *   { nasIp: string, secret?: string, coaPort?: number } — direct probe
 */

import { NextRequest, NextResponse } from "next/server";
import dgram from "node:dgram";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RADIUS_PORT = 1812;
const DEFAULT_COA_PORT = 3799;
const TIMEOUT_MS = 5000;

// A minimal RADIUS-like Status-Server packet (code 12, just for UDP reachability)
// This is NOT a real RADIUS packet — it's a small UDP probe to test if the port is open.
function buildProbePacket(): Buffer {
  // We send a minimal 20-byte UDP payload that looks like a RADIUS packet header.
  // Real RADIUS servers may reject it, but the port being reachable is the test.
  const buf = Buffer.alloc(20);
  buf.writeUInt8(12, 0); // Code: Status-Server
  buf.writeUInt8(0, 1);  // Identifier
  buf.writeUInt16BE(20, 2); // Length
  // Bytes 4-19: authenticator (zeros, will be rejected by server but tests UDP reachability)
  return buf;
}

/**
 * Send a UDP probe to a host:port and return whether the port responded.
 */
function probeUdpPort(
  host: string,
  port: number,
  timeoutMs: number
): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const probe = buildProbePacket();
    const start = Date.now();

    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        try { socket.close(); } catch { /* ignore */ }
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve({
        reachable: false,
        latencyMs: timeoutMs,
        error: `Connection timed out after ${timeoutMs}ms — no response from ${host}:${port}. Ensure the NAS is online and the port is not blocked by a firewall.`,
      });
    }, timeoutMs);

    socket.on("message", () => {
      const latency = Date.now() - start;
      clearTimeout(timer);
      cleanup();
      resolve({
        reachable: true,
        latencyMs: latency,
      });
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      const latency = Date.now() - start;
      clearTimeout(timer);
      cleanup();

      let message: string;
      if (err.code === "ECONNREFUSED") {
        message = `Port ${port} is closed or filtered on ${host}. The NAS may not be listening on this port.`;
      } else if (err.code === "ENETUNREACH") {
        message = `Network unreachable — ${host} is not reachable from this server. Check routing.`;
      } else if (err.code === "EHOSTUNREACH") {
        message = `Host unreachable — ${host} does not respond. Verify the IP address and network connectivity.`;
      } else {
        message = `UDP error: ${err.message} (${err.code})`;
      }

      resolve({
        reachable: false,
        latencyMs: latency,
        error: message,
      });
    });

    socket.send(probe, 0, probe.length, port, host, (sendErr: Error | null) => {
      if (sendErr) {
        clearTimeout(timer);
        cleanup();
        resolve({
          reachable: false,
          latencyMs: Date.now() - start,
          error: `Failed to send probe: ${sendErr.message}`,
        });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// POST /api/nas-clients/test-connection
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();

    let targetIp: string;
    let secret = "";
    let testPort: number;

    if (body.nasId) {
      // ---------- Lookup NAS by ID ----------
      const nasId = parseInt(body.nasId, 10);
      if (isNaN(nasId)) {
        return NextResponse.json(
          { success: false, error: "nasId must be a valid number" },
          { status: 400 }
        );
      }

      const rows = await db.$queryRawUnsafe<
        {
          id: number;
          nasname: string;
          shortname: string | null;
          secret: string | null;
          ports: number | null;
          coa_enabled: boolean | null;
        }[]
      >(
        `SELECT id, nasname, shortname, secret, ports, coa_enabled FROM nas WHERE id = $1`,
        nasId
      );

      if (!rows[0]) {
        return NextResponse.json(
          { success: false, error: `NAS client with id ${nasId} not found` },
          { status: 404 }
        );
      }

      targetIp = rows[0].nasname;
      secret = rows[0].secret || "";
      // Test CoA port if enabled, otherwise auth port
      testPort =
        rows[0].coa_enabled && rows[0].ports
          ? rows[0].ports
          : rows[0].coa_enabled
          ? DEFAULT_COA_PORT
          : DEFAULT_RADIUS_PORT;
    } else if (body.nasIp) {
      // ---------- Direct probe ----------
      targetIp = body.nasIp.trim();
      if (!targetIp) {
        return NextResponse.json(
          { success: false, error: "nasIp is required" },
          { status: 400 }
        );
      }
      secret = body.secret || "";
      testPort = body.coaPort || DEFAULT_RADIUS_PORT;
    } else {
      return NextResponse.json(
        {
          success: false,
          error:
            "Provide either nasId (to lookup from DB) or nasIp (direct probe)",
        },
        { status: 400 }
      );
    }

    // ---------- Run probe ----------
    const result = await probeUdpPort(targetIp, testPort, TIMEOUT_MS);

    if (result.reachable) {
      return NextResponse.json({
        success: true,
        data: {
          success: true,
          latency: result.latencyMs,
          message: `Successfully reached ${targetIp}:${testPort} in ${result.latencyMs}ms. UDP port is open and responding.`,
          target: { ip: targetIp, port: testPort },
        },
      });
    } else {
      return NextResponse.json({
        success: true,
        data: {
          success: false,
          latency: result.latencyMs,
          message: result.error || `Cannot reach ${targetIp}:${testPort}`,
          target: { ip: targetIp, port: testPort },
          troubleshooting: [
            "Verify the NAS device is powered on and connected to the network",
            "Check that the RADIUS/CoA port is not blocked by the NAS firewall",
            `Ensure the NAS is configured to accept RADIUS packets from this server's IP on port ${testPort}`,
            "Confirm the NAS IP address is correct and routable from this server",
            "If testing CoA (port 3799), ensure CoA is enabled on the NAS vendor config",
          ],
        },
      });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[nas-clients/test-connection] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to test NAS connection" },
      { status: 500 }
    );
  }
}
