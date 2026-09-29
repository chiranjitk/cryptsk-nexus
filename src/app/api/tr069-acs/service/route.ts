import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { spawn, execSync } from "child_process";
import { existsSync } from "fs";
import { mkdirSync } from "fs";
import net from "net";

// ─── Constants ──────────────────────────────────────────────────────────────

// Prevent Turbopack from treating paths as module imports.
// These must be resolved at runtime only.
const GENIEACS_BIN_PARTS = ["/home/z", ".npm-global", "lib", "node_modules", "genieacs", "bin"];
function getGenieacsBin() {
  return GENIEACS_BIN_PARTS.join("/");
}
const MONGOD_PARTS = ["/tmp", "mongodb-linux-x86_64-ubuntu2404-8.0.4", "bin", "mongod"];
function getMongodBin() {
  return MONGOD_PARTS.join("/");
}
const MONGODB_DATA = ["/tmp", "genieacs-mongodb-data"].join("/");
const MONGODB_PORT = 27017;

const SERVICES = [
  { name: "CWMP", bin: "genieacs-cwmp", port: 7547 },
  { name: "NBI", bin: "genieacs-nbi", port: 7548 },
  { name: "FS", bin: "genieacs-fs", port: 7567 },
] as const;

// Track spawned processes
const spawnedProcesses: Record<string, { process: ReturnType<typeof spawn>; pid: number }> = {};
let mongodProcess: { process: ReturnType<typeof spawn>; pid: number } | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function checkPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

async function checkMongoRunning(): Promise<boolean> {
  return checkPortOpen(MONGODB_PORT);
}

async function checkServiceRunning(port: number): Promise<boolean> {
  return checkPortOpen(port);
}

function checkProcessRunning(binName: string): boolean {
  try {
    const out = execSync(`pgrep -f "${binName}" 2>/dev/null`, {
      timeout: 2000,
      encoding: "utf-8",
    }).trim();
    return !!out;
  } catch {
    return false;
  }
}

async function startMongo(): Promise<{ success: boolean; message: string }> {
  const isRunning = await checkMongoRunning();
  if (isRunning) {
    return { success: true, message: "MongoDB is already running" };
  }

  // Ensure data directory exists
  if (!existsSync(MONGODB_DATA)) {
    mkdirSync(MONGODB_DATA, { recursive: true });
  }

  return new Promise((resolve) => {
    const proc = spawn(
      getMongodBin(),
      ["--dbpath", MONGODB_DATA, "--port", String(MONGODB_PORT), "--fork", "--logpath", ["/tmp", "genieacs-mongod.log"].join("/")],
      {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      },
    );

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      resolve({ success: false, message: `Failed to start MongoDB: ${err.message}` });
    });

    proc.on("close", (code) => {
      if (code === 0) {
        mongodProcess = { process: proc, pid: proc.pid ?? 0 };
        resolve({ success: true, message: "MongoDB started successfully" });
      } else {
        resolve({ success: false, message: `MongoDB exited with code ${code}: ${stderr}` });
      }
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      resolve({ success: false, message: "MongoDB start timed out" });
    }, 5000);
  });
}

function startGenieService(name: string, bin: string): Promise<{ success: boolean; message: string }> {
  const binPath = `${getGenieacsBin()}/${bin}`;
  if (!existsSync(binPath)) {
    return Promise.resolve({ success: false, message: `${bin} not found at ${binPath}` });
  }

  if (spawnedProcesses[name]) {
    return Promise.resolve({ success: true, message: `${name} is already running` });
  }

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      GENIEACS_MONGODB_CONNECTION_URL: process.env.GENIEACS_MONGODB_URL || "mongodb://127.0.0.1:27017/genieacs",
      GENIEACS_UI_JWT_SECRET: process.env.GENIEACS_JWT_SECRET || "CHANGE-THIS-SECRET-IN-PRODUCTION",
      GENIEACS_LOG_DIR: "/tmp/genieacs-logs",
    };

    // Ensure log directory
    try {
      mkdirSync("/tmp/genieacs-logs", { recursive: true });
    } catch {
      // ignore
    }

    // Hide path from static analysis by computing at runtime
    const args = [getGenieacsBin(), bin].join("/");
    const proc = spawn("node", [args], {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      resolve({ success: false, message: `Failed to start ${name}: ${err.message}` });
    });

    // Give it a moment to start
    setTimeout(() => {
      if (proc.exitCode === null) {
        spawnedProcesses[name] = { process: proc, pid: proc.pid ?? 0 };
        resolve({ success: true, message: `${name} started on port ${SERVICES.find((s) => s.name === name)?.port}` });
      } else {
        resolve({ success: false, message: `${name} exited immediately: ${stderr}` });
      }
    }, 2000);
  });
}

