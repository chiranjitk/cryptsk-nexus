#!/usr/bin/env node
/**
 * Test SSH access to StaySuite (103.244.7.218)
 */
import { Client } from 'ssh2';

const STAYSUITE = {
  host: '103.244.7.218',
  port: 22222,
  username: 'root',
  password: 'CryptSK@123#$',
  readyTimeout: 15000,
};

function sshExec(conn, command, timeout = 15000) {
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
  console.log('Attempting SSH to StaySuite (103.244.7.218:22222)...');
  const conn = new Client();
  try {
    await new Promise((r,j) => conn.on('ready', r).on('error', j).connect(STAYSUITE));
    console.log('✓ Connected to StaySuite!\n');

    // Basic system info
    const info = await sshExec(conn, `hostname; echo "---"; uname -a; echo "---"; cat /etc/os-release | head -3; echo "---"; uptime`);
    console.log('=== System Info ===');
    console.log(info.stdout);

    // Check if it's the StaySuite platform
    const checkApp = await sshExec(conn, `ls /opt/ 2>/dev/null; echo "---PM2---"; pm2 list 2>&1 | head -15; echo "---FREEPADIUS---"; systemctl is-active freeradius 2>/dev/null || systemctl is-active radiusd 2>/dev/null || pgrep -x freeradius > /dev/null && echo "freradius RUNNING" || echo "freeradius NOT running"`);
    console.log('=== App/Services ===');
    console.log(checkApp.stdout);

    // Check FreeRADIUS config location
    const frConfig = await sshExec(conn, `ls /etc/freeradius/ 2>/dev/null | head -10; echo "---"; ls /etc/raddb/ 2>/dev/null | head -10; echo "---CLIENTS---"; grep -A 3 'secret' /etc/freeradius/clients.conf 2>/dev/null | head -10 || grep -A 3 'secret' /etc/raddb/clients.conf 2>/dev/null | head -10`);
    console.log('=== FreeRADIUS Config ===');
    console.log(frConfig.stdout);

    conn.end();
    console.log('\n✓ SSH access to StaySuite confirmed');
  } catch (err) {
    console.error(`✗ SSH failed: ${err.message}`);
    process.exit(1);
  }
}

main();
