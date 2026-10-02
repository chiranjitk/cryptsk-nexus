#!/usr/bin/env node
/**
 * Fast push via SFTP + build
 */
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const PROD = { host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 };
const PROD_DIR = '/opt/ispplatform';

function sshExec(conn, command, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    conn.exec(command, (e, stream) => {
      if (e) { reject(e); return; }
      stream.on('data', d => chunks.push(d));
      stream.stderr.on('data', d => chunks.push(d));
      stream.on('close', code => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    setTimeout(() => reject(new Error('timeout')), timeout);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((r,j) => conn.on('ready', r).on('error', j).connect(PROD));
  console.log('✓ Connected');

  // Upload via SFTP (binary safe, no shell escaping issues)
  console.log('Uploading bundle via SFTP...');
  const bundlePath = '/tmp/captive-full-bundle.tar.gz';
  const bundle = readFileSync(bundlePath);
  console.log(`Bundle size: ${bundle.length} bytes`);

  await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      const writeStream = sftp.createWriteStream('/tmp/captive-full-bundle.tar.gz');
      writeStream.on('close', () => { console.log('✓ SFTP upload complete'); resolve(); });
      writeStream.on('error', reject);
      // Stream the file
      const { Readable } = require('stream');
      const readable = new Readable();
      readable.push(bundle);
      readable.push(null);
      readable.pipe(writeStream);
    });
  });

  // Extract
  console.log('Extracting...');
  const extract = await sshExec(conn, `cd ${PROD_DIR} && tar xzf /tmp/captive-full-bundle.tar.gz 2>&1 | tail -3`);
  console.log(extract);

  // Kill old build + clean
  await sshExec(conn, `pkill -KILL -f 'next build' 2>/dev/null; rm -rf ${PROD_DIR}/.next; echo cleaned`);
  console.log('✓ Cleaned .next');

  // Start build detached
  const start = await sshExec(conn, `cd ${PROD_DIR} && (nohup bun run build </dev/null >/tmp/build.log 2>&1 & disown) && sleep 1 && echo BUILD_LAUNCHED`);
  console.log(start.trim());

  conn.end();
  console.log('✓ Build running in background — check /tmp/build.log');
}

main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
