import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/api-auth';

// ─── Lazy-load ssh2 ───────────────────────────────────────────────
// ssh2 ships a native C++ binding (.node binary) that webpack cannot
// bundle. We use dynamic import() so the module is loaded at runtime
// by Node.js (which handles .node files natively) rather than at
// build-time by webpack. This also respects `serverExternalPackages`
// in next.config.ts.
let cachedClient: any = null;
async function getSshClient(): Promise<any> {
  if (!cachedClient) {
    const mod = await import('ssh2');
    cachedClient = mod.Client;
  }
  return cachedClient;
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Allowlist of safe read-only command prefixes for network devices */
function sanitizeCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  // Allowlist of safe read-only command prefixes
  const allowedPatterns = [
    /^show\s+/i,        // show interfaces, show running-config, show version, etc.
    /^display\s+/i,     // display commands (Huawei/ZTE)
    /^get\s+/i,         // get status/info
    /^ping\s+[\d.]+\s*$/i,  // ping with IP only
    /^traceroute\s+[\d.]+\s*$/i,  // traceroute with IP only
    /^system\s+(info|uptime|version|resources|status)\s*$/i,
    /^diag\s+/i,        // diagnostic commands
    /^echo\s+["']?.{1,50}["']?\s*$/i,  // echo with limited length
  ];
  return allowedPatterns.some(rx => rx.test(trimmed));
}

interface SshAuth {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

async function createConnection(auth: SshAuth): Promise<any> {
  const Client = await getSshClient();
  const conn = new Client();
  const config: Record<string, unknown> = {
    host: auth.host,
    port: auth.port || 22,
    username: auth.username,
    readyTimeout: 10000,
    keepaliveInterval: 15000,
  };
  if (auth.privateKey) {
    config.privateKey = Buffer.from(auth.privateKey, 'utf-8');
  } else if (auth.password) {
    config.password = auth.password;
  }
  conn.connect(config);
  return conn;
}

async function sshExec(auth: SshAuth, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const conn = await createConnection(auth);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error('SSH connection timed out after 30s'));
    }, 30000);

    conn.on('ready', () => {
      conn.exec(command, (err: Error | null, stream: any) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          reject(new Error(`Command execution failed: ${err.message}`));
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data: Buffer) => {
          stdout += data.toString('utf-8');
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8');
        });

        stream.on('close', (code: number) => {
          clearTimeout(timeout);
          conn.end();
          resolve({ stdout, stderr, code: code || 0 });
        });
      });
    });

    conn.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ─── POST Handler ─────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<Response> {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    const body = await request.json();
    const { action } = body;

    // ── Action: connect (test SSH connection) ────────────────
    if (action === 'connect') {
      const { host, port, username, password, privateKey } = body;
      if (!host || !username || (!password && !privateKey)) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: host, username, password or privateKey' },
          { status: 400 }
        );
      }

      return new Promise((resolve) => {
        createConnection({ host, port, username, password, privateKey }).then((conn: any) => {
        const timeout = setTimeout(() => {
          conn.end();
          resolve(NextResponse.json({ success: false, error: 'Connection timed out after 10s' }, { status: 408 }));
        }, 15000);

        conn.on('ready', () => {
          clearTimeout(timeout);
          const banner = (conn as any)._serverBanner || 'Connected';
          const version = (conn as any)._remoteVersion || 'Unknown';
          conn.end();
          resolve(NextResponse.json({
            success: true,
            banner: banner.replace(/[\r\n]/g, ''),
            remoteVersion: version,
          }));
        });

        conn.on('error', (err: Error) => {
          clearTimeout(timeout);
          let status = 500;
          let message = err.message;
          if (err.message.includes('ECONNREFUSED')) {
            status = 502;
            message = `Connection refused to ${host}:${port || 22}`;
          } else if (err.message.includes('ENOTFOUND')) {
            status = 502;
            message = `Host not found: ${host}`;
          } else if (err.message.includes('ECONNRESET')) {
            status = 502;
            message = `Connection reset by ${host}`;
          } else if (err.message.includes('auth') || err.message.includes('All configured') || err.message.includes('handshake')) {
            status = 401;
            message = `Authentication failed for ${username}@${host}`;
          } else if (err.message.includes('timeout') || err.message.includes('TIMEDOUT')) {
            status = 408;
            message = `Connection timed out to ${host}:${port || 22}`;
          }
          resolve(NextResponse.json({ success: false, error: message }, { status }));
        });
        }).catch((err: Error) => {
          resolve(NextResponse.json({ success: false, error: err.message }, { status: 502 }));
        });
      });
    }

    // ── Action: execute (single command) ─────────────────────
    if (action === 'execute') {
      const { host, port, username, password, privateKey, command } = body;
      if (!host || !username || (!password && !privateKey) || !command) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: host, username, password/privateKey, command' },
          { status: 400 }
        );
      }

      if (!sanitizeCommand(command)) {
        return NextResponse.json({ success: false, error: 'Command not allowed' }, { status: 403 });
      }

      try {
        const result = await sshExec({ host, port, username, password, privateKey }, command);
        return NextResponse.json({
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.code,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'SSH execution failed';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    // ── Action: executeBatch (multiple commands sequentially) ─
    if (action === 'executeBatch') {
      const { host, port, username, password, commands } = body;
      if (!host || !username || (!password && !commands) || !Array.isArray(commands) || commands.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: host, username, password, commands[]' },
          { status: 400 }
        );
      }

      // Validate all commands first
      for (const cmd of commands) {
        if (!sanitizeCommand(cmd)) {
          return NextResponse.json({ success: false, error: 'Command not allowed' }, { status: 403 });
        }
      }

      const results: Array<{ command: string; stdout: string; stderr: string; exitCode: number; success: boolean }> = [];

      for (const cmd of commands) {
        try {
          const result = await sshExec({ host, port, username, password }, cmd);
          results.push({ command: cmd, stdout: result.stdout, stderr: result.stderr, exitCode: result.code, success: result.code === 0 });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'SSH execution failed';
          results.push({ command: cmd, stdout: '', stderr: msg, exitCode: -1, success: false });
        }
      }

      return NextResponse.json({ success: true, results });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
