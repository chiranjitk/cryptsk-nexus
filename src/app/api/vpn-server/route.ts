import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { AuthError, requireAuth } from '@/lib/api-auth';

const execFileAsync = promisify(execFile);

// ─── Validation Helpers ──────────────────────────────────────────────

/** Validate VPN connection name — only allow safe characters */
function validateConnName(name: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Invalid connection name: ${name}`);
  return name;
}

/** Validate WireGuard config content — reject dangerous directives */
function validateWgConfig(config: string): void {
  // Reject shell escape sequences, template includes, and PostUp/PostDown with shell metacharacters
  const dangerousPatterns = [/`/g, /\$\(/g, /PostUp\s*=.*[;&|`$]/gi, /PostDown\s*=.*[;&|`$]/gi, /Include\s/i];
  for (const pat of dangerousPatterns) {
    if (pat.test(config)) {
      throw new Error('Invalid WireGuard config: contains dangerous content');
    }
  }
}

/** Validate WireGuard public key — Base64 encoded, 44 chars (32 bytes) */
function isValidWgPublicKey(key: string): boolean {
  return /^[A-Za-z0-9+/=]{44}$/.test(key);
}

/** Validate WireGuard allowed IP — CIDR notation: IP/mask */
function isValidWgIp(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(ip) ||
         /^[a-fA-F0-9:]+\/\d{1,3}$/.test(ip);
}

/** Validate WireGuard endpoint — host:port format only, no special characters */
function isValidWgEndpoint(endpoint: string): boolean {
  return /^[\w.-]+:\d{1,5}$/.test(endpoint);
}

/** Validate WireGuard keepalive — Numeric seconds only */
function isValidWgKeepalive(val: string): boolean {
  return /^\d{1,5}$/.test(val);
}

// ─── Helpers ──────────────────────────────────────────────────────

async function runFile(cmd: string, args: string[], timeout = 10000): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout, encoding: 'utf-8' });
    return { stdout, stderr: '', code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e?.stdout || '', stderr: e?.stderr || '', code: e?.status || 1 };
  }
}

async function whichTool(tool: string): Promise<boolean> {
  const r = await runFile('which', [tool], 3000);
  return r.code === 0;
}

const WG_CONF = '/etc/wireguard/wg0.conf';

