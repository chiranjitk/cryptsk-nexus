/**
 * Walled Garden / Portal Whitelist Firewall API Route
 *
 * Manages the captive portal whitelist firewall rules via shell script.
 * All nftables commands are executed from the shell script — NEVER from code.
 *
 * GET  /api/wifi/walled-garden?action=status  → Run script with 'status'
 * POST /api/wifi/walled-garden?action=apply   → Run script with 'apply'
 * POST /api/wifi/walled-garden?action=remove  → Run script with 'remove'
 *
 * Requires: wifi.manage permission
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-context';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { STAYSUITE_SCRIPTS_DIR } from '@/lib/wifi/paths';
import path from 'path';
import { logWifi } from '@/lib/audit';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = path.join(STAYSUITE_SCRIPTS_DIR, 'walled-garden-apply.sh');
const SCRIPT_TIMEOUT = 30_000; // 30 seconds

export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');

  if (action !== 'status') {
    return NextResponse.json(
      { success: false, error: 'Invalid action. Use ?action=status' },
      { status: 400 },
    );
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      'bash',
      [SCRIPT_PATH, 'status'],
      { timeout: SCRIPT_TIMEOUT, maxBuffer: 1024 * 1024 },
    );

    // Parse JSON output from script
    try {
      const result = JSON.parse(stdout.trim());
      return NextResponse.json(result);
    } catch {
      // Script output wasn't valid JSON
      return NextResponse.json({
        success: false,
        error: 'Script returned invalid JSON',
        raw: stdout.trim(),
        stderr: stderr.trim(),
      });
    }
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; stderr?: string; killed?: boolean };
    console.error('[Walled Garden] Status check failed:', err.message);

    if (err.killed) {
      return NextResponse.json(
        { success: false, error: 'Script timed out after 30 seconds' },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: `Failed to run walled garden status: ${err.message || 'Unknown error'}`,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const { action } = body;

  if (!action || !['apply', 'remove'].includes(action)) {
    return NextResponse.json(
      { success: false, error: 'Invalid action. Use "apply" or "remove"' },
      { status: 400 },
    );
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      'bash',
      [SCRIPT_PATH, action],
      { timeout: SCRIPT_TIMEOUT, maxBuffer: 1024 * 1024 },
    );

    // Parse JSON output from script
    try {
      const result = JSON.parse(stdout.trim());
      return NextResponse.json(result);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Script returned invalid JSON',
        raw: stdout.trim(),
        stderr: stderr.trim(),
      });
    }
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; stderr?: string; killed?: boolean };
    console.error(`[Walled Garden] ${action} failed:`, err.message);

    if (err.killed) {
      return NextResponse.json(
        { success: false, error: `Script timed out after 30 seconds during "${action}"` },
        { status: 504 },
      );
    }

    logWifi(request, 'create', 'walled_garden', undefined).catch(() => {});
    return NextResponse.json(
      {
        success: false,
        error: `Failed to run walled garden ${action}: ${err.message || 'Unknown error'}`,
      },
      { status: 500 },
    );
  }
}
