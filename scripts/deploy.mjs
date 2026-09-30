#!/usr/bin/env node
/**
 * CRYPTSK Nexus — CI/CD Deploy Script
 *
 * Flow: Sandbox (code) → Git Push → SSH to Prod → Git Pull → Restart → Verify
 *
 * Usage (from sandbox /home/z/my-project):
 *   bun run deploy                       # Full deploy (commit + push + pull + install + build + restart + verify)
 *   bun run deploy -- --no-push          # Skip git push (just pull + restart on server)
 *   bun run deploy -- --status           # Check server status only
 *   bun run deploy -- --restart          # Just restart the dev server on prod
 *   bun run deploy -- --logs             # Tail PM2 logs from prod
 *
 * Target: Rocky Linux 10 production server (103.244.7.221:22222)
 * Project path on prod: /opt/cryptsk-nexus
 *
 * SECRETS MIGRATION PLAN (Phase 1+):
 *   Current: credentials hardcoded below (already in git history — accepted for Phase 0).
 *   Target:  read from process.env / .env (gitignored). Refactor in Phase 1+ and
 *            rotate all secrets (SSH pass, DB pass, admin pass, GitHub PAT).
 *   See docs/CICD-GUIDE.md §10 Secrets Management for the full plan.
 */

import { Client } from 'ssh2';
import { execSync } from 'child_process';

// ─── Configuration ─────────────────────────────────────────────
// NOTE: Phase 0 — hardcoded. Phase 1+ — migrate to process.env (see header).
const PROD = {
  host: process.env.PROD_HOST || '103.244.7.221',
  port: parseInt(process.env.PROD_SSH_PORT || '22222', 10),
  username: process.env.PROD_SSH_USER || 'root',
  password: process.env.PROD_SSH_PASS || 'CryptSK@123#$',
  readyTimeout: 30000,
};

const PROD_PROJECT_DIR = '/opt/ispplatform';
const SANDBOX_DIR = '/home/z/my-project';
const APP_PORT = 3000;

// ─── Colors ────────────────────────────────────────────────────
const c = { reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m' };

function log(icon, msg) { console.log(`${c.cyan}${icon}${c.reset} ${msg}`); }
function ok(msg) { log('✅', `${c.green}${msg}${c.reset}`); }
function fail(msg) { log('❌', `${c.red}${msg}${c.reset}`); }
function info(msg) { log('ℹ️', `${c.blue}${msg}${c.reset}`); }
function warn(msg) { log('⚠️', `${c.yellow}${msg}${c.reset}`); }
function step(n, msg) { log('🚀', `${c.bold}${c.magenta}[${n}]${c.reset} ${msg}`); }

// ─── SSH Helper ────────────────────────────────────────────────
function sshExec(command, timeout) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { conn.end(); reject(err); return; }
        let stdout = '', stderr = '';
        stream.on('data', d => stdout += d.toString());
        stream.stderr.on('data', d => stderr += d.toString());
        stream.on('close', (code) => { conn.end(); resolve({ stdout, stderr, code }); });
      });
    }).on('error', reject).connect({ ...PROD, readyTimeout: timeout || 30000 });
  });
}

// ─── Steps ─────────────────────────────────────────────────────

async function gitCommitAndPush() {
  step(1, 'Committing & pushing code to GitHub');
  try {
    execSync('git add -A', { cwd: SANDBOX_DIR, stdio: 'pipe' });
    
    const status = execSync('git status --porcelain', { cwd: SANDBOX_DIR, encoding: 'utf8' });
    if (status.trim()) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      execSync(`git commit -m "deploy: ${ts}"`, { cwd: SANDBOX_DIR, stdio: 'pipe' });
      ok('Changes committed');
    } else {
      info('No new changes to commit');
    }
    
    execSync('git push origin main 2>/dev/null || git push origin master 2>/dev/null', { 
      cwd: SANDBOX_DIR, stdio: 'pipe' 
    });
    ok('Code pushed to GitHub');
    return true;
  } catch (err) {
    const msg = (err.message || '').slice(0, 200);
    if (msg.includes('up-to-date') || msg.includes('Everything up')) {
      info('Already up-to-date on GitHub');
      return true;
    }
    fail(`Git push failed: ${msg}`);
    return false;
  }
}

async function gitPullOnServer() {
  step(2, 'Pulling latest code on production server');
  
  const { stdout, stderr } = await sshExec(
    `cd ${PROD_PROJECT_DIR} && git fetch --all 2>&1 && git reset --hard origin/main 2>/dev/null || git reset --hard origin/master 2>/dev/null && echo PULL_OK`
  );
  
  if (stdout.includes('PULL_OK')) {
    ok('Code pulled successfully');
    return true;
  }
  fail(`Pull failed: ${(stderr || stdout).slice(0, 300)}`);
  return false;
}

