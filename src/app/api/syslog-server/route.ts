import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { execSync } from "child_process";
import { requireAuth, AuthError } from "@/lib/api-auth";

const SYSLOG_SERVICE_PORT = 1514;

// Simple in-memory state for server running status
let syslogRunning = false;

function isPortInUse(port: number): boolean {
  try {
    const result = execSync(
      `ss -tuln | grep ":${port} " || true`,
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

function isProcessRunning(): boolean {
  try {
    const result = execSync(
      `pgrep -f "syslog-service/index" | head -1`,
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    return !!result;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "status";

  if (action === "status") {
    // Check if syslog service process is running
    syslogRunning = isProcessRunning();

    const count = await db.syslogMessage.count();
    return NextResponse.json({
      running: syslogRunning,
      port: SYSLOG_SERVICE_PORT,
      messageCount: count,
    });
  }

  if (action === "messages") {
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const facility = searchParams.get("facility");
    const severity = searchParams.get("severity");
    const search = searchParams.get("search");
    const source = searchParams.get("source");

    const where: Record<string, unknown> = {};
    if (facility) where.facility = facility;
    if (severity) where.severity = severity;
    if (source) where.source = source;
    if (search) where.message = { contains: search };

    const [messages, total] = await Promise.all([
      db.syslogMessage.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.syslogMessage.count({ where }),
    ]);

    return NextResponse.json({ messages, total, page, limit });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
  const body = await request.json();
  const { action } = body;

  if (action === "start") {
    try {
      // Check if port is already in use
      if (isPortInUse(SYSLOG_SERVICE_PORT)) {
        return NextResponse.json(
          { error: `Port ${SYSLOG_SERVICE_PORT} is already in use` },
          { status: 409 }
        );
      }

      // Check if process is already running
      if (isProcessRunning()) {
        return NextResponse.json(
          { error: "Syslog service is already running" },
          { status: 409 }
        );
      }

      // Ensure dependencies are installed
      try {
        execSync(
          `cd /home/z/my-project/mini-services/syslog-service && bun install 2>&1`,
          { encoding: "utf-8", timeout: 30000 }
        );
      } catch (installErr: unknown) {
        const installMsg = installErr instanceof Error ? installErr.message : String(installErr);
        console.error("[syslog] Dependency install failed:", installMsg);
        // Try to start anyway, might already be installed
      }

      // Ensure Prisma client is generated
      try {
        execSync(
          `cd /home/z/my-project/mini-services/syslog-service && bunx prisma generate --schema=/home/z/my-project/prisma/schema.prisma 2>&1`,
          { encoding: "utf-8", timeout: 30000 }
        );
      } catch (genErr: unknown) {
        const genMsg = genErr instanceof Error ? genErr.message : String(genErr);
        console.error("[syslog] Prisma generate warning:", genMsg);
        // Continue anyway, client might already be generated
      }

      // Start the service with DATABASE_URL from env
      const dbUrl = process.env.DATABASE_URL || "postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform";
      execSync(
        `cd /home/z/my-project/mini-services/syslog-service && DATABASE_URL="${dbUrl}" nohup bun run dev > /tmp/syslog-service.log 2>&1 &`,
        { encoding: "utf-8", timeout: 5000 }
      );

      // Wait and verify it started
      await new Promise((r) => setTimeout(r, 2000));

      if (isProcessRunning()) {
        syslogRunning = true;
        return NextResponse.json({ success: true, message: "Syslog server started successfully" });
      }

      // Check the log for errors
      let logOutput = "";
      try {
        logOutput = execSync(`cat /tmp/syslog-service.log 2>/dev/null || true`, {
          encoding: "utf-8",
          timeout: 3000,
        }).trim();
      } catch {
        // Ignore
      }

      return NextResponse.json(
        { error: "Syslog service failed to start", details: logOutput || "No log output available" },
        { status: 500 }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "stop") {
    try {
      execSync("pkill -f 'syslog-service/index' || true", { encoding: "utf-8", timeout: 5000 });
      await new Promise((r) => setTimeout(r, 500));
      syslogRunning = false;
      return NextResponse.json({ success: true, message: "Syslog server stopped" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "restart") {
    try {
      // Stop first
      execSync("pkill -f 'syslog-service/index' || true", { encoding: "utf-8", timeout: 5000 });
      await new Promise((r) => setTimeout(r, 1000));

      // Wait for port to be released
      for (let i = 0; i < 5; i++) {
        if (!isPortInUse(SYSLOG_SERVICE_PORT)) break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Start again with DATABASE_URL
      const dbUrl = process.env.DATABASE_URL || "postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform";
      execSync(
        `cd /home/z/my-project/mini-services/syslog-service && DATABASE_URL="${dbUrl}" nohup bun run dev > /tmp/syslog-service.log 2>&1 &`,
        { encoding: "utf-8", timeout: 5000 }
      );
      await new Promise((r) => setTimeout(r, 2000));

      syslogRunning = isProcessRunning();
      return NextResponse.json({ success: true, message: syslogRunning ? "Syslog server restarted" : "Syslog server restart attempted" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "clear") {
    await db.syslogMessage.deleteMany({});
    return NextResponse.json({ success: true, message: "All messages cleared" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
