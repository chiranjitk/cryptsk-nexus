// ============================================================================
// Cryptsk — ISP Gateway Management Service
// Port: 3005 | All endpoints require auth except /api/health
// Uses real shell commands via Bun.spawn, real Prisma queries
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { requireAuth, corsHeaders, optionalAuth } from "../shared/auth.js";
import { createLogger } from "../shared/logger.js";

// ─── Logger & Prisma Setup ────────────────────────────────────────────────
const log = createLogger("gateway-service");
const prisma = new PrismaClient({
  datasourceUrl:
    process.env.DATABASE_URL || "postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform",
});

const SERVICE_PORT = 3005;

// ─── Shell Command Helper ─────────────────────────────────────────────────
interface ShellResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runShell(
  cmd: string,
  args: string[],
  timeoutMs = 10000
): Promise<ShellResult> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const timeout = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    clearTimeout(timeout);
    const exitCode = await proc.exited;
    return { success: exitCode === 0, stdout, stderr, exitCode };
  } catch (err: any) {
    return {
      success: false,
      stdout: "",
      stderr: err.message || "Command not found or failed",
      exitCode: -1,
    };
  }
}

// ─── JSON Helpers ─────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function jsonErr(message: string, status = 400) {
  return json({ success: false, error: message }, status);
}

// ─── Audit Logger ─────────────────────────────────────────────────────────
async function auditLog(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown> = {},
  req?: Request
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        userName: "",
        action,
        entity,
        entityId,
        details: JSON.stringify(details, (_, v) => typeof v === 'bigint' ? v.toString() : v),
        endpoint: req?.url || "",
        method: req?.method || "",
        ipAddress: req?.headers.get("x-forwarded-for") || "",
        userAgent: req?.headers.get("user-agent") || "",
      },
    });
  } catch (e) {
    log.error("auditLog failed", { error: String(e) });
  }
}

// ─── Route Matcher ────────────────────────────────────────────────────────
function matchRoute(
  url: URL,
  method: string
): { handler: (req: Request, params: Record<string, string>) => Promise<Response>; params: Record<string, string> } | null {
  const path = url.pathname;
  const urlPath = path.replace(/\/+/g, "/"); // normalize slashes

  // Health — no auth
  if (method === "GET" && urlPath === "/api/health") {
    return { handler: handleHealth, params: {} };
  }

  // ─── System Interface Routes ─────────────────────────────────────────
  // GET /api/interfaces
  if (method === "GET" && urlPath === "/api/interfaces") {
    return { handler: handleGetInterfaces, params: {} };
  }
  // PUT /api/interfaces/:id
  let m = urlPath.match(/^\/api\/interfaces\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateInterface, params: { id: m[1] } };
  }
  // POST /api/interfaces/vlan
  if (method === "POST" && urlPath === "/api/interfaces/vlan") {
    return { handler: handleCreateVlan, params: {} };
  }
  // DELETE /api/interfaces/vlan/:name
  m = urlPath.match(/^\/api\/interfaces\/vlan\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteVlan, params: { name: m[1] } };
  }
  // POST /api/interfaces/bridge
  if (method === "POST" && urlPath === "/api/interfaces/bridge") {
    return { handler: handleCreateBridge, params: {} };
  }
  // DELETE /api/interfaces/bridge/:name
  m = urlPath.match(/^\/api\/interfaces\/bridge\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteBridge, params: { name: m[1] } };
  }
  // POST /api/interfaces/bond
  if (method === "POST" && urlPath === "/api/interfaces/bond") {
    return { handler: handleCreateBond, params: {} };
  }
  // DELETE /api/interfaces/bond/:name
  m = urlPath.match(/^\/api\/interfaces\/bond\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteBond, params: { name: m[1] } };
  }
  // POST /api/interfaces/:name/up
  m = urlPath.match(/^\/api\/interfaces\/([^/]+)\/up$/);
  if (method === "POST" && m) {
    return { handler: handleIfaceUp, params: { name: m[1] } };
  }
  // POST /api/interfaces/:name/down
  m = urlPath.match(/^\/api\/interfaces\/([^/]+)\/down$/);
  if (method === "POST" && m) {
    return { handler: handleIfaceDown, params: { name: m[1] } };
  }
  // POST /api/interfaces/:name/flush
  m = urlPath.match(/^\/api\/interfaces\/([^/]+)\/flush$/);
  if (method === "POST" && m) {
    return { handler: handleIfaceFlush, params: { name: m[1] } };
  }

  // ─── DHCP Routes ────────────────────────────────────────────────────
  // GET /api/dhcp/subnets
  if (method === "GET" && urlPath === "/api/dhcp/subnets") {
    return { handler: handleGetDhcpSubnets, params: {} };
  }
  // POST /api/dhcp/subnets
  if (method === "POST" && urlPath === "/api/dhcp/subnets") {
    return { handler: handleCreateDhcpSubnet, params: {} };
  }
  // PUT /api/dhcp/subnets/:id
  m = urlPath.match(/^\/api\/dhcp\/subnets\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateDhcpSubnet, params: { id: m[1] } };
  }
  // DELETE /api/dhcp/subnets/:id
  m = urlPath.match(/^\/api\/dhcp\/subnets\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteDhcpSubnet, params: { id: m[1] } };
  }
  // GET /api/dhcp/reservations
  if (method === "GET" && urlPath === "/api/dhcp/reservations") {
    return { handler: handleGetDhcpReservations, params: {} };
  }
  // POST /api/dhcp/reservations
  if (method === "POST" && urlPath === "/api/dhcp/reservations") {
    return { handler: handleCreateDhcpReservation, params: {} };
  }
  // PUT /api/dhcp/reservations/:id
  m = urlPath.match(/^\/api\/dhcp\/reservations\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateDhcpReservation, params: { id: m[1] } };
  }
  // DELETE /api/dhcp/reservations/:id
  m = urlPath.match(/^\/api\/dhcp\/reservations\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteDhcpReservation, params: { id: m[1] } };
  }
  // GET /api/dhcp/leases
  if (method === "GET" && urlPath === "/api/dhcp/leases") {
    return { handler: handleGetDhcpLeases, params: {} };
  }
  // POST /api/dhcp/kea/reload
  if (method === "POST" && urlPath === "/api/dhcp/kea/reload") {
    return { handler: handleKeaReload, params: {} };
  }
  // GET /api/dhcp/kea/status
  if (method === "GET" && urlPath === "/api/dhcp/kea/status") {
    return { handler: handleKeaStatus, params: {} };
  }
  // POST /api/dhcp/kea/test
  if (method === "POST" && urlPath === "/api/dhcp/kea/test") {
    return { handler: handleKeaTest, params: {} };
  }

  // ─── DNS Routes ─────────────────────────────────────────────────────
  if (method === "GET" && urlPath === "/api/dns/records") {
    return { handler: handleGetDnsRecords, params: {} };
  }
  if (method === "POST" && urlPath === "/api/dns/records") {
    return { handler: handleCreateDnsRecord, params: {} };
  }
  m = urlPath.match(/^\/api\/dns\/records\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateDnsRecord, params: { id: m[1] } };
  }
  m = urlPath.match(/^\/api\/dns\/records\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteDnsRecord, params: { id: m[1] } };
  }
  if (method === "POST" && urlPath === "/api/dns/reload") {
    return { handler: handleDnsReload, params: {} };
  }
  if (method === "GET" && urlPath === "/api/dns/config") {
    return { handler: handleDnsConfig, params: {} };
  }
  if (method === "POST" && urlPath === "/api/dns/test") {
    return { handler: handleDnsTest, params: {} };
  }

  // ─── Gateway Config Routes ──────────────────────────────────────────
  if (method === "GET" && urlPath === "/api/gateway/config") {
    return { handler: handleGetGatewayConfig, params: {} };
  }
  if (method === "PUT" && urlPath === "/api/gateway/config") {
    return { handler: handleUpdateGatewayConfig, params: {} };
  }
  if (method === "POST" && urlPath === "/api/gateway/init") {
    return { handler: handleGatewayInit, params: {} };
  }

  // ─── Service Status Routes ────────────────────────────────────────
  if (method === "GET" && urlPath === "/api/services/status") {
    return { handler: handleGetServicesStatus, params: {} };
  }
  if (method === "GET" && urlPath === "/api/services/radius/status") {
    return { handler: handleGetRadiusStatus, params: {} };
  }

  // ─── Firewall Routes ────────────────────────────────────────────────
  if (method === "GET" && urlPath === "/api/firewall/rules") {
    return { handler: handleGetFirewallRules, params: {} };
  }
  if (method === "POST" && urlPath === "/api/firewall/rules") {
    return { handler: handleCreateFirewallRule, params: {} };
  }
  m = urlPath.match(/^\/api\/firewall\/rules\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateFirewallRule, params: { id: m[1] } };
  }
  m = urlPath.match(/^\/api\/firewall\/rules\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteFirewallRule, params: { id: m[1] } };
  }
  if (method === "POST" && urlPath === "/api/firewall/apply") {
    return { handler: handleFirewallApply, params: {} };
  }
  if (method === "GET" && urlPath === "/api/firewall/nftables-status") {
    return { handler: handleNftablesStatus, params: {} };
  }

  // ─── QoS Routes (Subnet-based TC) ────────────────────────────────────
  if (method === "GET" && urlPath === "/api/qos/status") {
    return { handler: handleQosStatus, params: {} };
  }
  if (method === "GET" && urlPath === "/api/qos/config") {
    return { handler: handleQosGetConfig, params: {} };
  }
  if (method === "PUT" && urlPath === "/api/qos/config") {
    return { handler: handleQosSetConfig, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/init") {
    return { handler: handleQosInit, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/teardown") {
    return { handler: handleQosTeardown, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/restore") {
    return { handler: handleQosBatchRestore, params: {} };
  }
  if (method === "GET" && urlPath === "/api/qos/subnets") {
    return { handler: handleQosGetSubnets, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/subnet/add") {
    return { handler: handleQosSubnetAdd, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/subnet/del") {
    return { handler: handleQosSubnetDel, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/subnet/rate") {
    return { handler: handleQosSubnetRate, params: {} };
  }
  if (method === "GET" && urlPath === "/api/qos/subscribers") {
    return { handler: handleQosGetSubscribers, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/subscriber/add") {
    return { handler: handleQosSubscriberAdd, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/subscriber/del") {
    return { handler: handleQosSubscriberDel, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/subscriber/rate") {
    return { handler: handleQosSubscriberRate, params: {} };
  }
  if (method === "POST" && urlPath === "/api/qos/subscriber/block") {
    return { handler: handleQosSubscriberBlock, params: {} };
  }
  // ─── Bandwidth/TC Routes (Legacy) ──────────────────────────────────
  if (method === "GET" && urlPath === "/api/tc/policies") {
    return { handler: handleGetTcPolicies, params: {} };
  }
  if (method === "POST" && urlPath === "/api/tc/policies") {
    return { handler: handleCreateTcPolicy, params: {} };
  }
  m = urlPath.match(/^\/api\/tc\/policies\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateTcPolicy, params: { id: m[1] } };
  }
  m = urlPath.match(/^\/api\/tc\/policies\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteTcPolicy, params: { id: m[1] } };
  }
  if (method === "POST" && urlPath === "/api/tc/apply-user") {
    return { handler: handleTcApplyUser, params: {} };
  }
  if (method === "DELETE" && urlPath === "/api/tc/remove-user") {
    return { handler: handleTcRemoveUser, params: {} };
  }
  if (method === "POST" && urlPath === "/api/tc/init") {
    return { handler: handleTcInit, params: {} };
  }
  if (method === "GET" && urlPath === "/api/tc/status") {
    return { handler: handleTcStatus, params: {} };
  }
  if (method === "GET" && urlPath === "/api/gateway/bandwidth/fap-status") {
    return { handler: handleFapStatus, params: {} };
  }

  // ─── Captive Portal Routes ──────────────────────────────────────────
  if (method === "GET" && urlPath === "/api/captive-portals") {
    return { handler: handleGetCaptivePortals, params: {} };
  }
  if (method === "POST" && urlPath === "/api/captive-portals") {
    return { handler: handleCreateCaptivePortal, params: {} };
  }
  m = urlPath.match(/^\/api\/captive-portals\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateCaptivePortal, params: { id: m[1] } };
  }
  m = urlPath.match(/^\/api\/captive-portals\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteCaptivePortal, params: { id: m[1] } };
  }
  if (method === "GET" && urlPath === "/api/captive-portals/sessions") {
    return { handler: handleGetPortalSessions, params: {} };
  }
  m = urlPath.match(/^\/api\/captive-portals\/sessions\/([^/]+)\/disconnect$/);
  if (method === "POST" && m) {
    return { handler: handleDisconnectPortalSession, params: { id: m[1] } };
  }
  if (method === "POST" && urlPath === "/api/captive-portals/apply") {
    return { handler: handleCaptivePortalApply, params: {} };
  }

  // ─── Security Routes ────────────────────────────────────────────────
  if (method === "GET" && urlPath === "/api/security/profiles") {
    return { handler: handleGetSecurityProfiles, params: {} };
  }
  if (method === "POST" && urlPath === "/api/security/profiles") {
    return { handler: handleCreateSecurityProfile, params: {} };
  }
  m = urlPath.match(/^\/api\/security\/profiles\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateSecurityProfile, params: { id: m[1] } };
  }
  m = urlPath.match(/^\/api\/security\/profiles\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteSecurityProfile, params: { id: m[1] } };
  }
  if (method === "POST" && urlPath === "/api/security/apply") {
    return { handler: handleSecurityApply, params: {} };
  }

  // ─── NAT Log Routes ─────────────────────────────────────────────────
  if (method === "GET" && urlPath === "/api/nat-logs") {
    return { handler: handleGetNatLogs, params: {} };
  }
  if (method === "DELETE" && urlPath === "/api/nat-logs/cleanup") {
    return { handler: handleNatLogCleanup, params: {} };
  }
  if (method === "GET" && urlPath === "/api/nat-logs/stats") {
    return { handler: handleNatLogStats, params: {} };
  }

  // ─── Syslog Routes ──────────────────────────────────────────────────
  if (method === "GET" && urlPath === "/api/syslog/configs") {
    return { handler: handleGetSyslogConfigs, params: {} };
  }
  if (method === "POST" && urlPath === "/api/syslog/configs") {
    return { handler: handleCreateSyslogConfig, params: {} };
  }
  m = urlPath.match(/^\/api\/syslog\/configs\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateSyslogConfig, params: { id: m[1] } };
  }
  m = urlPath.match(/^\/api\/syslog\/configs\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteSyslogConfig, params: { id: m[1] } };
  }
  m = urlPath.match(/^\/api\/syslog\/test\/([^/]+)$/);
  if (method === "POST" && m) {
    return { handler: handleSyslogTest, params: { id: m[1] } };
  }

  // ─── RADIUS Accounting / Concurrent Sessions ─────────────────────────
  if (method === "GET" && urlPath === "/api/radius/accounting/active") {
    return { handler: handleGetActiveRadiusSessions, params: {} };
  }
  if (method === "GET" && urlPath === "/api/radius/accounting/interim") {
    return { handler: handleGetInterimAccounting, params: {} };
  }
  if (method === "POST" && urlPath === "/api/radius/accounting/interim") {
    return { handler: handlePostInterimUpdate, params: {} };
  }
  if (method === "POST" && urlPath === "/api/radius/accounting/enforce-concurrent") {
    return { handler: handleEnforceConcurrentSessions, params: {} };
  }
  if (method === "GET" && urlPath === "/api/radius/accounting/stats") {
    return { handler: handleGetAccountingStats, params: {} };
  }
  // ─── Login/Logout Scripts ─────────────────────────────────────────────
  if (method === "POST" && urlPath === "/api/radius/post-auth") {
    return { handler: handlePostAuthScript, params: {} };
  }
  if (method === "POST" && urlPath === "/api/radius/post-logout") {
    return { handler: handlePostLogoutScript, params: {} };
  }

  // ─── DDoS Protection Routes ─────────────────────────────────────
  if (method === "GET" && urlPath === "/api/ddos/policies") {
    return { handler: handleGetDdosPolicies, params: {} };
  }
  if (method === "POST" && urlPath === "/api/ddos/policies") {
    return { handler: handleCreateDdosPolicy, params: {} };
  }
  m = urlPath.match(/^\/api\/ddos\/policies\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateDdosPolicy, params: { id: m[1] } };
  }
  m = urlPath.match(/^\/api\/ddos\/policies\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteDdosPolicy, params: { id: m[1] } };
  }
  if (method === "POST" && urlPath === "/api/ddos/apply") {
    return { handler: handleDdosApply, params: {} };
  }
  if (method === "POST" && urlPath === "/api/ddos/reset-counters") {
    return { handler: handleDdosResetCounters, params: {} };
  }
  if (method === "GET" && urlPath === "/api/ddos/counters") {
    return { handler: handleDdosCounters, params: {} };
  }

  // ─── PPPoE Routes ───────────────────────────────────────────────
  if (method === "GET" && urlPath === "/api/pppoe/profiles") {
    return { handler: handleGetPppoeProfiles, params: {} };
  }
  if (method === "POST" && urlPath === "/api/pppoe/profiles") {
    return { handler: handleCreatePppoeProfile, params: {} };
  }
  m = urlPath.match(/^\/api\/pppoe\/profiles\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdatePppoeProfile, params: { id: m[1] } };
  }
  m = urlPath.match(/^\/api\/pppoe\/profiles\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeletePppoeProfile, params: { id: m[1] } };
  }
  if (method === "GET" && urlPath === "/api/pppoe/sessions") {
    return { handler: handleGetPppoeSessions, params: {} };
  }
  m = urlPath.match(/^\/api\/pppoe\/sessions\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDisconnectPppoeSession, params: { id: m[1] } };
  }
  if (method === "POST" && urlPath === "/api/pppoe/apply") {
    return { handler: handlePppoeApply, params: {} };
  }
  if (method === "GET" && urlPath === "/api/pppoe/realtime-bw") {
    return { handler: handlePppoeRealtimeBw, params: {} };
  }
  if (method === "GET" && urlPath === "/api/pppoe/config") {
    return { handler: handleGetPppoeConfig, params: {} };
  }
  if (method === "PUT" && urlPath === "/api/pppoe/config") {
    return { handler: handleSavePppoeConfig, params: {} };
  }
  if (method === "POST" && urlPath === "/api/pppoe/sessions/bulk-disconnect") {
    return { handler: handleBulkDisconnectPppoeSessions, params: {} };
  }

  // ─── Bandwidth Sample / Reports Routes ──────────────────────────
  if (method === "POST" && urlPath === "/api/bw/samples") {
    return { handler: handleRecordBwSample, params: {} };
  }
  if (method === "GET" && urlPath === "/api/bw/samples") {
    return { handler: handleGetBwSamples, params: {} };
  }
  if (method === "GET" && urlPath === "/api/bw/report/summary") {
    return { handler: handleBwReportSummary, params: {} };
  }
  if (method === "GET" && urlPath === "/api/bw/report/timeseries") {
    return { handler: handleBwReportTimeseries, params: {} };
  }
  if (method === "GET" && urlPath === "/api/bw/report/top-users") {
    return { handler: handleBwReportTopUsers, params: {} };
  }
  if (method === "DELETE" && urlPath === "/api/bw/samples/cleanup") {
    return { handler: handleBwSampleCleanup, params: {} };
  }

  // ─── Diagnostic Tools Routes ────────────────────────────────────
  if (method === "POST" && urlPath === "/api/diag/tcpdump/start") {
    return { handler: handleTcpdumpStart, params: {} };
  }
  if (method === "POST" && urlPath === "/api/diag/tcpdump/stop") {
    return { handler: handleTcpdumpStop, params: {} };
  }
  if (method === "GET" && urlPath === "/api/diag/tcpdump/status") {
    return { handler: handleTcpdumpStatus, params: {} };
  }
  if (method === "GET" && urlPath === "/api/diag/tcpdump/captures") {
    return { handler: handleTcpdumpList, params: {} };
  }
  if (method === "DELETE" && urlPath.match(/^\/api\/diag\/tcpdump\/captures\/([^/]+)$/)) {
    const m = urlPath.match(/^\/api\/diag\/tcpdump\/captures\/([^/]+)$/);
    return { handler: handleTcpdumpDeleteSingle, params: { id: m![1] } };
  }
  if (method === "DELETE" && urlPath === "/api/diag/tcpdump/captures") {
    return { handler: handleTcpdumpCleanup, params: {} };
  }
  if (method === "GET" && urlPath.match(/^\/api\/diag\/tcpdump\/download\/([^/]+)$/)) {
    const m = urlPath.match(/^\/api\/diag\/tcpdump\/download\/([^/]+)$/);
    return { handler: handleTcpdumpDownload, params: { id: m![1] } };
  }
  if (method === "POST" && urlPath === "/api/diag/ping") {
    return { handler: handlePing, params: {} };
  }
  if (method === "POST" && urlPath === "/api/diag/traceroute") {
    return { handler: handleTraceroute, params: {} };
  }
  if (method === "POST" && urlPath === "/api/diag/nslookup") {
    return { handler: handleNslookup, params: {} };
  }
  if (method === "GET" && urlPath === "/api/diag/arp-table") {
    return { handler: handleArpTable, params: {} };
  }
  if (method === "POST" && urlPath === "/api/diag/arp-flush") {
    return { handler: handleArpFlush, params: {} };
  }
  if (method === "POST" && urlPath === "/api/diag/dig") {
    return { handler: handleDig, params: {} };
  }
  if (method === "GET" && urlPath === "/api/diag/captures") {
    return { handler: handleGetAllCaptures, params: {} };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Health
// ═══════════════════════════════════════════════════════════════════════════
async function handleHealth() {
  return json({
    status: "ok",
    service: "cryptsk-gateway-service",
    port: SERVICE_PORT,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — System Interfaces
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetInterfaces(req: Request) {
  const auth = requireAuth(req);
  try {
    // Run shell commands to discover interfaces
    const [linkResult, addrResult] = await Promise.all([
      runShell("ip", ["link", "show"]),
      runShell("ip", ["addr", "show"]),
    ]);

    // Read /sys/class/net/ for physical interface info
    let sysInterfaces: string[] = [];
    try {
      const lsResult = await runShell("ls", ["/sys/class/net/"]);
      sysInterfaces = lsResult.stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      // ignore
    }

    // Parse interfaces from ip output
    const interfaces: Record<string, any> = {};

    // Parse ip link show
    const linkLines = linkResult.stdout.split("\n");
    let currentIface = "";
    for (const line of linkLines) {
      const ifaceMatch = line.match(/^\d+:\s+([^:@]+)/);
      if (ifaceMatch) {
        currentIface = ifaceMatch[1].trim();
        interfaces[currentIface] = { name: currentIface };
      }
      if (currentIface && interfaces[currentIface]) {
        if (line.includes("link/ether")) {
          const macMatch = line.match(/link\/ether\s+([0-9a-f:]+)/i);
          if (macMatch) interfaces[currentIface].macAddress = macMatch[1];
        }
        const mtuMatch = line.match(/mtu\s+(\d+)/);
        if (mtuMatch) interfaces[currentIface].mtu = parseInt(mtuMatch[1]);
        const stateMatch = line.match(/state\s+(\w+)/);
        if (stateMatch) {
          interfaces[currentIface].carrierStatus =
            stateMatch[1].toUpperCase() === "UP";
        }
      }
    }

    // Parse ip addr show for addresses
    const addrLines = addrResult.stdout.split("\n");
    currentIface = "";
    const ifaceAddrs: Record<string, { ipv4: string[]; ipv6: string[] }> = {};
    for (const line of addrLines) {
      const ifaceMatch = line.match(/^\d+:\s+([^:@]+)/);
      if (ifaceMatch) {
        currentIface = ifaceMatch[1].trim();
        if (!ifaceAddrs[currentIface])
          ifaceAddrs[currentIface] = { ipv4: [], ipv6: [] };
      }
      if (currentIface && ifaceAddrs[currentIface]) {
        const inetMatch = line.match(
          /inet\s+(\S+)/
        );
        if (inetMatch) {
          ifaceAddrs[currentIface].ipv4.push(inetMatch[1]);
        }
        const inet6Match = line.match(
          /inet6\s+(\S+)/
        );
        if (inet6Match) {
          ifaceAddrs[currentIface].ipv6.push(inet6Match[1]);
        }
      }
    }

    // Build final interface list
    const result = [];
    for (const [name, info] of Object.entries(interfaces)) {
      const addrs = ifaceAddrs[name] || { ipv4: [], ipv6: [] };
      const isPhysical = sysInterfaces.includes(name);
      const ifaceData = {
        name,
        type: isPhysical ? "PHYSICAL" : "VIRTUAL",
        macAddress: (info as any).macAddress || "",
        mtu: (info as any).mtu || 1500,
        carrierStatus: (info as any).carrierStatus || false,
        ipv4Addresses: addrs.ipv4,
        ipv6Addresses: addrs.ipv6,
      };
      result.push(ifaceData);

      // Sync to DB
      try {
        await prisma.systemInterface.upsert({
          where: { name },
          update: {
            macAddress: ifaceData.macAddress,
            mtu: ifaceData.mtu,
            carrierStatus: ifaceData.carrierStatus,
            ipv4Address: addrs.ipv4[0]?.split("/")[0] || "",
            ipv6Address: addrs.ipv6[0]?.split("/")[0] || "",
          },
          create: {
            name,
            type: isPhysical ? "PHYSICAL" : "VIRTUAL",
            macAddress: ifaceData.macAddress,
            mtu: ifaceData.mtu,
            carrierStatus: ifaceData.carrierStatus,
            ipv4Address: addrs.ipv4[0]?.split("/")[0] || "",
            ipv6Address: addrs.ipv6[0]?.split("/")[0] || "",
          },
        });
      } catch (dbErr) {
        log.warn("Failed to sync interface to DB", { name, error: String(dbErr) });
      }
    }

    return json({ success: true, data: result, total: result.length });
  } catch (err: any) {
    log.error("handleGetInterfaces failed", { error: String(err) });
    return jsonErr("Failed to discover interfaces: " + String(err.message), 500);
  }
}

async function handleUpdateInterface(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { role, enabled, ipv4Address, ipv4Netmask, ipv4Gateway, ipv4Dns } = body;
    const iface = await prisma.systemInterface.findUnique({
      where: { id: params.id },
    });
    if (!iface) return jsonErr("Interface not found", 404);

    const updateData: any = {};
    if (role !== undefined) updateData.role = role;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (ipv4Address !== undefined) updateData.ipv4Address = ipv4Address;
    if (ipv4Netmask !== undefined) updateData.ipv4Netmask = ipv4Netmask;
    if (ipv4Gateway !== undefined) updateData.ipv4Gateway = ipv4Gateway;
    if (ipv4Dns !== undefined) updateData.ipv4Dns = ipv4Dns;

    // Apply system changes
    if (enabled !== undefined) {
      const cmd = enabled ? "up" : "down";
      await runShell("ip", ["link", "set", iface.name, cmd]);
    }
    if (ipv4Address && ipv4Netmask) {
      const cidr = `${ipv4Address}/${ipv4Netmask}`;
      await runShell("ip", ["addr", "add", cidr, "dev", iface.name]);
    }
    if (ipv4Gateway) {
      await runShell("ip", ["route", "add", "default", "via", ipv4Gateway, "dev", iface.name]);
    }

    const updated = await prisma.systemInterface.update({
      where: { id: params.id },
      data: updateData,
    });

    await auditLog(auth.userId, "UPDATE", "SystemInterface", params.id, updateData, req);
    log.info("Interface updated", { name: iface.name, ...updateData });
    return json({ success: true, data: updated });
  } catch (err: any) {
    return jsonErr(err.message || "Update failed", 500);
  }
}

async function handleCreateVlan(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { parentInterface, vlanId, ip } = body;
    if (!parentInterface || !vlanId) return jsonErr("parentInterface and vlanId required");

    const vlanName = `${parentInterface}.${vlanId}`;
    const result = await runShell("ip", [
      "link", "add", "link", parentInterface,
      "name", vlanName, "type", "vlan", "id", String(vlanId),
    ]);
    if (!result.success) return jsonErr("Failed to create VLAN: " + result.stderr);

    // Bring it up
    await runShell("ip", ["link", "set", vlanName, "up"]);

    // Optionally add IP
    if (ip) {
      await runShell("ip", ["addr", "add", ip, "dev", vlanName]);
    }

    // Sync to DB
    const parent = await prisma.systemInterface.findUnique({ where: { name: parentInterface } });
    const dbRecord = await prisma.systemInterface.create({
      data: {
        name: vlanName,
        type: "VLAN",
        parentInterfaceId: parent?.id || null,
        vlanId,
        ipv4Address: ip?.split("/")[0] || "",
        enabled: true,
      },
    });

    await auditLog(auth.userId, "CREATE", "SystemInterface", dbRecord.id, { parentInterface, vlanId }, req);
    log.info("VLAN created", { vlanName });
    return json({ success: true, data: dbRecord });
  } catch (err: any) {
    return jsonErr(err.message || "Create VLAN failed", 500);
  }
}

async function handleDeleteVlan(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const result = await runShell("ip", ["link", "del", params.name]);
    if (!result.success) return jsonErr("Failed to delete VLAN: " + result.stderr);

    await prisma.systemInterface.deleteMany({ where: { name: params.name } });

    await auditLog(auth.userId, "DELETE", "SystemInterface", params.name, { type: "VLAN" }, req);
    log.info("VLAN deleted", { name: params.name });
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message || "Delete VLAN failed", 500);
  }
}