// ─── GET Handler ──────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // ── Action: status ────────────────────────────────────────
    if (action === 'status') {
      const wgInstalled = await whichTool('wg');
      const wgRunning = wgInstalled ? (await runFile('wg', ['show'], 5000)).code === 0 : false;
      const ipsecInstalled = await whichTool('ipsec');
      const swanctlInstalled = await whichTool('swanctl');

      let ipsecRunning = false;
      let ipsecVersion = '';
      if (ipsecInstalled) {
        const v = await runFile('ipsec', ['--version'], 3000);
        ipsecVersion = v.stdout.trim();
        const status = await runFile('ipsec', ['status'], 5000);
        ipsecRunning = status.code === 0 && status.stdout.includes('Security Associations');
      } else if (swanctlInstalled) {
        const status = await runFile('swanctl', ['--stats'], 5000);
        ipsecRunning = status.code === 0;
        const v = await runFile('swanctl', ['--version'], 3000);
        ipsecVersion = v.stdout.trim();
      }

      const wgVersion = wgInstalled ? (await runFile('wg', ['--version'], 3000)).stdout.trim() : '';

      return NextResponse.json({
        wireguard: { installed: wgInstalled, running: wgRunning, version: wgVersion },
        ipsec: { installed: ipsecInstalled || swanctlInstalled, running: ipsecRunning, version: ipsecVersion, swanctlMode: swanctlInstalled },
      });
    }

    // ── Action: ipsec-tunnels ─────────────────────────────────
    if (action === 'ipsec-tunnels') {
      const r = await runFile('ipsec', ['statusall'], 10000);
      return NextResponse.json({ success: true, output: r.stdout, exitCode: r.code, error: r.stderr });
    }

    // ── Action: ipsec-policies ────────────────────────────────
    if (action === 'ipsec-policies') {
      const r = await runFile('ipsec', ['status', 'policies'], 10000);
      return NextResponse.json({ success: true, output: r.stdout, exitCode: r.code, error: r.stderr });
    }

    // ── Action: ipsec-sa ──────────────────────────────────────
    if (action === 'ipsec-sa') {
      const r = await runFile('ipsec', ['status', 'sa'], 10000);
      return NextResponse.json({ success: true, output: r.stdout, exitCode: r.code, error: r.stderr });
    }

    // ── Action: wireguard-peers ───────────────────────────────
    if (action === 'wireguard-peers') {
      const r = await runFile('wg', ['show', 'all'], 10000);
      return NextResponse.json({ success: true, output: r.stdout, exitCode: r.code, error: r.stderr });
    }

    // ── Action: wireguard-config ──────────────────────────────
    if (action === 'wireguard-config') {
      if (!existsSync(WG_CONF)) {
        return NextResponse.json({ success: true, config: '# WireGuard config not found', exists: false });
      }
      const config = readFileSync(WG_CONF, 'utf-8');
      return NextResponse.json({ success: true, config, exists: true });
    }

    // ── Action: system-keys ───────────────────────────────────
    if (action === 'system-keys') {
      const privKeyPath = '/etc/wireguard/privatekey';
      const pubKeyPath = '/etc/wireguard/publickey';
      let hasKeys = false;
      let publicKey = '';
      let hasPrivateKey = false;
      if (existsSync(pubKeyPath)) {
        publicKey = readFileSync(pubKeyPath, 'utf-8').trim();
        hasKeys = true;
      }
      if (existsSync(privKeyPath)) {
        hasPrivateKey = true;
      }
      return NextResponse.json({ success: true, hasKeys, publicKey, hasPrivateKey });
    }

    // ── Action: vpn-logs ──────────────────────────────────────
    if (action === 'vpn-logs') {
      const filterConn = searchParams.get('connection') || '';
      const limit = searchParams.get('limit') || '200';

      // Try journalctl first
      let logs = '';
      const journalResult = await runFile('journalctl', ['-u', 'strongswan', '--no-pager', '-n', '500'], 10000);
      if (journalResult.code === 0 && journalResult.stdout) {
        logs = journalResult.stdout;
      } else {
        // Try syslog
        const syslogResult = await runFile('journalctl', ['-u', 'wg-quick@wg0', '--no-pager', '-n', '200'], 10000);
        if (syslogResult.code === 0 && syslogResult.stdout) {
          logs = syslogResult.stdout;
        } else {
          // Try /var/log
          const syslogFile = await runFile('tail', ['-n', '500', '/var/log/syslog'], 10000).catch(() => ({ stdout: '' }));
          logs = syslogFile.stdout;
        }
      }

      // Parse logs: filter VPN-related entries
      const lines = logs.split('\n').filter((line) => {
        if (!line.trim()) return false;
        const lower = line.toLowerCase();
        const isVpn = lower.includes('ipsec') || lower.includes('strongswan') || lower.includes('charon') ||
          lower.includes('wireguard') || lower.includes('wg-quick') || lower.includes('swanctl') ||
          lower.includes('ike') || lower.includes('esp') || lower.includes('handshake');
        if (!isVpn) return false;
        if (filterConn && !lower.includes(filterConn.toLowerCase())) return false;
        return true;
      });

      return NextResponse.json({
        success: true,
        logs: lines.slice(-parseInt(limit)).join('\n'),
        totalLines: lines.length,
      });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const msg = error instanceof Error && error.message.includes("Authentication") ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── POST Handler ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    const body = await request.json();
    const { action } = body;

    // ── Action: wg-generate-keys ──────────────────────────────
    if (action === 'wg-generate-keys') {
      if (!(await whichTool('wg'))) {
        return NextResponse.json({
          success: false,
          error: 'WireGuard (wg) is not installed. Install with: apt install wireguard',
        }, { status: 400 });
      }

      const privKey = await runFile('wg', ['genkey'], 5000);
      if (privKey.code !== 0 || !privKey.stdout.trim()) {
        return NextResponse.json({ success: false, error: 'Failed to generate private key' }, { status: 500 });
      }

      const pubKey = await runFile('wg', ['pubkey'], { timeout: 5000, input: privKey.stdout.trim() } as any);
      if (pubKey.code !== 0 || !pubKey.stdout.trim()) {
        return NextResponse.json({ success: false, error: 'Failed to generate public key' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        privateKey: privKey.stdout.trim(),
        publicKey: pubKey.stdout.trim(),
      });
    }

    // ── Action: wg-add-peer ───────────────────────────────────
    if (action === 'wg-add-peer') {
      const { publicKey, allowedIps, endpoint, keepalive } = body;
      if (!publicKey || !allowedIps) {
        return NextResponse.json({ success: false, error: 'Missing: publicKey, allowedIps' }, { status: 400 });
      }

      // Validate WireGuard peer fields before writing to config
      if (!isValidWgPublicKey(publicKey)) {
        return NextResponse.json({ success: false, error: 'Invalid public key format' }, { status: 400 });
      }
      if (!isValidWgIp(allowedIps)) {
        return NextResponse.json({ success: false, error: 'Invalid AllowedIPs format (expected CIDR notation)' }, { status: 400 });
      }
      if (endpoint && !isValidWgEndpoint(endpoint)) {
        return NextResponse.json({ success: false, error: 'Invalid endpoint format (expected host:port)' }, { status: 400 });
      }
      if (keepalive && !isValidWgKeepalive(String(keepalive))) {
        return NextResponse.json({ success: false, error: 'Invalid keepalive value (expected numeric seconds)' }, { status: 400 });
      }

      if (!existsSync(WG_CONF)) {
        return NextResponse.json({ success: false, error: `WireGuard config not found at ${WG_CONF}` }, { status: 400 });
      }

      let config = readFileSync(WG_CONF, 'utf-8');
      const peerBlock = `\n# Peer added via ISP Platform\n[Peer]\nPublicKey = ${publicKey}\nAllowedIPs = ${allowedIps}${endpoint ? `\nEndpoint = ${endpoint}` : ''}${keepalive ? `\nPersistentKeepalive = ${keepalive}` : ''}\n`;
      config += peerBlock;
      writeFileSync(WG_CONF, config, 'utf-8');

      return NextResponse.json({ success: true, message: 'Peer added to config (not yet applied)' });
    }

    // ── Action: wg-remove-peer ────────────────────────────────
    if (action === 'wg-remove-peer') {
      const { publicKey } = body;
      if (!publicKey) {
        return NextResponse.json({ success: false, error: 'Missing: publicKey' }, { status: 400 });
      }

      if (!existsSync(WG_CONF)) {
        return NextResponse.json({ success: false, error: `WireGuard config not found at ${WG_CONF}` }, { status: 400 });
      }

      let config = readFileSync(WG_CONF, 'utf-8');
      const lines = config.split('\n');
      const newLines: string[] = [];
      let skip = false;

      for (const line of lines) {
        if (line.trim() === '[Peer]') {
          skip = true;
          continue;
        }
        if (skip && line.trim().startsWith('PublicKey') && line.includes(publicKey)) {
          // Found the peer to remove, continue skipping until next section
          continue;
        }
        if (skip && line.trim().startsWith('# Peer')) {
          continue;
        }
        if (skip && (line.trim().startsWith('[') || line.trim() === '')) {
          // End of peer block
          if (line.trim().startsWith('[')) {
            newLines.push(line);
          }
          skip = false;
          continue;
        }
        if (!skip) {
          newLines.push(line);
        }
      }

      writeFileSync(WG_CONF, newLines.join('\n'), 'utf-8');
      return NextResponse.json({ success: true, message: 'Peer removed from config' });
    }

    // ── Action: wg-save-config ────────────────────────────────
    if (action === 'wg-save-config') {
      const { config } = body;
      if (!config) {
        return NextResponse.json({ success: false, error: 'Missing: config' }, { status: 400 });
      }

      // Validate config before writing
      try {
        validateWgConfig(String(config));
      } catch (err: any) {
        return NextResponse.json({ success: false, error: "Invalid WireGuard configuration" }, { status: 400 });
      }

      // Ensure directory exists
      const dir = WG_CONF.substring(0, WG_CONF.lastIndexOf('/'));
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(WG_CONF, String(config), 'utf-8');

      // Try simple reload
      const down = await runFile('wg-quick', ['down', 'wg0'], 15000);
      const up = await runFile('wg-quick', ['up', 'wg0'], 15000);

      return NextResponse.json({
        success: true,
        message: 'Config saved',
        reloadOutput: up.stdout || up.stderr,
        reloadCode: up.code,
      });
    }

    // ── Action: ipsec-add-conn ────────────────────────────────
    if (action === 'ipsec-add-conn') {
      const { name, type, localIp, localSubnet, remoteIp, remoteSubnet, psk, ike, esp, pfs } = body;
      if (!name || !localIp || !remoteIp) {
        return NextResponse.json({ success: false, error: 'Missing: name, localIp, remoteIp' }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return NextResponse.json({ success: false, error: 'Invalid connection name' }, { status: 400 });
      }
      const safeName = validateConnName(name);

      const connType = type || 'tunnel';
      const localNet = localSubnet || localIp;
      const remoteNet = remoteSubnet || remoteIp;

      let configBlock = `\nconn ${safeName}\n    auto=add\n    keyexchange=ikev2\n    `;
      if (connType === 'transport') {
        configBlock += `type=transport\n    `;
      } else {
        configBlock += `type=tunnel\n    `;
      }
      configBlock += `left=${localIp}\n`;
      if (localNet !== localIp) {
        configBlock += `    leftsubnet=${localNet}\n`;
      }
      configBlock += `    right=${remoteIp}\n`;
      if (remoteNet !== remoteIp) {
        configBlock += `    rightsubnet=${remoteNet}\n`;
      }
      if (psk) {
        configBlock += `    authby=secret\n`;
      }
      if (ike) configBlock += `    ike=${ike}\n`;
      if (esp) configBlock += `    esp=${esp}\n`;
      if (pfs) configBlock += `    pfs=${pfs}\n`;

      // Write to ipsec.secrets if PSK provided
      if (psk) {
        const secretsFile = '/etc/ipsec.secrets';
        const secretEntry = `${localIp} ${remoteIp} : PSK "${psk}"\n`;
        let secrets = '';
        if (existsSync(secretsFile)) {
          secrets = readFileSync(secretsFile, 'utf-8');
        }
        if (!secrets.includes(`${localIp} ${remoteIp}`)) {
          writeFileSync(secretsFile, secrets + secretEntry, 'utf-8');
        }
      }

      // Append to ipsec.conf
      const confFile = '/etc/ipsec.conf';
      let conf = '';
      if (existsSync(confFile)) {
        conf = readFileSync(confFile, 'utf-8');
      }
      if (!conf.includes(`conn ${safeName}`)) {
        conf += configBlock;
        writeFileSync(confFile, conf, 'utf-8');
      }

      return NextResponse.json({ success: true, message: `Connection "${safeName}" added to ipsec.conf`, config: configBlock.trim() });
    }

    // ── Action: ipsec-reload ──────────────────────────────────
    if (action === 'ipsec-reload') {
      const r = await runFile('ipsec', ['reload'], 15000);
      if (r.code !== 0) {
        // Try swanctl
        const sr = await runFile('swanctl', ['--load-all'], 15000);
        return NextResponse.json({ success: sr.code === 0, output: sr.stdout || sr.stderr, exitCode: sr.code });
      }
      return NextResponse.json({ success: true, output: r.stdout || r.stderr });
    }

    // ── Action: ipsec-up ──────────────────────────────────────
    if (action === 'ipsec-up') {
      const { name } = body;
      if (!name) {
        return NextResponse.json({ success: false, error: 'Missing: name' }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return NextResponse.json({ success: false, error: 'Invalid connection name' }, { status: 400 });
      }
      const safeName = validateConnName(name);
      const r = await runFile('ipsec', ['up', safeName], 30000);
      return NextResponse.json({ success: r.code === 0, output: r.stdout || r.stderr, exitCode: r.code });
    }

    // ── Action: ipsec-down ────────────────────────────────────
    if (action === 'ipsec-down') {
      const { name } = body;
      if (!name) {
        return NextResponse.json({ success: false, error: 'Missing: name' }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return NextResponse.json({ success: false, error: 'Invalid connection name' }, { status: 400 });
      }
      const safeName = validateConnName(name);
      const r = await runFile('ipsec', ['down', safeName], 30000);
      return NextResponse.json({ success: r.code === 0, output: r.stdout || r.stderr, exitCode: r.code });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const msg = error instanceof Error && error.message.includes("Authentication") ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
