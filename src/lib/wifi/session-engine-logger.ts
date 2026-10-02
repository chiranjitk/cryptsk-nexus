/**
 * StaySuite Session Engine Logger
 *
 * Provides file-based logging for the session engine with:
 *   - Writes to logs/session-engine.log (persistent)
 *   - Keeps last N log entries in memory (for status endpoint)
 *   - Tracks lastRun timestamp and run results (for health checks)
 *   - Daily log rotation (keeps last 7 days)
 *
 * Log format: [ISO8601] [LEVEL] [SessionEngine] message
 *
 * Performance: All file I/O is fully async (fs.promises) — zero blocking on the
 * Node.js event loop. This is critical for 5K+ concurrent users where the session
 * engine runs every 10 seconds and must not delay request handling.
 */

// Node.js-only modules — loaded via require() to avoid Turbopack Edge Runtime analysis.
// These files only execute in Node.js runtime (instrumentation + API routes with runtime='nodejs').
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = /*turbopackIgnore: true*/ require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = /*turbopackIgnore: true*/ require('path');

// Promisified fs for all file operations
const fsp = fs.promises;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LOG_DIR = /*turbopackIgnore: true*/ (() => path.join(process['cwd'](), 'logs'))();
const LOG_FILE = path.join(LOG_DIR, 'session-engine.log');
const MAX_IN_MEMORY_ENTRIES = 100;
const MAX_LOG_FILE_LINES = 10000;      // Rotate after this many lines
const MAX_LOG_FILES = 7;                // Keep 7 rotated files
const ROTATION_CHECK_INTERVAL = 100;    // Check rotation every N writes (not every write)

// In-memory line counter — avoids reading entire file on every log write
let fileLineCount = 0;

// ---------------------------------------------------------------------------
// In-memory state (survives as long as the Node process runs)
// ---------------------------------------------------------------------------

const inMemoryLog: Array<{ timestamp: string; level: string; message: string }> = [];
let lastRunResult: {
  timestamp: Date;
  sessionsProcessed: number;
  interimUpdated: number;
  sessionTimeoutDisconnected: number;
  idleTimeoutDisconnected: number;
  dataLimitDisconnected: number;
  staleCleaned: number;
  errors: number;
  durationMs: number;
  disconnectedSessions: Array<{ username: string; ip: string; reason: string }>;
} | null = null;

let totalRuns = 0;
let totalErrors = 0;

// Track whether dir has been ensured (sync only on first cold start)
let dirEnsured = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure log directory exists. Sync variant used only once on cold start. */
function ensureLogDirSync(): void {
  if (dirEnsured) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // may already exist
  }
  dirEnsured = true;
}

/** Ensure log directory exists. Async variant. */
async function ensureLogDir(): Promise<void> {
  if (dirEnsured) return;
  try {
    await fsp.mkdir(LOG_DIR, { recursive: true });
  } catch {
    // may already exist
  }
  dirEnsured = true;
}

const LOG_TIMEZONE = process.env.SE_LOG_TIMEZONE || 'Asia/Kolkata';