async function installDeps() {
  step(3, 'Installing dependencies on production');
  
  const { stdout, stderr } = await sshExec(
    `cd ${PROD_PROJECT_DIR} && bun install 2>&1 && echo INSTALL_OK`,
    60000
  );
  
  if (stdout.includes('INSTALL_OK')) {
    ok('Dependencies installed');
    return true;
  }
  warn(`Install had issues: ${(stderr || stdout).slice(-200)}`);
  return true; // Continue anyway
}

async function buildOnServer() {
  step(4, 'Building Next.js on production');
  
  const { stdout, stderr } = await sshExec(
    `cd ${PROD_PROJECT_DIR} && NODE_OPTIONS="--max-old-space-size=2048" npx next build 2>&1 | tail -5 && echo BUILD_OK`,
    300000  // 5 min timeout for build
  );
  
  if (stdout.includes('BUILD_OK')) {
    ok('Next.js build complete');
    return true;
  }
  fail(`Build failed: ${(stderr || stdout).slice(0, 300)}`);
  return false;
}

async function restartServer() {
  step(5, 'Restarting cryptsk-gateway on production');
  
  const { stdout, stderr } = await sshExec(
    `cd ${PROD_PROJECT_DIR} && pm2 restart cryptsk-gateway 2>&1 && sleep 5 && echo RESTART_OK`
  );
  
  if (stdout.includes('RESTART_OK')) {
    ok('Server restarted');
    // Wait a bit more for Next.js to be ready
    await new Promise(r => setTimeout(r, 3000));
    return true;
  }
  fail(`Restart failed: ${(stderr || stdout).slice(0, 300)}`);
  return false;
}

async function verifyDeploy() {
  step(6, 'Verifying deployment');
  
  // Check HTTP response
  const { stdout } = await sshExec(
    `curl -s -o /dev/null -w "%{http_code}" http://localhost:${APP_PORT}/ && echo "" && pm2 status cryptsk-gateway --no-color 2>&1 | tail -3`
  );
  
  if (stdout.includes('200')) {
    ok(`App is live at http://${PROD.host}:${APP_PORT}/`);
    return true;
  }
  fail(`App not responding: ${stdout.slice(0, 200)}`);
  return false;
}

async function checkStatus() {
  info('Checking production server status...\n');
  
  const { stdout } = await sshExec(
    `echo "=== PM2 Status ===" && pm2 status --no-color && echo "" && echo "=== App Response ===" && curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:${APP_PORT}/ && echo "" && echo "=== Memory ===" && free -h | head -2 && echo "" && echo "=== Disk ===" && df -h / | tail -1 && echo "" && echo "=== Git Log ===" && cd ${PROD_PROJECT_DIR} && git log --oneline -3`
  );
  
  console.log(stdout);
}

async function tailLogs() {
  info('Tailing PM2 logs (Ctrl+C to stop)...\n');
  
  const { stdout } = await sshExec(
    `pm2 logs cryptsk-gateway --lines 20 --nostream 2>&1`
  );
  console.log(stdout);
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  
  console.log(`\n${c.bold}${c.magenta}═══ Cryptsk CI/CD Deploy ═══${c.reset}\n`);
  
  if (args.includes('--status')) {
    await checkStatus();
    return;
  }
  
  if (args.includes('--logs')) {
    await tailLogs();
    return;
  }
  
  if (args.includes('--restart')) {
    await restartServer();
    await verifyDeploy();
    return;
  }
  
  // Full deploy flow
  const noPush = args.includes('--no-push');
  
  if (!noPush) {
    const pushOk = await gitCommitAndPush();
    if (!pushOk) { fail('Aborting: push failed'); process.exit(1); }
  }
  
  const pullOk = await gitPullOnServer();
  if (!pullOk) { fail('Aborting: pull failed'); process.exit(1); }
  
  const installOk = await installDeps();
  if (!installOk) { warn('Install had issues, continuing...'); }
  
  const buildOk = await buildOnServer();
  if (!buildOk) { fail('Aborting: build failed'); process.exit(1); }
  
  const restartOk = await restartServer();
  if (!restartOk) { fail('Aborting: restart failed'); process.exit(1); }
  
  const verifyOk = await verifyDeploy();
  
  console.log(`\n${c.bold}${verifyOk ? c.green : c.red}${verifyOk ? '🎉 Deploy complete!' : '⚠️ Deploy had issues'}${c.reset}\n`);
}

main().catch(err => {
  fail(`Deploy error: ${err.message}`);
  process.exit(1);
});
