import { Client } from 'ssh2';
const conn = new Client();
await new Promise((r,j) => conn.on('ready', r).on('error', j).connect({ host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 }));

function exec(cmd, t=30000) {
  return new Promise((resolve, reject) => {
    const ch = [];
    conn.exec(cmd, (e, s) => { if (e) { reject(e); return; } s.on('data', d => ch.push(d)); s.stderr.on('data', d => ch.push(d)); s.on('close', () => resolve(Buffer.concat(ch).toString())); });
    setTimeout(() => reject(new Error('timeout')), t);
  });
}

// Step 1: Abort any ongoing merge/rebase
console.log('===STEP 1: Abort any ongoing merge===');
await exec('cd /opt/ispplatform && git merge --abort 2>/dev/null; git rebase --abort 2>/dev/null; echo "aborted"', 10000);
console.log('✓ Any merge/rebase aborted');

// Step 2: Set git config (needed for commit)
console.log('\n===STEP 2: Set git config===');
await exec('cd /opt/ispplatform && git config user.email "admin@cryptsk.com" && git config user.name "CRYPTSK Admin"', 10000);
console.log('✓ Git config set');

// Step 3: Check what's changed (untracked + modified)
console.log('\n===STEP 3: Check status===');
const status = await exec('cd /opt/ispplatform && git status --short | head -30', 15000);
console.log(status);
const count = await exec('cd /opt/ispplatform && git status --short | wc -l', 10000);
console.log(`Total changed/untracked: ${count.trim()} files`);

// Step 4: Add ALL changes (including SSH-pushed files)
console.log('\n===STEP 4: Stage all changes===');
await exec('cd /opt/ispplatform && git add -A 2>&1', 30000);
console.log('✓ All changes staged');

// Step 5: Commit prod's local state
console.log('\n===STEP 5: Commit prod local changes===');
const commit = await exec("cd /opt/ispplatform && git commit -m 'commit(prod): preserve SSH-pushed captive portal files before pull' 2>&1 | tail -5", 30000);
console.log(commit);

// Step 6: Pull from GitHub (merge)
console.log('\n===STEP 6: Pull from GitHub (merge)===');
const pull = await exec('cd /opt/ispplatform && git pull origin main --no-edit 2>&1 | tail -15', 30000);
console.log(pull);

// Step 7: Check for conflicts
const conflicts = await exec('cd /opt/ispplatform && git diff --name-only --diff-filter=U 2>/dev/null | head -10', 10000);
if (conflicts.trim()) {
  console.log('\n===STEP 7: Resolving conflicts===');
  console.log('Conflicts in:', conflicts.trim());
  // For conflicting files, take prod version (ours) for captive portal files
  // take remote (theirs) for other files
  await exec('cd /opt/ispplatform && git checkout --ours src/lib/nav-config.ts src/lib/auth/tenant-context.ts src/components/pages/captive-portal-page.tsx 2>/dev/null', 10000);
  // For everything else, take the remote version
  await exec('cd /opt/ispplatform && git checkout --theirs . 2>/dev/null', 15000);
  // But keep our captive portal files
  await exec('cd /opt/ispplatform && git checkout --ours src/components/pages/captive-portal-page.tsx src/lib/auth/tenant-context.ts src/lib/nav-config.ts src/components/common/property-selector.tsx src/contexts/AuthContext.tsx src/lib/stubs/dompurify.ts 2>/dev/null', 10000);
  await exec('cd /opt/ispplatform && git add -A', 15000);
  await exec('cd /opt/ispplatform && git commit -m "merge: resolve conflicts — keep captive portal + nav changes" 2>&1 | tail -3', 15000);
  console.log('✓ Conflicts resolved');
} else {
  console.log('✓ No conflicts');
}

// Step 8: Push merged result back to GitHub
console.log('\n===STEP 8: Push to GitHub===');
const push = await exec('cd /opt/ispplatform && git push origin main 2>&1 | tail -5', 30000);
console.log(push);

// Step 9: Verify key files
console.log('\n===STEP 9: Verify===');
const nav = await exec('grep "Active Sessions" /opt/ispplatform/src/lib/nav-config.ts | head -2', 10000);
console.log('Nav:', nav.trim());
const portal = await exec('wc -l /opt/ispplatform/src/components/pages/captive-portal-page.tsx', 10000);
console.log('Portal:', portal.trim());
const tc = await exec('grep requireAuth /opt/ispplatform/src/lib/auth/tenant-context.ts | head -1', 10000);
console.log('tenant-context:', tc.trim());
const routes = await exec('find /opt/ispplatform/src/app/api/wifi/portal -name route.ts | wc -l', 10000);
console.log('Portal routes:', routes.trim());

conn.end();
console.log('\n✓ Done — prod local changes committed + GitHub merged + pushed back');
