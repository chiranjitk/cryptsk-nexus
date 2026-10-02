#!/usr/bin/env node
/**
 * Find the captive portal admin component by searching for tab names via SSH
 */
import { Client } from 'ssh2';
const STAYSUITE = { host: '103.244.7.218', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 };

function sshExec(conn, command, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const chunks = [], stderr = [];
    conn.exec(command, (e, stream) => {
      if (e) { reject(e); return; }
      stream.on('data', d => chunks.push(d));
      stream.stderr.on('data', d => stderr.push(d));
      stream.on('close', code => resolve({ stdout: Buffer.concat(chunks).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), code }));
    });
    setTimeout(() => reject(new Error('timeout')), timeout);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((r,j) => conn.on('ready', r).on('error', j).connect(STAYSUITE));
  console.log('✓ Connected to StaySuite\n');

  // Search for ALL tab names in one go — find the file that has them all
  const tabNames = ['Portal Instances', 'Walled Garden', 'Voucher Designer', 'Pool Mappings', 'Print Cards', 'Auth Methods', 'Portal Designer'];

  console.log('═══ Files containing ALL tab names ═══');
  let cmd = `grep -rl "Portal Instances" /opt/staysuite/src 2>/dev/null | grep -v node_modules | grep -v .next`;
  cmd += ` | xargs grep -l "Walled Garden" 2>/dev/null`;
  cmd += ` | xargs grep -l "Voucher Designer" 2>/dev/null`;
  cmd += ` | xargs grep -l "Pool Mappings" 2>/dev/null`;
  cmd += ` | xargs grep -l "Print Cards" 2>/dev/null`;
  const allTabs = await sshExec(conn, cmd);
  console.log(allTabs.stdout || '(no single file has all tabs — might be split across components)');

  // If not found, search individually
  console.log('\n═══ Individual tab searches ═══');
  for (const tab of tabNames) {
    const escaped = tab.replace(/'/g, "'\\''");
    const result = await sshExec(conn, `grep -rl "${escaped}" /opt/staysuite/src 2>/dev/null | grep -v node_modules | grep -v .next | head -5`);
    if (result.stdout.trim()) {
      console.log(`"${tab}" found in:`);
      console.log(result.stdout);
    }
  }

  // Search for the wifi management page that contains the captive portal tab
  console.log('═══ WiFi Management page (parent page) ═══');
  const wifiMgmt = await sshExec(conn, `find /opt/staysuite/src -name 'page.tsx' 2>/dev/null | xargs grep -l "WiFi Management\\|wifi.management\\|wifi-management" 2>/dev/null | head -5; echo "---"; find /opt/staysuite/src -name 'page.tsx' 2>/dev/null | xargs grep -l "captive" 2>/dev/null | head -10`);
  console.log(wifiMgmt.stdout);

  // List ALL page.tsx files to understand the route structure
  console.log('═══ ALL page.tsx routes ═══');
  const allRoutes = await sshExec(conn, `find /opt/staysuite/src/app -name 'page.tsx' 2>/dev/null | sort | head -50`);
  console.log(allRoutes.stdout);

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
