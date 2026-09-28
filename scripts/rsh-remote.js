#!/usr/bin/env node
/**
 * Persistent SSH/SFTP Remote Helper for Production Server
 * Single connection, multiple operations — feels like "mounted" access
 *
 * Usage:
 *   node scripts/rsh-remote.js cat /opt/cryptsk-nexus/package.json
 *   node scripts/rsh-remote.js ls /opt/cryptsk-nexus/src/ 2
 *   node scripts/rsh-remote.js write /opt/cryptsk-nexus/test.txt "hello world"
 *   node scripts/rsh-remote.js exec "pm2 status"
 *   node scripts/rsh-remote.js stat /opt/cryptsk-nexus/src/app
 *   node scripts/rsh-remote.js tree /opt/cryptsk-nexus/src/app 2
 *   node scripts/rsh-remote.js download /opt/cryptsk-nexus/src/app/page.tsx ./local-page.tsx
 *   node scripts/rsh-remote.js upload ./local-file.tsx /opt/cryptsk-nexus/src/app/new-file.tsx
 *   node scripts/rsh-remote.js batch '[
 *     {"cmd":"exec","args":["uptime"]},
 *     {"cmd":"cat","args":["/opt/cryptsk-nexus/package.json"]},
 *     {"cmd":"exec","args":["pm2 status --no-color"]}
 *   ]'
 *   node scripts/rsh-remote.js health
 *
 * NOTE: Host is 103.244.7.221 per CICD-GUIDE.md §2.3.
 *       The original script from user used 103.244.7.218 (possibly a different VM for
 *       the legacy "staysuite" project). Update PROD.host below or set PROD_HOST env var
 *       if you need to target a different host.
 *       Phase 1+ target: read all credentials from .env (see docs/CICD-GUIDE.md §10.2).
 */

const { Client } = require('ssh2');

const PROD = {
  host: process.env.PROD_HOST || '103.244.7.221',
  port: parseInt(process.env.PROD_SSH_PORT || '22222', 10),
  username: process.env.PROD_SSH_USER || 'root',
  password: process.env.PROD_SSH_PASS || 'CryptSK@123#$',
  readyTimeout: 15000,
  keepaliveInterval: 10000,
  keepaliveCountMax: 3
};

// ── Connection Pool (reuse single connection) ──
let _conn = null;
let _sftp = null;

function getConnection() {
  return new Promise((resolve, reject) => {
    if (_conn && !_conn._destroyed) {
      // Check if connection is still alive
      if (_sftp) return resolve({ conn: _conn, sftp: _sftp });
      // Re-get sftp
      _conn.sftp((err, sftp) => {
        if (err) { _conn = null; return getConnection(); }
        _sftp = sftp;
        resolve({ conn: _conn, sftp });
      });
      return;
    }

    const conn = new Client();
    conn.on('ready', () => {
      _conn = conn;
      conn.sftp((err, sftp) => {
        if (err) { reject(err); return; }
        _sftp = sftp;
        resolve({ conn, sftp });
      });
    });
    conn.on('error', reject);
    conn.connect(PROD);
  });
}

function disconnect() {
  if (_conn && !_conn._destroyed) _conn.end();
  _conn = null;
  _sftp = null;
}

// ── SFTP Operations ──

async function sftpReadFile(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.readFile(remotePath, (err, buf) => {
      if (err) return reject(err);
      resolve(buf.toString('utf-8'));
    });
  });
}

async function sftpWriteFile(sftp, remotePath, content) {
  return new Promise((resolve, reject) => {
    sftp.writeFile(remotePath, Buffer.from(content), (err) => {
      if (err) return reject(err);
      resolve('OK');
    });
  });
}

