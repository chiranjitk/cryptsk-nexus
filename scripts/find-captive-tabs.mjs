#!/usr/bin/env node
/**
 * Find the admin captive portal component by searching for the tab names
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
  console.log('✓ Connected\n');

  // Search for the tab names — these are unique strings that will find the component
  console.log('═══ Search for "Portal Instances" tab ═══');
  const search1 = await sshExec(conn, `grep -rl "Portal Instances\\|Portal Instances" /opt/staysuite/src 2>/dev/null | grep -v node_modules | grep -v .next | head -10`);
  console.log(search1.stdout);

  console.log('═══ Search for "Walled Garden" tab ═══');
  const search2 = await sshExec(conn, `grep -rl "Walled Garden\\|walled.garden\\|WalledGarden" /opt/staysuite/src 2>/dev/null | grep -v node_modules | grep -v .next | head -10`);
  console.log(search2.stdout);

  console.log('═══ Search for "Voucher Designer" tab ═══');
  const search3 = await sshExec(conn, `grep -rl "Voucher Designer\\|voucher.designer\\|VoucherDesigner" /opt/staysuite/src 2>/dev/null | grep -v node_modules | grep -v .next | head -10`);
  console.log(search3.stdout);

  console.log('═══ Search for "Print Cards" tab ═══');
  const search4 = await sshExec(conn, `grep -rl "Print Cards\\|print.cards\\|PrintCards" /opt/staysuite/src 2>/dev/null | grep -v node_modules | grep -v .next | head -10`);
  console.log(search4.stdout);

  console.log('═══ Search for "Pool Mappings" tab ═══');
  const search5 = await sshExec(conn, `grep -rl "Pool Mappings\\|pool.mappings\\|PoolMappings" /opt/staysuite/src 2>/dev/null | grep -v node_modules | grep -v .next | head -10`);
  console.log(search5.stdout);

  // Also search for ALL tab names in one file
  console.log('═══ Files containing MULTIPLE tab names ═══');
  const multiSearch = await sshExec(conn, `grep -rl "Portal Instances" /opt/staysuite/src 2>/dev/null | grep -v node_modules | grep -v .next | xargs grep -l "Walled Garden" 2>/dev/null | xargs grep -l "Voucher Designer" 2>/dev/null | xargs grep -l "Auth Methods" 2>/dev/null | head -5`);
  console.log(multiSearch.stdout);

  // Search in the wifi components directory specifically
  console.log('═══ WiFi components with captive/portal tabs ═══');
  const wifiSearch = await sshExec(conn, `grep -rl "Portal Instances\\|Walled Garden\\|Voucher Designer\\|Pool Mappings\\|Print Cards" /opt/staysuite/src/components 2>/dev/null | head -10; echo "---PAGES---"; grep -rl "Portal Instances\\|Walled Garden\\|Voucher Designer" /opt/staysuite/src/app 2>/dev/null | grep -v node_modules | grep -v .next | head -10`);
  console.log(wifiSearch.stdout);

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
