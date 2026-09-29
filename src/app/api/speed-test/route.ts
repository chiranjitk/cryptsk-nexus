import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { execSync } from "child_process";

const execFileAsync = promisify(execFile);

const SPEEDTEST_BIN = "/tmp/speedtest";
const SPEEDTEST_URL = "https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-x86_64.tgz";

// Auto-install the Ookla Speedtest CLI binary if missing
async function ensureSpeedtestBinary(): Promise<{ ok: boolean; error?: string }> {
  if (existsSync(SPEEDTEST_BIN)) {
    try {
      execSync(`"${SPEEDTEST_BIN}" --version`, { timeout: 5000, stdio: "pipe" });
      return { ok: true };
    } catch {
      // Binary exists but broken — reinstall
    }
  }

  try {
    // Download
    execSync(
      `curl -sLo /tmp/speedtest.tgz "${SPEEDTEST_URL}"`,
      { timeout: 60000, stdio: "pipe" }
    );
    // Extract
    execSync("cd /tmp && tar xzf speedtest.tgz", { timeout: 30000, stdio: "pipe" });
    // Make executable
    execSync(`chmod +x ${SPEEDTEST_BIN}`, { timeout: 5000, stdio: "pipe" });
    // Verify
    execSync(`"${SPEEDTEST_BIN}" --version`, { timeout: 5000, stdio: "pipe" });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to install speedtest CLI: ${msg}` };
  }
}

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "status";

  if (action === "install") {
    const result = await ensureSpeedtestBinary();
    if (!result.ok) {
      return NextResponse.json({ error: result.error, available: false }, { status: 500 });
    }
    return NextResponse.json({ available: true, binary: SPEEDTEST_BIN, message: "Speedtest CLI installed successfully" });
  }

  if (action === "servers") {
    const { ok, error } = await ensureSpeedtestBinary();
    if (!ok) {
      return NextResponse.json({ error }, { status: 503 });
    }
    try {
      const { stdout } = await execFileAsync(
        SPEEDTEST_BIN,
        ["-L", "--accept-license", "--accept-gdpr", "-f", "json"],
        { timeout: 30000 }
      );
      const data = JSON.parse(stdout);
      const servers = (data.servers || []).map((s: Record<string, unknown>) => ({
        id: s.id,
        name: s.name,
        location: s.location,
        host: s.host,
        sponsor: s.sponsor,
      }));
      return NextResponse.json({ servers });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({
    available: existsSync(SPEEDTEST_BIN),
    binary: SPEEDTEST_BIN,
  });
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
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  const body = await request.json();
  const { action, serverId } = body;

  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  // Auto-install if missing
  const { ok, error } = await ensureSpeedtestBinary();
  if (!ok) {
    return NextResponse.json({ error }, { status: 503 });
  }

  if (action === "run" || action === "test-with-server") {
    const args = ["--accept-license", "--accept-gdpr", "-f", "json"];

    if (action === "test-with-server" && serverId) {
      // Validate serverId — must be numeric only
      if (!/^\d+$/.test(String(serverId))) {
        return NextResponse.json({ error: "Invalid server ID" }, { status: 400 });
      }
      args.push("-s", String(serverId));
    }

    try {
      const { stdout } = await execFileAsync(SPEEDTEST_BIN, args, {
        timeout: 120000,
      });
      const data = JSON.parse(stdout);
      const result = {
        ping: data.ping
          ? {
              jitter: data.ping.jitter ?? 0,
              latency: data.ping.latency ?? 0,
              low: data.ping.low ?? 0,
              high: data.ping.high ?? 0,
            }
          : null,
        download: data.download
          ? {
              bandwidth: Math.round((data.download.bandwidth ?? 0) / 125000 * 100) / 100, // bytes/s to Mbps
              bytes: data.download.bytes ?? 0,
              elapsed: data.download.elapsed ?? 0,
            }
          : null,
        upload: data.upload
          ? {
              bandwidth: Math.round((data.upload.bandwidth ?? 0) / 125000 * 100) / 100,
              bytes: data.upload.bytes ?? 0,
              elapsed: data.upload.elapsed ?? 0,
            }
          : null,
        isp: data.isp ?? "",
        server: data.server
          ? {
              host: data.server.host ?? "",
              name: data.server.name ?? "",
              location: data.server.location ?? "",
            }
          : null,
        interface: data.interface
          ? {
              internalIp: data.interface.internalIp ?? "",
              name: data.interface.name ?? "",
              macAddr: data.interface.macAddr ?? "",
            }
          : null,
        resultUrl: data.result?.url ?? "",
        timestamp: new Date().toISOString(),
      };
      return NextResponse.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // execFileAsync throws if speedtest fails or times out
      if (msg.includes("timed out") || msg.includes("ETIMEDOUT") || msg.includes("SIGTERM")) {
        return NextResponse.json({ error: "Speed test timed out after 120s" }, { status: 408 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