async function sftpReaddir(sftp, remotePath, depth = 0, maxDepth = 1, prefix = '') {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, async (err, list) => {
      if (err) return reject(err);

      if (depth >= maxDepth) {
        resolve(list.map(f => ({
          name: f.filename,
          type: f.attrs.isDirectory() ? 'dir' : 'file',
          size: f.attrs.size,
          mode: (f.attrs.mode & 0o777).toString(8),
          modified: new Date(f.attrs.mtime * 1000).toISOString().slice(0, 19).replace('T', ' ')
        })));
        return;
      }

      const results = [];
      for (const f of list) {
        if (f.filename === '.' || f.filename === '..') continue;
        const entry = {
          name: prefix + f.filename,
          type: f.attrs.isDirectory() ? 'dir' : 'file',
          size: f.attrs.size,
          mode: (f.attrs.mode & 0o777).toString(8),
          modified: new Date(f.attrs.mtime * 1000).toISOString().slice(0, 19).replace('T', ' ')
        };
        results.push(entry);
        if (f.attrs.isDirectory() && depth < maxDepth) {
          try {
            const sub = await sftpReaddir(sftp, remotePath + '/' + f.filename, depth + 1, maxDepth, prefix + f.filename + '/');
            results.push(...sub);
          } catch (_) {}
        }
      }
      resolve(results);
    });
  });
}

async function sftpStat(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err, attrs) => {
      if (err) return reject(err);
      resolve({
        type: attrs.isDirectory() ? 'directory' : attrs.isFile() ? 'file' : 'other',
        size: attrs.size,
        mode: (attrs.mode & 0o777).toString(8),
        uid: attrs.uid,
        gid: attrs.gid,
        access: new Date(attrs.atime * 1000).toISOString().slice(0, 19).replace('T', ' '),
        modify: new Date(attrs.mtime * 1000).toISOString().slice(0, 19).replace('T', ' ')
      });
    });
  });
}

async function sftpExists(sftp, remotePath) {
  return new Promise((resolve) => {
    sftp.stat(remotePath, (err) => {
      resolve(!err);
    });
  });
}

// ── Exec ──

function sshExec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = '', errOut = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => errOut += d);
      stream.on('close', (code) => {
        resolve({ stdout: out, stderr: errOut, code });
      });
    });
  });
}

// ── File Transfer ──

async function downloadFile(sftp, remotePath, localPath) {
  const fs = require('fs');
  return new Promise((resolve, reject) => {
    sftp.readFile(remotePath, (err, buf) => {
      if (err) return reject(err);
      fs.writeFileSync(localPath, buf);
      resolve(`Downloaded: ${remotePath} → ${localPath} (${buf.length} bytes)`);
    });
  });
}

async function uploadFile(sftp, localPath, remotePath) {
  const fs = require('fs');
  const content = fs.readFileSync(localPath);
  return new Promise((resolve, reject) => {
    sftp.writeFile(remotePath, content, (err) => {
      if (err) return reject(err);
      resolve(`Uploaded: ${localPath} → ${remotePath} (${content.length} bytes)`);
    });
  });
}

// ── Batch ──

async function runBatch(conn, sftp, operations) {
  const results = [];
  for (const op of operations) {
    try {
      let result;
      switch (op.cmd) {
        case 'exec': result = await sshExec(conn, op.args[0]); break;
        case 'cat': result = await sftpReadFile(sftp, op.args[0]); break;
        case 'write': result = await sftpWriteFile(sftp, op.args[0], op.args[1]); break;
        case 'ls': result = await sftpReaddir(sftp, op.args[0], 0, op.args[1] || 1); break;
        case 'stat': result = await sftpStat(sftp, op.args[0]); break;
        default: result = `Unknown cmd: ${op.cmd}`;
      }
      results.push({ ok: true, data: result });
    } catch (e) {
      results.push({ ok: false, error: e.message });
    }
  }
  return results;
}