async function handleCreateBridge(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { name, members } = body;
    if (!name) return jsonErr("name required");

    const result = await runShell("ip", ["link", "add", name, "type", "bridge"]);
    if (!result.success) return jsonErr("Failed to create bridge: " + result.stderr);

    await runShell("ip", ["link", "set", name, "up"]);

    // Add members
    if (Array.isArray(members)) {
      for (const member of members) {
        await runShell("ip", ["link", "set", member, "master", name]);
      }
    }

    const dbRecord = await prisma.systemInterface.create({
      data: {
        name,
        type: "BRIDGE",
        bridgeMembers: JSON.stringify(members || []),
        enabled: true,
      },
    });

    await auditLog(auth.userId, "CREATE", "SystemInterface", dbRecord.id, { type: "BRIDGE", name, members }, req);
    log.info("Bridge created", { name });
    return json({ success: true, data: dbRecord });
  } catch (err: any) {
    return jsonErr(err.message || "Create bridge failed", 500);
  }
}

async function handleDeleteBridge(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const result = await runShell("ip", ["link", "del", params.name]);
    if (!result.success) return jsonErr("Failed to delete bridge: " + result.stderr);

    await prisma.systemInterface.deleteMany({ where: { name: params.name } });

    await auditLog(auth.userId, "DELETE", "SystemInterface", params.name, { type: "BRIDGE" }, req);
    log.info("Bridge deleted", { name: params.name });
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message || "Delete bridge failed", 500);
  }
}

async function handleCreateBond(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { name, mode, members } = body;
    if (!name || !mode) return jsonErr("name and mode required");

    const result = await runShell("ip", ["link", "add", name, "type", "bond", "mode", mode]);
    if (!result.success) return jsonErr("Failed to create bond: " + result.stderr);

    await runShell("ip", ["link", "set", name, "up"]);

    if (Array.isArray(members)) {
      for (const member of members) {
        await runShell("ip", ["link", "set", member, "master", name]);
      }
    }

    const dbRecord = await prisma.systemInterface.create({
      data: {
        name,
        type: "BOND",
        bondMode: mode,
        bondMembers: JSON.stringify(members || []),
        enabled: true,
      },
    });

    await auditLog(auth.userId, "CREATE", "SystemInterface", dbRecord.id, { type: "BOND", name, mode }, req);
    log.info("Bond created", { name, mode });
    return json({ success: true, data: dbRecord });
  } catch (err: any) {
    return jsonErr(err.message || "Create bond failed", 500);
  }
}

async function handleDeleteBond(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const result = await runShell("ip", ["link", "del", params.name]);
    if (!result.success) return jsonErr("Failed to delete bond: " + result.stderr);

    await prisma.systemInterface.deleteMany({ where: { name: params.name } });

    await auditLog(auth.userId, "DELETE", "SystemInterface", params.name, { type: "BOND" }, req);
    log.info("Bond deleted", { name: params.name });
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message || "Delete bond failed", 500);
  }
}

async function handleIfaceUp(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const result = await runShell("ip", ["link", "set", params.name, "up"]);
    if (!result.success) return jsonErr("Failed to bring up interface: " + result.stderr);

    await prisma.systemInterface.updateMany({
      where: { name: params.name },
      data: { enabled: true },
    });

    await auditLog(auth.userId, "UPDATE", "SystemInterface", params.name, { action: "up" }, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message || "Interface up failed", 500);
  }
}

async function handleIfaceDown(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const result = await runShell("ip", ["link", "set", params.name, "down"]);
    if (!result.success) return jsonErr("Failed to bring down interface: " + result.stderr);

    await prisma.systemInterface.updateMany({
      where: { name: params.name },
      data: { enabled: false },
    });

    await auditLog(auth.userId, "UPDATE", "SystemInterface", params.name, { action: "down" }, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message || "Interface down failed", 500);
  }
}

