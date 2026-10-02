#!/usr/bin/env node
/**
 * Find the StaySuite ADMIN captive config page (with 7-8 tabs)
 * Also check sidebar config + read the captive-redirect service
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

  // 1. Find admin captive config page — search for CaptivePortal model usage
  console.log('═══ Files using CaptivePortal model ═══');
  const captiveModel = await sshExec(conn, `grep -rl 'CaptivePortal\\|captive_portal\\|captivePortal' /opt/staysuite/src 2>/dev/null | grep -v node_modules | grep -v .next | head -20`);
  console.log(captiveModel.stdout);

  // 2. Find all admin/dashboard pages
  console.log('\n═══ Admin/Dashboard pages ═══');
  const adminPages = await sshExec(conn, `find /opt/staysuite/src/app -name 'page.tsx' 2>/dev/null | xargs grep -l 'CaptivePortal\\|PortalTemplate\\|PortalAuthentication\\|PortalAdCampaign\\|PortalWhitelist\\|PortalABTest' 2>/dev/null | head -10`);
  console.log(adminPages.stdout);

  // 3. Sidebar config — find the captive menu item
  console.log('\n═══ Sidebar nav config ═══');
  const sidebar = await sshExec(conn, `grep -n -i 'captive\\|portal' /opt/staysuite/src/components/layout/sidebar.tsx 2>/dev/null | head -20; echo "---NAV-CONFIG---"; find /opt/staysuite/src -name 'nav*' -o -name 'menu*' -o -name 'sidebar*' 2>/dev/null | grep -v node_modules | grep -v .next | head -10`);
  console.log(sidebar.stdout);

  // 4. Read the captive-redirect service (full — count lines + key sections)
  console.log('\n═══ captive-redirect service overview ═══');
  const crOverview = await sshExec(conn, `wc -l /opt/staysuite/mini-services/captive-redirect/index.ts; echo "---KEY FUNCTIONS---"; grep -n 'function\\|const.*=.*async\\|app.get\\|app.post\\|server.listen\\|router' /opt/staysuite/mini-services/captive-redirect/index.ts | head -30; echo "---ENDPOINTS---"; grep -n "path.*===\\|url.*===\\|req.url" /opt/staysuite/mini-services/captive-redirect/index.ts | head -20`);
  console.log(crOverview.stdout);

  // 5. List all Portal* + Captive* API routes
  console.log('\n═══ Portal/Captive API routes ═══');
  const portalApi = await sshExec(conn, `find /opt/staysuite/src/app/api -name 'route.ts' 2>/dev/null | xargs grep -l 'CaptivePortal\\|PortalTemplate\\|PortalAuthentication\\|PortalAdCampaign\\|PortalWhitelist\\|PortalABTest\\|PortalMapping\\|PortalPage\\|PortalDesignHistory' 2>/dev/null | sort`);
  console.log(portalApi.stdout);

  // 6. List all WiFi component files (the admin config components)
  console.log('\n═══ WiFi admin components ═══');
  const wifiComponents = await sshExec(conn, `ls -la /opt/staysuite/src/components/wifi/ 2>/dev/null | head -30`);
  console.log(wifiComponents.stdout);

  conn.end();
}
main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