// ── CLI ──

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`Persistent SSH/SFTP Helper — Single Connection, Multiple Ops
  Target: ${PROD.host}:${PROD.port} (user: ${PROD.username})

Usage:
  node scripts/rsh-remote.js <command> [args...]

Commands:
  cat <remote-path>              Read remote file
  write <remote-path> <content>  Write to remote file
  ls <remote-path> [depth]       List remote directory (depth=1 default, 0=flat)
  tree <remote-path> [depth]     Tree view of remote directory
  stat <remote-path>             File/directory stats
  exec <shell-command>           Execute shell command on remote
  exists <remote-path>           Check if path exists (true/false)
  download <remote> <local>      Download file to local
  upload <local> <remote>        Upload file to remote
  batch <json-array>             Run multiple ops on same connection
  health                         Quick health check (uptime + pm2 + disk + mem)
`);
    process.exit(0);
  }

  const cmd = args[0];
  const { conn, sftp } = await getConnection();

  try {
    switch (cmd) {
      case 'cat': {
        const content = await sftpReadFile(sftp, args[1]);
        console.log(content);
        break;
      }
      case 'write': {
        const content = args.length > 2 ? args[2] : process.stdin.read();
        if (!content) { console.error('Error: no content provided'); process.exit(1); }
        await sftpWriteFile(sftp, args[1], content);
        console.log(`Written to ${args[1]} (${Buffer.byteLength(content)} bytes)`);
        break;
      }
      case 'ls': {
        const depth = parseInt(args[2] || '1');
        const items = await sftpReaddir(sftp, args[1], 0, depth);
        console.table(items);
        console.log(`\nTotal: ${items.length} items`);
        break;
      }
      case 'tree': {
        const depth = parseInt(args[2] || '2');
        const items = await sftpReaddir(sftp, args[1], 0, depth);
        items.forEach(i => {
          const icon = i.type === 'dir' ? '📁' : '📄';
          const indent = '  '.repeat(i.name.split('/').length - 1);
          console.log(`${indent}${icon} ${i.name.split('/').pop()}${i.type === 'file' ? ` (${i.size}B)` : ''}`);
        });
        console.log(`\nTotal: ${items.length} items`);
        break;
      }
      case 'stat': {
        const stats = await sftpStat(sftp, args[1]);
        console.table(stats);
        break;
      }
      case 'exists': {
        const exists = await sftpExists(sftp, args[1]);
        console.log(exists ? 'true' : 'false');
        break;
      }
      case 'exec': {
        const shellCmd = args.slice(1).join(' ');
        const result = await sshExec(conn, shellCmd);
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        if (result.code !== 0) process.exit(result.code);
        break;
      }
      case 'download': {
        const msg = await downloadFile(sftp, args[1], args[2]);
        console.log(msg);
        break;
      }
      case 'upload': {
        const msg = await uploadFile(sftp, args[1], args[2]);
        console.log(msg);
        break;
      }
      case 'batch': {
        const ops = JSON.parse(args[1]);
        const results = await runBatch(conn, sftp, ops);
        results.forEach((r, i) => {
          console.log(`\n--- Op ${i + 1} ---`);
          console.log(r.ok ? JSON.stringify(r.data, null, 2) : `ERROR: ${r.error}`);
        });
        break;
      }
      case 'health': {
        const r1 = await sshExec(conn, 'uptime');
        console.log('uptime:', r1.stdout.trim());
        const r2 = await sshExec(conn, 'pm2 status --no-color 2>/dev/null | head -20 || systemctl is-active radiusd 2>/dev/null || echo "no pm2/radiusd"');
        console.log('pm2/radiusd:\n', r2.stdout.trim());
        const r3 = await sshExec(conn, 'df -h / | tail -1');
        console.log('disk:', r3.stdout.trim());
        const r4 = await sshExec(conn, 'free -h | head -2');
        console.log('memory:', r4.stdout.trim());
        const r5 = await sshExec(conn, 'cd /opt/cryptsk-nexus 2>/dev/null && git log --oneline -3 2>/dev/null || echo "no repo at /opt/cryptsk-nexus"');
        console.log('repo:', r5.stdout.trim());
        const r6 = await sshExec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "no-app"');
        console.log('app http:', r6.stdout.trim());
        break;
      }
      default:
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