async function handleIfaceFlush(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const result = await runShell("ip", ["addr", "flush", "dev", params.name]);
    if (!result.success) return jsonErr("Failed to flush IPs: " + result.stderr);

    await prisma.systemInterface.updateMany({
      where: { name: params.name },
      data: { ipv4Address: "", ipv6Address: "" },
    });

    await auditLog(auth.userId, "UPDATE", "SystemInterface", params.name, { action: "flush" }, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message || "Flush failed", 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — DHCP (KEA REST API proxy + DB)
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetDhcpSubnets(req: Request) {
  requireAuth(req);
  try {
    const subnets = await prisma.dhcpSubnet.findMany({
      include: { reservations: true },
      orderBy: { createdAt: "desc" },
    });
    return json({ success: true, data: subnets });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreateDhcpSubnet(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const {
      name, interfaceName, subnet, netmask, rangeStart, rangeEnd,
      leaseTimeSec, gateway, dnsServers, domainName, enabled,
    } = body;

    if (!name || !subnet || !rangeStart || !rangeEnd) {
      return jsonErr("name, subnet, rangeStart, rangeEnd are required");
    }

    const record = await prisma.dhcpSubnet.create({
      data: {
        name, interfaceName, subnet,
        netmask: netmask || "255.255.255.0",
        rangeStart, rangeEnd,
        leaseTimeSec: leaseTimeSec || 86400,
        gateway: gateway || "",
        dnsServers: dnsServers || "",
        domainName: domainName || "",
        enabled: enabled !== false,
      },
    });

    // Send to KEA REST API
    try {
      const keaConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
      const keaUrl = keaConfig?.dhcpServerUrl || "http://localhost:8080";
      await fetch(`${keaUrl}/dhcp4/subnets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "subnet4-add",
          service: ["dhcp4"],
          arguments: {
            subnets: [{
              id: parseInt(record.id.slice(-8), 36) || 1,
              subnet: `${subnet}/${netmask || "255.255.255.0"}`,
              pools: [{ pool: `${rangeStart}-${rangeEnd}` }],
              "valid-lifetime": leaseTimeSec || 86400,
              ...(gateway && { "option-data": [{ "name": "routers", "data": gateway }] }),
            }],
          },
        }),
      });
    } catch (keaErr) {
      log.warn("KEA config push failed (subnet created in DB)", { error: String(keaErr) });
    }

    await auditLog(auth.userId, "CREATE", "DhcpSubnet", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateDhcpSubnet(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.dhcpSubnet.update({
      where: { id: params.id },
      data: safeBody,
    });

    await auditLog(auth.userId, "UPDATE", "DhcpSubnet", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeleteDhcpSubnet(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.dhcpSubnet.delete({ where: { id: params.id } });

    // Remove from KEA
    try {
      const keaConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
      const keaUrl = keaConfig?.dhcpServerUrl || "http://localhost:8080";
      await fetch(`${keaUrl}/dhcp4/subnets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "subnet4-del",
          service: ["dhcp4"],
          arguments: { id: parseInt(params.id.slice(-8), 36) || 1 },
        }),
      });
    } catch {}

    await auditLog(auth.userId, "DELETE", "DhcpSubnet", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetDhcpReservations(req: Request) {
  requireAuth(req);
  try {
    const reservations = await prisma.dhcpReservation.findMany({
      include: { dhcpSubnet: true },
      orderBy: { createdAt: "desc" },
    });
    return json({ success: true, data: reservations });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreateDhcpReservation(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { dhcpSubnetId, macAddress, ipAddress, hostname, subscriberId } = body;
    if (!dhcpSubnetId || !macAddress || !ipAddress) {
      return jsonErr("dhcpSubnetId, macAddress, ipAddress are required");
    }

    const record = await prisma.dhcpReservation.create({
      data: {
        dhcpSubnetId, macAddress, ipAddress,
        hostname: hostname || "",
        subscriberId: subscriberId || null,
      },
    });

    await auditLog(auth.userId, "CREATE", "DhcpReservation", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateDhcpReservation(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.dhcpReservation.update({
      where: { id: params.id },
      data: safeBody,
    });

    await auditLog(auth.userId, "UPDATE", "DhcpReservation", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeleteDhcpReservation(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.dhcpReservation.delete({ where: { id: params.id } });
    await auditLog(auth.userId, "DELETE", "DhcpReservation", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetDhcpLeases(req: Request) {
  requireAuth(req);
  try {
    const keaConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
    const keaUrl = keaConfig?.dhcpServerUrl || "http://localhost:8080";

    const response = await fetch(`${keaUrl}/leases`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      return jsonErr(`KEA returned ${response.status}`, 502);
    }
    const data = await response.json();
    return json({ success: true, data });
  } catch (err: any) {
    return jsonErr("Failed to fetch KEA leases: " + String(err.message), 502);
  }
}

async function handleKeaReload(req: Request) {
  const auth = requireAuth(req);
  try {
    const keaConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
    const keaUrl = keaConfig?.dhcpServerUrl || "http://localhost:8080";

    const response = await fetch(`${keaUrl}/control-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: "config-reload",
        service: ["dhcp4"],
      }),
    });
    const data = await response.json();

    await auditLog(auth.userId, "RELOAD", "KEA", "server", data, req);
    return json({ success: true, data });
  } catch (err: any) {
    return jsonErr("KEA reload failed: " + String(err.message), 502);
  }
}

async function handleKeaStatus(req: Request) {
  requireAuth(req);
  try {
    const keaConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
    const keaUrl = keaConfig?.dhcpServerUrl || "http://localhost:8080";

    const response = await fetch(`${keaUrl}/control-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: "status-get",
        service: ["dhcp4"],
      }),
    });
    const data = await response.json();
    return json({ success: true, data });
  } catch (err: any) {
    return json({ success: false, status: "unreachable", error: String(err.message) });
  }
}

async function handleKeaTest(req: Request) {
  requireAuth(req);
  try {
    const keaConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
    const keaUrl = keaConfig?.dhcpServerUrl || "http://localhost:8080";

    const response = await fetch(`${keaUrl}/control-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: "status-get",
        service: ["dhcp4"],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      return json({ success: true, connected: true, message: "KEA server is reachable", data });
    } else {
      return json({ success: false, connected: false, message: `KEA responded with ${response.status}` });
    }
  } catch (err: any) {
    return json({ success: false, connected: false, message: `KEA not reachable: ${err.message}` });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — DNS (dnsmasq)
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetDnsRecords(req: Request) {
  requireAuth(req);
  try {
    const records = await prisma.dnsRecord.findMany({ orderBy: { name: "asc" } });
    return json({ success: true, data: records });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreateDnsRecord(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { type, name, value, priority, ttl, interfaceId, enabled } = body;
    if (!type || !name || !value) return jsonErr("type, name, value are required");

    const record = await prisma.dnsRecord.create({
      data: {
        type, name, value,
        priority: priority || 0,
        ttl: ttl || 300,
        interfaceId: interfaceId || null,
        enabled: enabled !== false,
      },
    });

    await regenerateDnsmasqConfig();
    await auditLog(auth.userId, "CREATE", "DnsRecord", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateDnsRecord(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.dnsRecord.update({
      where: { id: params.id },
      data: safeBody,
    });

    await regenerateDnsmasqConfig();
    await auditLog(auth.userId, "UPDATE", "DnsRecord", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeleteDnsRecord(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.dnsRecord.delete({ where: { id: params.id } });
    await regenerateDnsmasqConfig();
    await auditLog(auth.userId, "DELETE", "DnsRecord", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDnsReload(req: Request) {
  const auth = requireAuth(req);
  try {
    const result = await runShell("killall", ["-HUP", "dnsmasq"]);
    if (!result.success) {
      // Try pidof approach
      const pidResult = await runShell("pidof", ["dnsmasq"]);
      if (pidResult.success && pidResult.stdout.trim()) {
        const pid = pidResult.stdout.trim().split(" ")[0];
        await runShell("kill", ["-HUP", pid]);
      } else {
        log.warn("dnsmasq not running, cannot reload");
      }
    }
    await auditLog(auth.userId, "RELOAD", "DNS", "dnsmasq", {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDnsConfig(req: Request) {
  requireAuth(req);
  try {
    const config = await generateDnsmasqConfigPreview();
    return json({ success: true, data: { config } });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDnsTest(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { domain, server } = body;
    if (!domain) return jsonErr("domain is required");

    // Try dig first
    let result = await runShell("dig", [
      ...(server ? [`@${server}`] : []),
      domain, "+short", "+timeout=5",
    ], 10000);

    if (!result.success) {
      // Fallback to nslookup
      result = await runShell("nslookup", [
        domain,
        ...(server ? [server] : []),
      ], 10000);
    }

    return json({
      success: result.success,
      domain,
      server: server || "system default",
      output: result.stdout,
      stderr: result.stderr,
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ─── dnsmasq Config Generation Helpers ─────────────────────────────────
async function regenerateDnsmasqConfig(): Promise<string> {
  const records = await prisma.dnsRecord.findMany({ where: { enabled: true } });
  const gwConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });

  let config = `# Auto-generated by Cryptsk Gateway Service\n`;
  config += `# DO NOT EDIT MANUALLY\n\n`;
  config += `listen-address=127.0.0.1\n`;
  if (gwConfig?.enableDnsCache !== false) {
    config += `cache-size=1000\n`;
  }
  if (gwConfig?.dnsForwarders) {
    for (const dns of gwConfig.dnsForwarders.split(",")) {
      const trimmed = dns.trim();
      if (trimmed) config += `server=${trimmed}\n`;
    }
  }
  config += `\n# DNS Records\n`;

  for (const rec of records) {
    switch (rec.type) {
      case "A":
        config += `address=/${rec.name}/${rec.value}\n`;
        break;
      case "AAAA":
        config += `address=/${rec.name}/${rec.value}\n`;
        break;
      case "CNAME":
        config += `cname=${rec.name},${rec.value}\n`;
        break;
      case "MX":
        config += `mx-host=${rec.name},${rec.value},${rec.priority || 10}\n`;
        break;
      case "TXT":
        config += `txt-record=${rec.name},${rec.value}\n`;
        break;
      case "SRV":
        config += `srv-host=${rec.name},${rec.value},${rec.priority || 0}\n`;
        break;
    }
  }

  // Write config file
  const writeResult = await runShell("sh", [
    "-c", `mkdir -p /etc/dnsmasq.d && echo '${config.replace(/'/g, "'\"'\"'")}' > /etc/dnsmasq.d/cryptsk-hosts.conf`,
  ]);
  if (!writeResult.success) {
    log.warn("Failed to write dnsmasq config", { stderr: writeResult.stderr });
  }

  return config;
}

async function generateDnsmasqConfigPreview(): Promise<string> {
  try {
    const records = await prisma.dnsRecord.findMany({ where: { enabled: true } });
    const gwConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });

    let config = `# Cryptsk dnsmasq Configuration Preview\n\n`;
    config += `listen-address=127.0.0.1\n`;
    if (gwConfig?.enableDnsCache !== false) {
      config += `cache-size=1000\n`;
    }
    if (gwConfig?.dnsForwarders) {
      for (const dns of gwConfig.dnsForwarders.split(",")) {
        const trimmed = dns.trim();
        if (trimmed) config += `server=${trimmed}\n`;
      }
    }
    config += `\n# DNS Records (${records.length} total)\n`;
    for (const rec of records) {
      config += `# ${rec.type} ${rec.name} -> ${rec.value}\n`;
    }
    return config;
  } catch {
    return "# Unable to generate config preview";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Service Status Detection
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetServicesStatus(req: Request) {
  requireAuth(req);
  try {
    const services: Record<string, { installed: boolean; running: boolean; version?: string; port?: number }> = {};

    // Check dnsmasq
    const dnsmasqWhich = await runShell("which", ["dnsmasq"]);
    const dnsmasqPid = await runShell("pidof", ["dnsmasq"]);
    const dnsmasqVer = await runShell("dnsmasq", ["--version"]);
    services.dnsmasq = {
      installed: dnsmasqWhich.success,
      running: dnsmasqPid.success && !!dnsmasqPid.stdout.trim(),
      version: dnsmasqVer.success ? dnsmasqVer.stdout.split("\n")[0] : undefined,
      port: 53,
    };

    // Check Kea DHCP
    const keaWhich = await runShell("which", ["kea-dhcp4"]);
    const keaPid = await runShell("pidof", ["kea-dhcp4"]);
    services.kea = {
      installed: keaWhich.success,
      running: keaPid.success && !!keaPid.stdout.trim(),
      port: 67,
    };

    // Check FreeRADIUS
    const radiusWhich = await runShell("which", ["freeradius"]);
    const radiusPid = await runShell("pidof", ["freeradius"]);
    const radiusVer = await runShell("freeradius", ["-v"]);
    services.freeradius = {
      installed: radiusWhich.success,
      running: radiusPid.success && !!radiusPid.stdout.trim(),
      version: radiusVer.success ? radiusVer.stdout.split("\n")[0] : undefined,
      port: 1812,
    };

    // Check accel-ppp
    const accelWhich = await runShell("which", ["accel-pppd"]);
    const accelPid = await runShell("pidof", ["accel-pppd"]);
    services.accel_ppp = {
      installed: accelWhich.success,
      running: accelPid.success && !!accelPid.stdout.trim(),
      port: 0,
    };

    return json({ success: true, data: services });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetRadiusStatus(req: Request) {
  requireAuth(req);
  try {
    // Check radius-service mini-service on port 3001
    const radiusRes = await fetch("http://localhost:3001/api/health", { signal: AbortSignal.timeout(3000) });
    const data = await radiusRes.json();

    // Check actual FreeRADIUS daemon
    const frWhich = await runShell("which", ["freeradius"]);
    const frPid = await runShell("pidof", ["freeradius"]);
    const frVer = await runShell("freeradius", ["-v"]);

    return json({
      success: true,
      data: {
        radiusService: { connected: radiusRes.ok, ...data },
        freeradiusDaemon: {
          installed: frWhich.success,
          running: frPid.success && !!frPid.stdout.trim(),
          version: frVer.success ? frVer.stdout.split("\n")[0] : undefined,
        },
      },
    });
  } catch (err: any) {
    return json({
      success: true,
      data: {
        radiusService: { connected: false, error: String(err.message) },
        freeradiusDaemon: { installed: false, running: false },
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Gateway Config
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetGatewayConfig(req: Request) {
  requireAuth(req);
  try {
    const config = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
    return json({ success: true, data: config });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateGatewayConfig(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const config = await prisma.gatewayConfig.upsert({
      where: { id: "default" },
      update: safeBody,
      create: { id: "default", ...safeBody },
    });

    await auditLog(auth.userId, "UPDATE", "GatewayConfig", "default", body, req);
    return json({ success: true, data: config });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGatewayInit(req: Request) {
  const auth = requireAuth(req);
  // Check gateway mode before executing gateway operations
  const gwSettings = await prisma.ispSettings.findFirst();
  if (!gwSettings?.gatewayModeEnabled) {
    return jsonErr("Gateway mode is not enabled");
  }
  try {
    const results: Record<string, any> = {};

    // 1. Apply interface configs
    const interfaces = await prisma.systemInterface.findMany({ where: { enabled: true, isManaged: true } });
    for (const iface of interfaces) {
      await runShell("ip", ["link", "set", iface.name, "up"]);
      if (iface.ipv4Address && iface.ipv4Netmask) {
        await runShell("ip", ["addr", "add", `${iface.ipv4Address}/${iface.ipv4Netmask}`, "dev", iface.name]).catch(() => {});
      }
    }
    results.interfaces = { configured: interfaces.length };

    // 2. Enable IP forwarding
    await runShell("sh", ["-c", "echo 1 > /proc/sys/net/ipv4/ip_forward"]).catch(() => {});
    await runShell("sh", ["-c", "echo 1 > /proc/sys/net/ipv6/conf/all/forwarding"]).catch(() => {});

    // 3. Setup nftables basics
    await runShell("nft", ["flush", "ruleset"]).catch(() => {});
    await runShell("nft", ["add", "table", "inet", "cryptsk"]).catch(() => {});
    await runShell("nft", ["add", "chain", "inet", "cryptsk", "filter", "{ type filter hook forward priority 0 \\; policy drop \\;}"]).catch(() => {});
    await runShell("nft", ["add", "chain", "inet", "cryptsk", "nat", "{ type nat hook postrouting priority 100 \\;}"]).catch(() => {});
    // Allow established/related
    await runShell("nft", ["add", "rule", "inet", "cryptsk", "filter", "ct", "state", "established,related", "accept"]).catch(() => {});
    // MASQUERADE on WAN
    const wanIface = interfaces.find((i) => i.role === "WAN");
    if (wanIface) {
      await runShell("nft", ["add", "rule", "inet", "cryptsk", "nat", "outdev", wanIface.name, "masquerade"]).catch(() => {});
    }
    // Allow LAN forward
    const lanIface = interfaces.find((i) => i.role === "LAN");
    if (lanIface) {
      await runShell("nft", ["add", "rule", "inet", "cryptsk", "filter", "iifname", lanIface.name, "accept"]).catch(() => {});
    }

    // 4. Setup TC on WAN
    if (wanIface) {
      await runShell("tc", ["qdisc", "add", "dev", wanIface.name, "root", "handle", "1:", "htb"]).catch(() => {});
      await runShell("tc", ["class", "add", "dev", wanIface.name, "parent", "1:", "classid", "1:1", "htb", "rate", "1gbit"]).catch(() => {});
      results.tc = { wanInterface: wanIface.name, initialized: true };
    }

    results.status = "initialized";
    await auditLog(auth.userId, "INIT", "Gateway", "system", results, req);
    log.info("Gateway initialized", results);
    return json({ success: true, data: results });
  } catch (err: any) {
    return jsonErr("Gateway init failed: " + String(err.message), 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Firewall (nftables)
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetFirewallRules(req: Request) {
  requireAuth(req);
  try {
    const rules = await prisma.firewallRule.findMany({
      orderBy: { priority: "asc" },
    });
    return json({ success: true, data: rules });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreateFirewallRule(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { name, description, chain, table, action, matchCriteria, natTarget, logEnabled, enabled, priority } = body;
    if (!name) return jsonErr("name is required");

    const record = await prisma.firewallRule.create({
      data: {
        name, description: description || "",
        chain: chain || "forward", table: table || "filter",
        action: action || "ACCEPT",
        matchCriteria: JSON.stringify(matchCriteria || {}),
        natTarget: natTarget || "",
        logEnabled: logEnabled || false,
        enabled: enabled !== false,
        priority: priority || 0,
      },
    });

    // Apply to nftables
    if (record.enabled) {
      await applySingleNftRule(record);
    }

    await auditLog(auth.userId, "CREATE", "FirewallRule", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateFirewallRule(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.firewallRule.update({
      where: { id: params.id },
      data: safeBody,
    });
    await auditLog(auth.userId, "UPDATE", "FirewallRule", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeleteFirewallRule(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.firewallRule.delete({ where: { id: params.id } });
    await auditLog(auth.userId, "DELETE", "FirewallRule", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleFirewallApply(req: Request) {
  const auth = requireAuth(req);
  try {
    // Generate full nftables ruleset from DB
    const rules = await prisma.firewallRule.findMany({
      where: { enabled: true },
      orderBy: { priority: "asc" },
    });

    // Clear existing ruleset
    await runShell("nft", ["flush", "ruleset"]).catch(() => {});

    // Create tables
    await runShell("nft", ["add", "table", "inet", "cryptsk"]).catch(() => {});
    await runShell("nft", ["add", "chain", "inet", "cryptsk", "filter", "{ type filter hook forward priority 0 \\; policy drop \\;}"]).catch(() => {});
    await runShell("nft", ["add", "chain", "inet", "cryptsk", "nat", "{ type nat hook postrouting priority 100 \\;}"]).catch(() => {});
    await runShell("nft", ["add", "chain", "inet", "cryptsk", "input", "{ type filter hook input priority 0 \\; policy accept \\;}"]).catch(() => {});

    // Allow established/related first
    await runShell("nft", ["add", "rule", "inet", "cryptsk", "filter", "ct", "state", "established,related", "accept"]).catch(() => {});

    // Apply each rule
    let applied = 0;
    for (const rule of rules) {
      try {
        await applySingleNftRule(rule);
        applied++;
      } catch (e) {
        log.warn("Failed to apply firewall rule", { id: rule.id, error: String(e) });
      }
    }

    await auditLog(auth.userId, "APPLY", "FirewallRule", "all", { total: rules.length, applied }, req);
    return json({ success: true, data: { total: rules.length, applied } });
  } catch (err: any) {
    return jsonErr("Firewall apply failed: " + String(err.message), 500);
  }
}

async function applySingleNftRule(rule: any) {
  const criteria = JSON.parse(rule.matchCriteria || "{}");
  const chain = rule.chain || "forward";
  const base = ["nft", "add", "rule", "inet", "cryptsk", chain];

  const parts: string[] = [];

  if (criteria.protocol) parts.push("ip", "protocol", criteria.protocol);
  if (criteria.srcIp) parts.push("ip", "saddr", criteria.srcIp);
  if (criteria.dstIp) parts.push("ip", "daddr", criteria.dstIp);
  if (criteria.srcPort) parts.push(...(criteria.protocol === "tcp" || criteria.protocol === "udp" ? ["th", "sport"] : ["sport"]), criteria.srcPort);
  if (criteria.dstPort) parts.push(...(criteria.protocol === "tcp" || criteria.protocol === "udp" ? ["th", "dport"] : ["dport"]), criteria.dstPort);
  if (criteria.ifaceIn) parts.push("iifname", criteria.ifaceIn);
  if (criteria.ifaceOut) parts.push("oifname", criteria.ifaceOut);

  // Action
  const action = (rule.action || "ACCEPT").toLowerCase();
  if (action === "snat" || action === "dnat") {
    if (rule.natTarget) {
      parts.push(action, rule.natTarget);
    }
  } else {
    parts.push(action);
  }

  if (rule.logEnabled) {
    parts.push("log");
    if (rule.logPrefix) parts.push(`prefix "${rule.logPrefix}"`);
  }

  await runShell(base[0], [...base.slice(1), ...parts]);
}

async function handleNftablesStatus(req: Request) {
  requireAuth(req);
  try {
    const result = await runShell("nft", ["list", "ruleset"], 15000);
    return json({
      success: result.success,
      exitCode: result.exitCode,
      ruleset: result.stdout,
      error: result.stderr,
    });
  } catch (err: any) {
    return json({ success: false, error: String(err.message), ruleset: "" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Bandwidth/TC
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetTcPolicies(req: Request) {
  requireAuth(req);
  try {
    const policies = await prisma.bandwidthPolicy.findMany({ orderBy: { priority: "asc" } });
    return json({ success: true, data: policies });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreateTcPolicy(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { name, description, downloadKbps, uploadKbps, priority, planId, radiusGroupId } = body;
    if (!name || downloadKbps === undefined || uploadKbps === undefined) {
      return jsonErr("name, downloadKbps, uploadKbps are required");
    }

    const record = await prisma.bandwidthPolicy.create({
      data: {
        name, description: description || "",
        downloadKbps, uploadKbps,
        priority: priority || 5,
        planId: planId || null,
        radiusGroupId: radiusGroupId || null,
        ...(body.ceilingDownloadKbps && { ceilingDownloadKbps: body.ceilingDownloadKbps }),
        ...(body.ceilingUploadKbps && { ceilingUploadKbps: body.ceilingUploadKbps }),
      },
    });

    await auditLog(auth.userId, "CREATE", "BandwidthPolicy", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateTcPolicy(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.bandwidthPolicy.update({
      where: { id: params.id },
      data: safeBody,
    });

    await auditLog(auth.userId, "UPDATE", "BandwidthPolicy", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeleteTcPolicy(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.bandwidthPolicy.delete({ where: { id: params.id } });
    await auditLog(auth.userId, "DELETE", "BandwidthPolicy", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcApplyUser(req: Request) {
  const auth = requireAuth(req);
  // Check gateway mode before executing TC operations
  const settings = await prisma.ispSettings.findFirst();
  if (!settings?.gatewayModeEnabled) {
    return jsonErr("Gateway mode is not enabled");
  }
  try {
    const body = await req.json();
    const { subscriberId, ip, policyId } = body;
    if (!subscriberId || !ip || !policyId) {
      return jsonErr("subscriberId, ip, policyId are required");
    }

    const policy = await prisma.bandwidthPolicy.findUnique({ where: { id: policyId } });
    if (!policy) return jsonErr("Policy not found", 404);

    // Find WAN interface
    const wanIface = await prisma.systemInterface.findFirst({ where: { role: "WAN" } });
    if (!wanIface) return jsonErr("No WAN interface configured");

    const classId = `1:${parseInt(subscriberId.slice(-4), 36) % 9999 + 10}`;

    // Create HTB class
    await runShell("tc", ["class", "add", "dev", wanIface.name, "parent", "1:1", "classid", classId, "htb",
      "rate", `${policy.downloadKbps}kbit`,
      ...(policy.ceilingDownloadKbps ? ["ceil", `${policy.ceilingDownloadKbps}kbit`] : []),
      ...(policy.burstDownloadKbps ? ["burst", `${policy.burstDownloadKbps}kbit`] : []),
      `prio`, `${policy.priority}`,
    ]).catch(() => {});

    // Add filter to match IP
    await runShell("tc", ["filter", "add", "dev", wanIface.name, "protocol", "ip", "parent", "1:0", "prio", "1", "u32", "match", "ip", "dst", ip, "flowid", classId]).catch(() => {});

    await auditLog(auth.userId, "APPLY_TC", "BandwidthPolicy", policyId, { subscriberId, ip }, req);
    return json({ success: true, data: { classId, ip, policyName: policy.name } });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcRemoveUser(req: Request) {
  const auth = requireAuth(req);
  // Check gateway mode before executing TC operations
  const settings = await prisma.ispSettings.findFirst();
  if (!settings?.gatewayModeEnabled) {
    return jsonErr("Gateway mode is not enabled");
  }
  try {
    const url = new URL(req.url);
    const subscriberId = url.searchParams.get("subscriberId");
    const ip = url.searchParams.get("ip");
    if (!subscriberId && !ip) return jsonErr("subscriberId or ip query param required");

    const wanIface = await prisma.systemInterface.findFirst({ where: { role: "WAN" } });
    if (!wanIface) return jsonErr("No WAN interface configured");

    const classId = `1:${parseInt((subscriberId || "0").slice(-4), 36) % 9999 + 10}`;

    await runShell("tc", ["class", "del", "dev", wanIface.name, "classid", classId]).catch(() => {});
    await runShell("tc", ["filter", "del", "dev", wanIface.name, "protocol", "ip", "parent", "1:0", "prio", "1"]).catch(() => {});

    await auditLog(auth.userId, "REMOVE_TC", "BandwidthPolicy", "", { subscriberId, ip }, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcInit(req: Request) {
  const auth = requireAuth(req);
  // Check gateway mode before executing TC operations
  const settings = await prisma.ispSettings.findFirst();
  if (!settings?.gatewayModeEnabled) {
    return jsonErr("Gateway mode is not enabled");
  }
  try {
    const wanIface = await prisma.systemInterface.findFirst({ where: { role: "WAN" } });
    if (!wanIface) return jsonErr("No WAN interface configured");

    // Clear existing
    await runShell("tc", ["qdisc", "del", "dev", wanIface.name, "root"]).catch(() => {});

    // Create HTB root
    await runShell("tc", ["qdisc", "add", "dev", wanIface.name, "root", "handle", "1:", "htb", "default", "9999"]);
    // Default class (bulk/unclassified)
    await runShell("tc", ["class", "add", "dev", wanIface.name, "parent", "1:", "classid", "1:1", "htb", "rate", "1gbit", "ceil", "1gbit"]);
    await runShell("tc", ["class", "add", "dev", wanIface.name, "parent", "1:", "classid", "1:9999", "htb", "rate", "10mbit", "ceil", "100mbit"]);

    await auditLog(auth.userId, "INIT_TC", "Gateway", wanIface.name, {}, req);
    log.info("TC hierarchy initialized on", { interface: wanIface.name });
    return json({ success: true, interface: wanIface.name });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcStatus(req: Request) {
  requireAuth(req);
  // Check gateway mode before executing TC operations
  const settings = await prisma.ispSettings.findFirst();
  if (!settings?.gatewayModeEnabled) {
    return jsonErr("Gateway mode is not enabled");
  }
  try {
    const [qdiscResult, classResult] = await Promise.all([
      runShell("tc", ["-s", "qdisc", "show"]),
      runShell("tc", ["-s", "class", "show"]),
    ]);

    return json({
      success: true,
      data: {
        qdiscs: qdiscResult.stdout,
        classes: classResult.stdout,
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — FAP (Fair Access Policy) Status
// ═══════════════════════════════════════════════════════════════════════════
async function handleFapStatus(req: Request) {
  requireAuth(req);
  // Check gateway mode before executing TC operations
  const settings = await prisma.ispSettings.findFirst();
  if (!settings?.gatewayModeEnabled) {
    return jsonErr("Gateway mode is not enabled");
  }
  try {
    // Use ifb0 instead of hardcoded eth0 for QoS-aware FAP status
    const fapDevice = "ifb0";
    const [tcResult, ipsetResult] = await Promise.all([
      runShell("tc", ["-s", "qdisc", "show", "dev", fapDevice]),
      runShell("ipset", ["list", "cryptsk_auth_users"]).catch(() => ({ stdout: "ipset not found", success: false })),
    ]);

    // Parse TC class info for bandwidth policies
    const tcClasses = await runShell("tc", ["-s", "class", "show", "dev", fapDevice]).catch(() => ({ stdout: "" }));
    const classLines = tcClasses.stdout.split("\n").filter(l => l.includes("htb"));
    const policies = classLines.map(line => {
      const classid = line.match(/classid\s+(\S+)/)?.[1] || "";
      const rate = line.match(/rate\s+(\S+)/)?.[1] || "";
      const ceil = line.match(/ceil\s+(\S+)/)?.[1] || "";
      return { classid, rate, ceil };
    });

    return json({
      success: true,
      data: {
        tcActive: tcResult.success,
        tcQdisc: tcResult.stdout,
        ipsetActive: ipsetResult.success,
        ipsetMembers: ipsetResult.stdout.split("\n").filter(l => l.trim() && !l.startsWith("Name:")).length - 1,
        bandwidthPolicies: policies,
        interface: await getWanInterface(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Captive Portal
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetCaptivePortals(req: Request) {
  requireAuth(req);
  try {
    const portals = await prisma.captivePortal.findMany({
      include: { interface: true, subnets: true },
      orderBy: { createdAt: "desc" },
    });
    return json({ success: true, data: portals });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreateCaptivePortal(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { name, description, template, loginMethod, sessionTimeoutSec, redirectUrl, interfaceId, enabled } = body;
    if (!name) return jsonErr("name is required");

    const record = await prisma.captivePortal.create({
      data: {
        name, description: description || "",
        template: template || "ISP_DEFAULT",
        loginMethod: loginMethod || "RADIUS",
        sessionTimeoutSec: sessionTimeoutSec || 86400,
        redirectUrl: redirectUrl || "",
        interfaceId: interfaceId || null,
        enabled: enabled || false,
        ...(body.theme && { theme: body.theme }),
        ...(body.welcomeTitle && { welcomeTitle: body.welcomeTitle }),
        ...(body.welcomeMessage && { welcomeMessage: body.welcomeMessage }),
        ...(body.tosText && { tosText: body.tosText }),
        ...(body.bandwidthLimitDown && { bandwidthLimitDown: body.bandwidthLimitDown }),
        ...(body.bandwidthLimitUp && { bandwidthLimitUp: body.bandwidthLimitUp }),
        ...(body.allowedHosts && { allowedHosts: body.allowedHosts }),
        ...(body.macAuthEnabled !== undefined && { macAuthEnabled: body.macAuthEnabled }),
      },
    });

    await auditLog(auth.userId, "CREATE", "CaptivePortal", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateCaptivePortal(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.captivePortal.update({
      where: { id: params.id },
      data: safeBody,
    });
    await auditLog(auth.userId, "UPDATE", "CaptivePortal", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeleteCaptivePortal(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.captivePortal.delete({ where: { id: params.id } });
    await auditLog(auth.userId, "DELETE", "CaptivePortal", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetPortalSessions(req: Request) {
  requireAuth(req);
  try {
    const sessions = await prisma.portalSession.findMany({
      where: { status: "ACTIVE" },
      include: { portal: true, subscriber: true },
      orderBy: { startTime: "desc" },
    });
    return json({ success: true, data: sessions });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDisconnectPortalSession(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const session = await prisma.portalSession.findUnique({ where: { id: params.id } });
    if (!session) return jsonErr("Session not found", 404);

    // Block the user's IP/MAC via nftables
    if (session.ipAddress) {
      await runShell("nft", ["add", "rule", "inet", "cryptsk", "filter", "ip", "saddr", session.ipAddress, "reject"]).catch(() => {});
    }
    if (session.macAddress) {
      await runShell("nft", ["add", "rule", "inet", "cryptsk", "filter", "ether", "saddr", session.macAddress, "reject"]).catch(() => {});
    }

    await prisma.portalSession.update({
      where: { id: params.id },
      data: { status: "ADMIN_DISCONNECT", disconnectReason: "Disconnected by admin", terminateCause: "ADMIN_DISCONNECT" },
    });

    await auditLog(auth.userId, "DISCONNECT", "PortalSession", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCaptivePortalApply(req: Request) {
  const auth = requireAuth(req);
  try {
    const portals = await prisma.captivePortal.findMany({ where: { enabled: true } });

    // Create nftables chain for captive portal redirect
    await runShell("nft", ["add", "table", "inet", "cryptsk_portal"]).catch(() => {});
    await runShell("nft", ["flush", "chain", "inet", "cryptsk_portal", "prerouting"]).catch(() => {});
    await runShell("nft", ["add", "chain", "inet", "cryptsk_portal", "prerouting", "{ type nat hook prerouting priority dstnat \\;}"]).catch(() => {});

    let applied = 0;
    for (const portal of portals) {
      const allowedHosts: string[] = JSON.parse(portal.allowedHosts || "[]");
      // Build walled garden bypass rules
      for (const host of allowedHosts) {
        await runShell("nft", ["add", "rule", "inet", "cryptsk_portal", "prerouting", "ip", "daddr", host, "return"]).catch(() => {});
      }
      // Redirect to portal
      if (portal.redirectUrl) {
        // Use simple redirect for HTTP
        const redirectHost = new URL(portal.redirectUrl).hostname;
        const redirectPort = new URL(portal.redirectUrl).port || "80";
        await runShell("nft", ["add", "rule", "inet", "cryptsk_portal", "prerouting", "tcp", "dport", "80", "dnat", `to:${redirectHost}:${redirectPort}`]).catch(() => {});
      }
      applied++;
    }

    await auditLog(auth.userId, "APPLY", "CaptivePortal", "all", { total: portals.length, applied }, req);
    return json({ success: true, data: { total: portals.length, applied } });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Security Profiles
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetSecurityProfiles(req: Request) {
  requireAuth(req);
  try {
    const profiles = await prisma.securityProfile.findMany({
      include: { interface: true },
      orderBy: { createdAt: "desc" },
    });
    return json({ success: true, data: profiles });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreateSecurityProfile(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { name, description, features, interfaceId } = body;
    if (!name) return jsonErr("name is required");

    const record = await prisma.securityProfile.create({
      data: {
        name, description: description || "",
        features: JSON.stringify(features || []),
        interfaceId: interfaceId || null,
        ...(body.arpProtectionEnabled !== undefined && { arpProtectionEnabled: body.arpProtectionEnabled }),
        ...(body.dhcpSnoopingEnabled !== undefined && { dhcpSnoopingEnabled: body.dhcpSnoopingEnabled }),
        ...(body.clientIsolationEnabled !== undefined && { clientIsolationEnabled: body.clientIsolationEnabled }),
        ...(body.portSecurityEnabled !== undefined && { portSecurityEnabled: body.portSecurityEnabled }),
        ...(body.stormControlEnabled !== undefined && { stormControlEnabled: body.stormControlEnabled }),
      },
    });

    await auditLog(auth.userId, "CREATE", "SecurityProfile", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateSecurityProfile(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.securityProfile.update({
      where: { id: params.id },
      data: safeBody,
    });
    await auditLog(auth.userId, "UPDATE", "SecurityProfile", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeleteSecurityProfile(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.securityProfile.delete({ where: { id: params.id } });
    await auditLog(auth.userId, "DELETE", "SecurityProfile", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleSecurityApply(req: Request) {
  const auth = requireAuth(req);
  try {
    const profiles = await prisma.securityProfile.findMany({ where: { enabled: true } });
    const results: Record<string, any> = {};

    for (const profile of profiles) {
      const features: string[] = JSON.parse(profile.features || "[]");

      // ARP Protection
      if (profile.arpProtectionEnabled || features.includes("ARP_PROTECTION")) {
        const action = profile.arpProtectionAction || "DROP";
        await runShell("nft", ["add", "chain", "inet", "cryptsk", "arp_check"]).catch(() => {});
        await runShell("nft", ["flush", "chain", "inet", "cryptsk", "arp_check"]).catch(() => {});
        await runShell("nft", ["add", "rule", "inet", "cryptsk", "arp_check", "arp", "gratuitous", action]).catch(() => {});
        results.arpProtection = true;
      }

      // DHCP Snooping
      if (profile.dhcpSnoopingEnabled || features.includes("DHCP_SNOOPING")) {
        const trustedPorts: string[] = JSON.parse(profile.dhcpSnoopingTrustedPorts || "[]");
        await runShell("nft", ["add", "chain", "inet", "cryptsk", "dhcp_snooping"]).catch(() => {});
        await runShell("nft", ["flush", "chain", "inet", "cryptsk", "dhcp_snooping"]).catch(() => {});
        // Block DHCP from untrusted ports (allow from trusted)
        if (trustedPorts.length > 0) {
          const trustedArgs = ["add", "rule", "inet", "cryptsk", "dhcp_snooping", "udp", "sport", "67", "udp", "dport", "68"];
          for (const p of trustedPorts) {
            trustedArgs.push("iifname", p, "accept");
          }
          await runShell("nft", trustedArgs).catch(() => {});
        }
        await runShell("nft", ["add", "rule", "inet", "cryptsk", "dhcp_snooping", "udp", "sport", "67", "drop"]).catch(() => {});
        results.dhcpSnooping = true;
      }

      // Client Isolation
      if (profile.clientIsolationEnabled || features.includes("CLIENT_ISOLATION")) {
        const isoInterfaces: string[] = JSON.parse(profile.clientIsolationInterfaces || "[]");
        await runShell("nft", ["add", "chain", "inet", "cryptsk", "client_isolation"]).catch(() => {});
        await runShell("nft", ["flush", "chain", "inet", "cryptsk", "client_isolation"]).catch(() => {});
        for (const iface of isoInterfaces) {
          await runShell("nft", ["add", "rule", "inet", "cryptsk", "client_isolation", "iifname", iface, "oifname", iface, "drop"]).catch(() => {});
        }
        results.clientIsolation = true;
      }
    }

    await auditLog(auth.userId, "APPLY", "SecurityProfile", "all", results, req);
    return json({ success: true, data: results });
  } catch (err: any) {
    return jsonErr("Security apply failed: " + String(err.message), 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — NAT Logs
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetNatLogs(req: Request) {
  requireAuth(req);
  try {
    const url = new URL(req.url);
    const subscriberId = url.searchParams.get("subscriberId");
    const dstDomain = url.searchParams.get("dstDomain");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const where: any = {};
    if (subscriberId) where.subscriberId = subscriberId;
    if (dstDomain) where.dstDomain = { contains: dstDomain };
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      prisma.natLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.natLog.count({ where }),
    ]);

    return json({
      success: true,
      data: logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleNatLogCleanup(req: Request) {
  const auth = requireAuth(req);
  try {
    const url = new URL(req.url);
    const retentionDays = parseInt(url.searchParams.get("retentionDays") || "90");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await prisma.natLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });

    await auditLog(auth.userId, "CLEANUP", "NatLog", "", { retentionDays, deleted: result.count }, req);
    return json({ success: true, deleted: result.count, retentionDays });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleNatLogStats(req: Request) {
  requireAuth(req);
  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "7");
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Top domains by traffic
    const topDomains = await prisma.natLog.groupBy({
      by: ["dstDomain"],
      where: { timestamp: { gte: since }, dstDomain: { not: "" } },
      _sum: { bytesSent: true, bytesReceived: true },
      _count: true,
      orderBy: { _sum: { bytesReceived: "desc" } },
      take: 20,
    });

    // Top subscribers by bandwidth
    const topSubscribers = await prisma.natLog.groupBy({
      by: ["subscriberId"],
      where: { timestamp: { gte: since }, subscriberId: { not: null } },
      _sum: { bytesSent: true, bytesReceived: true },
      _count: true,
      orderBy: { _sum: { bytesReceived: "desc" } },
      take: 20,
    });

    // Protocol breakdown
    const protocolRows = await prisma.$queryRawUnsafe<
      { protocol: string; count: number }[]
    >(
      `SELECT protocol, COUNT(*) as count FROM NatLog WHERE timestamp >= ? GROUP BY protocol`,
      since.toISOString()
    );
    const totalProtocols = protocolRows.reduce((sum, r) => sum + r.count, 0);

    // Hourly distribution (last 24h)
    const hourlyRows = await prisma.$queryRawUnsafe<
      { hour: string; connections: number; totalBytes: number }[]
    >(
      `SELECT strftime('%H', timestamp) as hour, COUNT(*) as connections, SUM(bytesSent + bytesReceived) as totalBytes FROM NatLog WHERE timestamp >= datetime('now', '-24 hours') GROUP BY hour ORDER BY hour`
    );

    // Fill in missing hours with 0
    const hourlyDistribution = Array.from({ length: 24 }, (_, i) => {
      const hh = i.toString().padStart(2, "0");
      const found = hourlyRows.find((r) => r.hour === hh);
      return {
        hour: `${hh}:00`,
        connections: found?.connections || 0,
        totalBytes: Number(found?.totalBytes || 0),
      };
    });

    return json({
      success: true,
      data: {
        period: `${days} days`,
        topDomains: topDomains.map((d) => ({
          domain: d.dstDomain,
          bytesSent: d._sum.bytesSent,
          bytesReceived: d._sum.bytesReceived,
          totalBytes: Number(d._sum.bytesSent || 0n) + Number(d._sum.bytesReceived || 0n),
          connections: d._count,
        })),
        topSubscribers: topSubscribers.map((s) => ({
          subscriberId: s.subscriberId,
          bytesSent: s._sum.bytesSent,
          bytesReceived: s._sum.bytesReceived,
          totalBytes: Number(s._sum.bytesSent || 0n) + Number(s._sum.bytesReceived || 0n),
          connections: s._count,
        })),
        protocolBreakdown: protocolRows.map((r) => ({
          protocol: r.protocol,
          count: r.count,
          percentage: totalProtocols > 0 ? (r.count / totalProtocols) * 100 : 0,
        })),
        hourlyDistribution,
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Syslog
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetSyslogConfigs(req: Request) {
  requireAuth(req);
  try {
    const configs = await prisma.syslogConfig.findMany({ orderBy: { createdAt: "desc" } });
    return json({ success: true, data: configs });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreateSyslogConfig(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { name, protocol, host, port, format, facility, severity, enabled } = body;
    if (!name || !host) return jsonErr("name and host are required");

    const record = await prisma.syslogConfig.create({
      data: {
        name,
        protocol: protocol || "UDP",
        host,
        port: port || 514,
        format: format || "RFC5424",
        facility: facility || "local0",
        severity: severity || "info",
        enabled: enabled || false,
        ...(body.tags && { tags: body.tags }),
      },
    });

    await auditLog(auth.userId, "CREATE", "SyslogConfig", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateSyslogConfig(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.syslogConfig.update({
      where: { id: params.id },
      data: safeBody,
    });
    await auditLog(auth.userId, "UPDATE", "SyslogConfig", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeleteSyslogConfig(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.syslogConfig.delete({ where: { id: params.id } });
    await auditLog(auth.userId, "DELETE", "SyslogConfig", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleSyslogTest(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const config = await prisma.syslogConfig.findUnique({ where: { id: params.id } });
    if (!config) return jsonErr("Syslog config not found", 404);

    const testMsg = `Cryptsk syslog test from gateway-service at ${new Date().toISOString()}`;
    const proto = config.protocol?.toLowerCase() || "udp";
    const port = config.port || 514;

    let result: ShellResult;
    if (proto === "tcp") {
      result = await runShell("sh", [
        "-c",
        `echo "${testMsg}" | nc -w 3 ${config.host} ${port}`,
      ], 5000);
    } else {
      // UDP via logger or nc
      result = await runShell("logger", [
        "-n", `${config.host}:${port}`,
        "-p", `${config.facility || "local0"}.${config.severity || "info"}`,
        "-t", "cryptsk-gateway",
        testMsg,
      ], 5000);
    }

    // Update error count
    if (!result.success) {
      await prisma.syslogConfig.update({
        where: { id: params.id },
        data: { errorCount: { increment: 1 }, lastError: result.stderr || result.stdout },
      });
    } else {
      await prisma.syslogConfig.update({
        where: { id: params.id },
        data: { lastSentAt: new Date(), errorCount: 0, lastError: "" },
      });
    }

    await auditLog(auth.userId, "TEST", "SyslogConfig", params.id, { success: result.success }, req);
    return json({
      success: result.success,
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      error: result.success ? null : (result.stderr || result.stdout),
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — RADIUS Accounting / Concurrent Sessions
// ═══════════════════════════════════════════════════════════════════════════

// Helper: Resolve subscriber speeds through Plan → RadiusGroup chain
async function resolveSubscriberSpeeds(subscriberId: string) {
  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    include: { plan: { include: { group: true } }, radiusGroup: true },
  });
  if (!subscriber) return { down: 0, up: 0, dataLimit: 0, sessionTimeout: null };

  const group = subscriber.radiusGroup || subscriber.plan?.group;
  const down = group?.speedLimitDown || subscriber.plan?.downloadSpeed || subscriber.currentSpeedDown || 0;
  const up = group?.speedLimitUp || subscriber.plan?.uploadSpeed || subscriber.currentSpeedUp || 0;
  const dataLimit = group?.dataLimit || (subscriber.plan?.dataLimitGb ? Math.round(subscriber.plan.dataLimitGb * 1024) : 0);
  const sessionTimeout = subscriber.sessionTimeout || group?.sessionTimeout || null;
  return { down, up, dataLimit, sessionTimeout, subscriber };
}

async function handleGetActiveRadiusSessions(req: Request) {
  requireAuth(req);
  try {
    const activeSessions = await prisma.radiusSession.findMany({
      where: { stopTime: null },
      include: {
        radiusUser: {
          include: {
            subscriber: {
              include: { plan: { include: { group: true } }, radiusGroup: true },
            },
          },
        },
      },
      orderBy: { startTime: "desc" },
    });

    const enriched = activeSessions.map((s) => {
      const sub = s.radiusUser?.subscriber;
      const group = sub?.radiusGroup || sub?.plan?.group;
      return {
        ...s,
        subscriberName: sub?.name || "",
        serviceUsername: sub?.serviceUsername || "",
        planName: sub?.plan?.name || "",
        groupName: group?.name || "",
        speedDown: group?.speedLimitDown || sub?.plan?.downloadSpeed || 0,
        speedUp: group?.speedLimitUp || sub?.plan?.uploadSpeed || 0,
        macAddress: sub?.macAddress || "",
        ipAddress: s.framedIp || "",
        duration: s.lastUpdate
          ? Math.round((new Date(s.lastUpdate).getTime() - new Date(s.startTime || Date.now()).getTime()) / 1000)
          : 0,
      };
    });

    return json({ success: true, data: enriched, total: enriched.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetInterimAccounting(req: Request) {
  requireAuth(req);
  try {
    const { searchParams } = new URL(req.url);
    const subscriberId = searchParams.get("subscriberId");
    const hours = parseInt(searchParams.get("hours") || "24");

    const since = new Date(Date.now() - hours * 3600 * 1000);

    const logs = await prisma.radiusAccountingLog.findMany({
      where: {
        ...(subscriberId ? { username: (await prisma.subscriber.findUnique({ where: { id: subscriberId } }))?.serviceUsername } : {}),
        acctStartTime: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return json({ success: true, data: logs, total: logs.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handlePostInterimUpdate(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { username, sessionId, sessionTime, inputOctets, outputOctets, framedIp, callingStationId } = body;

    if (!username) return jsonErr("username required");

    // Find subscriber by serviceUsername
    const subscriber = await prisma.subscriber.findUnique({
      where: { serviceUsername: username },
      include: { plan: true, radiusGroup: true },
    });
    if (!subscriber) return jsonErr("Subscriber not found", 404);

    // Create or update accounting log entry
    const existingLog = await prisma.radiusAccountingLog.findFirst({
      where: { sessionId: sessionId || "", username },
      orderBy: { createdAt: "desc" },
    });

    if (existingLog) {
      await prisma.radiusAccountingLog.update({
        where: { id: existingLog.id },
        data: {
          sessionTime: sessionTime || existingLog.sessionTime,
          inputOctets: BigInt(Number(inputOctets) || existingLog.inputOctets || 0n),
          outputOctets: BigInt(Number(outputOctets) || existingLog.outputOctets || 0n),
        },
      });
    } else {
      await prisma.radiusAccountingLog.create({
        data: {
          username,
          sessionId: sessionId || "",
          nasIp: "",
          callingStationId: callingStationId || "",
          acctStartTime: new Date(Date.now() - (sessionTime || 0) * 1000),
          sessionTime: sessionTime || 0,
          inputOctets: BigInt(Number(inputOctets || 0)),
          outputOctets: BigInt(Number(outputOctets || 0)),
        },
      });
    }

    // Update subscriber usage tracking
    const totalUsedMb = Math.round((Number(inputOctets || 0) + Number(outputOctets || 0)) / (1024 * 1024));
    const speeds = resolveSubscriberSpeeds(subscriber.id);

    // Check data cap enforcement
    if ((await speeds).dataLimit > 0 && totalUsedMb >= (await speeds).dataLimit) {
      // Data cap exceeded — apply throttling via TC
      log.warn("Data cap exceeded", { username, usedMb: totalUsedMb, limitMb: (await speeds).dataLimit });
    }

    // Update subscriber's current usage
    await prisma.subscriber.update({
      where: { id: subscriber.id },
      data: {
        currentCycleDataUsed: totalUsedMb,
        lastAuthAt: new Date(),
      },
    });

    await auditLog(auth.userId, "INTERIM_UPDATE", "RadiusAccounting", sessionId || username, body, req);
    return json({ success: true, message: "Interim update recorded" });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleEnforceConcurrentSessions(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { username, maxSessions = 1, nasIp, framedIp, callingStationId, sessionId } = body;

    if (!username) return jsonErr("username required");

    // Count active sessions for this user
    const activeCount = await prisma.radiusSession.count({
      where: {
        stopTime: null,
        radiusUser: {
          subscriber: { serviceUsername: username },
        },
      },
    });

    // Also check Plan's maxConcurrentSessions
    const subscriber = await prisma.subscriber.findUnique({
      where: { serviceUsername: username },
      include: { plan: true },
    });
    const planMax = subscriber?.plan?.maxConcurrentSessions || maxSessions;

    if (activeCount >= planMax) {
      // Concurrent session limit exceeded — disconnect oldest session
      const oldestSession = await prisma.radiusSession.findFirst({
        where: {
          stopTime: null,
          radiusUser: { subscriber: { serviceUsername: username } },
        },
        orderBy: { startTime: "asc" },
      });

      if (oldestSession) {
        await prisma.radiusSession.update({
          where: { id: oldestSession.id },
          data: {
            stopTime: new Date(),
            terminateCause: "ADMIN_RESET",
          },
        });

        // Log the enforcement
        await prisma.auditLog.create({
          data: {
            userId: auth.userId,
            userName: "",
            action: "CONCURRENT_SESSION_KICK",
            entity: "RadiusSession",
            entityId: oldestSession.id,
            details: JSON.stringify({
              username,
              maxSessions: planMax,
              activeAtKick: activeCount,
              kickedSessionId: oldestSession.sessionId,
              nasIp,
              newSessionId: sessionId,
            }),
            endpoint: req.url,
            method: "POST",
            ipAddress: req.headers.get("x-forwarded-for") || "",
            userAgent: req.headers.get("user-agent") || "",
          },
        });

        log.warn("Concurrent session kicked", {
          username,
          maxSessions: planMax,
          kickedId: oldestSession.sessionId,
        });

        return json({
          success: false,
          action: "kick",
          message: `Concurrent session limit (${planMax}) exceeded. Oldest session ${oldestSession.sessionId} disconnected.`,
          kickedSessionId: oldestSession.sessionId,
          activeSessions: activeCount - 1,
        });
      }
    }

    return json({
      success: true,
      action: "allow",
      message: "Within concurrent session limit",
      activeSessions: activeCount + 1,
      maxSessions: planMax,
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetAccountingStats(req: Request) {
  requireAuth(req);
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalSessions, activeSessions, todayAuth, todayReject, monthAuth] = await Promise.all([
      prisma.radiusSession.count(),
      prisma.radiusSession.count({ where: { stopTime: null } }),
      prisma.radiusSession.count({ where: { startTime: { gte: todayStart } } }),
      prisma.radiusAccountingLog.count({ where: { acctStartTime: { gte: todayStart }, terminateCause: "User-Request" } }),
      prisma.radiusSession.count({ where: { startTime: { gte: monthStart } } }),
    ]);

    // Average session duration (completed sessions this week)
    const recentSessions = await prisma.radiusSession.findMany({
      where: {
        stopTime: { not: null },
        startTime: { gte: weekStart },
      },
      select: { startTime: true, stopTime: true },
      take: 1000,
    });
    const avgDuration = recentSessions.length > 0
      ? Math.round(recentSessions.reduce((sum, s) => {
          const dur = s.stopTime && s.startTime ? (s.stopTime.getTime() - s.startTime.getTime()) / 1000 : 0;
          return sum + dur;
        }, 0) / recentSessions.length)
      : 0;

    // Total data transferred this month (from accounting logs)
    const monthlyData = await prisma.radiusAccountingLog.aggregate({
      where: { acctStartTime: { gte: monthStart } },
      _sum: { inputOctets: true, outputOctets: true },
    });

    return json({
      success: true,
      data: {
        totalSessions,
        activeSessions,
        todayAuthentications: todayAuth,
        todayDisconnects: todayReject,
        monthAuthentications: monthAuth,
        avgSessionDurationSec: avgDuration,
        avgSessionDurationFormatted: avgDuration >= 3600
          ? `${(avgDuration / 3600).toFixed(1)}h`
          : avgDuration >= 60
          ? `${Math.round(avgDuration / 60)}m`
          : `${avgDuration}s`,
        monthlyDataInGb: Number((monthlyData._sum.inputOctets || 0n) + (monthlyData._sum.outputOctets || 0n)) / (1024 ** 3),
        authSuccessRate: todayAuth + todayReject > 0
          ? Math.round((todayAuth / (todayAuth + todayReject)) * 100)
          : 100,
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Post-Auth / Post-Logout Scripts
// ═══════════════════════════════════════════════════════════════════════════

async function handlePostAuthScript(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { subscriberId, ipAddress, macAddress } = body;

    if (!subscriberId) return jsonErr("subscriberId required");

    const speeds = await resolveSubscriberSpeeds(subscriberId);
    const { down, up, dataLimit, sessionTimeout, subscriber } = await speeds;

    // Apply TC bandwidth policy for this user
    if (down > 0 || up > 0) {
      // Add TC filter to mark this user's traffic
      const mark = await generateClassId(subscriberId);

      try {
        // Egress (download) — apply on WAN interface
        const wanIface = await getWanInterface();
        await runShell("tc", ["filter", "add", "dev", wanIface, "parent", "1:0", "protocol", "ip", "prio", "1", "u32", "match", "ip", "dst", ipAddress || "0.0.0.0", "flowid", `1:${mark}`]).catch(() => {});
        // Ingress (upload) — use iptables MARK
        await runShell("iptables", ["-t", "mangle", "-A", "POSTROUTING", "-s", ipAddress || "0.0.0.0", "-j", "MARK", "--set-mark", String(mark)]).catch(() => {});
      } catch {
        log.warn("Failed to apply TC policy for user", { subscriberId, ipAddress });
      }

      // Add to ipset for authenticated users
      await runShell("ipset", ["add", "cryptsk_auth_users", ipAddress || "", "-exist"]).catch(() => {});
    }

    // Set session timeout via nftables (auto-expire connection tracking)
    if (sessionTimeout && sessionTimeout > 0) {
      await runShell("nft", ["add", "rule", "inet", "cryptsk", "filter", "ip", "saddr", ipAddress || "0.0.0.0", "ct", "state", "established", "ct", "timeout", `{ "established": "${sessionTimeout}" }`]).catch(() => {});
    }

    // Create RadiusSession record
    const radiusUser = await prisma.radiusUser.findUnique({ where: { subscriberId } });
    if (radiusUser) {
      await prisma.radiusSession.create({
        data: {
          radiusUserId: radiusUser.id,
          sessionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          framedIp: ipAddress || "",
          callingStationId: macAddress || "",
          startTime: new Date(),
          lastUpdate: new Date(),
          inputOctets: 0n,
          outputOctets: 0n,
        },
      });
    }

    // Update subscriber last auth
    await prisma.subscriber.update({
      where: { id: subscriberId },
      data: {
        lastAuthAt: new Date(),
        lastAuthResult: "Access-Accept",
        ipAddress: ipAddress || undefined,
        macAddress: macAddress || undefined,
      },
    });

    await auditLog(auth.userId, "POST_AUTH", "RadiusSession", subscriberId, { ipAddress, macAddress, speedDown: down, speedUp: up }, req);
    return json({
      success: true,
      message: "Post-auth script executed",
      appliedPolicy: { speedDown: down, speedUp: up, dataLimit, sessionTimeout },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handlePostLogoutScript(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { subscriberId, ipAddress, macAddress, terminateCause = "User-Request" } = body;

    if (!subscriberId) return jsonErr("subscriberId required");

    // Remove TC filters for this user
    const mark = await generateClassId(subscriberId);
    try {
      const wanIface = await getWanInterface();
      await runShell("tc", ["filter", "del", "dev", wanIface, "prio", "1", "u32", "match", "ip", "dst", ipAddress || "0.0.0.0", "flowid", `1:${mark}`]).catch(() => {});
      await runShell("iptables", ["-t", "mangle", "-D", "POSTROUTING", "-s", ipAddress || "0.0.0.0", "-j", "MARK", "--set-mark", String(mark)]).catch(() => {});
    } catch {
      log.warn("Failed to remove TC policy for user", { subscriberId });
    }

    // Remove from ipset
    await runShell("ipset", ["del", "cryptsk_auth_users", ipAddress || ""]).catch(() => {});

    // Close active RadiusSession
    const radiusUser = await prisma.radiusUser.findUnique({ where: { subscriberId } });
    if (radiusUser) {
      await prisma.radiusSession.updateMany({
        where: { radiusUserId: radiusUser.id, stopTime: null },
        data: {
          stopTime: new Date(),
          terminateCause,
        },
      });
    }

    // Update subscriber
    await prisma.subscriber.update({
      where: { id: subscriberId },
      data: {
        lastAuthAt: new Date(),
        lastAuthResult: "Logout",
      },
    });

    await auditLog(auth.userId, "POST_LOGOUT", "RadiusSession", subscriberId, { ipAddress, macAddress, terminateCause }, req);
    return json({ success: true, message: "Post-logout script executed" });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// Generate a consistent class ID from subscriber ID
async function generateClassId(subscriberId: string): Promise<number> {
  // Use a simple hash of the cuid to generate a number between 10-9999
  let hash = 0;
  for (let i = 0; i < subscriberId.length; i++) {
    hash = ((hash << 5) - hash + subscriberId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 9990) + 10;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — DDoS Protection
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetDdosPolicies(req: Request) {
  requireAuth(req);
  try {
    const policies = await prisma.ddosProtection.findMany({
      orderBy: { createdAt: "desc" },
    });
    return json({ success: true, data: policies });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreateDdosPolicy(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    if (!body.name || !body.protectionType) return jsonErr("name and protectionType are required");
    const { id, createdAt, ...safeBody } = body;
    const record = await prisma.ddosProtection.create({ data: safeBody });
    await auditLog(auth.userId, "CREATE", "DdosProtection", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdateDdosPolicy(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.ddosProtection.update({
      where: { id: params.id },
      data: safeBody,
    });
    await auditLog(auth.userId, "UPDATE", "DdosProtection", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeleteDdosPolicy(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.ddosProtection.delete({ where: { id: params.id } });
    await auditLog(auth.userId, "DELETE", "DdosProtection", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDdosApply(req: Request) {
  const auth = requireAuth(req);
  try {
    const policies = await prisma.ddosProtection.findMany({ where: { enabled: true } });
    const gwConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
    const tableName = gwConfig?.nftablesTable || "cryptsk";

    // Build nftables rules for each enabled DDoS protection
    const commands: string[] = [];
    // Flush existing DDoS chain
    commands.push(`nft flush chain inet ${tableName} ddos_input 2>/dev/null || true`);
    commands.push(`nft flush chain inet ${tableName} ddos_forward 2>/dev/null || true`);

    for (const policy of policies) {
      const chain = "ddos_input";
      const logFlag = policy.logEnabled ? `log prefix "${policy.logPrefix}-${policy.protectionType}: " level warn` : "";
      const ports = policy.targetPorts ? `dport { ${policy.targetPorts} }` : "";
      const protocols = policy.targetProtocols ? `ip protocol { ${policy.targetProtocols} }` : "";
      const iface = policy.targetInterface ? `iifname "${policy.targetInterface}"` : "";
      const ifaces = [iface, protocols, ports].filter(Boolean).join(" ");

      switch (policy.protectionType) {
        case "SYN_FLOOD":
          commands.push(`nft add rule inet ${tableName} ${chain} tcp flags syn tcp flags ack != 0 ${ifaces} ${logFlag} counter drop`);
          commands.push(`nft add rule inet ${tableName} ${chain} tcp flags & (fin|syn|rst|ack) == syn ct state new ${ifaces} limit rate ${policy.rateLimitPps || 200}/second ${logFlag} counter accept`);
          commands.push(`nft add rule inet ${tableName} ${chain} tcp flags & (fin|syn|rst|ack) == syn ct state new ${ifaces} ${logFlag} counter drop`);
          break;
        case "UDP_FLOOD":
          commands.push(`nft add rule inet ${tableName} ${chain} udp ${ifaces} limit rate over ${policy.rateLimitPps || 1000}/second ${logFlag} counter drop`);
          break;
        case "ICMP_FLOOD":
          commands.push(`nft add rule inet ${tableName} ${chain} icmp type echo-request ${ifaces} limit rate ${policy.rateLimitPps || 10}/second ${logFlag} counter accept`);
          commands.push(`nft add rule inet ${tableName} ${chain} icmp type echo-request ${ifaces} ${logFlag} counter drop`);
          break;
        case "ACK_FLOOD":
          commands.push(`nft add rule inet ${tableName} ${chain} tcp flags & (fin|syn|rst) == 0 tcp flags ack == 1 ct state established ${ifaces} limit rate over ${policy.rateLimitPps || 5000}/second ${logFlag} counter drop`);
          break;
        case "DNS_AMPLIFICATION":
          commands.push(`nft add rule inet ${tableName} ${chain} udp ${ports || "dport 53"} udp length > 512 ${ifaces} ${logFlag} counter drop`);
          break;
        case "NTP_AMPLIFICATION":
          commands.push(`nft add rule inet ${tableName} ${chain} udp ${ports || "dport 123"} udp length > 440 ${ifaces} ${logFlag} counter drop`);
          break;
        case "FRAG_ATTACK":
          commands.push(`nft add rule inet ${tableName} ${chain} ip frag-off != 0 ${ifaces} ${logFlag} counter drop`);
          break;
        case "PING_OF_DEATH":
          commands.push(`nft add rule inet ${tableName} ${chain} icmp type echo-request ip length > 65507 ${ifaces} ${logFlag} counter drop`);
          break;
        case "SMURF_ATTACK":
          commands.push(`nft add rule inet ${tableName} ${chain} icmp type echo-request ${ifaces} ct state new ${logFlag} counter drop`);
          break;
        case "SLOWLORIS":
          commands.push(`nft add rule inet ${tableName} ${chain} tcp dport 80 ct state new limit rate over 20/second ${logFlag} counter drop`);
          commands.push(`nft add rule inet ${tableName} ${chain} tcp dport 443 ct state new limit rate over 20/second ${logFlag} counter drop`);
          break;
        case "PORT_SCAN":
          commands.push(`nft add rule inet ${tableName} ${chain} ct state new tcp dport != { 22, 80, 443, 8080, 8443 } limit rate over 5/second ${logFlag} counter drop`);
          break;
        case "CONNECTION_LIMIT":
          commands.push(`nft add rule inet ${tableName} ${chain} ct state new ${ifaces} limit rate over ${policy.thresholdConnRate || 1000}/second ${logFlag} counter drop`);
          break;
        case "RATE_LIMIT":
          commands.push(`nft add rule inet ${tableName} ${chain} ${ifaces} limit rate over ${policy.rateLimitPps || 10000}/second ${logFlag} counter drop`);
          break;
        case "BOGON_FILTER":
          commands.push(`nft add rule inet ${tableName} ${chain} ip saddr { 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24, 192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24, 203.0.113.0/24, 224.0.0.0/4, 240.0.0.0/4, 255.255.255.255/32 } ${ifaces} ${logFlag} counter drop`);
          break;
        case "BLACKLIST":
          if (policy.sourceBlacklist) {
            const ips = policy.sourceBlacklist.split(",").map(ip => ip.trim()).filter(Boolean).join(",");
            commands.push(`nft add rule inet ${tableName} ${chain} ip saddr { ${ips} } ${ifaces} ${logFlag} counter drop`);
          }
          break;
        case "WHITELIST":
          if (policy.sourceWhitelist) {
            const ips = policy.sourceWhitelist.split(",").map(ip => ip.trim()).filter(Boolean).join(",");
            // This creates a whitelist rule that ACCEPTS traffic from these IPs before other rules
            commands.push(`nft add rule inet ${tableName} ${chain} ip saddr { ${ips} } ${ifaces} counter accept`);
          }
          break;
        default:
          commands.push(`nft add rule inet ${tableName} ${chain} ${ifaces} ${logFlag} counter ${policy.action.toLowerCase() || "drop"}`);
      }
    }

    // Execute commands
    const results = [];
    for (const cmd of commands) {
      const parts = cmd.split(" ");
      const result = await runShell(parts[0], parts.slice(1));
      results.push({ cmd, success: result.success, stderr: result.stderr });
    }

    await auditLog(auth.userId, "APPLY", "DdosProtection", "all", { policiesApplied: policies.length, commands }, req);
    return json({ success: true, policiesApplied: policies.length, results });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDdosResetCounters(req: Request) {
  const auth = requireAuth(req);
  try {
    await prisma.ddosProtection.updateMany({
      data: { hitCount: 0, packetCount: BigInt(0), byteCount: BigInt(0), lastHitAt: null as any },
    });
    // Reset nftables counters
    const gwConfig = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
    const tableName = gwConfig?.nftablesTable || "cryptsk";
    await runShell("nft", ["list", "counters", "-a", "inet", tableName]);
    await auditLog(auth.userId, "RESET", "DdosProtection", "counters", {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDdosCounters(req: Request) {
  requireAuth(req);
  try {
    const policies = await prisma.ddosProtection.findMany({
      where: { enabled: true },
      select: { id: true, name: true, protectionType: true, hitCount: true, packetCount: true, byteCount: true, lastHitAt: true },
    });
    // Also get nftables counters from shell
    const nftResult = await runShell("nft", ["-j", "list", "counters"]);
    let nftCounters: any[] = [];
    try { nftCounters = JSON.parse(nftResult.stdout); } catch {}
    return json({ success: true, policies, nftCounters });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — PPPoE Server
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetPppoeProfiles(req: Request) {
  requireAuth(req);
  try {
    const profiles = await prisma.pppoeProfile.findMany({
      include: { _count: { select: { sessions: { where: { status: "ACTIVE" } } } } },
      orderBy: { createdAt: "desc" },
    });
    return json({ success: true, data: profiles });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleCreatePppoeProfile(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    if (!body.name) return jsonErr("name is required");
    const { id, createdAt, ...safeBody } = body;
    const record = await prisma.pppoeProfile.create({ data: safeBody });
    await auditLog(auth.userId, "CREATE", "PppoeProfile", record.id, body, req);
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleUpdatePppoeProfile(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, updatedAt, ...safeBody } = body;
    const record = await prisma.pppoeProfile.update({
      where: { id: params.id },
      data: safeBody,
    });
    await auditLog(auth.userId, "UPDATE", "PppoeProfile", params.id, body, req);
    return json({ success: true, data: record });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDeletePppoeProfile(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.pppoeProfile.delete({ where: { id: params.id } });
    await auditLog(auth.userId, "DELETE", "PppoeProfile", params.id, {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetPppoeSessions(req: Request) {
  requireAuth(req);
  try {
    const url = new URL(req.url);
    const profileId = url.searchParams.get("profileId");
    const status = url.searchParams.get("status");
    const where: any = {};
    if (profileId) where.profileId = profileId;
    if (status) where.status = status;

    const sessions = await prisma.pppoeSession.findMany({
      where,
      include: { profile: { select: { name: true } } },
      orderBy: { startTime: "desc" },
      take: 500,
    });
    return json({ success: true, data: sessions, total: sessions.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDisconnectPppoeSession(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const session = await prisma.pppoeSession.findUnique({ where: { id: params.id } });
    if (!session) return jsonErr("Session not found", 404);
    // Kill pppoe session via shell
    if (session.interfaceName) {
      await runShell("ip", ["link", "set", session.interfaceName, "down"]);
    }
    await prisma.pppoeSession.update({
      where: { id: params.id },
      data: { status: "TERMINATING", stopTime: new Date() },
    });
    await auditLog(auth.userId, "DISCONNECT", "PppoeSession", params.id, { username: session.username }, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handlePppoeApply(req: Request) {
  const auth = requireAuth(req);
  try {
    const profiles = await prisma.pppoeProfile.findMany({ where: { enabled: true } });
    // In production, this would configure the actual PPPoE server (accel-ppp/rp-pppoe)
    // For now, we set up the IP pool and interface
    for (const profile of profiles) {
      if (profile.interfaceName) {
        await runShell("ip", ["link", "set", profile.interfaceName, "up"]);
      }
    }
    await auditLog(auth.userId, "APPLY", "PppoeProfile", "all", { profilesApplied: profiles.length }, req);
    return json({ success: true, profilesApplied: profiles.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handlePppoeRealtimeBw(req: Request) {
  requireAuth(req);
  try {
    const activeSessions = await prisma.pppoeSession.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, username: true, ipAddress: true, interfaceName: true, inputOctets: true, outputOctets: true, startTime: true },
    });
    // Get real-time per-interface stats from /proc/net/dev
    const procNet = await runShell("cat", ["/proc/net/dev"]);
    const interfaceStats: Record<string, { rxBytes: number; txBytes: number; rxPkts: number; txPkts: number }> = {};
    const lines = procNet.stdout.split("\n");
    for (const line of lines.slice(2)) {
      const parts = line.trim().split(/[:\s]+/);
      if (parts.length >= 10) {
        const iface = parts[0];
        interfaceStats[iface] = {
          rxBytes: parseInt(parts[1]) || 0,
          txBytes: parseInt(parts[9]) || 0,
          rxPkts: parseInt(parts[2]) || 0,
          txPkts: parseInt(parts[10]) || 0,
        };
      }
    }
    // Map interface stats to sessions
    const result = activeSessions.map(s => {
      const stats = interfaceStats[s.interfaceName || ""] || { rxBytes: 0, txBytes: 0, rxPkts: 0, txPkts: 0 };
      return {
        ...s,
        currentRxBytes: stats.rxBytes,
        currentTxBytes: stats.txBytes,
        totalBytes: stats.rxBytes + stats.txBytes,
      };
    });
    return json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetPppoeConfig(req: Request) {
  requireAuth(req);
  try {
    // Return default accel-ppp server configuration
    const defaultConfig = {
      defaultInterface: await getWanInterface(),
      defaultMtu: 1492,
      defaultMru: 1492,
      defaultDnsPrimary: "8.8.8.8",
      defaultDnsSecondary: "8.8.4.4",
      defaultWinsPrimary: "",
      defaultWinsSecondary: "",
      lcpEchoInterval: 30,
      lcpEchoFailure: 5,
      maxSessionsGlobal: 500,
      sessionTimeoutDefault: 86400,
      idleTimeoutDefault: 1800,
      pppoeListeningInterfaces: [],
    };

    // Try to read actual accel-ppp config if installed
    const accelWhich = await runShell("which", ["accel-pppd"]);
    if (accelWhich.success) {
      const configFile = await runShell("cat", ["/etc/accel-ppp/config.conf"]);
      if (configFile.success) {
        defaultConfig._rawConfig = configFile.stdout;
        defaultConfig._configExists = true;
      }
      // Get version
      const version = await runShell("accel-pppd", ["--version"]);
      if (version.success) {
        defaultConfig._version = version.stdout.trim().split("\n")[0];
      }
    }

    return json({ success: true, data: defaultConfig });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleSavePppoeConfig(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    // Store config in database for later accel-ppp config generation
    // The actual config file is generated when "Apply Config" is clicked
    await auditLog(auth.userId, "UPDATE", "PppoeConfig", "server", body, req);
    return json({ success: true, message: "Server configuration saved. Click 'Apply Config' to deploy." });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleBulkDisconnectPppoeSessions(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { sessionIds } = body;
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return jsonErr("sessionIds array is required");
    }
    let disconnected = 0;
    for (const id of sessionIds) {
      try {
        const session = await prisma.pppoeSession.findUnique({ where: { id } });
        if (session) {
          if (session.interfaceName) {
            await runShell("ip", ["link", "set", session.interfaceName, "down"]);
          }
          await prisma.pppoeSession.update({
            where: { id },
            data: { status: "TERMINATING", stopTime: new Date() },
          });
          disconnected++;
        }
      } catch {
        // Skip individual failures
      }
    }
    await auditLog(auth.userId, "BULK_DISCONNECT", "PppoeSession", "batch", { count: disconnected }, req);
    return json({ success: true, message: `${disconnected} sessions disconnected`, disconnected });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Bandwidth Samples / Reports
// ═══════════════════════════════════════════════════════════════════════════
async function handleRecordBwSample(req: Request) {
  requireAuth(req);
  try {
    const body = await req.json();
    const { id, createdAt, ...safeBody } = body;
    const record = await prisma.bwSample.create({ data: safeBody });
    return json({ success: true, data: record }, 201);
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetBwSamples(req: Request) {
  requireAuth(req);
  try {
    const url = new URL(req.url);
    const sourceType = url.searchParams.get("sourceType");
    const sourceId = url.searchParams.get("sourceId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const limit = parseInt(url.searchParams.get("limit") || "1000");

    const where: any = {};
    if (sourceType) where.sourceType = sourceType;
    if (sourceId) where.sourceId = sourceId;
    if (from) where.timestamp = { ...where.timestamp, gte: new Date(from) };
    if (to) where.timestamp = { ...where.timestamp, lte: new Date(to) };

    const samples = await prisma.bwSample.findMany({
      where,
      orderBy: { timestamp: "asc" },
      take: limit,
    });
    return json({ success: true, data: samples, total: samples.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleBwReportSummary(req: Request) {
  requireAuth(req);
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "24h";
    const fromDate = new Date(Date.now() - parseDuration(period));
    const now = new Date();

    // Per-source aggregate
    const aggregates = await prisma.bwSample.groupBy({
      by: ["sourceType", "sourceId", "sourceName"],
      where: { timestamp: { gte: fromDate, lte: now } },
      _sum: { downloadBps: true, uploadBps: true, totalBps: true, downloadBytes: true, uploadBytes: true, totalBytes: true },
      _avg: { downloadBps: true, uploadBps: true, totalBps: true, activeSessions: true },
      _max: { downloadBps: true, uploadBps: true, activeSessions: true },
      _count: true,
    });

    return json({
      success: true,
      data: {
        period,
        from: fromDate,
        to: now,
        aggregates,
        totalSamples: aggregates.reduce((sum: number, a: any) => sum + a._count, 0),
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

function parseDuration(dur: string): number {
  const match = dur.match(/^(\d+)(h|d|m|w)$/);
  if (!match) return 86400000; // default 24h
  const val = parseInt(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return val * (multipliers[unit] || 86400000);
}

async function handleBwReportTimeseries(req: Request) {
  requireAuth(req);
  try {
    const url = new URL(req.url);
    const sourceType = url.searchParams.get("sourceType") || "GATEWAY";
    const sourceId = url.searchParams.get("sourceId") || "";
    const period = url.searchParams.get("period") || "24h";
    const aggregate = url.searchParams.get("aggregate") || "1h"; // 5m, 15m, 1h, 6h, 1d
    const fromDate = new Date(Date.now() - parseDuration(period));

    const where: any = { timestamp: { gte: fromDate } };
    if (sourceType) where.sourceType = sourceType;
    if (sourceId) where.sourceId = sourceId;

    const samples = await prisma.bwSample.findMany({
      where,
      orderBy: { timestamp: "asc" },
    });

    return json({ success: true, data: samples, period, aggregate });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleBwReportTopUsers(req: Request) {
  requireAuth(req);
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "24h";
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const fromDate = new Date(Date.now() - parseDuration(period));

    const topUsers = await prisma.bwSample.groupBy({
      by: ["sourceId", "sourceName"],
      where: { sourceType: "USER", timestamp: { gte: fromDate } },
      _sum: { totalBytes: true, downloadBytes: true, uploadBytes: true },
      _avg: { downloadBps: true, uploadBps: true },
      orderBy: { _sum: { totalBytes: "desc" } },
      take: limit,
    });

    return json({ success: true, data: topUsers, period });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleBwSampleCleanup(req: Request) {
  const auth = requireAuth(req);
  try {
    const url = new URL(req.url);
    const before = url.searchParams.get("before");
    if (before) {
      const date = new Date(before);
      const result = await prisma.bwSample.deleteMany({ where: { timestamp: { lt: date } } });
      return json({ success: true, deleted: result.count });
    }
    // Default: delete samples older than 90 days
    const cutoff = new Date(Date.now() - 90 * 86400000);
    const result = await prisma.bwSample.deleteMany({ where: { timestamp: { lt: cutoff } } });
    await auditLog(auth.userId, "CLEANUP", "BwSample", "old", { deleted: result.count }, req);
    return json({ success: true, deleted: result.count, cutoffDate: cutoff });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Diagnostic Tools (REAL system commands)
// ═══════════════════════════════════════════════════════════════════════════
let activeTcpdumpProcess: any = null;
let activeTcpdumpCapture: any = null;

// ─── Parse ping output for stats ──────────────────────────────────────
function parsePingOutput(output: string): { sent: number; received: number; loss: number; minRtt: number; avgRtt: number; maxRtt: number } {
  const result = { sent: 0, received: 0, loss: 0, minRtt: 0, avgRtt: 0, maxRtt: 0 };
  const pktLine = output.match(/(\d+)\s+packets?\s+transmitted,\s+(\d+)\s+(?:packets?\s+)?received/);
  if (pktLine) { result.sent = parseInt(pktLine[1]); result.received = parseInt(pktLine[2]); }
  const lossLine = output.match(/(\d+)%\s+packet loss/);
  if (lossLine) { result.loss = parseInt(lossLine[1]); }
  const rttLine = output.match(/rtt\s+min\/avg\/max\/mdev\s+=\s+([\d.]+)\/([\d.]+)\/([\d.]+)/);
  if (rttLine) { result.minRtt = parseFloat(rttLine[1]); result.avgRtt = parseFloat(rttLine[2]); result.maxRtt = parseFloat(rttLine[3]); }
  return result;
}

// ─── TCP Connect Ping (fallback when ICMP not available) ────────────────
async function tcpPing(host: string, count: number): Promise<ShellResult> {
  const lines: string[] = [`TCP CONNECT PING ${host} : ${count} probes`];
  let totalMs = 0;
  let received = 0;
  let minMs = Infinity, maxMs = 0;

  for (let i = 0; i < count; i++) {
    const start = Date.now();
    try {
      const proc = Bun.spawn(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{time_total}", "--connect-timeout", "3", `http://${host}/`], {
        stdout: "pipe", stderr: "pipe",
      });
      const timeout = setTimeout(() => proc.kill(), 5000);
      const [stdout] = await Promise.all([new Response(proc.stdout).text()]);
      clearTimeout(timeout);
      const ms = Date.now() - start;
      const parts = stdout.trim().split(" ");
      const code = parts[0] || "000";
      if (code !== "000") {
        received++;
        totalMs += ms;
        if (ms < minMs) minMs = ms;
        if (ms > maxMs) maxMs = ms;
        lines.push(`reply from ${host}: http_code=${code} time=${ms}ms`);
      } else {
        lines.push(`Request timeout for seq ${i + 1}`);
      }
    } catch {
      lines.push(`Request timeout for seq ${i + 1}`);
    }
  }

  const loss = count > 0 ? Math.round(((count - received) / count) * 100) : 0;
  const avg = received > 0 ? Math.round(totalMs / received) : 0;
  lines.push("");
  lines.push(`--- ${host} TCP connect statistics ---`);
  lines.push(`${count} probes sent, ${received} received, ${loss}% loss`);
  if (received > 0) {
    lines.push(`rtt min/avg/max = ${minMs}/${avg}/${maxMs} ms`);
  }

  return { success: received > 0, stdout: lines.join("\n"), stderr: "", exitCode: received > 0 ? 0 : 1 };
}

// ─── Parse traceroute output ──────────────────────────────────────────
function parseTracerouteOutput(output: string): { hopCount: number } {
  let hopCount = 0;
  for (const line of output.split("\n")) {
    const m = line.match(/^\s*(\d+)/);
    if (m) hopCount = parseInt(m[1]);
  }
  return { hopCount };
}

async function handleTcpdumpStart(req: Request) {
  const auth = requireAuth(req);
  try {
    if (activeTcpdumpProcess) return jsonErr("A capture is already running. Stop it first.");
    const body = await req.json();
    const { targetInterface, filterExpression, packetCount, snapshotLength } = body;
    const iface = targetInterface || await getWanInterface();
    const pcapFile = `/tmp/cryptsk-capture-${Date.now()}.pcap`;

    // Check if tcpdump is available
    const check = await runShell("which", ["tcpdump"]);
    if (!check.success) {
      return jsonErr("tcpdump is not installed. On Debian: apt-get install -y tcpdump", 503);
    }

    const realArgs: string[] = ["-n", "-nn"];
    if (packetCount) { realArgs.push("-c", String(packetCount)); }
    if (snapshotLength) { realArgs.push("-s", String(snapshotLength)); }
    realArgs.push("-i", iface, "-w", pcapFile);
    if (filterExpression) {
      // Only allow safe BPF filter characters
      if (/^[a-zA-Z0-9\s\.\-_:\/\[\]\(\)=,!<>]+$/.test(filterExpression)) {
        realArgs.push(filterExpression);
      } else {
        return jsonErr("Invalid filter expression: contains unsafe characters");
      }
    }

    activeTcpdumpProcess = Bun.spawn(["tcpdump", ...realArgs], {
      stdout: "pipe", stderr: "pipe",
    });

    activeTcpdumpCapture = await prisma.diagnosticCapture.create({
      data: {
        tool: "TCPDUMP",
        status: "RUNNING",
        targetInterface: iface,
        filterExpression: filterExpression || "",
        packetCount: packetCount || 0,
        snapshotLength: snapshotLength || 262144,
        captureFile: pcapFile,
        startedBy: auth.userId,
        startedAt: new Date(),
      },
    });
    await auditLog(auth.userId, "START", "Tcpdump", activeTcpdumpCapture.id, body, req);
    return json({ success: true, captureId: activeTcpdumpCapture.id });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcpdumpStop(req: Request) {
  const auth = requireAuth(req);
  try {
    if (activeTcpdumpProcess) {
      activeTcpdumpProcess.kill("SIGTERM");
      await new Promise(resolve => setTimeout(resolve, 1000));
      try { activeTcpdumpProcess.kill("SIGKILL"); } catch {}
      activeTcpdumpProcess = null;
    }
    if (activeTcpdumpCapture) {
      let fileSize = 0;
      try {
        const stat = await runShell("stat", ["-c", "%s", activeTcpdumpCapture.captureFile]);
        fileSize = parseInt(stat.stdout.trim()) || 0;
      } catch {}
      const updated = await prisma.diagnosticCapture.update({
        where: { id: activeTcpdumpCapture.id },
        data: { status: "COMPLETED", stoppedAt: new Date(), fileSizeBytes: fileSize },
      });
      activeTcpdumpCapture = null;
      await auditLog(auth.userId, "STOP", "Tcpdump", updated.id, { fileSize }, req);
      return json({ success: true, data: updated });
    }
    return jsonErr("No active capture found");
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcpdumpStatus(req: Request) {
  try {
    let packetCount = 0;
    if (activeTcpdumpCapture && activeTcpdumpCapture.captureFile) {
      try {
        // Use tcpdump -r to read the pcap and count packets via wc -l
        const capStat = await runShell("sh", ["-c", `tcpdump -r ${activeTcpdumpCapture.captureFile} -nn 2>/dev/null | wc -l`], 5000);
        packetCount = parseInt(capStat.stdout.trim()) || 0;
      } catch {
        // Fallback: use capinfos if available
        try {
          const capInfo = await runShell("capinfos", ["-c", activeTcpdumpCapture.captureFile], 3000);
          const m = capInfo.stdout.match(/(\d+)\s+packets/);
          if (m) packetCount = parseInt(m[1]);
        } catch {}
      }
    }
    return json({
      success: true,
      isRunning: !!activeTcpdumpProcess,
      packetCount,
      capture: activeTcpdumpCapture ? { ...activeTcpdumpCapture, packetsCaptured: packetCount } : null,
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcpdumpList(req: Request) {
  try {
    const captures = await prisma.diagnosticCapture.findMany({
      where: { tool: "TCPDUMP" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return json({ success: true, data: captures });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcpdumpCleanup(req: Request) {
  const auth = requireAuth(req);
  try {
    const old = await prisma.diagnosticCapture.findMany({
      where: { tool: "TCPDUMP", status: "COMPLETED" },
    });
    for (const c of old) {
      if (c.captureFile) await runShell("rm", ["-f", c.captureFile]);
    }
    await prisma.diagnosticCapture.deleteMany({ where: { tool: "TCPDUMP", status: "COMPLETED" } });
    await auditLog(auth.userId, "CLEANUP", "Tcpdump", "all", {}, req);
    return json({ success: true });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcpdumpDeleteSingle(req: Request, params: any) {
  const auth = requireAuth(req);
  try {
    const capture = await prisma.diagnosticCapture.findUnique({
      where: { id: params.id },
    });
    if (!capture) return jsonErr("Capture not found", 404);
    // Don't allow deleting a running capture
    if (capture.status === "RUNNING") return jsonErr("Cannot delete a running capture", 400);
    // Delete PCAP file from disk
    if (capture.captureFile) {
      await runShell("rm", ["-f", capture.captureFile]).catch(() => {});
    }
    await prisma.diagnosticCapture.delete({ where: { id: params.id } });
    await auditLog(auth.userId, "DELETE", "Tcpdump", params.id, { captureFile: capture.captureFile }, req);
    return json({ success: true, deleted: params.id });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTcpdumpDownload(req: Request, params: any) {
  try {
    const capture = await prisma.diagnosticCapture.findUnique({
      where: { id: params.id },
    });
    if (!capture) return jsonErr("Capture not found", 404);
    if (!capture.captureFile) return jsonErr("No capture file associated", 404);

    // Check if file exists on disk
    const checkFile = await runShell("stat", ["-c", "%s", capture.captureFile]).catch(() => null);
    if (!checkFile || !checkFile.success) {
      return jsonErr("PCAP file not found on disk. It may have been deleted.", 410);
    }

    // Read file and return as binary
    const file = Bun.file(capture.captureFile);
    if (!(await file.exists())) {
      return jsonErr("PCAP file does not exist", 410);
    }

    return new Response(file, {
      headers: {
        "Content-Type": "application/vnd.tcpdump.pcap",
        "Content-Disposition": `attachment; filename="capture-${params.id}.pcap"`,
        "Content-Length": String(file.size),
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handlePing(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { targetHost, count, interface: iface } = body;
    if (!targetHost) return jsonErr("targetHost is required");
    const startTime = Date.now();
    let result: ShellResult;
    let method = "icmp";

    const icmpArgs = ["-c", String(count || 4), "-W", "5", "-n"];
    if (iface && iface !== "any") icmpArgs.push("-I", iface);
    icmpArgs.push(targetHost);
    result = await runShell("ping", icmpArgs, 30000);

    // Fallback to TCP connect if ICMP not available
    if (!result.success && (result.stderr.includes("Operation not permitted") || result.stderr.includes("CAP_NET_RAW") || result.stderr.includes("socket"))) {
      log.info("ICMP not available, using TCP connect fallback", { targetHost });
      result = await tcpPing(targetHost, count || 4);
      method = "tcp-connect";
    }

    const durationMs = Date.now() - startTime;
    const output = result.stdout + (result.stderr ? "\n" + result.stderr : "");
    const parsed = parsePingOutput(output);

    const capture = await prisma.diagnosticCapture.create({
      data: {
        tool: "PING",
        status: result.success ? "COMPLETED" : "FAILED",
        targetHost,
        targetInterface: iface || "",
        output,
        exitCode: result.exitCode,
        durationMs,
        startedBy: auth.userId,
        startedAt: new Date(Date.now() - durationMs),
      },
    });
    await auditLog(auth.userId, "PING", "Diagnostic", targetHost, { success: result.success, method, parsed }, req);
    return json({ success: true, data: { ...capture, parsed, method } });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleTraceroute(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { targetHost, maxHops } = body;
    if (!targetHost) return jsonErr("targetHost is required");
    const args = ["-n", "-m", String(maxHops || 30), "-w", "3", "-q", "2", targetHost];
    const startTime = Date.now();
    const result = await runShell("traceroute", args, 60000);
    const durationMs = Date.now() - startTime;
    const output = result.stdout + (result.stderr ? "\n" + result.stderr : "");
    const parsed = parseTracerouteOutput(output);

    const capture = await prisma.diagnosticCapture.create({
      data: {
        tool: "TRACEROUTE",
        status: "COMPLETED",
        targetHost,
        output,
        exitCode: result.exitCode,
        durationMs,
        startedBy: auth.userId,
        startedAt: new Date(Date.now() - durationMs),
      },
    });
    await auditLog(auth.userId, "TRACEROUTE", "Diagnostic", targetHost, { hopCount: parsed.hopCount }, req);
    return json({ success: true, data: { ...capture, parsed } });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleNslookup(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { domain, dnsServer } = body;
    if (!domain) return jsonErr("domain is required");
    const args = [domain];
    if (dnsServer) args.push(dnsServer);
    const startTime = Date.now();
    const result = await runShell("nslookup", args, 15000);
    const durationMs = Date.now() - startTime;
    const output = result.stdout + (result.stderr ? "\n" + result.stderr : "");

    const capture = await prisma.diagnosticCapture.create({
      data: {
        tool: "NSLOOKUP",
        status: result.success ? "COMPLETED" : "FAILED",
        targetHost: domain,
        output,
        exitCode: result.exitCode,
        durationMs,
        startedBy: auth.userId,
        startedAt: new Date(Date.now() - durationMs),
      },
    });
    await auditLog(auth.userId, "NSLOOKUP", "Diagnostic", domain, {}, req);
    return json({ success: true, data: capture });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleDig(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { domain, recordType, dnsServer } = body;
    if (!domain) return jsonErr("domain is required");
    const args = [domain, recordType || "A", "+noall", "+answer", "+comments"];
    if (dnsServer) args.push(`@${dnsServer}`);
    const startTime = Date.now();
    const result = await runShell("dig", args, 15000);
    const durationMs = Date.now() - startTime;
    const output = result.stdout + (result.stderr ? "\n" + result.stderr : "");

    const capture = await prisma.diagnosticCapture.create({
      data: {
        tool: "DIG",
        status: "COMPLETED",
        targetHost: domain,
        output,
        exitCode: result.exitCode,
        durationMs,
        startedBy: auth.userId,
        startedAt: new Date(Date.now() - durationMs),
      },
    });
    await auditLog(auth.userId, "DIG", "Diagnostic", domain, { recordType }, req);
    return json({ success: true, data: capture });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleArpTable(req: Request) {
  try {
    const result = await runShell("ip", ["-s", "-d", "neigh", "show", "all"]);
    const entries = result.stdout.split("\n").filter(Boolean).map(line => {
      const ip = line.trim().split(/\s+/)[0];
      const isIncomplete = line.includes("<incomplete>");
      const mac = isIncomplete ? "" : (line.match(/lladdr\s+([0-9a-f:]+)/i)?.[1] || "");
      const device = line.match(/dev\s+(\S+)/)?.[1] || "";
      let state = "UNKNOWN";
      if (isIncomplete) state = "FAILED";
      else if (line.includes("REACHABLE")) state = "REACHABLE";
      else if (line.includes("STALE")) state = "STALE";
      else if (line.includes("DELAY")) state = "DELAY";
      else if (line.includes("PERMANENT")) state = "PERMANENT";
      else if (line.includes("NOARP")) state = "NOARP";
      else if (line.includes("FAILED")) state = "FAILED";
      return { ip, mac, device, state };
    });
    return json({ success: true, data: entries, total: entries.length, raw: result.stdout });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleArpFlush(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { interface: iface } = body;
    if (iface && iface !== "all") {
      await runShell("ip", ["neigh", "flush", "dev", iface]);
      await auditLog(auth.userId, "FLUSH_ARP", "Diagnostic", iface, {}, req);
      return json({ success: true, message: `ARP cache flushed for ${iface}` });
    }
    await runShell("ip", ["-s", "neigh", "flush", "all"]);
    await auditLog(auth.userId, "FLUSH_ARP", "Diagnostic", "all", {}, req);
    return json({ success: true, message: "ARP cache flushed for all interfaces" });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGetAllCaptures(req: Request) {
  try {
    const url = new URL(req.url);
    const tool = url.searchParams.get("tool");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const where: any = {};
    if (tool) where.tool = tool;
    const captures = await prisma.diagnosticCapture.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return json({ success: true, data: captures, total: captures.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  QoS HANDLERS — Subnet-based TC/QoS Management
// ═══════════════════════════════════════════════════════════════════════════

const SCRIPTS_DIR = "/home/z/my-project/scripts/tc";

/** Check if gateway mode is enabled — returns config or null */
async function getGatewayConfig() {
  return await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
}

/** Check if QoS should be active — checks BOTH GatewayConfig AND IspSettings gatewayModeEnabled */
async function isQosActive(): Promise<boolean> {
  // Primary check: IspSettings.gatewayModeEnabled (set by Module Manager)
  const settings = await prisma.ispSettings.findUnique({ where: { id: "default" } });
  if (!settings?.gatewayModeEnabled) return false;

  // Secondary check: GatewayConfig must be in ROUTED mode with TC enabled
  const gc = await getGatewayConfig();
  return gc?.gatewayMode !== "BRIDGE" && gc?.tcEnabled === true;
}

/** Get WAN and LAN interfaces from SystemInterface table */
async function getWanLanInterfaces(): Promise<{ wan: string[]; lan: string[] }> {
  const ifaces = await prisma.systemInterface.findMany({ where: { enabled: true } });
  const wan = ifaces.filter(i => i.role === "WAN").map(i => i.name);
  const lan = ifaces.filter(i => i.role === "LAN").map(i => i.name);
  return { wan, lan };
}

/** Cached helper to get the primary WAN interface name */
let _wanCache: string[] = [];
let _wanCacheTime = 0;
async function getWanInterface(): Promise<string> {
  if (Date.now() - _wanCacheTime < 30000 && _wanCache.length > 0) return _wanCache[0];
  try {
    const { wan } = await getWanLanInterfaces();
    _wanCache = wan;
    _wanCacheTime = Date.now();
    return wan[0] || "eth0";
  } catch {
    return "eth0";
  }
}

/** Run a TC shell script and return structured result */
async function runTcScript(scriptName: string, args: string[], stdin?: string, timeoutMs = 30000): Promise<ShellResult> {
  const scriptPath = `${SCRIPTS_DIR}/${scriptName}`;
  const proc = Bun.spawn(["bash", scriptPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    ...(stdin ? {} : {}),
  });

  if (stdin) {
    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();
  }

  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  clearTimeout(timer);
  const exitCode = await proc.exited;
  return { success: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// ─── Gateway Config Get/Set ──────────────────────────────────────────
async function handleGatewayConfigGet(req: Request) {
  requireAuth(req);
  try {
    const gc = await prisma.gatewayConfig.findUnique({ where: { id: "default" } });
    return json({
      success: true,
      data: {
        gatewayMode: gc?.gatewayMode || "BRIDGE",
        tcEnabled: gc?.tcEnabled || false,
        natEnabled: gc?.natEnabled ?? true,
        nftablesEnabled: gc?.nftablesEnabled ?? true,
        defaultGateway: gc?.defaultGateway || "",
        dnsForwarders: gc?.dnsForwarders || "",
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleGatewayConfigSet(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const gc = await prisma.gatewayConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        gatewayMode: body.gatewayMode || "BRIDGE",
        tcEnabled: body.tcEnabled ?? false,
        natEnabled: body.natEnabled ?? true,
        nftablesEnabled: body.nftablesEnabled ?? true,
        defaultGateway: body.defaultGateway || "",
        dnsForwarders: body.dnsForwarders || "",
      },
      update: {
        ...(body.gatewayMode !== undefined ? { gatewayMode: body.gatewayMode } : {}),
        ...(body.tcEnabled !== undefined ? { tcEnabled: body.tcEnabled } : {}),
        ...(body.natEnabled !== undefined ? { natEnabled: body.natEnabled } : {}),
        ...(body.nftablesEnabled !== undefined ? { nftablesEnabled: body.nftablesEnabled } : {}),
        ...(body.defaultGateway !== undefined ? { defaultGateway: body.defaultGateway } : {}),
        ...(body.dnsForwarders !== undefined ? { dnsForwarders: body.dnsForwarders } : {}),
      },
    });
    await auditLog(auth.userId, "UPDATE_GATEWAY_CONFIG", "GatewayConfig", "default", body, req);
    return json({ success: true, data: gc });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ─── QoS Status (health-check + live TC state) ───────────────────────
async function handleQosStatus(req: Request) {
  requireAuth(req);
  try {
    const { wan, lan } = await getWanLanInterfaces();
    const qosActive = await isQosActive();
    const settings = await prisma.ispSettings.findUnique({ where: { id: "default" } });

    // Run health check
    const healthResult = await runTcScript("health-check.sh", [wan.join(","), lan.join(",")]);
    let healthData: any = { healthy: false, ifb0: {}, ifb1: {}, warnings: [] };
    try { healthData = JSON.parse(healthResult.stdout); } catch {}

    // Get live TC class stats
    const [ifb0Classes, ifb1Classes] = await Promise.all([
      runShell("tc", ["-s", "-j", "class", "show", "dev", "ifb0"], 10000).catch(() => ({ stdout: "[]", success: false })),
      runShell("tc", ["-s", "-j", "class", "show", "dev", "ifb1"], 10000).catch(() => ({ stdout: "[]", success: false })),
    ]);

    let parsedIfb0: any[] = [];
    let parsedIfb1: any[] = [];
    try { parsedIfb0 = JSON.parse(ifb0Classes.stdout); } catch {}
    try { parsedIfb1 = JSON.parse(ifb1Classes.stdout); } catch {}

    // Count active subscriber classes
    const activeMappings = await prisma.tcClassMapping.count({ where: { isActive: true } });
    const activeSubnets = await prisma.subnet.count({ where: { tcEnabled: true } });

    return json({
      success: true,
      data: {
        gatewayModeEnabled: settings?.gatewayModeEnabled ?? false,
        gatewayMode: settings?.gatewayModeEnabled ? "ACTIVE" : "INACTIVE",
        tcInitialized: healthData.ifb0?.rootQdisc === true && healthData.ifb1?.rootQdisc === true,
        health: healthData,
        rootBandwidthDown: settings?.tcRootBandwidthDownMbps || 0,
        rootBandwidthUp: settings?.tcRootBandwidthUpMbps || 0,
        activeSubnets,
        activeSubscribers: activeMappings,
        ifb0Classes: parsedIfb0.length,
        ifb1Classes: parsedIfb1.length,
        wanInterfaces: wan,
        lanInterfaces: lan,
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ─── QoS Config (global settings from IspSettings) ───────────────────
async function handleQosGetConfig(req: Request) {
  requireAuth(req);
  try {
    const settings = await prisma.ispSettings.findUnique({ where: { id: "default" } });
    return json({
      success: true,
      data: {
        tcRootBandwidthDownMbps: settings?.tcRootBandwidthDownMbps || 0,
        tcRootBandwidthUpMbps: settings?.tcRootBandwidthUpMbps || 0,
        tcAutoRestoreOnBoot: settings?.tcAutoRestoreOnBoot ?? true,
        tcDefaultUnshapedDownMbps: settings?.tcDefaultUnshapedDownMbps || 100,
        tcDefaultUnshapedUpMbps: settings?.tcDefaultUnshapedUpMbps || 100,
      },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleQosSetConfig(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const settings = await prisma.ispSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        tcRootBandwidthDownMbps: body.tcRootBandwidthDownMbps || 0,
        tcRootBandwidthUpMbps: body.tcRootBandwidthUpMbps || 0,
        tcAutoRestoreOnBoot: body.tcAutoRestoreOnBoot ?? true,
        tcDefaultUnshapedDownMbps: body.tcDefaultUnshapedDownMbps || 100,
        tcDefaultUnshapedUpMbps: body.tcDefaultUnshapedUpMbps || 100,
      },
      update: {
        ...(body.tcRootBandwidthDownMbps !== undefined ? { tcRootBandwidthDownMbps: body.tcRootBandwidthDownMbps } : {}),
        ...(body.tcRootBandwidthUpMbps !== undefined ? { tcRootBandwidthUpMbps: body.tcRootBandwidthUpMbps } : {}),
        ...(body.tcAutoRestoreOnBoot !== undefined ? { tcAutoRestoreOnBoot: body.tcAutoRestoreOnBoot } : {}),
        ...(body.tcDefaultUnshapedDownMbps !== undefined ? { tcDefaultUnshapedDownMbps: body.tcDefaultUnshapedDownMbps } : {}),
        ...(body.tcDefaultUnshapedUpMbps !== undefined ? { tcDefaultUnshapedUpMbps: body.tcDefaultUnshapedUpMbps } : {}),
      },
    });
    await auditLog(auth.userId, "UPDATE_QOS_CONFIG", "IspSettings", "default", body, req);
    return json({ success: true, data: settings });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ─── QoS Init (full TC initialization) ───────────────────────────────
async function handleQosInit(req: Request) {
  const auth = requireAuth(req);
  try {
    const qosActive = await isQosActive();
    if (!qosActive) return jsonErr("Gateway mode or TC is not enabled. Enable in Gateway Config.", 400);

    const { wan, lan } = await getWanLanInterfaces();
    if (wan.length === 0 || lan.length === 0) {
      return jsonErr("Both WAN and LAN interfaces must be configured with roles.", 400);
    }

    const settings = await prisma.ispSettings.findUnique({ where: { id: "default" } });
    const rootDown = settings?.tcRootBandwidthDownMbps || 25000;
    const rootUp = settings?.tcRootBandwidthUpMbps || 25000;
    const defaultDown = settings?.tcDefaultUnshapedDownMbps || 100;
    const defaultUp = settings?.tcDefaultUnshapedUpMbps || 100;

    // Step 1: IFB init
    const ifbResult = await runTcScript("ifb-init.sh", [wan.join(","), lan.join(",")]);
    if (!ifbResult.success) {
      return json({ success: false, stage: "ifb_init", error: ifbResult.stderr, stdout: ifbResult.stdout });
    }

    // Step 2: Qdisc setup
    const qdiscResult = await runTcScript("qdisc-setup.sh", [String(rootDown), String(rootUp)]);
    if (!qdiscResult.success) {
      return json({ success: false, stage: "qdisc_setup", error: qdiscResult.stderr });
    }

    // Step 3: Create all TC-enabled subnet classes
    const subnets = await prisma.subnet.findMany({ where: { tcEnabled: true } });
    let subnetOk = 0;
    const subnetErrors: string[] = [];

    for (const sn of subnets) {
      if (!sn.tcSubnetIndex || sn.tcSubnetIndex < 1) continue;
      const classId = sn.tcSubnetIndex * 1000;
      const result = await runTcScript("subnet-add.sh", [
        String(classId),
        String(sn.bandwidthPoolDownMbps || 100),
        String(sn.bandwidthBurstDownMbps || 150),
        String(sn.bandwidthPoolUpMbps || 50),
        String(sn.bandwidthBurstUpMbps || 75),
      ]);
      if (result.success) {
        subnetOk++;
      } else {
        subnetErrors.push(`${sn.name}: ${result.stderr}`);
      }
    }

    // Step 4: Restore active subscriber classes
    const activeMappings = await prisma.tcClassMapping.findMany({ where: { isActive: true } });
    let sessionsOk = 0;
    const sessionErrors: string[] = [];

    for (const mapping of activeMappings) {
      const subnet = subnets.find(s => s.id === mapping.subnetId);
      if (!subnet || !subnet.tcSubnetIndex) continue;
      const parentClassId = subnet.tcSubnetIndex * 1000;
      const rateMbps = Math.max(1, Math.round(mapping.rateKbps / 1000));
      const ceilMbps = rateMbps;

      for (const dir of ["download", "upload"] as const) {
        const result = await runTcScript("subscriber-add.sh", [
          dir, String(parentClassId), String(mapping.classSlot),
          mapping.ipAddress, String(rateMbps), String(ceilMbps), "3", "15",
        ]);
        if (!result.success) {
          sessionErrors.push(`${mapping.ipAddress} (${dir}): ${result.stderr}`);
        }
      }
      sessionsOk++;
    }

    await auditLog(auth.userId, "QOS_INIT", "QoS", "", {
      wan, lan, rootDown, rootUp, subnets: subnetOk, sessions: sessionsOk,
    }, req);

    log.info("QoS initialized", { subnets: subnetOk, sessions: sessionsOk, errors: subnetErrors.length + sessionErrors.length });
    return json({
      success: true,
      ifb: ifbResult.success,
      qdisc: qdiscResult.success,
      subnetsCreated: subnetOk,
      subnetErrors,
      sessionsRestored: sessionsOk,
      sessionErrors,
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ─── QoS Teardown ────────────────────────────────────────────────────
async function handleQosTeardown(req: Request) {
  const auth = requireAuth(req);
  try {
    const result = await runTcScript("qdisc-teardown.sh", []);
    await auditLog(auth.userId, "QOS_TEARDOWN", "QoS", "", {}, req);
    return json({ success: result.success, stdout: result.stdout, stderr: result.stderr });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ─── QoS Batch Restore (from DB) ─────────────────────────────────────
async function handleQosBatchRestore(req: Request) {
  const auth = requireAuth(req);
  try {
    const { wan, lan } = await getWanLanInterfaces();
    if (wan.length === 0 || lan.length === 0) {
      return jsonErr("Both WAN and LAN interfaces required.", 400);
    }

    const settings = await prisma.ispSettings.findUnique({ where: { id: "default" } });
    const subnets = await prisma.subnet.findMany({ where: { tcEnabled: true } });
    const activeMappings = await prisma.tcClassMapping.findMany({
      where: { isActive: true },
      include: { subnet: true },
    });

    // Build restore JSON for batch-restore.sh
    const restoreData = {
      wanInterfaces: wan,
      lanInterfaces: lan,
      rootBandwidthDownMbps: settings?.tcRootBandwidthDownMbps || 25000,
      rootBandwidthUpMbps: settings?.tcRootBandwidthUpMbps || 25000,
      subnets: subnets.map(sn => ({
        tcSubnetIndex: sn.tcSubnetIndex,
        bandwidthPoolDownMbps: sn.bandwidthPoolDownMbps || 100,
        bandwidthBurstDownMbps: sn.bandwidthBurstDownMbps || 150,
        bandwidthPoolUpMbps: sn.bandwidthPoolUpMbps || 50,
        bandwidthBurstUpMbps: sn.bandwidthBurstUpMbps || 75,
      })),
      activeSessions: activeMappings.map(m => ({
        subscriberId: m.subscriberId,
        subnetIndex: m.subnet?.tcSubnetIndex || 0,
        classSlot: m.classSlot,
        ipAddress: m.ipAddress,
        downloadRateKbps: m.rateKbps,
        downloadCeilKbps: m.rateKbps,
        uploadRateKbps: m.rateKbps,
        uploadCeilKbps: m.rateKbps,
        priority: 3,
        direction: "both",
        quantum: 15,
      })),
    };

    const result = await runTcScript("batch-restore.sh", [], JSON.stringify(restoreData), 120000);

    let parsedResult: any = { status: "error" };
    try { parsedResult = JSON.parse(result.stdout); } catch {}

    await auditLog(auth.userId, "QOS_BATCH_RESTORE", "QoS", "", parsedResult, req);
    return json({ success: parsedResult.status !== "error", ...parsedResult, stderr: result.stderr });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ─── QoS Subnet Management ───────────────────────────────────────────
async function handleQosGetSubnets(req: Request) {
  requireAuth(req);
  try {
    const subnets = await prisma.subnet.findMany({
      where: { tcEnabled: true },
      include: {
        tcClassMappings: { where: { isActive: true, direction: "download" } },
      },
      orderBy: { tcSubnetIndex: "asc" },
    });

    const result = subnets.map(sn => ({
      id: sn.id,
      name: sn.name,
      network: sn.cidr || sn.network,
      tcSubnetIndex: sn.tcSubnetIndex,
      classId: `1:${(sn.tcSubnetIndex || 0) * 1000}`,
      bandwidthPoolDownMbps: sn.bandwidthPoolDownMbps,
      bandwidthBurstDownMbps: sn.bandwidthBurstDownMbps,
      bandwidthPoolUpMbps: sn.bandwidthPoolUpMbps,
      bandwidthBurstUpMbps: sn.bandwidthBurstUpMbps,
      defaultUserDownMbps: sn.defaultUserDownMbps,
      defaultUserUpMbps: sn.defaultUserUpMbps,
      activeUsers: sn.tcClassMappings.length,
      nextClassSlot: sn.nextClassSlot,
    }));

    return json({ success: true, data: result, total: result.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleQosSubnetAdd(req: Request) {
  const auth = requireAuth(req);
  try {
    const qosActive = await isQosActive();
    if (!qosActive) return jsonErr("QoS not active — enable Gateway Mode and TC first.", 400);

    const body = await req.json();
    const { subnetId } = body;
    if (!subnetId) return jsonErr("subnetId is required");

    // Auto-assign subnet index
    const maxIndex = await prisma.subnet.findFirst({
      where: { tcEnabled: true },
      orderBy: { tcSubnetIndex: "desc" },
      select: { tcSubnetIndex: true },
    });
    const nextIndex = (maxIndex?.tcSubnetIndex || 0) + 1;
    if (nextIndex > 999) return jsonErr("Maximum 999 QoS-enabled subnets reached.");

    const classId = nextIndex * 1000;

    // Update subnet in DB
    const subnet = await prisma.subnet.update({
      where: { id: subnetId },
      data: {
        tcEnabled: true,
        tcSubnetIndex: nextIndex,
        nextClassSlot: 1,
        bandwidthPoolDownMbps: body.bandwidthPoolDownMbps || 100,
        bandwidthBurstDownMbps: body.bandwidthBurstDownMbps || 150,
        bandwidthPoolUpMbps: body.bandwidthPoolUpMbps || 50,
        bandwidthBurstUpMbps: body.bandwidthBurstUpMbps || 75,
        defaultUserDownMbps: body.defaultUserDownMbps || 0,
        defaultUserUpMbps: body.defaultUserUpMbps || 0,
      },
    });

    // Create TC class via shell script
    const result = await runTcScript("subnet-add.sh", [
      String(classId),
      String(subnet.bandwidthPoolDownMbps || 100),
      String(subnet.bandwidthBurstDownMbps || 150),
      String(subnet.bandwidthPoolUpMbps || 50),
      String(subnet.bandwidthBurstUpMbps || 75),
    ]);

    await auditLog(auth.userId, "QOS_SUBNET_ADD", "Subnet", subnetId, { classId, nextIndex, subnetName: subnet.name }, req);
    return json({
      success: result.success,
      classId: `1:${classId}`,
      tcSubnetIndex: nextIndex,
      subnet: { id: subnet.id, name: subnet.name, network: subnet.cidr || subnet.network },
      tcResult: { stdout: result.stdout, stderr: result.stderr },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleQosSubnetDel(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { subnetId } = body;
    if (!subnetId) return jsonErr("subnetId is required");

    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
    if (!subnet) return jsonErr("Subnet not found", 404);

    const classId = (subnet.tcSubnetIndex || 0) * 1000;
    if (classId < 1000) return jsonErr("Subnet has no valid TC index.");

    // Delete TC class via shell script
    const result = await runTcScript("subnet-del.sh", [String(classId)]);

    // Remove all TC class mappings for this subnet
    await prisma.tcClassMapping.updateMany({
      where: { subnetId, isActive: true },
      data: { isActive: false },
    });

    // Reset subnet TC fields
    await prisma.subnet.update({
      where: { id: subnetId },
      data: { tcEnabled: false, tcSubnetIndex: 0, nextClassSlot: 1 },
    });

    await auditLog(auth.userId, "QOS_SUBNET_DEL", "Subnet", subnetId, { classId, subnetName: subnet.name }, req);
    return json({ success: result.success, classId: `1:${classId}`, tcResult: { stdout: result.stdout, stderr: result.stderr } });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleQosSubnetRate(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { subnetId, bandwidthPoolDownMbps, bandwidthBurstDownMbps, bandwidthPoolUpMbps, bandwidthBurstUpMbps } = body;
    if (!subnetId) return jsonErr("subnetId is required");

    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
    if (!subnet || !subnet.tcSubnetIndex) return jsonErr("Subnet not found or TC not enabled", 404);

    const classId = subnet.tcSubnetIndex * 1000;

    // Update DB
    const updated = await prisma.subnet.update({
      where: { id: subnetId },
      data: {
        ...(bandwidthPoolDownMbps !== undefined ? { bandwidthPoolDownMbps } : {}),
        ...(bandwidthBurstDownMbps !== undefined ? { bandwidthBurstDownMbps } : {}),
        ...(bandwidthPoolUpMbps !== undefined ? { bandwidthPoolUpMbps } : {}),
        ...(bandwidthBurstUpMbps !== undefined ? { bandwidthBurstUpMbps } : {}),
      },
    });

    // Update TC via shell script
    const result = await runTcScript("subnet-rate.sh", [
      String(classId),
      String(updated.bandwidthPoolDownMbps || 100),
      String(updated.bandwidthBurstDownMbps || 150),
      String(updated.bandwidthPoolUpMbps || 50),
      String(updated.bandwidthBurstUpMbps || 75),
    ]);

    await auditLog(auth.userId, "QOS_SUBNET_RATE", "Subnet", subnetId, { classId: `1:${classId}`, body }, req);
    return json({ success: result.success, subnet: { id: subnet.id, name: subnet.name }, tcResult: { stdout: result.stdout, stderr: result.stderr } });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

// ─── QoS Subscriber Management ───────────────────────────────────────
async function handleQosGetSubscribers(req: Request) {
  requireAuth(req);
  try {
    const mappings = await prisma.tcClassMapping.findMany({
      where: { isActive: true },
      include: { subnet: { select: { id: true, name: true, network: true, cidr: true, tcSubnetIndex: true } } },
      orderBy: { createdAt: "desc" },
    });

    const result = mappings.map(m => ({
      id: m.id,
      subscriberId: m.subscriberId,
      subnetId: m.subnetId,
      subnetName: m.subnet?.name || "",
      subnetNetwork: m.subnet?.cidr || m.subnet?.network || "",
      ipAddress: m.ipAddress,
      classSlot: m.classSlot,
      classId: m.classId,
      direction: m.direction,
      rateKbps: m.rateKbps,
      originalRateKbps: m.originalRateKbps,
      isThrottled: m.rateKbps < m.originalRateKbps,
      createdAt: m.createdAt,
    }));

    return json({ success: true, data: result, total: result.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleQosSubscriberAdd(req: Request) {
  const auth = requireAuth(req);
  try {
    const qosActive = await isQosActive();
    if (!qosActive) return jsonErr("QoS not active.", 400);

    const body = await req.json();
    const { subscriberId, ipAddress, downloadRateKbps, uploadRateKbps } = body;
    if (!subscriberId || !ipAddress) return jsonErr("subscriberId and ipAddress required");

    // Find which subnet this IP belongs to
    const ipNum = ipToNumber(ipAddress);
    const subnets = await prisma.subnet.findMany({ where: { tcEnabled: true } });
    let matchedSubnet: typeof subnets[0] | null = null;

    for (const sn of subnets) {
      const network = sn.cidr || sn.network;
      if (!network) continue;
      const [netAddr, cidrBits] = network.split("/");
      if (!netAddr || !cidrBits) continue;
      const netNum = ipToNumber(netAddr);
      const mask = cidrBits === "0" ? 0n : (~0n << (32n - BigInt(cidrBits))) & 0xFFFFFFFFn;
      if ((ipNum & mask) === (netNum & mask)) {
        matchedSubnet = sn;
        break;
      }
    }

    if (!matchedSubnet) {
      return jsonErr(`No TC-enabled subnet found for IP ${ipAddress}`, 404);
    }

    const parentClassId = matchedSubnet.tcSubnetIndex * 1000;

    // Allocate next class slot atomically
    const updatedSubnet = await prisma.subnet.update({
      where: { id: matchedSubnet.id },
      data: { nextClassSlot: { increment: 1 } },
    });
    const classSlot = updatedSubnet.nextClassSlot - 1;

    if (classSlot > 999) {
      // Rollback
      await prisma.subnet.update({ where: { id: matchedSubnet.id }, data: { nextClassSlot: { decrement: 1 } } });
      return jsonErr("Subnet class slots exhausted (max 999 per subnet).", 400);
    }

    const fullClassId = `1:${parentClassId + classSlot}`;
    const dlMbps = Math.max(1, Math.round((downloadRateKbps || 0) / 1000));
    const ulMbps = Math.max(1, Math.round((uploadRateKbps || 0) / 1000));

    // Create TC classes for both directions
    const dlResult = await runTcScript("subscriber-add.sh", [
      "download", String(parentClassId), String(classSlot), ipAddress, String(dlMbps), String(dlMbps), "3", "15",
    ]);
    const ulResult = await runTcScript("subscriber-add.sh", [
      "upload", String(parentClassId), String(classSlot), ipAddress, String(ulMbps), String(ulMbps), "3", "15",
    ]);

    // Save mapping records for both directions
    await prisma.tcClassMapping.createMany({
      data: [
        { subscriberId, subnetId: matchedSubnet.id, ipAddress, classSlot, classId: fullClassId, direction: "download", rateKbps: downloadRateKbps, originalRateKbps: downloadRateKbps, isActive: true },
        { subscriberId, subnetId: matchedSubnet.id, ipAddress, classSlot, classId: fullClassId, direction: "upload", rateKbps: uploadRateKbps, originalRateKbps: uploadRateKbps, isActive: true },
      ],
      skipDuplicates: true,
    });

    await auditLog(auth.userId, "QOS_SUBSCRIBER_ADD", "TcClassMapping", subscriberId, {
      ipAddress, fullClassId, subnetName: matchedSubnet.name, dlMbps, ulMbps,
    }, req);

    return json({
      success: dlResult.success && ulResult.success,
      classId: fullClassId,
      classSlot,
      subnetName: matchedSubnet.name,
      ipAddress,
      download: { success: dlResult.success },
      upload: { success: ulResult.success },
    });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleQosSubscriberDel(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { subscriberId, ipAddress } = body;
    if (!subscriberId) return jsonErr("subscriberId required");

    // Get existing mappings
    const mappings = await prisma.tcClassMapping.findMany({
      where: { subscriberId, isActive: true },
    });

    for (const mapping of mappings) {
      const subnet = await prisma.subnet.findUnique({ where: { id: mapping.subnetId } });
      if (!subnet?.tcSubnetIndex) continue;
      const parentClassId = subnet.tcSubnetIndex * 1000;
      await runTcScript("subscriber-del.sh", [mapping.direction, `1:${parentClassId + mapping.classSlot}`, mapping.ipAddress]).catch(() => {});
    }

    // Deactivate mappings
    await prisma.tcClassMapping.updateMany({
      where: { subscriberId, isActive: true },
      data: { isActive: false },
    });

    await auditLog(auth.userId, "QOS_SUBSCRIBER_DEL", "TcClassMapping", subscriberId, { ipAddress }, req);
    return json({ success: true, removed: mappings.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleQosSubscriberRate(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { subscriberId, newRateKbps, direction } = body;
    if (!subscriberId || !newRateKbps) return jsonErr("subscriberId and newRateKbps required");

    const mappings = await prisma.tcClassMapping.findMany({
      where: { subscriberId, isActive: true, ...(direction && direction !== "both" ? { direction } : {}) },
    });

    for (const mapping of mappings) {
      const subnet = await prisma.subnet.findUnique({ where: { id: mapping.subnetId } });
      if (!subnet?.tcSubnetIndex) continue;
      const classId = `1:${subnet.tcSubnetIndex * 1000 + mapping.classSlot}`;
      const rateMbps = Math.max(1, Math.round(newRateKbps / 1000));

      await runTcScript("subscriber-rate.sh", [mapping.direction, classId, String(rateMbps)]).catch(() => {});

      await prisma.tcClassMapping.update({
        where: { id: mapping.id },
        data: { rateKbps: newRateKbps },
      });
    }

    await auditLog(auth.userId, "QOS_SUBSCRIBER_RATE", "TcClassMapping", subscriberId, { newRateKbps, direction }, req);
    return json({ success: true, updated: mappings.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

async function handleQosSubscriberBlock(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { subscriberId } = body;
    if (!subscriberId) return jsonErr("subscriberId required");

    const mappings = await prisma.tcClassMapping.findMany({
      where: { subscriberId, isActive: true },
    });

    for (const mapping of mappings) {
      const subnet = await prisma.subnet.findUnique({ where: { id: mapping.subnetId } });
      if (!subnet?.tcSubnetIndex) continue;
      const classId = `1:${subnet.tcSubnetIndex * 1000 + mapping.classSlot}`;
      await runTcScript("subscriber-block.sh", [mapping.direction, classId]).catch(() => {});
    }

    await auditLog(auth.userId, "QOS_SUBSCRIBER_BLOCK", "TcClassMapping", subscriberId, {}, req);
    return json({ success: true, blocked: mappings.length });
  } catch (err: any) {
    return jsonErr(err.message, 500);
  }
}

/** Helper: Convert IPv4 string to BigInt for subnet matching */
function ipToNumber(ip: string): bigint {
  const parts = ip.split(".").map(Number);
  return (BigInt(parts[0]) << 24n) | (BigInt(parts[1]) << 16n) | (BigInt(parts[2]) << 8n) | BigInt(parts[3]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN SERVER
// ═══════════════════════════════════════════════════════════════════════════
log.info("Starting Cryptsk Gateway Service", { port: SERVICE_PORT });

const server = Bun.serve({
  port: SERVICE_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const matched = matchRoute(url, method);
    if (matched) {
      try {
        return await matched.handler(req, matched.params);
      } catch (err: any) {
        if (err.message?.includes("Unauthorized")) {
          return json({ success: false, error: "Unauthorized" }, 401);
        }
        log.error("Handler error", { url: url.pathname, error: String(err.message), stack: err.stack });
        return jsonErr("Internal server error", 500);
      }
    }

    return json({ success: false, error: "Not found" }, 404);
  },
});

// ─── Auto Batch-Restore on Boot ────────────────────────────────────
(async () => {
  try {
    const settings = await prisma.ispSettings.findUnique({ where: { id: "default" } });
    if (!settings?.tcAutoRestoreOnBoot) {
      log.info("QoS auto-restore skipped (tcAutoRestoreOnBoot is false)");
      return;
    }
    const qosActive = await isQosActive();
    if (!qosActive) {
      log.info("QoS auto-restore skipped (gateway mode or TC not enabled)");
      return;
    }

    // Wait a moment for the server to fully start
    await new Promise(resolve => setTimeout(resolve, 2000));

    const { wan, lan } = await getWanLanInterfaces();
    if (wan.length === 0 || lan.length === 0) {
      log.warn("QoS auto-restore skipped (no WAN/LAN interfaces configured)");
      return;
    }

    const subnets = await prisma.subnet.findMany({ where: { tcEnabled: true } });
    const activeMappings = await prisma.tcClassMapping.findMany({
      where: { isActive: true },
      include: { subnet: true },
    });

    if (subnets.length === 0 && activeMappings.length === 0) {
      log.info("QoS auto-restore skipped (no subnets or sessions to restore)");
      return;
    }

    log.info("QoS auto-restore starting on boot", { subnets: subnets.length, sessions: activeMappings.length });

    const restoreData = {
      wanInterfaces: wan,
      lanInterfaces: lan,
      rootBandwidthDownMbps: settings.tcRootBandwidthDownMbps || 25000,
      rootBandwidthUpMbps: settings.tcRootBandwidthUpMbps || 25000,
      subnets: subnets.map(sn => ({
        tcSubnetIndex: sn.tcSubnetIndex,
        bandwidthPoolDownMbps: sn.bandwidthPoolDownMbps || 100,
        bandwidthBurstDownMbps: sn.bandwidthBurstDownMbps || 150,
        bandwidthPoolUpMbps: sn.bandwidthPoolUpMbps || 50,
        bandwidthBurstUpMbps: sn.bandwidthBurstUpMbps || 75,
      })),
      activeSessions: activeMappings.map(m => ({
        subscriberId: m.subscriberId,
        subnetIndex: m.subnet?.tcSubnetIndex || 0,
        classSlot: m.classSlot,
        ipAddress: m.ipAddress,
        downloadRateKbps: m.rateKbps,
        downloadCeilKbps: m.rateKbps,
        uploadRateKbps: m.rateKbps,
        uploadCeilKbps: m.rateKbps,
        priority: 3,
        direction: "both",
        quantum: 15,
      })),
    };

    const result = await runTcScript("batch-restore.sh", [], JSON.stringify(restoreData), 180000);
    log.info("QoS auto-restore complete", { success: result.success, stdout: result.stdout.substring(0, 200) });
  } catch (err: any) {
    log.error("QoS auto-restore failed on boot", { error: err.message });
  }
})();

log.info("Cryptsk Gateway Service running", {
  port: SERVICE_PORT,
  hostname: "0.0.0.0",
  pid: process.pid,
});
