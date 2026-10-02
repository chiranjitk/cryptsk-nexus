import { Client } from 'ssh2';
import { readFileSync } from 'fs';
const conn = new Client();
await new Promise((r,j) => conn.on('ready', r).on('error', j).connect({ host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 }));
function exec(cmd, t=20000) {
  return new Promise((resolve, reject) => {
    const ch = [];
    conn.exec(cmd, (e, s) => { if (e) { reject(e); return; } s.on('data', d => ch.push(d)); s.stderr.on('data', d => ch.push(d)); s.on('close', () => resolve(Buffer.concat(ch).toString())); });
    setTimeout(() => reject(new Error('timeout')), t);
  });
}

// Upload the script
console.log('Uploading auto-commit-cron.sh...');
const content = readFileSync('/home/z/my-project/scripts/auto-commit-cron.sh');
const b64 = content.toString('base64');
await exec('echo -n "' + b64 + '" | base64 -d > /opt/ispplatform/scripts/auto-commit-cron.sh && chmod +x /opt/ispplatform/scripts/auto-commit-cron.sh && echo UPLOADED');
console.log('✓ Script uploaded');

// Set up git config
await exec('cd /opt/ispplatform && git config user.email "admin@cryptsk.com" && git config user.name "CRYPTSK Auto-Commit"');
console.log('✓ Git config set');

// Create log file
await exec('touch /var/log/auto-commit.log && chmod 644 /var/log/auto-commit.log');
console.log('✓ Log file created');

// Install crontab (every 5 minutes)
console.log('\nInstalling crontab...');
const existingCron = await exec('crontab -l 2>/dev/null || echo ""');
let newCron = existingCron.trim();
// Remove any existing auto-commit entry
newCron = newCron.split('\n').filter(l => !l.includes('auto-commit-cron')).join('\n');
// Add the new entry
newCron += '\n*/5 * * * * /opt/ispplatform/scripts/auto-commit-cron.sh >> /var/log/auto-commit.log 2>&1\n';
// Install
await exec('echo "' + newCron.replace(/"/g, '\\"').replace(/\n/g, '\\n') + '" | crontab -', 15000);

// Verify crontab
const verify = await exec('crontab -l 2>/dev/null | grep auto-commit');
console.log('Crontab:', verify.trim() || '✗ NOT INSTALLED');

// Run it once to test
console.log('\nRunning auto-commit once to test...');
const testRun = await exec('/opt/ispplatform/scripts/auto-commit-cron.sh 2>&1 | tail -5', 15000);
console.log(testRun.trim());

// Verify local git log
const log = await exec('cd /opt/ispplatform && git log --oneline -3', 10000);
console.log('\nGit log:', log.trim());

conn.end();
console.log('\n✅ Auto-commit cron installed — runs every 5 minutes');
