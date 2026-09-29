#!/usr/bin/env node
'use strict';
const { Client } = require('ssh2');
const PROD = { host: '103.244.7.221', port: 22222, username: 'root', password: 'CryptSK@123#$', readyTimeout: 15000 };
const cmd = process.argv[2] || 'echo hello';
const c = new Client();
c.on('ready', () => c.exec(cmd, (err, stream) => {
  if (err) { console.error(err); process.exit(1); }
  let out=''; stream.on('data', d => out+=d).on('stderr', d => out+=d).on('close', () => { console.log(out); c.end(); });
}));
c.on('error', e => { console.error(e.message); process.exit(1); });
c.connect(PROD);