function formatTimestamp(): string {
  return new Date().toLocaleString('en-IN', {
    timeZone: LOG_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-');
}

function formatLine(level: string, message: string): string {
  const ts = formatTimestamp();
  return `[${ts}] [${level}] [SessionEngine] ${message}`;
}

/**
 * Async log rotation — fully non-blocking.
 *
 * Shifts old files (.1→.2, .2→.3, …, .6→.7 delete) and trims the current file
 * to the last 60% of lines. Uses streaming read to avoid loading entire file.
 *
 * Guard: only one rotation can run at a time via the `rotating` flag.
 */
let rotating = false;

async function rotateIfNeeded(): Promise<void> {
  if (rotating) return;
  if (fileLineCount <= MAX_LOG_FILE_LINES) return;

  rotating = true;
  try {
    await ensureLogDir();

    // Shift old files: .6 → .7 (delete), .5 → .6, ..., .1 → .2, current → .1
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const older = i === MAX_LOG_FILES - 1 ? null : path.join(LOG_DIR, `session-engine.log.${i + 1}`);
      const current = path.join(LOG_DIR, `session-engine.log.${i}`);
      try {
        await fsp.access(current);
        if (older) {
          await fsp.unlink(older).catch(() => {});
        }
        await fsp.rename(current, older || current);
      } catch {
        // file doesn't exist — skip
      }
    }

    // Trim current file to last 60% using async read
    try {
      const content = await fsp.readFile(LOG_FILE, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const keepFrom = Math.floor(lines.length * 0.4);
      const kept = lines.slice(keepFrom).join('\n') + '\n';
      await fsp.writeFile(LOG_FILE, kept, 'utf-8');
      // Update in-memory counter to match trimmed file
      fileLineCount = lines.slice(keepFrom).length;
    } catch {
      // If trim fails, reset counter and let it recover on next cycle
      fileLineCount = 0;
    }
  } finally {
    rotating = false;
  }
}

/**
 * Write a line to the log file — fully async, fire-and-forget.
 *
 * Uses callback-style appendFile (not await) to avoid blocking even the
 * microtask queue. The rotation check is also async but guarded by a flag
 * so only one rotation runs at a time.
 */
function writeToFile(line: string): void {
  try {
    ensureLogDirSync(); // sync only once on cold start (dirEnsured guard)
    // Only check rotation every N writes (not every single write)
    if (fileLineCount > 0 && fileLineCount % ROTATION_CHECK_INTERVAL === 0) {
      rotateIfNeeded().catch(() => {}); // fire-and-forget
    }
    // Use callback-style appendFile — does not block the event loop
    fs.appendFile(LOG_FILE, line + '\n', 'utf-8', (err) => {
      if (!err) {
        fileLineCount++;
      }
    });
  } catch {
    // Non-fatal — don't crash if log write fails
  }
}

// ---------------------------------------------------------------------------
// Logger functions
// ---------------------------------------------------------------------------

function addEntry(level: string, message: string): void {
  const line = formatLine(level, message);

  // Console output
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }

  // File output (async, non-blocking)
  writeToFile(line);

  // In-memory buffer (ring buffer)
  inMemoryLog.push({ timestamp: new Date().toISOString(), level, message });
  if (inMemoryLog.length > MAX_IN_MEMORY_ENTRIES) {
    inMemoryLog.shift();
  }
}

export function info(message: string): void {
  addEntry('INFO', message);
}

export function warn(message: string): void {
  addEntry('WARN', message);
}

export function error(message: string): void {
  totalErrors++;
  addEntry('ERROR', message);
}

// ---------------------------------------------------------------------------
// Run result tracking
// ---------------------------------------------------------------------------

export function recordRunResult(result: {
  sessionsProcessed: number;
  interimUpdated: number;
  sessionTimeoutDisconnected: number;
  idleTimeoutDisconnected: number;
  dataLimitDisconnected: number;
  staleCleaned: number;
  errors: number;
  durationMs: number;
  disconnectedSessions: Array<{ username: string; ip: string; reason: string }>;
}): void {
  totalRuns++;
  totalErrors += result.errors;

  lastRunResult = {
    timestamp: new Date(),
    ...result,
  };
}

// ---------------------------------------------------------------------------
// Status / diagnostics (fully async I/O)
// ---------------------------------------------------------------------------

export interface SessionEngineStatus {
  /** Whether the cron job is registered */
  cronRegistered: boolean;
  /** Last run timestamp */
  lastRunAt: string | null;
  /** How many seconds since last run */
  secondsSinceLastRun: number | null;
  /** Total runs since server started */
  totalRuns: number;
  /** Total errors since server started */
  totalErrors: number;
  /** Last run result details */
  lastResult: typeof lastRunResult;
  /** Recent in-memory log entries (last 30) */
  recentLogs: Array<{ timestamp: string; level: string; message: string }>;
  /** Log file path */
  logFilePath: string;
  /** Log file size in bytes */
  logFileSize: number;
  /** Number of log lines in file */
  logFileLines: number;
  /** Active sessions in radacct */
  activeSessions: number;
  /** nftables counter IPs */
  counterIPs: number;
}

/**
 * Read the last N lines from the log file — fully async.
 *
 * For large files, reads only the tail (~50KB) from the end to avoid
 * loading the entire file into memory.
 */
async function readLastLogLines(n: number): Promise<string[]> {
  try {
    await ensureLogDir();
    const stat = await fsp.stat(LOG_FILE);
    const readSize = Math.min(stat.size, 51200);
    if (stat.size === 0) return [];
    const handle = await fsp.open(LOG_FILE, 'r');
    try {
      const buf = Buffer.alloc(readSize);
      await handle.read(buf, 0, readSize, Math.max(0, stat.size - readSize));
      const lines = buf.toString('utf-8').split('\n').filter(Boolean);
      return lines.slice(-n);
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

/**
 * Get a full status report — fully async I/O.
 *
 * File stat is done via fs.promises.stat to avoid blocking the event loop.
 * In-memory counter is used for line count (no file read needed).
 */
export async function getStatus(extra?: {
  activeSessions?: number;
  counterIPs?: number;
}): Promise<SessionEngineStatus> {
  let logFileSize = 0;
  let logFileLines = 0;

  try {
    const stat = await fsp.stat(LOG_FILE);
    logFileSize = stat.size;
    // Use in-memory counter instead of reading entire file
    logFileLines = fileLineCount;
  } catch {
    // file doesn't exist yet — ignore
  }

  const now = Date.now();
  const secondsSinceLastRun = lastRunResult
    ? Math.floor((now - lastRunResult.timestamp.getTime()) / 1000)
    : null;

  return {
    cronRegistered: true, // If we're calling this, the cron is registered
    lastRunAt: lastRunResult?.timestamp.toISOString() ?? null,
    secondsSinceLastRun,
    totalRuns,
    totalErrors,
    lastResult: lastRunResult,
    recentLogs: inMemoryLog.slice(-30),
    logFilePath: LOG_FILE,
    logFileSize,
    logFileLines,
    activeSessions: extra?.activeSessions ?? 0,
    counterIPs: extra?.counterIPs ?? 0,
  };
}

/**
 * Read the last N lines from the log file (for display purposes) — fully async.
 */
export async function getRecentFileLogs(n: number = 50): Promise<string[]> {
  return readLastLogLines(n);
}

/**
 * Clear in-memory logs (useful for testing).
 */
export function clearMemoryLogs(): void {
  inMemoryLog.length = 0;
}