async function stopService(name: string, bin: string): Promise<{ success: boolean; message: string }> {
  // Kill tracked process first
  if (spawnedProcesses[name]) {
    try {
      spawnedProcesses[name].process.kill("SIGTERM");
      delete spawnedProcesses[name];
    } catch {
      // Process may already be dead
    }
  }

  // Also kill via pgrep to be thorough
  try {
    execSync(`pkill -f "${bin}" 2>/dev/null`, { timeout: 2000 });
    return { success: true, message: `${name} stopped` };
  } catch {
    return { success: true, message: `${name} was not running` };
  }
}

async function stopMongo(): Promise<{ success: boolean; message: string }> {
  try {
    execSync(`"${getMongodBin()}" --shutdown --dbpath ${MONGODB_DATA} 2>/dev/null || pkill -f "mongod.*genieacs" 2>/dev/null`, {
      timeout: 3000,
    });
    mongodProcess = null;
    return { success: true, message: "MongoDB stopped" };
  } catch {
    return { success: true, message: "MongoDB was not running" };
  }
}

// ─── GET Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const mongoRunning = await checkMongoRunning();
    const serviceStatus = await Promise.all(
      SERVICES.map(async (s) => ({
        name: s.name,
        port: s.port,
        bin: s.bin,
        running: await checkServiceRunning(s.port),
        processRunning: checkProcessRunning(s.bin),
      })),
    );

    return NextResponse.json({
      success: true,
      mongodb: {
        running: mongoRunning,
        port: MONGODB_PORT,
        dataPath: MONGODB_DATA,
      },
      services: serviceStatus,
      allRunning: mongoRunning && serviceStatus.every((s) => s.running),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const body = await req.json();
    const { action } = body as { action: string };

    const results: Array<{ service: string; success: boolean; message: string }> = [];

    if (action === "start") {
      // Start MongoDB first if needed
      const mongoStatus = await startMongo();
      results.push({ service: "MongoDB", ...mongoStatus });

      if (!mongoStatus.success) {
        return NextResponse.json({ success: false, results, error: "Failed to start MongoDB" });
      }

      // Wait a moment for MongoDB to be ready
      await new Promise((r) => setTimeout(r, 1000));

      // Start all GenieACS services
      for (const svc of SERVICES) {
        const result = await startGenieService(svc.name, svc.bin);
        results.push({ service: svc.name, ...result });
      }

      return NextResponse.json({ success: true, results });
    }

    if (action === "stop") {
      // Stop GenieACS services first
      for (const svc of SERVICES) {
        const result = await stopService(svc.name, svc.bin);
        results.push({ service: svc.name, ...result });
      }

      // Stop MongoDB
      const mongoResult = await stopMongo();
      results.push({ service: "MongoDB", ...mongoResult });

      return NextResponse.json({ success: true, results });
    }

    if (action === "restart") {
      // Stop everything first
      for (const svc of SERVICES) {
        await stopService(svc.name, svc.bin);
      }
      await stopMongo();

      await new Promise((r) => setTimeout(r, 1000));

      // Start everything
      const mongoStatus = await startMongo();
      results.push({ service: "MongoDB", ...mongoStatus });

      if (!mongoStatus.success) {
        return NextResponse.json({ success: false, results, error: "Failed to start MongoDB after restart" });
      }

      await new Promise((r) => setTimeout(r, 1000));

      for (const svc of SERVICES) {
        const result = await startGenieService(svc.name, svc.bin);
        results.push({ service: svc.name, ...result });
      }

      return NextResponse.json({ success: true, results });
    }

    if (action === "status") {
      // Same as GET
      const mongoRunning = await checkMongoRunning();
      const serviceStatus = await Promise.all(
        SERVICES.map(async (s) => ({
          name: s.name,
          port: s.port,
          bin: s.bin,
          running: await checkServiceRunning(s.port),
          processRunning: checkProcessRunning(s.bin),
        })),
      );

      return NextResponse.json({
        success: true,
        mongodb: { running: mongoRunning, port: MONGODB_PORT },
        services: serviceStatus,
        allRunning: mongoRunning && serviceStatus.every((s) => s.running),
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
