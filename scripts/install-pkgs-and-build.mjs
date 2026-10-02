import { Client } from 'ssh2';
const conn = new Client();
await new Promise((r,j) => conn.on('ready', r).on('error', j).connect({ host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 }));

function exec(cmd, t=120000) {
  return new Promise((resolve, reject) => {
    const ch = [];
    conn.exec(cmd, (e, s) => {
      if (e) { reject(e); return; }
      s.on('data', d => ch.push(d));
      s.stderr.on('data', d => ch.push(d));
      s.on('close', () => resolve(Buffer.concat(ch).toString()));
    });
    setTimeout(() => reject(new Error('timeout')), t);
  });
}

// Install packages
console.log('Installing qrcode + sanitize-html (may take 2 min)...');
try {
  const install = await exec('cd /opt/ispplatform && bun add qrcode sanitize-html 2>&1 | tail -5', 120000);
  console.log(install.trim());
} catch (e) {
  console.log('Install timeout/error:', e.message);
  // Check if already installed
  const check = await exec('ls /opt/ispplatform/node_modules/qrcode 2>/dev/null && echo QR_OK; ls /opt/ispplatform/node_modules/sanitize-html 2>/dev/null && echo SH_OK', 10000);
  console.log('Package check:', check.trim());
}

// Kill old build + start new
console.log('\nKilling old build + starting fresh...');
await exec('pkill -KILL -f "next build" 2>/dev/null; rm -rf /opt/ispplatform/.next; echo cleaned', 15000);
const start = await exec('cd /opt/ispplatform && (nohup bun run build </dev/null >/tmp/build.log 2>&1 & disown) && sleep 1 && echo BUILD_LAUNCHED', 20000);
console.log(start.trim());

conn.end();
console.log('✓ Build started — check in 5 min');
