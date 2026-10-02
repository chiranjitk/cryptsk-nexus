import { Client } from 'ssh2';
const conn = new Client();
await new Promise((r,j) => conn.on('ready', r).on('error', j).connect({ host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 }));

function exec(cmd, t=15000) {
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

// Kill current build
await exec('pkill -KILL -f "next build" 2>/dev/null', 10000);
console.log('Killed old build');

// Start dompurify install + build in background (chained)
console.log('Starting install+build in background...');
await exec(
  'cd /opt/ispplatform && setsid bash -c "npm install dompurify --save 2>/dev/null; echo INSTALL_DONE > /tmp/install.status; rm -rf .next; bun run build > /tmp/build.log 2>&1; echo BUILD_DONE >> /tmp/install.status" &',
  10000
);
console.log('✓ Background install+build started (check /tmp/install.status)');

conn.end();
