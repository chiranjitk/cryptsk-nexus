import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import net from "net";

// POST /api/devices/test-connection - Test TCP connectivity to a device
export async function POST(request: NextRequest): Promise<Response> {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { ip, port, username, password } = body;

    if (!ip) return NextResponse.json({ error: "IP address is required" }, { status: 400 });
    if (!port || port < 1 || port > 65535) return NextResponse.json({ error: "Valid port is required" }, { status: 400 });

    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 3000;

      socket.setTimeout(timeout);

      socket.on("connect", () => {
        socket.destroy();
        resolve(NextResponse.json({
          success: true,
          message: `Connection to ${ip}:${port} successful`,
          ip,
          port,
          responseTime: "< 5s",
          credentialsProvided: !!(username && password),
        }));
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(NextResponse.json({
          success: false,
          message: `Connection to ${ip}:${port} timed out after ${timeout}ms`,
          ip,
          port,
          error: "TIMEOUT",
        }));
      });

      socket.on("error", (err: NodeJS.ErrnoException) => {
        socket.destroy();
        resolve(NextResponse.json({
          success: false,
          message: `Failed to connect to ${ip}:${port} — ${err.code || err.message}`,
          ip,
          port,
          error: err.code || "UNKNOWN",
        }));
      });

      socket.connect(port, ip);
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Test connection error:", error);
    return NextResponse.json({ error: "Failed to test connection" }, { status: 500 });
  }
}
